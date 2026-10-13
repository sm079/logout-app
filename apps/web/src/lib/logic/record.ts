/* The log as the profile tells it: days in a row, a grid of recent weeks, what it all adds up to, and the newest
   body measurements */
import type { Day, MeasureWhat } from '@logout/engine';
import { addDays, dayDiff, fromIso, isoOf } from './dates.ts';

export interface Streak {
  /** Days logged in a row up to today, or up to yesterday while today is still open */
  now: number;
  /** The most days ever logged in a row */
  best: number;
  /** Days with anything logged */
  days: number;
  /** Today has something logged */
  today: boolean;
}

/** Streaks from the days that have entries. Days after today don't count. */
export function streak(dates: Iterable<string>, today: Date): Streak {
  const t = isoOf(today);
  const sorted = [...new Set(dates)].filter(d => d <= t).sort();
  const have = new Set(sorted);
  let best = 0,
    run = 0,
    prev: Date | null = null;
  for (const d of sorted) {
    const at = fromIso(d);
    run = prev && dayDiff(prev, at) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = at;
  }
  let now = 0;
  for (let d = have.has(t) ? today : addDays(today, -1); have.has(isoOf(d)); d = addDays(d, -1)) now++;
  return { now, best, days: sorted.length, today: have.has(t) };
}

export interface GridDay {
  iso: string;
  /** Entries that day */
  n: number;
  /** How full it shows, 0 to 4 */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
  today: boolean;
}

/** How full a day shows, in quarters of the fullest day around it (taken as at least four entries, so a day or two
    of one entry each doesn't show as full) */
export const levelOf = (n: number, most: number): GridDay['level'] =>
  n <= 0 ? 0 : (Math.min(4, Math.ceil((4 * n) / Math.max(4, most))) as GridDay['level']);

/** The last few weeks as columns of seven days, Sunday first (as the calendar has them), today's week last; with
    each month's name over the week its first day falls in */
export function grid(
  count: (iso: string) => number,
  today: Date,
  weeks: number
): { cols: GridDay[][]; months: { col: number; name: string }[] } {
  const t = isoOf(today);
  const first = addDays(today, -today.getDay() - (weeks - 1) * 7);
  const cols: GridDay[][] = [],
    months: { col: number; name: string }[] = [];
  for (let c = 0; c < weeks; c++) {
    const col: GridDay[] = [];
    for (let r = 0; r < 7; r++) {
      const d = addDays(first, c * 7 + r);
      const iso = isoOf(d);
      const future = iso > t;
      col.push({ iso, n: future ? 0 : count(iso), level: 0, future, today: iso === t });
      if (d.getDate() === 1) months.push({ col: c, name: d.toLocaleDateString('en-US', { month: 'short' }) });
    }
    cols.push(col);
  }
  const days = cols.flat(),
    most = Math.max(0, ...days.map(d => d.n));
  for (const d of days) d.level = levelOf(d.n, most);
  return { cols, months };
}

export interface Lifetime {
  entries: number;
  /** Kilograms lifted */
  volume: number;
  /** Metres covered */
  distM: number;
  /** Food lines read */
  foods: number;
}

/** What every day adds up to */
export function lifetime(days: Iterable<Day>): Lifetime {
  const out: Lifetime = { entries: 0, volume: 0, distM: 0, foods: 0 };
  for (const d of days) {
    out.entries += d.entries;
    out.volume += d.volume;
    out.distM += d.distM;
    out.foods += d.food;
  }
  return out;
}

export interface Measures {
  /** The newest day with a waist, neck or hips */
  date: string | null;
  waist: number | null;
  neck: number | null;
  hips: number | null;
  /** The newest height logged, if any; it stands in for the profile's */
  height: number | null;
}

/** The measurements body fat is read from, as the engine reads them on the newest day that has any: each the newest
    within 30 days of it */
export function measures(days: Map<string, Day>): Measures {
  const dates = [...days.keys()].sort();
  const out: Measures = { date: null, waist: null, neck: null, hips: null, height: null };
  const at = dates.findLast(d => {
    const m = days.get(d)!.meas;
    return m.waist != null || m.neck != null || m.hips != null;
  });
  if (!at) return out;
  out.date = at;
  const newest = (k: MeasureWhat) => {
    const d = dates.findLast(x => x <= at && days.get(x)!.meas[k] != null);
    return d ? { d, v: days.get(d)!.meas[k]! } : null;
  };
  for (const k of ['waist', 'neck', 'hips'] as const) {
    const m = newest(k);
    out[k] = m && dayDiff(fromIso(m.d), fromIso(at)) <= 30 ? m.v : null;
  }
  out.height = newest('height')?.v ?? null;
  return out;
}
