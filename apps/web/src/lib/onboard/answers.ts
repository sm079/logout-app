/* The Script flow's reading: a setup answer typed as a line (`lb mi`, `male 5'11"`, `2600kcal 180p 290c 75f`) read
   into what it says, each piece marked with the class the composer colours a log line with. Any answer can say
   anything: units typed while the goals are asked are taken all the same. */
import type { Sex } from '../data/types.ts';
import { esc } from '../logic/markup.ts';
import { nf } from '../logic/format.ts';
import { heightText, litres } from './words.ts';

export type Topic = 'units' | 'body' | 'goals' | 'start';
export const TOPICS: Topic[] = ['units', 'body', 'goals', 'start'];

export interface Facts {
  load?: 'kg' | 'lb';
  dist?: 'km' | 'mi';
  sex?: Sex;
  heightCm?: number;
  kcal?: number;
  p?: number;
  c?: number;
  f?: number;
  /** Litres */
  water?: number;
  steps?: number;
  sample?: boolean;
}

export interface Mark {
  s: number;
  e: number;
  cls: string;
}

export interface Answer {
  facts: Facts;
  marks: Mark[];
  /** A word that means "leave it as it is" */
  pass: boolean;
  email: string | null;
  /** Words that weren't read */
  unread: number;
}

const TOPIC_OF: Record<keyof Facts, Topic> = {
  load: 'units',
  dist: 'units',
  sex: 'body',
  heightCm: 'body',
  kcal: 'goals',
  p: 'goals',
  c: 'goals',
  f: 'goals',
  water: 'goals',
  steps: 'goals',
  sample: 'start'
};

const num = (s: string) => parseFloat(s.replace(/,/g, ''));
const within = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
const height = (f: Facts, cm: number) => (within(cm, 100, 250) ? ((f.heightCm = Math.round(cm * 10) / 10), 'tk-measure') : null);
const MACRO: Record<string, 'p' | 'c' | 'f'> = { p: 'p', protein: 'p', c: 'c', carb: 'c', carbs: 'c', f: 'f', fat: 'f', fats: 'f' };

