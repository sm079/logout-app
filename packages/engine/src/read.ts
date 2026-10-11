/* Reading a line: fixed patterns claim the values, the words left over are its name and a note. */
import { DEFAULT_UNITS, SPELL, UNITS, unitOf, type UnitName, type Units } from './units';
import type {
  Amount,
  CardioFields,
  CheckinFields,
  Distance,
  EntryLine,
  FoodFields,
  Kind,
  Line,
  MacroKey,
  MeasureFields,
  MeasureWhat,
  Mode,
  Role,
  Stated,
  StrengthFields,
  Token,
  WaterFields
} from './types';

/* ---------- Regex essentials ---------- */
type Groups = Record<string, string | undefined>;
interface Ctx {
  kind: Kind;
}
interface Pattern {
  role: Role;
  re: RegExp;
  read(g: Groups, ctx: Ctx, m: RegExpMatchArray): Partial<Token> | null;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const alt = (words: Iterable<string>) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(esc)
    .join('|');
const spellings = (names: UnitName[]) => alt([...SPELL].filter(([, n]) => names.includes(n)).map(([s]) => s));
// `8,400` is eight thousand four hundred; `60,5` is sixty and a half
const NUM = String.raw`(?:\d+(?:,\d{3})+(?![\d.,])|\d+(?:[.,]\d+)?)`;
const L = String.raw`(?<![\p{L}\p{N}_.,])`;
const R = String.raw`(?![\p{L}\p{N}_])`;
const CLOCK = String.raw`(?:\d+:)?\d{1,2}:\d{2}`;
const rx = (src: string) => new RegExp(src, 'giu');
const num = (s: string | undefined) => {
  const t = s ?? '';
  return /^\d+(?:,\d{3})+$/.test(t) ? Number(t.replace(/,/g, '')) : Number(t.replace(',', '.'));
};
const clockSec = (s: string) => s.split(':').reduce((a, p) => a * 60 + Number(p), 0);
const unitF = (u: UnitName | undefined) => (u ? UNITS[u].f : NaN);
const MAX_SETS = 15;

// A time of day, in every mode: `@7pm`, `@7:30am`, `@19:00`. In strength `@8` is effort, so there it needs a colon or am/pm.
const TIME: Pattern = {
  role: 'time',
  re: rx(String.raw`@\s*(?<h>\d{1,2})(?::(?<m>\d{2}))?\s*(?<ap>am|pm)?${R}`),
  read(g, ctx) {
    let h = Number(g.h);
    const m = g.m ? Number(g.m) : 0;
    if (!g.m && !g.ap && ctx.kind === 'strength') return null;
    if (g.ap) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (g.ap.toLowerCase() === 'pm' ? 12 : 0);
    }
    return h > 23 || m > 59 ? null : { min: h * 60 + m };
  }
};
const BARE: Pattern = { role: 'num', re: rx(String.raw`${L}(?<v>${NUM})${R}`), read: g => ({ v: num(g.v) }) };

