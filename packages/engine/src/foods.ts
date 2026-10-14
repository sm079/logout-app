/* Food tables: values for foods the log hasn't stated, from public food composition tables, read by name.
   A name reads as an entry only when it points to exactly one: the entry's short name, one of its plain forms (its
   words without default ones like `raw`), every word of its description, or words no other entry has. Short names
   are unique, so the text alone always reads back to the same entry. */
import type { Stated } from './types';
import type { Dim } from './units';

export type FoodSource = 'usda' | 'indb' | 'ifct';
export const FOOD_SOURCES: readonly FoodSource[] = ['usda', 'indb', 'ifct'];

/** An entry as the data file keeps it: short name, plain forms (`|` between), description, then kcal, protein,
    carbs and fat per 100 g, and grams per millilitre (0 when it isn't known) */
export type FoodRow = [name: string, forms: string, desc: string, kcal: number, p: number, c: number, f: number, gml: number];
export type FoodData = { v: number } & Record<FoodSource, FoodRow[]>;

export interface Food {
  name: string;
  forms: string[];
  desc: string;
  src: FoodSource;
  /** Per 100 g */
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Grams per millilitre; 0 when it isn't known */
  gml: number;
}

export interface Foods {
  list: Food[];
  /** Each entry's words: its description's, its forms' and its short name's */
  words: Set<string>[];
  /** A set of words (sorted, space between) to the entry it names */
  exact: Map<string, number>;
  /** Each word to the entries that have it */
  post: Map<string, number[]>;
  /** Every word, to find the ones a half-typed word starts */
  vocab: string[];
  memo: Map<string, Food | null>;
  /** Each entry's description taken apart for ranking suggestions, worked out when first needed */
  shapes: (Shape | undefined)[];
}

/* ---------- Words ---------- */
// Words that say nothing about which food it is (`ki` and `ka` join Hindi names: `makki ki roti`)
const FILLER = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'ka', 'ke', 'ki']);
// Plurals that the rules below would get wrong, and words that only look plural
const IRREGULAR: Record<string, string> = { leaves: 'leaf', halves: 'half', loaves: 'loaf', knives: 'knife', quiches: 'quiche' };
const IE = new Set(['brownie', 'calorie', 'cookie', 'pie', 'potpie', 'smoothie', 'veggie', 'rotie', 'goalie']);
const KEEP = new Set([
  'asparagus',
  'couscous',
  'hummus',
  'molasses',
  'citrus',
  'octopus',
  'series',
  'species',
  'swiss',
  'gras',
  'chaas',
  'paneer'
]);