/** Each rule reads one kind of piece. It says what the piece is (a class), or null when its number can't be right. */
type Rule = [RegExp, (m: RegExpExecArray, f: Facts, a: Answer) => string | null];
const RULES: Rule[] = [
  [
    /[^\s@]+@[^\s@]+\.[^\s@]+/g,
    (m, _, a) => {
      a.email = m[0];
      return 'tk-time';
    }
  ],
  // 5'11", 5ft 11in, 6 foot
  [
    /\b(\d)\s*(?:'|′|ft\b|feet\b|foot\b)\s*(?:(\d{1,2})\s*(?:"|″|''|in\b|inch\b|inches\b)?)?/gi,
    (m, f) => height(f, (+m[1]! * 12 + +(m[2] ?? 0)) * 2.54)
  ],
  [/\b(\d{2,3}(?:\.\d+)?)\s*(?:cm|centimet(?:er|re)s?)\b/gi, (m, f) => height(f, num(m[1]!))],
  [/\b([12](?:\.\d{1,2})?)\s*(?:m|metres?|meters?)\b/gi, (m, f) => height(f, num(m[1]!) * 100)],
  [/\b(\d{2})\s*(?:"|″|in\b|inch\b|inches\b)/gi, (m, f) => height(f, +m[1]! * 2.54)],
  // A height without a unit: centimetres if it could be, else inches
  [/\b(?:height|tall)\s*(\d{2,3})\b/gi, (m, f) => height(f, +m[1]! >= 100 ? +m[1]! : +m[1]! * 2.54)],
  [/\b(\d[\d,]{2,5})\s*(?:kcal|cals?|calories)\b/gi, (m, f) => (within(num(m[1]!), 800, 8000) ? ((f.kcal = num(m[1]!)), 'tk-kcal') : null)],
  [
    /\b(\d{1,4})\s*(?:g\s*)?(p|protein|c|carbs?|f|fats?)\b/gi,
    (m, f) => {
      const k = MACRO[m[2]!.toLowerCase()]!;
      if (!within(+m[1]!, 0, 1500)) return null;
      f[k] = +m[1]!;
      return `tk-${k}`;
    }
  ],
  [/\bwater\s*(\d+(?:\.\d+)?)\s*(l|litres?|liters?|ml)?\b/gi, (m, f) => water(f, num(m[1]!), m[2])],
  [/\b(\d+(?:\.\d+)?)\s*(l|litres?|liters?|ml)\s*(?:of\s+)?water\b/gi, (m, f) => water(f, num(m[1]!), m[2])],
  [/\b(\d+(?:\.\d+)?)\s*(l|litres?|liters?)\b/gi, (m, f) => water(f, num(m[1]!), m[2])],
  [/\b(\d[\d,.]*)\s*(k)?\s*steps\b/gi, (m, f) => steps(f, num(m[1]!) * (m[2] ? 1000 : 1))],
  [/\bsteps\s*(\d[\d,.]*)\s*(k)?\b/gi, (m, f) => steps(f, num(m[1]!) * (m[2] ? 1000 : 1))],
  [
    /\b(kgs?|kilos?|kilograms?|lbs?|pounds?|km|kms|kilomet(?:er|re)s?|mi|miles?|metric|imperial)\b/gi,
    (m, f) => {
      const w = m[1]!.toLowerCase();
      if (w === 'metric') Object.assign(f, { load: 'kg', dist: 'km' });
      else if (w === 'imperial') Object.assign(f, { load: 'lb', dist: 'mi' });
      else if (/^k(?:g|ilo|ilog)/.test(w)) f.load = 'kg';
      else if (/^(?:lb|pound)/.test(w)) f.load = 'lb';
      else if (/^k/.test(w)) f.dist = 'km';
      else f.dist = 'mi';
      return 'tk-v';
    }
  ],
  [
    /\b(male|man|female|woman)\b/gi,
    (m, f) => {
      f.sex = /^(?:fe|wo)/i.test(m[1]!) ? 'female' : 'male';
      return 'tk-score';
    }
  ],
  [
    /\b(sample|samples|explore|demo|example|fresh|empty|blank|clean)\b/gi,
    (m, f) => {
      f.sample = /^(?:sample|explore|demo|example)/i.test(m[1]!);
      return 'tk-v';
    }
  ],
  [
    /\b(skip|pass|later|keep|defaults?|none|nope|no)\b/gi,
    (_, __, a) => {
      a.pass = true;
      return 'tk-note';
    }
  ]
];
function water(f: Facts, v: number, unit: string | undefined): string | null {
  const l = /^ml$/i.test(unit ?? '') || (!unit && v > 20) ? v / 1000 : v;
  return within(l, 0.25, 10) ? ((f.water = l), 'tk-water') : null;
}
function steps(f: Facts, v: number): string | null {
  return within(v, 500, 100000) ? ((f.steps = Math.round(v)), 'tk-v') : null;
}

// Words that join an answer up without saying anything
const FILLER = new Set(
  "and i i'm i’m im am a an the in on use using with my me for of is it it's to at per a day daily lift lifts run runs like please ok okay yes yeah sure height tall weigh goal goals target targets about just do go start with set up both or".split(
    ' '
  )
);

/** Reads an answer. A number on its own is read as what was asked: a height, or the day's calories. */
export function readAnswer(text: string, asked?: Topic): Answer {
  const a: Answer = { facts: {}, marks: [], pass: false, email: null, unread: 0 };
  const free = (s: number, e: number) => a.marks.every(m => e <= m.s || s >= m.e);
  for (const [re, read] of RULES) {
    for (const m of text.matchAll(re)) {
      const s = m.index,
        e = s + m[0].trimEnd().length;
      if (!free(s, e)) continue;
      a.marks.push({ s, e, cls: read(m as RegExpExecArray, a.facts, a) ?? 'tk-bad' });
    }
  }
  if (asked === 'body' || asked === 'goals')
    for (const m of text.matchAll(/\b\d{2,4}(?:\.\d)?\b/g)) {
      const s = m.index,
        e = s + m[0].length,
        v = num(m[0]);
      if (!free(s, e)) continue;
      const cls =
        asked === 'body' ? height(a.facts, v >= 100 ? v : v * 2.54) : within(v, 800, 8000) ? ((a.facts.kcal = v), 'tk-kcal') : null;
      if (cls) a.marks.push({ s, e, cls });
    }
  for (const m of text.matchAll(/[\p{L}\p{N}'’.,]+/gu)) {
    const s = m.index,
      e = s + m[0].replace(/[.,]+$/, '').length;
    if (s === e || !free(s, e)) continue;
    const filler = FILLER.has(text.slice(s, e).toLowerCase());
    if (!filler) a.unread++;
    a.marks.push({ s, e, cls: filler ? 'tk-note' : 'tk-bad' });
  }
  a.marks.sort((x, y) => x.s - y.s);
  return a;
}

/** The topics an answer says something about */
export function topicsOf(f: Facts): Set<Topic> {
  return new Set((Object.keys(f) as (keyof Facts)[]).map(k => TOPIC_OF[k]));
}

/** What an answer comes to, worded */
export function factsText(f: Facts, imperial: boolean): string {
  const out: string[] = [];
  if (f.load || f.dist) out.push([f.load, f.dist].filter(Boolean).join(' · '));
  if (f.sex) out.push(f.sex);
  if (f.heightCm != null) out.push(heightText(f.heightCm, imperial)!);
  if (f.kcal != null) out.push(`${nf(f.kcal)} kcal`);
  for (const k of ['p', 'c', 'f'] as const) if (f[k] != null) out.push(`${f[k]} ${k}`);
  if (f.water != null) out.push(`${litres(f.water)} water`);
  if (f.steps != null) out.push(`${nf(f.steps)} steps`);
  if (f.sample != null) out.push(f.sample ? 'sample on' : 'empty log');
  return out.join(' · ');
}

/** An answer as markup, each piece coloured */
export function answerMarkup(text: string, marks: Mark[]): string {
  let html = '',
    at = 0;
  for (const m of marks) {
    html += esc(text.slice(at, m.s)) + `<span class="${m.cls}">${esc(text.slice(m.s, m.e))}</span>`;
    at = m.e;
  }
  return html + esc(text.slice(at));
}