const FOOD_U = spellings(['mg', 'g', 'oz', 'kg', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'scoop', 'slice', 'serving']);
const MACRO: Record<string, MacroKey> = {
  kcal: 'kcal',
  kcals: 'kcal',
  cal: 'kcal',
  cals: 'kcal',
  calorie: 'kcal',
  calories: 'kcal',
  p: 'p',
  protein: 'p',
  prot: 'p',
  c: 'c',
  carb: 'c',
  carbs: 'c',
  f: 'f',
  fat: 'f',
  fats: 'f'
};
const amountOf = (value: number, unit: UnitName, text?: string): Amount => ({ value, unit, text });
const FOOD: Pattern[] = [
  TIME,
  // `/100g`, `per serving`: the values on the line are for that much
  {
    role: 'basis',
    re: rx(String.raw`(?:\/|${L}per\s+)\s*(?<a>${NUM})?\s*(?<u>${FOOD_U})${R}`),
    read: g => ({ basis: amountOf(g.a ? num(g.a) : 1, unitOf(g.u) as UnitName) })
  },
  // `2x50g`: a count of a portion
  {
    role: 'amount',
    re: rx(String.raw`${L}(?<n>\d+)\s*x\s*(?<q>${NUM})\s*(?<u>${FOOD_U})${R}`),
    read: (g, _c, m) => ({ amount: amountOf(Number(g.n) * num(g.q), unitOf(g.u) as UnitName, m[0]) })
  },
  // `30g protein` as well as `30p`
  {
    role: 'macro',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?:g\s*)?(?<k>protein|prot|carbs|carb|fats|fat)${R}`),
    read: g => ({ k: MACRO[(g.k ?? '').toLowerCase()], v: num(g.v) })
  },
  {
    role: 'macro',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?<k>${alt(Object.keys(MACRO))})${R}`),
    read: g => ({ k: MACRO[(g.k ?? '').toLowerCase()], v: num(g.v) })
  },
  {
    role: 'amount',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${FOOD_U})${R}`),
    read: (g, _c, m) => ({ amount: amountOf(num(g.v), unitOf(g.u) as UnitName, m[0]) })
  },
  BARE
];

const LOADS = spellings(['kg', 'lb']);
const TIME_U = spellings(['s', 'min', 'h']);
const rpe = (v: number) => (v >= 1 && v <= 10 ? { rpe: v, rir: 10 - v } : null);
const STRENGTH: Pattern[] = [
  TIME,
  // `+10kg`: added to bodyweight (a weighted pull-up)
  { role: 'load', re: rx(String.raw`\+\s*(?<w>${NUM})\s*(?<u>${LOADS})?${R}`), read: g => ({ w: num(g.w), u: unitOf(g.u), added: true }) },
  { role: 'effort', re: rx(String.raw`@\s*(?<v>\d{1,2}(?:[.,]5)?)(?![\d:])${R}`), read: g => rpe(num(g.v)) },
  { role: 'effort', re: rx(String.raw`${L}rpe\s*(?<v>\d{1,2}(?:[.,]5)?)${R}`), read: g => rpe(num(g.v)) },
  { role: 'effort', re: rx(String.raw`${L}(?<v>\d)\s*rir${R}`), read: g => ({ rir: Number(g.v) }) },
  { role: 'effort', re: rx(String.raw`${L}rir\s*(?<v>\d)${R}`), read: g => ({ rir: Number(g.v) }) },
  // `3x60s`, `3x1:00`: sets of a hold
  {
    role: 'sets',
    re: rx(String.raw`${L}(?<n>\d+)\s*x\s*(?:(?<c>${CLOCK})|(?<t>${NUM})\s*(?<u>${TIME_U}))${R}`),
    read: g => ({ sets: Number(g.n), hold: g.c ? clockSec(g.c) : num(g.t) * unitF(unitOf(g.u)) })
  },
  // Three numbers: `100kg x 5 x 3` and `100x5x3` are load × reps × sets; `3x8x60` is sets × reps × load
  {
    role: 'sets',
    re: rx(String.raw`${L}(?<a>${NUM})\s*(?<au>${LOADS})?\s*x\s*(?<b>\d+)\s*x\s*(?<c>${NUM})\s*(?<cu>${LOADS})?${R}`),
    read(g) {
      const a = num(g.a),
        c = num(g.c);
      if (g.au || (!g.cu && a > MAX_SETS)) return Number.isInteger(c) ? { w: a, u: unitOf(g.au), reps: Number(g.b), sets: c } : null;
      return Number.isInteger(a) ? { sets: a, reps: Number(g.b), w: c, u: unitOf(g.cu) } : null;
    }
  },
  {
    role: 'sets',
    re: rx(String.raw`${L}(?<w>${NUM})\s*(?<u>${LOADS})\s*x\s*(?<r>\d+)${R}`),
    read: g => ({ w: num(g.w), u: unitOf(g.u), reps: Number(g.r), sets: 1 })
  },
  // `3x8` is sets × reps; `100x5` is load × reps, since more than 15 sets is not a set count
  {
    role: 'sets',
    re: rx(String.raw`${L}(?<a>${NUM})\s*x\s*(?<b>\d+)${R}`),
    read(g) {
      const a = num(g.a);
      return a > MAX_SETS || !Number.isInteger(a) ? { w: a, reps: Number(g.b), sets: 1 } : { sets: a, reps: Number(g.b) };
    }
  },
  {
    role: 'sets',
    re: rx(String.raw`${L}(?<s>\d+)\s*sets?\s*(?:of|x)?\s*(?<r>\d+)(?:\s*reps?)?${R}`),
    read: g => ({ sets: Number(g.s), reps: Number(g.r) })
  },
  { role: 'sets', re: rx(String.raw`${L}(?<r>\d+)\s*reps?${R}`), read: g => ({ reps: Number(g.r) }) },
  { role: 'sets', re: rx(String.raw`${L}(?<s>\d+)\s*sets?${R}`), read: g => ({ sets: Number(g.s) }) },
  { role: 'load', re: rx(String.raw`${L}(?:bw|bodyweight)${R}`), read: () => ({ bw: true }) },
  { role: 'hold', re: rx(String.raw`${L}(?<c>${CLOCK})${R}`), read: g => ({ hold: clockSec(g.c ?? '') }) },
  { role: 'hold', re: rx(String.raw`${L}(?<t>${NUM})\s*(?<u>${TIME_U})${R}`), read: g => ({ hold: num(g.t) * unitF(unitOf(g.u)) }) },
  { role: 'load', re: rx(String.raw`${L}(?<w>${NUM})\s*(?<u>${LOADS})${R}`), read: g => ({ w: num(g.w), u: unitOf(g.u) }) },
  BARE
];

// `m` is always metres; minutes are `min`. `5k` is five kilometres.
const DIST_U = spellings(['m', 'yd', 'km', 'mi']) + '|k';
const distOf = (value: number, w: string | undefined): Distance => {
  const unit = unitOf(w) || 'km';
  return { value, unit, m: value * UNITS[unit].f };
};
const CARDIO: Pattern[] = [
  TIME,
  {
    role: 'steps',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?<k>k)?\s*steps?${R}`),
    read: g => ({ steps: Math.round(num(g.v) * (g.k ? 1000 : 1)) })
  },
  {
    role: 'steps',
    re: rx(String.raw`${L}steps?\s*(?<v>${NUM})\s*(?<k>k)?${R}`),
    read: g => ({ steps: Math.round(num(g.v) * (g.k ? 1000 : 1)) })
  },
  // `6x800m`, `10x30s`, `4x4:00`
  {
    role: 'interval',
    re: rx(String.raw`${L}(?<n>\d+)\s*x\s*(?:(?<c>${CLOCK})|(?<v>${NUM})\s*(?<u>${DIST_U}|${TIME_U}))${R}`),
    read(g) {
      const n = Number(g.n);
      if (g.c) return { n, sec: clockSec(g.c) };
      const u = ((g.u ?? '').toLowerCase() === 'k' ? 'km' : unitOf(g.u)) as UnitName;
      return UNITS[u].dim === 'time' ? { n, sec: num(g.v) * UNITS[u].f } : { n, dist: distOf(num(g.v), u) };
    }
  },
  {
    role: 'pace',
    re: rx(String.raw`${L}(?<c>\d{1,2}:\d{2})\s*\/\s*(?<u>km|mi)${R}`),
    read: g => ({ pace: clockSec(g.c ?? ''), per: (g.u ?? '').toLowerCase() as 'km' | 'mi' })
  },
  {
    role: 'pace',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>km\/h|kph|mph)(?![\p{L}])`),
    read: g => ({ kmh: num(g.v) * ((g.u ?? '').toLowerCase() === 'mph' ? 1.609344 : 1) })
  },
  {
    role: 'duration',
    re: rx(String.raw`${L}(?<h>\d+)\s*h(?:rs?|ours?)?\s*(?<m>\d+)\s*m(?:in(?:s|utes?)?)?${R}`),
    read: g => ({ sec: Number(g.h) * 3600 + Number(g.m) * 60 })
  },
  { role: 'duration', re: rx(String.raw`${L}(?<c>${CLOCK})${R}`), read: g => ({ sec: clockSec(g.c ?? '') }) },
  { role: 'hr', re: rx(String.raw`${L}(?<v>\d{2,3})\s*bpm${R}`), read: g => ({ hr: Number(g.v) }) },
  { role: 'hr', re: rx(String.raw`${L}(?:avg\s+)?hr\s*(?<v>\d{2,3})${R}`), read: g => ({ hr: Number(g.v) }) },
  { role: 'kcal', re: rx(String.raw`${L}(?<v>${NUM})\s*(?:kcals?|cals?|calories|calorie)${R}`), read: g => ({ kcal: num(g.v) }) },
  { role: 'duration', re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${TIME_U})${R}`), read: g => ({ sec: num(g.v) * unitF(unitOf(g.u)) }) },
  {
    role: 'distance',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${DIST_U})${R}`),
    read: g => ({ dist: distOf(num(g.v), (g.u ?? '').toLowerCase() === 'k' ? 'km' : g.u) })
  },
  BARE
];

// Lines that mean the same in every mode
const WATER_U: Record<string, number> = {
  ml: 1,
  mls: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  cup: 240,
  cups: 240,
  oz: 29.5735,
  glass: 250,
  glasses: 250
};
const WATER: Pattern[] = [
  TIME,
  {
    role: 'water',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${alt(Object.keys(WATER_U))})${R}`),
    read: g => ({ ml: num(g.v) * (WATER_U[(g.u ?? '').toLowerCase()] ?? NaN) })
  },
  BARE
];
const MEASURES: Record<string, MeasureWhat> = {
  weight: 'weight',
  bw: 'weight',
  bodyweight: 'weight',
  'body weight': 'weight',
  waist: 'waist',
  neck: 'neck',
  hips: 'hips',
  hip: 'hips',
  height: 'height'
};
const MEASURE: Pattern[] = [
  TIME,
  {
    role: 'measure',
    re: rx(String.raw`${L}(?<v>${NUM})\s*(?<u>${spellings(['kg', 'lb', 'mm', 'cm', 'in', 'ft', 'm'])})${R}`),
    read: g => ({ v: num(g.v), u: unitOf(g.u) })
  },
  BARE
];
const SCORE: Pattern = {
  role: 'score',
  re: rx(String.raw`(?<![\p{N}.\/])(?<v>[1-5])\s*\/\s*5(?![\p{N}.])`),
  read: g => ({ score: Number(g.v) })
};
const SCORE_RE = new RegExp(SCORE.re.source, 'iu');
const CHECKIN: Pattern[] = [TIME, SCORE, BARE];
// Check-ins any name can make with `n/5`; these few are check-ins even without it
export const CHECKINS: ReadonlySet<string> = new Set(['sleep', 'mood', 'energy', 'stress', 'soreness']);
const RESERVED_RE =
  /(?:^|[^\p{L}])(?:water|weight|bw|bodyweight|body weight|waist|neck|hips?|height|sleep|mood|energy|stress|soreness)(?![\p{L}])/iu;