/** One word in the form tables and typed names are compared in: lower-case, singular */
export function singular(w: string): string {
  if (w.length < 4 || KEEP.has(w) || /(?:ss|us|is)$/.test(w)) return w;
  const irr = IRREGULAR[w];
  if (irr) return irr;
  if (w.endsWith('ies')) return IE.has(w.slice(0, -1)) ? w.slice(0, -1) : w.slice(0, -3) + 'y';
  if (/(?:ch|sh|ss|x|z|o)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** The words of a name or a description, as they're compared: lower-case, singular, without accents, filler words
    or numbers. A percentage stays a word: `2%` is `2pct`, `3.25%` is `3p25pct`. */
export function foodWords(text: string): string[] {
  const out: string[] = [];
  const t = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/(\d+)(?:[.,](\d+))?\s*%/g, (_, a: string, b?: string) => ` ${a}${b ? `p${b}` : ''}pct `);
  for (const raw of t.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw || FILLER.has(raw) || (/^\d/.test(raw) && !/^\d+(?:p\d+)?pct$/.test(raw))) continue;
    const w = singular(raw);
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

export const wordsKey = (ws: Iterable<string>): string => [...new Set(ws)].sort().join(' ');

/* ---------- The table ---------- */
/** Reads the data file into a table to look names up in */
export function foodTable(data: FoodData): Foods {
  const list: Food[] = [];
  for (const src of FOOD_SOURCES) {
    for (const [name, forms, desc, kcal, p, c, f, gml] of data[src] ?? [])
      list.push({ name, forms: forms ? forms.split('|') : [], desc, src, kcal, p, c, f, gml });
  }
  const own = list.map(e => foodWords(e.desc));
  const words = list.map((e, i) => new Set([...(own[i] as string[]), ...e.forms.flatMap(foodWords), ...foodWords(e.name)]));
  // Short names are unique. Then a whole description, or else a plain form, names its entry; between tables the
  // first table's (USDA, then INDB, then IFCT). One that two entries of a table share at the same level names neither.
  const exact = new Map<string, number>();
  list.forEach((e, i) => exact.set(wordsKey(foodWords(e.name)), i));
  const claims = new Map<string, { i: number; level: number }[]>();
  const claim = (ws: string[], i: number, level: number) => {
    const k = wordsKey(ws);
    if (!k || exact.has(k)) return;
    const l = claims.get(k);
    if (!l) claims.set(k, [{ i, level }]);
    else if (!l.some(c => c.i === i)) l.push({ i, level });
  };
  list.forEach((e, i) => {
    claim(own[i] as string[], i, 0);
    for (const f of e.forms) claim(foodWords(f), i, 1);
  });
  const order = (c: { i: number; level: number }) => FOOD_SOURCES.indexOf((list[c.i] as Food).src) * 2 + c.level;
  for (const [k, l] of claims) {
    l.sort((a, b) => order(a) - order(b));
    const [best, next] = l as [{ i: number; level: number }, { i: number; level: number } | undefined];
    if (!next || order(next) !== order(best)) exact.set(k, best.i);
  }
  const post = new Map<string, number[]>();
  words.forEach((ws, i) => {
    for (const w of ws) {
      const l = post.get(w);
      if (l) l.push(i);
      else post.set(w, [i]);
    }
  });
  return { list, words, exact, post, vocab: [...post.keys()].sort(), memo: new Map(), shapes: [] };
}

/** Entries that have every one of the words, at most `limit` */
export function having(foods: Foods, ws: string[], limit = Infinity): number[] {
  let rarest: number[] | undefined;
  for (const w of ws) {
    const l = foods.post.get(w);
    if (!l) return [];
    if (!rarest || l.length < rarest.length) rarest = l;
  }
  const out: number[] = [];
  for (const i of rarest ?? []) {
    if (ws.every(w => (foods.words[i] as Set<string>).has(w))) {
      out.push(i);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** The entry an item's name reads as, or null when it names none or more than one */
export function foodOf(foods: Foods | null | undefined, key: string | null | undefined): Food | null {
  if (!foods || !key) return null;
  let hit = foods.memo.get(key);
  if (hit !== undefined) return hit;
  const ws = foodWords(key);
  let i = ws.length ? foods.exact.get(wordsKey(ws)) : undefined;
  if (i == null && ws.length) {
    const only = having(foods, ws, 2);
    if (only.length === 1) i = only[0];
  }
  hit = i == null ? null : (foods.list[i] as Food);
  if (foods.memo.size > 20000) foods.memo.clear();
  foods.memo.set(key, hit);
  return hit;
}

/* ---------- Ranking suggestions ---------- */
// Words that say how a plain food is had rather than which food it is: they don't count against an entry
const PLAIN = new Set(['raw', 'cooked', 'boiled', 'roasted', 'plain', 'whole', 'fresh', 'enriched', 'unenriched', 'fluid']);
// Words that mark a processed or prepared product, unless they were typed (a brand in capitals counts too)
const MADE = new Set([
  'deli',
  'breaded',
  'batter',
  'roll',
  'canned',
  'sweetened',
  'frozen',
  'prepackaged',
  'imitation',
  'meatless',
  'restaurant',
  'fast'
]);
// Description heads that only say what kind of food follows: `Cheese, brie` is brie, `Beverages, coffee` coffee
const CLASS = new Set(['nut', 'seed', 'spice', 'fish', 'cheese', 'beverage', 'cereal']);

interface Shape {
  /** Its description's words, without what's in brackets; and with words a hyphen joins as one (`long-grain`) */
  all: string[];
  joined: string[];
  /** The words of its description's first part, and of the next when the first is a class word (`Cheese, brie`) */
  first: string[];
  next: string[] | null;
  kind: string | null;
  /** Its plain forms' words */
  forms: string[][];
  /** Brands: words in capitals */
  caps: string[];
  name: string[];
  length: number;
}

function shapeOf(e: Food): Shape {
  const desc = e.desc.replace(/\([^)]*\)/g, ' '),
    parts = desc.split(','),
    first = foodWords(parts[0] as string),
    kind = parts.length > 1 && first.length === 1 && CLASS.has(first[0] as string) ? (first[0] as string) : null;
  return {
    all: foodWords(desc),
    joined: foodWords(desc.replace(/(?<=\p{L})-(?=\p{L})/gu, '')),
    first,
    next: kind ? foodWords(parts[1] as string) : null,
    kind,
    forms: e.forms.map(foodWords),
    caps: [...desc.matchAll(/\b[A-Z][A-Z'&.-]*[A-Z]\b/g)].map(m => foodWords(m[0])[0] as string),
    name: e.name.split(' '),
    length: desc.length
  };
}

/** How well an entry fits the typed words (which it has), as numbers to sort by, lowest best */
function fit(s: Shape, typed: string[], whole: boolean): number[] {
  const t = new Set(typed),
    // `Cheese, brie` is brie, unless `cheese` was typed
    first = s.next && !t.has(s.kind as string) ? s.next : s.first;
  // 0: its first part, or a plain form, is the typed words and plain ones (`Rice, raw`, `Boiled rice`); 1: it starts
  // with a typed word (`Rice upma`); 2: neither (`Lemon rice`)
  const head = [first, ...s.forms].some(ws => ws.length && ws.every(w => t.has(w) || PLAIN.has(w))) ? 0 : t.has(first[0] as string) ? 1 : 2;
  const made = s.all.some(w => MADE.has(w) && !t.has(w)) || s.caps.some(w => !t.has(w));
  // Words it adds to the typed ones, other than plain ones and its class word, in the fewest it's described in
  let extra = 99;
  for (const ws of [s.joined, s.all, ...s.forms])
    if (typed.every(w => ws.includes(w))) extra = Math.min(extra, ws.filter(w => !t.has(w) && !PLAIN.has(w) && w !== s.kind).length);
  return [whole ? 0 : 1, head, made ? 1 : 0, extra, typed.every(w => s.name.includes(w)) ? 0 : 1, s.name.length, s.length];
}

/** Entries with every typed word, the last one as far as it's typed, best first: the one the words name; then
    those with every word whole (not `ricebean` for `rice`); that are the typed food, not a dish of it (`rice, raw`,
    not `rice upma`); that aren't a product (canned, breaded, a brand); that add the fewest words besides plain ones
    (raw, cooked, plain, whole); whose short name has the typed words; then the shortest names */
export function foodsLike(foods: Foods | null | undefined, query: string, n: number, skip?: (f: Food) => boolean): Food[] {
  if (!foods || n <= 0) return [];
  const q = query.toLowerCase().replace(/^\s+/, '');
  if (q.replace(/\s/g, '').length < 2) return [];
  const done = /\s$/.test(q);
  const ws = foodWords(q);
  if (!ws.length) return [];
  let rows: number[];
  // The typed words as an entry has them, and whether they're the words meant
  let typedOf = (_: number): [string[], boolean] => [ws, true];
  if (done) rows = having(foods, ws);
  else {
    // The last word is still being typed: any word it starts (or the word itself, made singular)
    const raw = (
        q
          .trim()
          .split(/[^\p{L}\p{N}'’]+/u)
          .pop() ?? ''
      ).replace(/['’]/g, ''),
      one = singular(raw);
    const whole = ws.filter(w => w !== one);
    const seen = new Set<number>();
    for (const w of foods.vocab) {
      if (!(w.startsWith(raw) || w.startsWith(one))) continue;
      for (const i of foods.post.get(w) ?? []) seen.add(i);
    }
    rows = [...seen].filter(i => whole.every(w => (foods.words[i] as Set<string>).has(w)));
    // The word it's taken to be, by how many of these entries' short names have it: the word as typed, unless one it
    // starts is in ten times as many (`pea` stays `pea`, not `peanut`; `chick` is `chicken`); else the one most have
    const count = new Map<string, number>();
    for (const i of rows)
      for (const w of (foods.list[i] as Food).name.split(' '))
        if (w.startsWith(raw) || w.startsWith(one)) count.set(w, (count.get(w) ?? 0) + 1);
    let meant = one,
      most = 0;
    for (const [w, c] of count) if (c > most || (c === most && w.length < meant.length)) [meant, most] = [w, c];
    if (foods.post.has(one) && (count.get(one) ?? 0) * 10 >= most) meant = one;
    typedOf = i => {
      const own = foods.words[i] as Set<string>;
      if (own.has(meant)) return [[...whole, meant], true];
      const starts = [...own].filter(w => w.startsWith(raw) || w.startsWith(one)).sort((a, b) => a.length - b.length);
      return [[...whole, starts[0] ?? one], false];
    };
  }
  const exact = foods.exact.get(wordsKey(ws));
  const rank = (i: number) => [i === exact ? 0 : 1, ...fit((foods.shapes[i] ??= shapeOf(foods.list[i] as Food)), ...typedOf(i))];
  const ranked = rows
    .filter(i => !skip || !skip(foods.list[i] as Food))
    .map(i => ({ i, r: rank(i) }))
    .sort((a, b) => {
      for (let k = 0; k < a.r.length; k++) if (a.r[k] !== b.r[k]) return (a.r[k] as number) - (b.r[k] as number);
      return (foods.list[a.i] as Food).name < (foods.list[b.i] as Food).name ? -1 : 1;
    });
  return ranked.slice(0, n).map(x => foods.list[x.i] as Food);
}

/** An entry's values for a kind of amount, as if a line had stated them: per 100 g, or per the millilitres 100 g
    takes up; none for counted amounts */
export function foodBase(food: Food, dim: Dim): Stated | null {
  const per = { kcal: food.kcal, p: food.p, c: food.c, f: food.f, worked: null };
  if (dim === 'mass') return { ...per, unit: 'g', value: 100, base: 100, dim };
  if (dim === 'volume' && food.gml > 0) return { ...per, unit: 'ml', value: 100 / food.gml, base: 100 / food.gml, dim };
  return null;
}

export const SOURCE_LABEL: Record<FoodSource, string> = { usda: 'USDA', indb: 'INDB', ifct: 'IFCT' };
