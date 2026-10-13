/* Makes data/foods.json, the food tables the app reads names against, from three public tables:
     - USDA FoodData Central, SR Legacy (April 2018), public domain: https://fdc.nal.usda.gov/download-datasets
     - INDB, the Indian Nutrient Databank's 1,014 recipes: https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-
     - IFCT 2017, India's food composition tables (NIN, Hyderabad), as digitised in @ifct2017/compositions
   Only names and kcal, protein, carbs and fat per 100 g are kept (plus grams per ml where USDA gives a plain volume).

     node scripts/foods.ts <cache dir>

   Downloads go into the cache directory (kept outside the repo) and are only read, never run. */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, resolve } from 'node:path';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { FOOD_SOURCES, foodTable, foodWords, having, wordsKey, type FoodData, type FoodRow, type FoodSource } from '../src/foods.ts';

const SOURCES = {
  usda: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
  indb: 'https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/raw/main/INDB.xlsx',
  ifct: 'https://registry.npmjs.org/@ifct2017/compositions/-/compositions-2.0.9.tgz'
};
const FILES = { usda: 'sr_legacy.zip', indb: 'INDB.xlsx', ifct: 'ifct2017-compositions.tgz' };
const OUT = resolve(import.meta.dirname, '../data/foods.json');

// The engine imports its modules without extensions, as the bundler resolves them; Node needs the `.ts`
registerHooks({
  resolve: (spec, ctx, next) => next(/^\.\.?\/[^.]*$/.test(spec) && ctx.parentURL?.includes('/engine/src/') ? `${spec}.ts` : spec, ctx)
});
const { readLine } = await import('../src/read.ts');