export const MODE_KINDS: ReadonlySet<Kind> = new Set<Kind>(['food', 'strength', 'cardio']);
const PATTERNS: Record<Mode, Pattern[]> = { food: FOOD, strength: STRENGTH, cardio: CARDIO };

/* ---------- Scanning ---------- */
const MASK = '\u0001';
interface Word {
  s: number;
  e: number;
  w: string;
}
interface Run {
  e: number;
  words: Word[];
}
interface Scan {
  text: string;
  tokens: Token[];
  runs: Run[];
}

// Each pattern claims what it matches, in order; claimed text is masked so later patterns can't reuse it
function scan(text: string, patterns: Pattern[], ctx: Ctx): Scan {
  let work = text.replace(/[×*]/g, 'x');
  const tokens: Token[] = [];
  for (const p of patterns) {
    for (const m of work.matchAll(p.re)) {
      const t = p.read((m.groups || {}) as Groups, ctx, m);
      if (!t) continue;
      const s = m.index ?? 0,
        e = s + m[0].length;
      tokens.push(Object.assign({ s, e, role: p.role }, t));
      work = work.slice(0, s) + MASK.repeat(e - s) + work.slice(e);
    }
  }
  tokens.sort((a, b) => a.s - b.s);
  // What's left is words, grouped into runs that no value interrupts
  const runs: Run[] = [];
  let run: Run | null = null;
  for (const m of work.matchAll(/[^\s\u0001]+/gu)) {
    const s = m.index ?? 0;
    const w: Word = { s, e: s + m[0].length, w: m[0] };
    if (run && !work.slice(run.e, w.s).includes(MASK)) {
      run.words.push(w);
      run.e = w.e;
    } else runs.push((run = { e: w.e, words: [w] }));
  }
  return { text, tokens, runs };
}

