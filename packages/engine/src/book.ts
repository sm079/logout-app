/* The book: everything worked out from the entries, in two passes over every entry, oldest first:
     1. the newest line that states an item's values sets that item's card (one set of values per kind of amount);
     2. every line is resolved against the cards, then added up per day.
   What the user typed never changes; only what it resolves to does. */
import { readAliased } from './aliases';
import { daysBetween, nextDay } from './dates';
import { clock, distText, LABEL, nf } from './format';
import { amountOf, MODE_KINDS } from './read';
import type { Book, BookEntry, BuildOptions, Card, Day, Entry, Line, MeasureWhat, Mode, Profile, Resolved, Sum, Totals } from './types';
import { DEFAULT_UNITS, UNITS } from './units';

/* ---------- Pass 1: cards ---------- */
export function cardFor(cards: Map<string, Card>, line: Line): Card {
  const id = `${line.kind}:${line.key}`;
  let c = cards.get(id);
  if (!c) {
    c = {
      id,
      kind: line.kind as Mode,
      key: line.key as string,
      name: line.name ?? (line.key as string),
      uses: 0,
      last: null,
      lastEntry: null,
      repeat: [],
      bases: {},
      from: {},
      newest: null,
      amount: null,
      history: {}
    };
    cards.set(id, c);
  }
  return c;
}

export function learn(cards: Map<string, Card>, line: Line, e: Pick<Entry, 'id' | 'date'>): Card | null {
  if (!line.key || !MODE_KINDS.has(line.kind)) return null;
  const c = cardFor(cards, line);
  c.name = line.name ?? line.key;
  if (c.lastEntry !== e.id) {
    c.uses++;
    c.lastEntry = e.id;
    c.repeat = [];
  }
  c.last = e.date;
  c.repeat.push(line);
  if (line.kind === 'food') {
    if (line.f.amount) c.amount = line.f.amount;
    const st = line.f.stated;
    // `from`: the entry that stated each kind of amount's values
    if (st) {
      c.bases = { ...c.bases, [st.dim]: st };
      c.from = { ...c.from, [st.dim]: e.id };
      c.newest = st.dim;
    }
  }
  return c;
}

/* ---------- Pass 2: resolving ---------- */
/** Resolves a line against its card. `U` is a usual set (load × reps), so volume can stand in for effort. */
export function settle(line: Line, card: Card | null | undefined, U: number, s: number): Resolved {
  if (!line.key && line.kind !== 'steps') return { line, st: 'noname', v: {}, s };
  switch (line.kind) {
    case 'food': {
      const f = line.f;
      // No amount: as much as the newest values were stated for
      const newest = card && card.newest ? card.bases[card.newest] : null;
      const amt = f.amount || (newest ? amountOf(newest.value, newest.unit) : amountOf(1, 'piece'));
      const u = UNITS[amt.unit],
        b = card && card.bases[u.dim];
      if (!b) return { line, st: 'needs', v: { amount: amt, other: !!newest }, s };
      const k = (amt.value * u.f) / b.base;
      return {
        line,
        st: 'ok',
        s,
        v: {
          amount: amt,
          worked: b.worked,
          kcal: b.kcal != null ? b.kcal * k : null,
          p: b.p != null ? b.p * k : null,
          c: b.c != null ? b.c * k : null,
          f: b.f != null ? b.f * k : null
        }
      };
    }
    case 'strength': {
      const f = line.f;
      if (f.reps == null && f.hold == null) return { line, st: 'needs', v: {}, s };
      const sets = f.sets as number;
      const kg = f.w != null ? (f.w * UNITS[f.u!].f) / 1000 : 0;
      const volume = f.reps ? sets * f.reps * kg : 0;
      const hard = f.rir == null || f.rir <= 4 ? sets : 0;
      // Fatigue in hard-set units: weighted by effort when it's given, otherwise by volume against a usual set
      const load = f.rir != null ? sets * Math.max(0.3, Math.min(1, 1 - 0.1 * f.rir)) : volume > 0 && !f.added ? volume / U : sets * 0.7;
      return { line, st: 'ok', v: { sets, reps: f.reps, kg, unit: f.u, volume, hard, load, hold: f.hold }, s };
    }
    case 'cardio': {
      const f = line.f,
        iv = f.interval;
      const distM = f.dist ? f.dist.m : iv && iv.dist ? iv.n * iv.dist.m : 0;
      let sec = f.sec || (iv && iv.sec ? iv.n * iv.sec : 0);
      if (!sec && distM && f.pace) sec = (f.pace * distM) / UNITS[f.per!].f;
      if (!sec && distM && f.kmh) sec = (distM / 1000 / f.kmh) * 3600;
      if (!distM && !sec) return { line, st: 'needs', v: {}, s };
      return { line, st: 'ok', v: { distM, sec, hr: f.hr, kcal: f.kcal, steps: f.steps, load: sec ? sec / 600 : (distM / 1000) * 0.6 }, s };
    }
    case 'steps':
      return { line, st: 'ok', v: { steps: line.f.steps }, s };
    case 'water':
      return line.f.ml == null ? { line, st: 'needs', v: {}, s } : { line, st: 'ok', v: { ml: line.f.ml }, s };
    case 'checkin':
      return line.f.score == null ? { line, st: 'needs', v: {}, s } : { line, st: 'ok', v: { score: line.f.score }, s };
    case 'measure':
      return line.f.v == null ? { line, st: 'needs', v: {}, s } : { line, st: 'ok', v: { what: line.f.what, si: line.f.si as number }, s };
  }
  return { line, st: 'needs', v: {}, s };
}

