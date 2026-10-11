/* The calendar: what each scale shows, how a selection is described, and the activity marks under each unit */
import { addDays, DAYMS, fmt, isoOf, MON } from './dates.ts';

export type Level = 'd' | 'w' | 'm' | 'y';
export const LEVELS: Level[] = ['d', 'w', 'm', 'y'];
export const UNIT: Record<Level, string> = { d: 'day', w: 'week', m: 'month', y: 'year' };

/** A selected span, plus the scale it was picked at. Views never change it; only a tap or a hold does. */
export interface Selection {
  level: Level;
  from: Date;
  to: Date;
  n: number;
  anchor: Date;
}

/** One cell of the strip: a day, week, month or year */
export interface Span {
  a: Date;
  b: Date;
}

/** Sessions per day, for the marks */
export type Sessions = (iso: string) => number;

/** The units a scale shows around a day: its week's days, its month's weeks, its year's months, or every year */
export function unitsFor(l: Level, F: Date, start: Date, today: Date): Span[] {
  const u: Span[] = [];
  if (l === 'y') for (let y = start.getFullYear(); y <= today.getFullYear(); y++) u.push({ a: new Date(y, 0, 1), b: new Date(y, 11, 31) });
  if (l === 'm') for (let m = 0; m < 12; m++) u.push({ a: new Date(F.getFullYear(), m, 1), b: new Date(F.getFullYear(), m + 1, 0) });
  if (l === 'w') {
    const m0 = new Date(F.getFullYear(), F.getMonth(), 1),
      m1 = new Date(F.getFullYear(), F.getMonth() + 1, 0);
    for (let a = addDays(m0, -m0.getDay()); a <= m1; a = addDays(a, 7)) u.push({ a, b: addDays(a, 6) });
  }
  if (l === 'd') {
    const a = addDays(F, -F.getDay());
    for (let i = 0; i < 7; i++) {
      const d = addDays(a, i);
      u.push({ a: d, b: d });
    }
  }
  return u;
}

export const isNow = (u: Span, today: Date): boolean => u.a <= today && u.b >= today;
export const selectable = (u: Span, start: Date, today: Date): boolean => u.a <= today && u.b >= start;

/** What each view shows follows the selection: today while it's inside, otherwise the selection's start */
export const focusDate = (p: Selection, today: Date): Date => (p.from <= today && p.to >= today ? today : p.from);

/** Which visible units the selection fully covers, and which it only touches */
export function coverage(units: Span[], p: Selection, start: Date, today: Date): { full: number[]; part: number[] } {
  const full: number[] = [],
    part: number[] = [];
  units.forEach((u, i) => {
    if (!selectable(u, start, today)) return;
    if (u.a >= p.from && u.b <= p.to) full.push(i);
    else if (u.a <= p.to && u.b >= p.from) part.push(i);
  });
  return { full, part };
}