const CONNECT = new Set(['of', 'at', 'x', 'with', 'and', 'in', 'for', 'a', 'an', 'the', 'on', 'to', 'per']);
const connector = (w: string) => CONNECT.has(w.toLowerCase()) || !/[\p{L}\p{N}]/u.test(w);
interface Named {
  name: string | null;
  key: string | null;
}
// The name is the first run of words; later runs are a note. Linking words at a run's edges belong to neither.
function nameOf(sc: Scan): Named {
  let name: string | null = null,
    key: string | null = null;
  for (const r of sc.runs) {
    let a = 0,
      b = r.words.length;
    while (a < b && connector(r.words[a]!.w)) a++;
    while (b > a && connector(r.words[b - 1]!.w)) b--;
    if (a === b) continue;
    const span = { s: r.words[a]!.s, e: r.words[b - 1]!.e };
    if (!name) {
      name = sc.text.slice(span.s, span.e).replace(/\s+/g, ' ');
      key = name.toLowerCase();
      sc.tokens.push({ ...span, role: 'name' });
    } else sc.tokens.push({ ...span, role: 'note' });
  }
  sc.tokens.sort((x, y) => x.s - y.s);
  return { name, key };
}

// A value a line already has makes a second one unreadable
function taker<F extends object>(f: F) {
  return <K extends keyof F>(t: Token, field: K, v: F[K]): boolean => {
    if (f[field] != null) {
      t.role = 'bad';
      return false;
    }
    f[field] = v;
    return true;
  };
}