/* ---------- Readouts ---------- */
// What a resolved line comes to, in a few words: shown at the end of the line while typing
const NEEDS: Record<string, string> = {
  food: 'add kcal p c f',
  strength: 'add sets × reps',
  cardio: 'add a distance or time',
  water: 'add an amount, 500ml',
  checkin: 'add a score, 4/5',
  measure: 'add a value'
};
const DIM_WORD: Record<string, string> = { mass: 'grams', volume: 'ml' };

export function readout(r: Resolved): string {
  const { line, v } = r;
  if (r.st === 'noname') return 'add a name';
  if (r.st === 'needs') {
    if (line.kind === 'food' && v.other && v.amount) {
      const d = UNITS[v.amount.unit].dim;
      return `add values for ${DIM_WORD[d] || `${LABEL[d] || d}s`}`;
    }
    if (line.kind === 'cardio' && line.f.steps != null) return `${nf(line.f.steps)} steps`;
    return NEEDS[line.kind] || '';
  }
  switch (line.kind) {
    case 'food':
      return v.kcal != null
        ? `${nf(v.kcal)} kcal`
        : (['p', 'c', 'f'] as const)
            .filter(m => v[m] != null)
            .map(m => `${nf(v[m] as number)}${m}`)
            .join(' ');
    case 'strength': {
      const f = line.f;
      if (f.hold != null) return `${f.sets} × ${clock(f.hold)}`;
      return v.kg
        ? `${nf((f.sets as number) * (f.reps as number) * (f.w as number))} ${f.u}`
        : `${nf((f.sets as number) * (f.reps as number))} reps`;
    }
    case 'cardio': {
      const f = line.f,
        iv = f.interval;
      if (iv) return `${iv.n} × ${iv.dist ? distText(iv.dist) : clock(iv.sec as number)}`;
      if (v.distM && v.sec) {
        const per = f.dist && f.dist.unit === 'mi' ? 'mi' : 'km';
        return `${clock(v.sec / (v.distM / UNITS[per].f))} /${per}`;
      }
      return v.distM ? distText(f.dist!) : clock(v.sec as number);
    }
    case 'steps':
      return `${nf(v.steps as number)} steps`;
    case 'water':
      return `${nf(v.ml as number)} ml`;
    case 'checkin':
      return 'check-in';
    case 'measure':
      return v.what === 'weight' ? 'body weight' : (v.what as string);
  }
  return '';
}