/* ---------- Reading the downloads ---------- */
/** The files in a zip archive (stored or deflated), by name */
function unzip(buf: Buffer): Map<string, Buffer> {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(at + 10),
      size = buf.readUInt32LE(at + 20),
      nameLen = buf.readUInt16LE(at + 28),
      extra = buf.readUInt16LE(at + 30),
      comment = buf.readUInt16LE(at + 32),
      local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const data = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(data, data + size);
    out.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

/** The files in a gzipped tar archive, by name */
function untgz(buf: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(buf),
    out = new Map<string, Buffer>();
  for (let at = 0; at + 512 <= tar.length;) {
    const name = tar.toString('utf8', at, at + 100).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(
      tar
        .toString('utf8', at + 124, at + 136)
        .replace(/\0.*$/s, '')
        .trim() || '0',
      8
    );
    out.set(name, tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Rows of a CSV file, quotes and all */
function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

/** CSV rows as objects keyed by the header */
function records(text: string): Record<string, string>[] {
  const [head, ...rows] = csv(text);
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries((head as string[]).map((h, i) => [h, r[i] ?? ''])));
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** The first sheet of a workbook as objects keyed by its first row */
function sheet(buf: Buffer): Record<string, string>[] {
  const files = unzip(buf);
  const strings = [...(files.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>(.*?)<\/si>/gs)].map(m =>
    unxml([...(m[1] ?? '').matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(t => t[1]).join(''))
  );
  const xml = (files.get('xl/worksheets/sheet1.xml') as Buffer).toString('utf8');
  const col = (ref: string) => [...(ref.match(/^[A-Z]+/)?.[0] ?? '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
    const row: string[] = [];
    for (const c of (r[1] ?? '').matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const v = c[3]?.match(/<v>(.*?)<\/v>/s)?.[1] ?? c[3]?.match(/<t[^>]*>(.*?)<\/t>/s)?.[1] ?? '';
      row[col(c[1] as string)] = /t="s"/.test(c[2] ?? '') ? (strings[Number(v)] ?? '') : unxml(v);
    }
    rows.push(row);
  }
  const [head, ...rest] = rows;
  return rest.map(r => Object.fromEntries((head as string[]).map((h, i) => [h, r[i] ?? ''])));
}

async function fetchTo(dir: string, src: FoodSource): Promise<Buffer> {
  const file = join(dir, FILES[src]);
  if (!existsSync(file)) {
    console.log(`downloading ${src}: ${SOURCES[src]}`);
    const res = await fetch(SOURCES[src]);
    if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file);
}

/* ---------- Entries ---------- */
interface Entry {
  src: FoodSource;
  /** Where it came from, to keep merges and the order stable */
  id: string;
  desc: string;
  /** Plain forms: what the entry is called without its default words, or in another language */
  forms: string[];
  /** What its short name is made from: its plain form's parts (`chicken`, `breast`, `meat only`), in order */
  segs: string[][];
  kcal: number;
  p: number;
  c: number;
  f: number;
  gml: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10,
  r2 = (n: number) => Math.round(n * 100) / 100;

/* USDA. A plain form drops what doesn't change which food it is (fortification, salt, `fluid`, the distribution
   programme note), the word `raw` for fruit, vegetables, nuts and seeds, the class word some names start with
   (`Nuts, almonds` is almonds), and `whole`, `fresh`, `raw` for eggs and the milk fat figures for milk. */
const NOISE = [
  /\(includes foods for usda'?s food distribution program\)/g,
  /\bwith added vitamins? a and (?:vitamin )?d\b/g,
  /\bwithout added vitamins? a and (?:vitamin )?d\b/g,
  /\bwith added vitamin d\b/g,
  /\bwith added ascorbic acid\b/g,
  /\bwithout added ascorbic acid\b/g,
  /\bvitamin d fortified\b/g,
  /\b(?:un)?enriched\b/g,
  /\b(?:cooked )?with(?:out)? salt\b/g,
  /\bfluid\b/g
];
const RAW_DEFAULT = new Set(['9', '11', '12']);
const CLASS_HEADS = new Set(['nuts', 'seeds', 'spices', 'fish', 'cheese', 'beverages']);

function usdaForm(desc: string, cat: string): { segs: string[][]; full: string[] } {
  let t = desc.toLowerCase();
  for (const re of NOISE) t = t.replace(re, ' ');
  let parts = t
    .split(',')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (parts.length > 1 && CLASS_HEADS.has(parts[0] as string)) parts = parts.slice(1);
  const head = foodWords(parts[0] ?? '')[0];
  const drop = new Set<string>();
  if (RAW_DEFAULT.has(cat)) drop.add('raw');
  if (head === 'egg') ['whole', 'fresh', 'raw'].forEach(w => drop.add(w));
  if (head === 'milk') drop.add('whole');
  // Broilers or fryers are the chicken sold as chicken; roasting, stewing and game hens are named
  if (head === 'chicken') parts = parts.filter(s => s !== 'broilers or fryers' && s !== 'broiler or fryers');
  const keep = (w: string) => !drop.has(w) && !(head === 'milk' && (w === 'milkfat' || w.endsWith('pct')));
  return {
    segs: parts.map(s => foodWords(s).filter(keep)).filter(ws => ws.length),
    full: foodWords(parts.join(' ')).filter(w => !(head === 'milk' && (w === 'milkfat' || w.endsWith('pct'))))
  };
}

const ML: Record<string, number> = {
  cup: 236.588,
  'cup (8 fl oz)': 236.588,
  tbsp: 14.787,
  tablespoon: 14.787,
  tsp: 4.929,
  teaspoon: 4.929,
  'fl oz': 29.574,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
  liter: 1000,
  ml: 1
};

function usda(zip: Buffer): Entry[] {
  const files = unzip(zip);
  const file = (n: string) => {
    for (const [k, v] of files) if (k.endsWith('/' + n)) return v.toString('utf8');
    throw new Error(`USDA: no ${n}`);
  };
  const want: Record<string, 'kcal' | 'p' | 'c' | 'f'> = { '1008': 'kcal', '1003': 'p', '1005': 'c', '1004': 'f' };
  const values = new Map<string, Partial<Record<'kcal' | 'p' | 'c' | 'f', number>>>();
  for (const r of records(file('food_nutrient.csv'))) {
    const k = want[r.nutrient_id as string];
    if (!k) continue;
    const v = values.get(r.fdc_id as string) ?? {};
    v[k] = Number(r.amount);
    values.set(r.fdc_id as string, v);
  }
  // Grams per millilitre, from the largest plain volume portion (`1 cup`, not `1 cup, mashed`)
  const gml = new Map<string, { ml: number; g: number }>();
  for (const r of records(file('food_portion.csv'))) {
    const per = ML[(r.modifier ?? '').trim().toLowerCase()];
    const amount = Number(r.amount) || 1;
    if (!per || r.portion_description) continue;
    const ml = per * amount,
      g = Number(r.gram_weight);
    const was = gml.get(r.fdc_id as string);
    if (g > 0 && (!was || ml > was.ml)) gml.set(r.fdc_id as string, { ml, g });
  }
  const out: Entry[] = [];
  let skipped = 0;
  for (const r of records(file('food.csv'))) {
    // Baby food and lab reference materials aren't foods anyone logs
    if (r.food_category_id === '3' || r.food_category_id === '27') continue;
    const v = values.get(r.fdc_id as string);
    if (!v || v.kcal == null || v.p == null || v.c == null || v.f == null) {
      skipped++;
      continue;
    }
    const d = gml.get(r.fdc_id as string);
    const density = d ? d.g / d.ml : 0;
    const form = usdaForm(r.description as string, r.food_category_id as string);
    out.push({
      src: 'usda',
      id: r.fdc_id as string,
      desc: (r.description as string).trim(),
      // Without its default words (`banana`), and with them (`milk whole`)
      forms: [form.segs.flat().join(' '), form.full.join(' ')],
      segs: form.segs,
      kcal: r1(v.kcal),
      p: r2(v.p),
      c: r2(v.c),
      f: r2(v.f),
      gml: density > 0.05 && density < 2.5 ? Math.round(density * 1000) / 1000 : 0
    });
  }
  console.log(`USDA: ${out.length} entries (${skipped} without kcal, protein, carbs and fat)`);
  return out;
}

/* INDB. Names give spellings with a slash (`Plain parantha/paratha`) and other names in brackets (`Washed moong dal
   (Dhuli moong ki dal)`); each is a plain form. `Plain` is a default word. Many fried dishes and curries count all
   the frying oil (`Chilli paneer`: 84 g fat and 2 g protein per 100 g), so a dish with over 40 g fat per 100 g, or
   with more than 88% of its energy from fat, is left out. */
const similar = (a: string, b: string) => a.slice(0, 3).toLowerCase() === b.slice(0, 3).toLowerCase();
function spellings(phrase: string): string[] {
  const parts = phrase
    .split('/')
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return parts;
  const out: string[] = [];
  let prev: string[] | null = null;
  for (const part of parts) {
    const ws = part.split(/\s+/);
    if (prev && ws.length === 1 && prev.length > 1 && similar(ws[0] as string, prev[prev.length - 1] as string)) {
      // `parantha/paratha`: another spelling of the word before the slash
      out.push([...prev.slice(0, -1), ws[0]].join(' '));
      continue;
    }
    out.push(part);
    prev = ws;
  }
  // `Suji/Rava dosa`: a lone word before a phrase takes the phrase's place for its first word
  return out.map((s, i) => {
    const next = out[i + 1];
    return !s.includes(' ') && next && next.includes(' ') ? [s, ...next.split(' ').slice(1)].join(' ') : s;
  });
}

function indb(xlsx: Buffer): Entry[] {
  const out: Entry[] = [];
  let skipped = 0,
    oily = 0;
  for (const r of sheet(xlsx)) {
    const desc = (r.food_name ?? '').replace(/\s+/g, ' ').trim();
    const kcal = Number(r.energy_kcal),
      p = Number(r.protein_g),
      c = Number(r.carb_g),
      f = Number(r.fat_g);
    if (!desc || ![kcal, p, c, f].every(Number.isFinite) || r.energy_kcal === '') {
      skipped++;
      continue;
    }
    if (f > 40 || 9 * f > 0.88 * kcal) {
      oily++;
      if (process.env.FOODS_VERBOSE) console.warn(`  INDB, too much fat: ${desc} (${r1(f)} g fat, ${r1(kcal)} kcal per 100 g)`);
      continue;
    }
    const main = desc.replace(/\([^)]*\)/g, ' ').trim();
    const others = [...desc.matchAll(/\(([^)]*)\)/g)].map(m => m[1] as string);
    const forms = [...spellings(main), ...others.flatMap(spellings)]
      .map(s => foodWords(s).filter(w => w !== 'plain'))
      .filter(ws => ws.length);
    out.push({
      src: 'indb',
      id: r.food_code as string,
      desc,
      forms: forms.map(ws => ws.join(' ')),
      segs: [forms[0] ?? foodWords(desc)],
      kcal: r1(kcal),
      p: r2(p),
      c: r2(c),
      f: r2(f),
      gml: 0
    });
  }
  console.log(`INDB: ${out.length} entries (${skipped} without values, ${oily} left out for their fat)`);
  return out;
}

/* IFCT 2017. Energy is in kJ. Plain forms are its name and its English and Hindi local names (`H. Atta`). */
function ifct(tgz: Buffer): Entry[] {
  const text = untgz(tgz).get('package/index.csv')?.toString('utf8');
  if (!text) throw new Error('IFCT: no package/index.csv');
  const [head, ...rows] = csv(text);
  const ix = Object.fromEntries((head as string[]).map((h, i) => [h.split('; ')[1] ?? h, i]));
  const get = (r: string[], k: string) => r[ix[k] as number] ?? '';
  const out: Entry[] = [];
  let worked = 0,
    samples = 0;
  // `Brinjal-1` to `Brinjal-21` are samples of varieties; `Brinjal - all varieties` is their average, and stays
  const averaged = new Set(
    rows
      .map(r =>
        get(r, 'name')
          .match(/^(.*?)\s*-\s*all varieties$/i)?.[1]
          ?.toLowerCase()
      )
      .filter(Boolean)
  );
  for (const r of rows) {
    const desc = get(r, 'name').trim();
    if (!desc) continue;
    const sample = desc.match(/^(.*?)-\d+$/);
    if (sample && averaged.has((sample[1] as string).toLowerCase())) {
      samples++;
      continue;
    }
    const p = Number(get(r, 'protcnt')),
      c = Number(get(r, 'choavldf')),
      f = Number(get(r, 'fatce'));
    let kcal = Number(get(r, 'enerc')) / 4.184;
    if (![p, c, f].every(Number.isFinite)) continue;
    // A few rows (the oils and ghee) have no energy figure: it's worked out as the app does from the other three
    if (!(kcal > 0) && p + c + f > 0) {
      kcal = 4 * p + 4 * c + 9 * f;
      worked++;
    }
    // `B., Kash., H. Arhar dal; E. Pigeon pea`: the names after E. (English) and H. (Hindi)
    const local = get(r, 'lang')
      .split(';')
      .map(s => s.trim().match(/^((?:[A-Z][a-z]*\.,?\s*)+)(.*)$/))
      .filter((m): m is RegExpMatchArray => !!m && /(?:^|\s)[EH]\./.test(m[1] as string))
      .flatMap(m => (m[2] as string).split(','))
      .map(s => foodWords(s))
      .filter(ws => ws.length);
    const plain = desc.replace(/\s*-\s*all varieties$/i, '');
    const own = foodWords(plain);
    out.push({
      src: 'ifct',
      id: get(r, 'code'),
      desc,
      forms: [own, ...local].map(ws => ws.join(' ')),
      segs: plain
        .split(',')
        .map(foodWords)
        .filter(ws => ws.length),
      kcal: r1(kcal),
      p: r2(p),
      c: r2(c),
      f: r2(f),
      gml: 0
    });
  }
  console.log(`IFCT: ${out.length} entries (${samples} variety samples left for their average, ${worked} with kcal worked out)`);
  return out;
}

/* ---------- Merging, then short names ---------- */
const near = (a: Entry, b: Entry) =>
  Math.abs(a.kcal - b.kcal) <= Math.max(2, a.kcal * 0.02) &&
  Math.abs(a.p - b.p) <= 0.3 &&
  Math.abs(a.c - b.c) <= 0.3 &&
  Math.abs(a.f - b.f) <= 0.3;

// The numbers in a description, to tell `trimmed to 0" fat` from `trimmed to 1/8" fat`
const numbers = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
const fewer = (a: Entry, b: Entry) => {
  const x = numbers(a.desc),
    y = numbers(b.desc);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  return a.desc.length - b.desc.length || (a.id < b.id ? -1 : 1);
};

/** Entries no words can tell apart are one. Same plain form and the same values (`with salt` and without): the
    shortest description stays. Descriptions that differ only in numbers (`trimmed to 0" fat`, `80 proof`) or in word
    order: the one with the lowest numbers stays. Where a shared plain form's values differ, it names neither. */
function merge(list: Entry[]): Entry[] {
  const pick = (key: (e: Entry) => string, keep: (g: Entry[]) => Entry[]) => {
    const groups = new Map<string, Entry[]>();
    for (const e of list) groups.set(key(e), [...(groups.get(key(e)) ?? []), e]);
    const before = list.length;
    list = [...groups.values()].flatMap(g => (g.length > 1 ? keep(g) : g));
    return before - list.length;
  };
  const same = pick(
    e => `${e.src}|${wordsKey(foodWords(e.desc))}`,
    g => [g.sort(fewer)[0] as Entry]
  );
  const plain = pick(
    e => `${e.src}|${wordsKey(e.segs.flat())}`,
    g =>
      g.every(e => near(e, g[0] as Entry)) ? [g.sort((a, b) => a.desc.length - b.desc.length || (a.id < b.id ? -1 : 1))[0] as Entry] : g
  );
  console.log(`merged ${same} entries no words tell apart, and ${plain} with the same plain name and values`);
  return list;
}

// A short name must read back as a food line's whole name, with and without an amount
const readsBack = (name: string) =>
  [name, `${name} 100g`].every(t => {
    const l = readLine(t, 'food');
    return l.kind === 'food' && l.key === name;
  });

/** Ways to name an entry from its parts, fewest words first: always the first part, then any of the rest (of the
    first ten), earlier parts before later ones */
function namings(segs: string[][]): string[][] {
  const [head, ...rest] = segs.slice(0, 10);
  if (!head) return [];
  const out: { ws: string[]; at: number[] }[] = [];
  for (let mask = 0; mask < 1 << rest.length; mask++) {
    const at = rest.map((_, i) => i).filter(i => mask & (1 << i));
    out.push({ ws: [...new Set([...head, ...at.flatMap(i => rest[i] as string[])])], at });
  }
  const earlier = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
    return a.length - b.length;
  };
  return out.sort((a, b) => a.ws.length - b.ws.length || earlier(a.at, b.at)).map(x => x.ws);
}

function rows(list: Entry[]): FoodData {
  const data = { v: 1 } as FoodData;
  for (const src of FOOD_SOURCES) data[src] = [];
  for (const e of list) {
    const own = wordsKey(foodWords(e.desc));
    const forms = [...new Set(e.forms)].filter(f => f && wordsKey(foodWords(f)) !== own);
    data[e.src].push(['', forms.join('|'), e.desc, e.kcal, e.p, e.c, e.f, e.gml] as FoodRow);
  }
  return data;
}

function name(list: Entry[]): FoodData {
  const data = rows(list);
  const table = foodTable(data);
  // What a set of words reads as, as foodOf() would read it
  const reads = (ws: string[]) => {
    const k = wordsKey(ws);
    const e = table.exact.get(k);
    if (e != null) return e;
    const only = having(table, ws, 2);
    return only.length === 1 ? (only[0] as number) : -1;
  };
  const taken = new Set<string>();
  let dropped = 0;
  const all = FOOD_SOURCES.flatMap(src => data[src]);
  all.forEach((row, i) => {
    const e = table.list[i]!,
      segs = (list[i] as Entry).segs;
    const tries = [...namings(segs), segs.flat(), ...e.forms.map(foodWords), foodWords(e.desc)];
    const pick = tries.find(ws => ws.length && reads(ws) === i && !taken.has(wordsKey(ws)) && readsBack(ws.join(' ')));
    if (!pick) {
      dropped++;
      console.warn(`  no name reads as: ${e.desc}`);
      return;
    }
    taken.add(wordsKey(pick));
    row[0] = pick.join(' ');
  });
  for (const src of FOOD_SOURCES) data[src] = data[src].filter(r => r[0]);
  console.log(`named ${all.length - dropped} entries (${dropped} left out: no words name them alone)`);
  return data;
}

/* ---------- Writing ---------- */
const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/foods.ts <cache dir>');
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const list = merge([...usda(await fetchTo(dir, 'usda')), ...indb(await fetchTo(dir, 'indb')), ...ifct(await fetchTo(dir, 'ifct'))]).sort(
  (a, b) => FOOD_SOURCES.indexOf(a.src) - FOOD_SOURCES.indexOf(b.src)
);
const data = name(list);
const body = FOOD_SOURCES.map(src => `"${src}":[\n${data[src].map(r => JSON.stringify(r)).join(',\n')}\n]`).join(',\n');
mkdirSync(resolve(OUT, '..'), { recursive: true });
writeFileSync(OUT, `{"v":${data.v},\n${body}}\n`);
console.log(`wrote ${OUT}: ${FOOD_SOURCES.map(s => `${data[s].length} ${s}`).join(', ')}`);