// Any three of kcal, protein, carbs and fat fix the fourth (kcal = 4p + 4c + 9f)
const PER_G: Record<'p' | 'c' | 'f', number> = { p: 4, c: 4, f: 9 };
function complete(m: Partial<Record<MacroKey, number>>): Pick<Stated, MacroKey | 'worked'> {
  const missing = (['kcal', 'p', 'c', 'f'] as const).filter(k => m[k] == null);
  if (missing.length !== 1) return { ...m, worked: null };
  const k = missing[0]!;
  let known = 0;
  for (const [q, e] of Object.entries(PER_G) as ['p' | 'c' | 'f', number][]) if (q !== k) known += e * (m[q] as number);
  const v = k === 'kcal' ? known : ((m.kcal as number) - known) / PER_G[k];
  return { ...m, [k]: Math.max(0, v), worked: k };
}

function readFood(sc: Scan): FoodFields {
  const f: FoodFields = { amount: null, count: null, basis: null, macros: {}, stated: null };
  const take = taker(f);
  for (const t of sc.tokens) {
    if (t.role === 'macro') {
      if (f.macros[t.k!] != null) t.role = 'bad';
      else f.macros[t.k!] = t.v;
    } else if (t.role === 'amount') take(t, 'amount', t.amount!);
    else if (t.role === 'basis') take(t, 'basis', t.basis!);
  }
  // A bare number is a count; once there's an amount with a unit, the unit wins
  for (const t of sc.tokens) {
    if (t.role !== 'num') continue;
    if (f.count == null) {
      f.count = t.v!;
      t.role = 'count';
    } else t.role = 'bad';
  }
  if (!f.amount && f.count != null) f.amount = amountOf(f.count, 'piece', String(f.count));
  if (Object.keys(f.macros).length) {
    const basis = f.basis || f.amount || amountOf(1, 'piece');
    const u = UNITS[basis.unit];
    f.stated = { ...complete(f.macros), unit: basis.unit, value: basis.value, base: basis.value * u.f, dim: u.dim };
  }
  return f;
}

function readStrength(sc: Scan, units: Units): StrengthFields {
  const f: StrengthFields = { sets: null, reps: null, w: null, u: null, added: false, bw: false, rpe: null, rir: null, hold: null };
  const take = taker(f);
  for (const t of sc.tokens) {
    if (t.role === 'sets') {
      if ((t.sets != null && f.sets != null) || (t.reps != null && f.reps != null) || (t.w != null && f.w != null)) {
        t.role = 'bad';
        continue;
      }
      if (t.sets != null) f.sets = t.sets;
      if (t.reps != null) f.reps = t.reps;
      if (t.hold != null) f.hold = t.hold;
      if (t.w != null) {
        f.w = t.w;
        f.u = t.u || null;
      }
    } else if (t.role === 'load') {
      if (t.bw) f.bw = true;
      else if (take(t, 'w', t.w!)) {
        f.u = t.u || null;
        f.added = !!t.added;
      }
    } else if (t.role === 'effort') {
      if (take(t, 'rir', t.rir!)) f.rpe = t.rpe != null ? t.rpe : null;
    } else if (t.role === 'hold') take(t, 'hold', t.hold!);
  }
  // A bare number after sets × reps is the load, in the unit the toggle is on; on its own it's reps (`pushups 20`)
  for (const t of sc.tokens) {
    if (t.role !== 'num') continue;
    if ((f.sets != null || f.reps != null) && f.w == null && !f.bw) {
      f.w = t.v!;
      t.role = 'load';
    } else if (f.reps == null && f.hold == null && Number.isInteger(t.v)) {
      f.reps = t.v!;
      t.role = 'sets';
    } else t.role = 'bad';
  }
  if (f.w != null && !f.u) f.u = units.load;
  if ((f.reps != null || f.hold != null) && f.sets == null) f.sets = 1;
  return f;
}