/* ---------- Adding up ---------- */
const zero = (): Totals => ({
  kcal: 0,
  p: 0,
  c: 0,
  f: 0,
  food: 0,
  needs: 0,
  water: 0,
  sets: 0,
  hard: 0,
  reps: 0,
  volume: 0,
  lifts: 0,
  cardioS: 0,
  distM: 0,
  burned: 0,
  cardio: 0,
  steps: null,
  check: {},
  meas: {},
  load: 0
});

/** What an entry's (or a draft's) resolved lines add up to */
export function sum(res: Resolved[]): Sum {
  const s: Sum = { ...zero(), kinds: {} };
  const lifts = new Set<string>();
  for (const r of res) {
    const k = r.line.kind,
      v = r.v;
    s.kinds[k] = (s.kinds[k] || 0) + 1;
    if (r.st !== 'ok') {
      s.needs++;
      continue;
    }
    if (k === 'food') {
      s.food++;
      s.kcal += v.kcal || 0;
      s.p += v.p || 0;
      s.c += v.c || 0;
      s.f += v.f || 0;
    } else if (k === 'strength') {
      s.sets += v.sets as number;
      s.hard += v.hard as number;
      s.reps += (v.sets as number) * (v.reps || 0);
      s.volume += v.volume as number;
      s.load += v.load as number;
      lifts.add(r.line.key as string);
    } else if (k === 'cardio') {
      s.cardio++;
      s.cardioS += v.sec as number;
      s.distM += v.distM as number;
      s.burned += v.kcal || 0;
      s.load += v.load as number;
      if (v.steps != null) s.activitySteps = (s.activitySteps || 0) + v.steps;
    } else if (k === 'steps') s.steps = v.steps as number;
    else if (k === 'water') s.water += v.ml as number;
    else if (k === 'checkin') s.check[r.line.key as string] = v.score as number;
    else if (k === 'measure') s.meas[v.what as MeasureWhat] = v.si as number;
  }
  s.lifts = lifts.size;
  return s;
}

/** Entries in the order they happened: by day, then time, then id */
export const byWhen = (a: Pick<Entry, 'date' | 'time' | 'id'>, b: Pick<Entry, 'date' | 'time' | 'id'>): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || 0) - (b.time || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// A usual set: the median of load × reps over every loaded set, so volume can stand in for effort
function usualSet(list: BookEntry[]): number {
  const xs: number[] = [];
  for (const e of list) {
    for (const { line } of e.lines) {
      if (line.kind === 'strength' && line.f.w && line.f.reps && !line.f.added)
        xs.push(((line.f.w * UNITS[line.f.u!].f) / 1000) * line.f.reps);
    }
  }
  if (!xs.length) return 600;
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)] || 600;
}

const ADDED = [
  'kcal',
  'p',
  'c',
  'f',
  'food',
  'needs',
  'water',
  'sets',
  'hard',
  'reps',
  'volume',
  'lifts',
  'cardioS',
  'distM',
  'burned',
  'cardio',
  'load'
] as const;
export const newDay = (date: string): Day => ({ ...zero(), date, sessions: 0, entries: 0, minutes: 0 });
function add(day: Day, s: Sum) {
  for (const k of ADDED) day[k] += s[k];
  // The newest step count, check-in and measurement of the day stand
  if (s.steps != null) day.steps = s.steps;
  Object.assign(day.check, s.check);
  Object.assign(day.meas, s.meas);
  day.minutes = day.cardioS / 60 + day.sets * 3;
}

/* ---------- Recovery and body fat ---------- */
const HALF_LIFE = 1.5,
  DECAY = Math.pow(0.5, 1 / HALF_LIFE),
  BASE_DAYS = 28;
// Fatigue fades by half every day and a half; recovery compares today's fatigue with your usual
function recoverySeries(days: Map<string, Day>, from: string, to: string): Map<string, number> {
  const out = new Map<string, number>(),
    hist: number[] = [];
  let F = 0,
    run = 0;
  for (let d = from; d <= to; d = nextDay(d)) {
    const day = days.get(d);
    F = F * DECAY + (day ? day.load : 0);
    const base = Math.max(4, hist.length ? run / hist.length : 0);
    const sleep = day && day.check.sleep != null ? 1 + 0.075 * (day.check.sleep - 3) : 1;
    out.set(d, Math.max(5, Math.min(99, 100 * Math.exp((-0.4 * F) / base) * sleep)));
    hist.push(F);
    run += F;
    if (hist.length > BASE_DAYS) run -= hist.shift() as number;
  }
  return out;
}