export function shortRange(A: Date, B: Date): string {
  if (A.getMonth() === B.getMonth()) return `${fmt(A, { month: 'short' })} ${A.getDate()} – ${B.getDate()}`;
  return `${fmt(A, { month: 'short', day: 'numeric' })} – ${fmt(B, { month: 'short', day: 'numeric' })}`;
}
export function rangeText(A: Date, B: Date, today: Date): string {
  if (A.getFullYear() !== B.getFullYear()) {
    return `${fmt(A, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(B, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return shortRange(A, B) + (B.getFullYear() !== today.getFullYear() ? `, ${B.getFullYear()}` : '');
}

/** The selection's title and the line above it */
export function describe(p: Selection, today: Date, joined: Date): { title: string; eyebrow: string } {
  const { level: l, n, from: A, to: B } = p;
  const CY = today.getFullYear();
  if (n > 1) {
    const title = `${n} ${UNIT[l]}s`;
    if (l === 'd' || l === 'w') return { title, eyebrow: rangeText(A, B, today) };
    if (l === 'm') {
      return {
        title,
        eyebrow:
          A.getFullYear() === B.getFullYear()
            ? `${fmt(A, { month: 'short' })} – ${fmt(B, { month: 'short' })} ${B.getFullYear()}`
            : `${fmt(A, { month: 'short', year: 'numeric' })} – ${fmt(B, { month: 'short', year: 'numeric' })}`
      };
    }
    return { title, eyebrow: `${A.getFullYear()} – ${B.getFullYear()}` };
  }
  if (l === 'd') {
    const back = Math.round((+today - +A) / DAYMS);
    const title =
      back === 0 ? 'Today' : back === 1 ? 'Yesterday' : back < 7 ? fmt(A, { weekday: 'long' }) : fmt(A, { month: 'short', day: 'numeric' });
    return {
      title,
      eyebrow: fmt(A, { weekday: 'short', month: 'short', day: 'numeric' }) + (A.getFullYear() !== CY ? `, ${A.getFullYear()}` : '')
    };
  }
  if (l === 'w') {
    const back = Math.round((+addDays(today, -today.getDay()) - +A) / (7 * DAYMS));
    if (back <= 1) return { title: back === 0 ? 'This week' : 'Last week', eyebrow: rangeText(A, B, today) };
    return { title: shortRange(A, B), eyebrow: `Week · ${B.getFullYear()}` };
  }
  if (l === 'm') {
    const back = (CY - A.getFullYear()) * 12 + today.getMonth() - A.getMonth();
    return {
      title: fmt(A, { month: 'long' }),
      eyebrow: back === 0 ? `This month · ${CY}` : back === 1 ? `Last month · ${A.getFullYear()}` : String(A.getFullYear())
    };
  }
  const back = CY - A.getFullYear();
  return {
    title: String(A.getFullYear()),
    eyebrow:
      back === 0
        ? 'This year'
        : back === 1
          ? 'Last year'
          : A.getFullYear() === joined.getFullYear()
            ? `Joined ${fmt(joined, { month: 'long', day: 'numeric' })}`
            : `${back} years ago`
  };
}

/** Sessions over a span, how many of its days have passed, and how many of those were logged */
export function stats(a: Date, b: Date, sessions: Sessions, today: Date): { s: number; days: number; logged: number } {
  let s = 0,
    days = 0,
    logged = 0;
  const end = b > today ? today : b;
  for (let d = new Date(a); d <= end; d = addDays(d, 1)) {
    days++;
    const n = sessions(isoOf(d));
    if (n) {
      s += n;
      logged++;
    }
  }
  return { s, days, logged };
}

/* Marks: dots for a day's sessions, a tick per day of a week, quarters of a month, months of a year */
export type Mark =
  | { kind: 'dots'; n: number; ring: boolean }
  | { kind: 'ticks'; on: (boolean | null)[] }
  | { kind: 'quarters'; o: (number | null | false)[] }
  | { kind: 'months'; o: (number | null | false)[] };

/** How much of a span was logged: false for the future, null for nothing, else an opacity */
function spanO(a: Date, b: Date, sessions: Sessions, today: Date): number | null | false {
  if (a > today) return false;
  const st = stats(a, b, sessions, today);
  if (!st.logged) return null;
  return +(0.35 + (0.65 * st.logged) / st.days).toFixed(2);
}

export function markOf(l: Level, u: Span, sessions: Sessions, today: Date): Mark {
  if (l === 'd') {
    const n = sessions(isoOf(u.a));
    return { kind: 'dots', n: Math.min(n, 3), ring: !n && +u.a === +today };
  }
  if (l === 'w') {
    const on: (boolean | null)[] = [];
    for (let k = 0; k < 7; k++) {
      const d = addDays(u.a, k);
      on.push(d > today ? null : sessions(isoOf(d)) > 0);
    }
    return { kind: 'ticks', on };
  }
  if (l === 'm') {
    const D = u.b.getDate(),
      o: (number | null | false)[] = [];
    for (let q = 0; q < 4; q++) {
      const s = Math.round((D * q) / 4) + 1,
        e = Math.round((D * (q + 1)) / 4);
      o.push(spanO(new Date(u.a.getFullYear(), u.a.getMonth(), s), new Date(u.a.getFullYear(), u.a.getMonth(), e), sessions, today));
    }
    return { kind: 'quarters', o };
  }
  const o: (number | null | false)[] = [];
  for (let m = 0; m < 12; m++) o.push(spanO(new Date(u.a.getFullYear(), m, 1), new Date(u.a.getFullYear(), m + 1, 0), sessions, today));
  return { kind: 'months', o };
}

/** A cell's two lines of text */
export function cellText(l: Level, u: Span): { top: string; main: string } {
  if (l === 'd') return { top: fmt(u.a, { weekday: 'narrow' }), main: String(u.a.getDate()) };
  if (l === 'w')
    return { top: u.a.getMonth() === u.b.getMonth() ? MON(u.a) : `${MON(u.a)}–${MON(u.b)}`, main: `${u.a.getDate()}–${u.b.getDate()}` };
  if (l === 'm') return { top: '', main: MON(u.a) };
  return { top: '', main: String(u.a.getFullYear()) };
}

export function cellLabel(l: Level, u: Span, sessions: Sessions, start: Date, today: Date): string {
  const name =
    l === 'd'
      ? fmt(u.a, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : l === 'w'
        ? `Week of ${rangeText(u.a, u.b, today)}`
        : l === 'm'
          ? fmt(u.a, { month: 'long', year: 'numeric' })
          : String(u.a.getFullYear());
  if (!selectable(u, start, today)) return `${name}, upcoming`;
  const st = stats(u.a, u.b, sessions, today);
  return `${name}, ${st.s} session${st.s === 1 ? '' : 's'}`;
}