function readCardio(sc: Scan, units: Units): CardioFields {
  const f: CardioFields = { dist: null, sec: null, interval: null, pace: null, per: null, kmh: null, hr: null, kcal: null, steps: null };
  const take = taker(f);
  for (const t of sc.tokens) {
    if (t.role === 'duration') f.sec = (f.sec || 0) + t.sec!;
    else if (t.role === 'distance') take(t, 'dist', t.dist!);
    else if (t.role === 'interval') take(t, 'interval', { n: t.n!, dist: t.dist || null, sec: t.sec || null });
    else if (t.role === 'pace') {
      if (t.kmh != null) take(t, 'kmh', t.kmh);
      else if (take(t, 'pace', t.pace!)) f.per = t.per!;
    } else if (t.role === 'hr') take(t, 'hr', t.hr!);
    else if (t.role === 'kcal') take(t, 'kcal', t.kcal!);
    else if (t.role === 'steps') take(t, 'steps', t.steps!);
  }
  // A bare number is a distance, in the unit the toggle is on
  for (const t of sc.tokens) {
    if (t.role !== 'num') continue;
    if (f.dist == null) {
      f.dist = distOf(t.v!, units.dist);
      t.role = 'distance';
    } else t.role = 'bad';
  }
  return f;
}

function readCheckin(sc: Scan): CheckinFields {
  const f: CheckinFields = { score: null };
  for (const t of sc.tokens) {
    if (t.role === 'score') {
      if (f.score == null) f.score = t.score!;
      else t.role = 'bad';
    }
  }
  for (const t of sc.tokens) {
    if (t.role !== 'num') continue;
    if (f.score == null && Number.isInteger(t.v) && t.v! >= 1 && t.v! <= 5) {
      f.score = t.v!;
      t.role = 'score';
    } else t.role = 'bad';
  }
  return f;
}

function readWater(sc: Scan): WaterFields {
  const f: WaterFields = { ml: null };
  for (const t of sc.tokens) {
    if (t.role === 'water') {
      if (f.ml == null) f.ml = t.ml!;
      else t.role = 'bad';
    }
  }
  // `water 2` is two glasses; `water 500` is millilitres
  for (const t of sc.tokens) {
    if (t.role !== 'num') continue;
    if (f.ml == null) {
      f.ml = t.v! <= 20 ? t.v! * 250 : t.v!;
      t.role = 'water';
    } else t.role = 'bad';
  }
  return f;
}

function readMeasure(sc: Scan, what: MeasureWhat, units: Units): MeasureFields {
  const weight = what === 'weight';
  const f: MeasureFields = { what, v: null, u: null, si: null };
  for (const t of sc.tokens) {
    if (t.role === 'measure') {
      const ok = f.v == null && UNITS[t.u!].dim === (weight ? 'mass' : 'length');
      if (ok) {
        f.v = t.v!;
        f.u = t.u!;
      } else t.role = 'bad';
    }
  }
  for (const t of sc.tokens) {
    if (t.role !== 'num') continue;
    if (f.v == null) {
      f.v = t.v!;
      f.u = weight ? units.load : units.load === 'lb' ? 'in' : 'cm';
      t.role = 'measure';
    } else t.role = 'bad';
  }
  // Weights in kg, lengths in cm
  if (f.v != null) f.si = weight ? (f.v * UNITS[f.u!].f) / 1000 : f.v * UNITS[f.u!].f * 100;
  return f;
}

function timeOfTokens(tokens: Token[]): number | null {
  const t = tokens.find(x => x.role === 'time');
  return t ? t.min! : null;
}

function lineOf(kind: Line['kind'], sc: Scan, nm: Named, f: Line['f']): Line {
  return { kind, text: sc.text, tokens: sc.tokens, name: nm.name, key: nm.key, f, at: timeOfTokens(sc.tokens) } as Line;
}