/** US Navy body fat estimate, in percent; null without what it needs */
export function navy(
  sex: Profile['sex'],
  height: number | null | undefined,
  waist: number | null | undefined,
  neck: number | null | undefined,
  hips?: number | null
): number | null {
  if (!sex || !height || !waist || !neck) return null;
  if (sex === 'female') {
    if (!hips || waist + hips - neck <= 0) return null;
    return 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(height)) - 450;
  }
  if (waist - neck <= 0) return null;
  return 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
}

// From the newest waist, neck (and hips) within 30 days
function bodyFatSeries(days: Map<string, Day>, profile: Profile): Map<string, number> {
  const out = new Map<string, number>(),
    seen: Partial<Record<MeasureWhat, { v: number; date: string }>> = {};
  for (const date of [...days.keys()].sort()) {
    const m = (days.get(date) as Day).meas;
    for (const k of Object.keys(m) as MeasureWhat[]) seen[k] = { v: m[k] as number, date };
    if (m.waist == null && m.neck == null && m.hips == null) continue;
    const fresh = (k: MeasureWhat) => {
      const x = seen[k];
      return x && daysBetween(x.date, date) <= 30 ? x.v : null;
    };
    const height = seen.height ? seen.height.v : profile.heightCm;
    const bf = navy(profile.sex, height, fresh('waist'), fresh('neck'), fresh('hips'));
    if (bf != null && bf > 2 && bf < 60) out.set(date, bf);
  }
  return out;
}

/* ---------- Building the book ---------- */
/** Reads every entry and works out the cards, each line's numbers, each day's totals, recovery and body fat */
export function build(entries: readonly Entry[], opts: BuildOptions = {}): Book {
  const profile = opts.profile || {},
    aliases = opts.aliases || {};
  const list: BookEntry[] = entries
    .map(e => ({
      id: e.id,
      date: e.date,
      time: e.time,
      mode: e.mode,
      text: e.text,
      units: e.units,
      lines: readAliased(e.text, e.mode, e.units || DEFAULT_UNITS, aliases),
      res: [] as Resolved[],
      sum: null as unknown as Sum
    }))
    .sort(byWhen);
  const cards = new Map<string, Card>();
  let seq = 0;
  for (const e of list) {
    for (const { line } of e.lines) {
      const c = learn(cards, line, e);
      // Every statement is kept, so a draft placed among them can be read as it will be saved
      if (c && line.kind === 'food' && line.f.stated) {
        const st = line.f.stated;
        (c.history[st.dim] ??= []).push({ id: e.id, date: e.date, time: e.time, seq: seq++, stated: st });
      }
    }
  }
  const U = usualSet(list);
  const days = new Map<string, Day>();
  for (const e of list) {
    e.res = e.lines.map(({ line, s }) => settle(line, line.key ? cards.get(`${line.kind}:${line.key}`) : null, U, s));
    e.sum = sum(e.res);
    let day = days.get(e.date);
    if (!day) days.set(e.date, (day = newDay(e.date)));
    add(day, e.sum);
    day.entries++;
    if (e.sum.sets || e.sum.cardio) day.sessions++;
  }
  const dates = [...days.keys()].sort();
  const lastDate = dates[dates.length - 1];
  const last = opts.today && (!dates.length || opts.today > (lastDate as string)) ? opts.today : lastDate;
  const firstLoad = dates.find(d => (days.get(d) as Day).load > 0);
  return {
    entries: list,
    byId: new Map(list.map(e => [e.id, e])),
    cards,
    days,
    U,
    profile,
    aliases,
    recovery: firstLoad && last ? recoverySeries(days, firstLoad, last) : new Map(),
    bodyFat: bodyFatSeries(days, profile)
  };
}