function read(text: string, mode: Mode, units: Units): Line {
  if (SCORE_RE.test(text)) {
    const sc = scan(text, CHECKIN, { kind: 'checkin' });
    return lineOf('checkin', sc, nameOf(sc), readCheckin(sc));
  }
  if (RESERVED_RE.test(text)) {
    let sc = scan(text, CHECKIN, { kind: 'checkin' }),
      nm = nameOf(sc);
    if (nm.key && CHECKINS.has(nm.key)) return lineOf('checkin', sc, nm, readCheckin(sc));
    sc = scan(text, WATER, { kind: 'water' });
    nm = nameOf(sc);
    if (nm.key === 'water') return lineOf('water', sc, nm, readWater(sc));
    sc = scan(text, MEASURE, { kind: 'measure' });
    nm = nameOf(sc);
    const what = nm.key && Object.hasOwn(MEASURES, nm.key) ? MEASURES[nm.key] : undefined;
    if (what) return lineOf('measure', sc, nm, readMeasure(sc, what, units));
  }
  const sc = scan(text, PATTERNS[mode], { kind: mode }),
    nm = nameOf(sc);
  if (mode === 'food') return lineOf('food', sc, nm, readFood(sc));
  if (mode === 'strength') return lineOf('strength', sc, nm, readStrength(sc, units));
  const f = readCardio(sc, units);
  // A line that's only a step count is the day's total
  if (!nm.key && f.steps != null && f.dist == null && f.sec == null && f.interval == null) return lineOf('steps', sc, nm, f);
  return lineOf('cardio', sc, nm, f);
}

/* ---------- Caches: the same words always read the same way ---------- */
const CACHE_MAX = 20000;
const LINE_CACHE = new Map<string, Line>();
/** Reads one line (no separators) in a mode */
export function readLine(text: string, mode: Mode, units: Units = DEFAULT_UNITS): Line {
  const k = `${mode}|${units.load}|${units.dist}|${text}`;
  let line = LINE_CACHE.get(k);
  if (!line) {
    if (LINE_CACHE.size > CACHE_MAX) LINE_CACHE.clear();
    line = Object.freeze(read(text, mode, units)) as Line;
    LINE_CACHE.set(k, line);
  }
  return line;
}

// Lines end at a new line, `;`, or a comma that isn't inside a number
const SPLIT = /\n|;|,(?!\d)|(?<!\d),/g;
export interface Segment {
  s: number;
  text: string;
}
/** An entry's text split into its lines, each trimmed, with where it starts */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  const push = (a: number, b: number) => {
    const raw = text.slice(a, b),
      t = raw.trim();
    if (t) out.push({ s: a + raw.length - raw.trimStart().length, text: t });
  };
  for (const m of text.matchAll(SPLIT)) {
    push(at, m.index ?? 0);
    at = (m.index ?? 0) + m[0].length;
  }
  push(at, text.length);
  return out;
}

const ENTRY_CACHE = new Map<string, EntryLine[]>();
/** An entry's lines, each with where it starts in the text. A line with no name carries on the line before it
    (`bench 60x8, 70x6, 80x4`). */
export function readEntry(text: string, mode: Mode, units: Units = DEFAULT_UNITS): EntryLine[] {
  const k = `${mode}|${units.load}|${units.dist}|${text}`;
  let out = ENTRY_CACHE.get(k);
  if (out) return out;
  if (ENTRY_CACHE.size > CACHE_MAX) ENTRY_CACHE.clear();
  ENTRY_CACHE.set(k, (out = []));
  let prev: Line | null = null;
  for (const seg of segments(text)) {
    let line = readLine(seg.text, mode, units);
    if (!line.key && prev && prev.key && prev.kind === line.kind && MODE_KINDS.has(line.kind)) {
      line = { ...line, name: prev.name, key: prev.key, cont: true };
    }
    out.push({ line, s: seg.s });
    prev = line;
  }
  return out;
}

/** The words after the name: what to type again to repeat a line */
export const valuesText = (line: Line): string => {
  const n = line.tokens.find(t => t.role === 'name');
  return (n ? line.text.slice(0, n.s) + line.text.slice(n.e) : line.text).replace(/\s+/g, ' ').trim();
};

export { amountOf };
