/* What each widget shows for the selected period, worked out from the timeline */
import { preview } from '@logout/engine';
import type { Goals } from '../data/types.ts';
import type { Selection } from '../logic/calendar.ts';
import { fmt, MON, yr } from '../logic/dates.ts';
import { compact, nf } from '../logic/format.ts';
import { markup } from '../logic/markup.ts';
import { FIRST, type DaySpan, type Gran, type Metric, type Timeline } from '../logic/metrics.ts';
import type { MTintName } from '../logic/palette.ts';
import type { BarData, BarItem, HeatCell, HeatData, LineData } from './plots.ts';

const MODE_NAME = { strength: 'Strength', cardio: 'Cardio', food: 'Food' } as const;
const MIN_BARS = 7;

/** A point a chart can be scrubbed to */
export interface ScrubPoint {
  label: string;
  num: string;
  unit: string;
  v: number | null;
  none?: boolean;
}

export interface Headline {
  qual: string;
  name: string;
  num: string;
  unit: string;
  meta: string;
  /** Change, for the arrow */
  d: number;
  up: boolean | null;
  /** Never logged */
  none: boolean;
  /** Markup to show in place of the chart, if any */
  empty: string;
}

/** In place of a chart with nothing to draw: the line to type, coloured as the composer would read it */
export function emptyHTML(m: Metric, bodyKnown: boolean): string {
  const [ex, mode] = FIRST[m.id];
  const line = `<code class="wex">${markup(ex, preview(null, ex, mode || 'strength').res)}</code>`;
  if (m.id === 'bodyfat' && !bodyKnown) return `<span>Needs your sex and height, then</span>${line}`;
  return `<span>${mode ? `In ${MODE_NAME[mode]}, type` : 'Type'}</span>${line}`;
}

export function headline(
  tl: Timeline,
  m: Metric,
  S: DaySpan,
  p: Selection,
  wantTotal: boolean,
  bodyKnown: boolean,
  override?: { d: number; text: string } | null
): Headline {
  const none = !tl.ever(m);
  const sv = tl.spanValue(m, S, wantTotal);
  const [num, unit] = none ? ['—', ''] : tl.fmt(m, sv.v);
  const dl = none
    ? { d: 0, text: m.id === 'bodyfat' && !bodyKnown ? 'Needs a profile' : 'Not logged yet' }
    : override || tl.spanDelta(m, S, wantTotal, p);
  return { qual: sv.q, name: m.name, num, unit, meta: dl.text, d: dl.d, up: m.up, none, empty: none ? emptyHTML(m, bodyKnown) : '' };
}

/* ---------- Line chart ---------- */
export function lineView(tl: Timeline, m: Metric, S: DaySpan): { data: LineData; pts: ScrubPoint[] } {
  const a0 = S.n < 14 ? Math.max(0, S.b - 13) : S.a;
  const nd = S.b - a0 + 1,
    gran: Gran = nd <= 62 ? 'd' : nd <= 400 ? 'w' : 'm';
  const pts: (ScrubPoint & { t: number; v: number })[] = [];
  for (const bk of tl.buckets(a0, S.b, gran)) {
    const v = gran === 'd' ? tl.mv(m, bk.a) : tl.avg(m, bk.a, bk.b);
    if (v == null) continue;
    const [num, unit] = tl.fmt(m, v);
    pts.push({ t: gran === 'd' ? bk.a : (bk.a + bk.b) / 2, v, label: tl.bucketLabel(bk, gran), num, unit });
  }
  return {
    data: { pts, t0: a0, t1: S.b, band: a0 < S.a ? [S.a, S.b] : null, xl: [tl.shortDate(a0), tl.shortDate(S.b)], live: S.live },
    pts
  };
}

/* ---------- Bar chart ---------- */
export function barView(
  tl: Timeline,
  m: Metric,
  S: DaySpan
): { data: BarData; items: (BarItem & ScrubPoint)[]; override: { d: number; text: string } | null } {
  let a0 = S.aRaw;
  const b0 = S.end,
    nd = b0 - a0 + 1;
  const gran: Gran = nd <= 31 ? 'd' : nd <= 140 ? 'w' : nd <= 1100 ? 'm' : 'y';
  // A short or barely started selection is read against the periods before it, shown dimmed
  let bks = tl.buckets(a0, b0, gran);
  while (bks.filter(bk => bk.a <= tl.last).length < MIN_BARS && a0 > 0) {
    a0 = tl.prevBucketStart(a0, gran);
    bks = tl.buckets(a0, b0, gran);
  }
  const ctx = a0 < S.aRaw;
  const goodGoal = !!(m.goal && m.up);
  let vmax = 0;
  const items = bks.map(bk => {
    if (bk.a > tl.last) return { v: null, cls: 'fut', bk };
    if (bk.b < 0) return { v: null, cls: 'none', bk };
    const end = Math.min(bk.b, tl.last);
    const endC = gran !== 'd' && end === tl.last && bk.a < end ? end - 1 : end;
    const v = tl.avg(m, bk.a, endC);
    if (v != null) vmax = Math.max(vmax, v);
    const sel = bk.b >= S.aRaw;
    return {
      v,
      bk,
      on: ctx && sel,
      live: gran === 'd' && bk.a === tl.last,
      cls: ctx ? (sel ? 'sel' : 'dim') : !goodGoal || (v ?? 0) >= m.goal! ? 'ok' : 'low'
    };
  });
  const max = Math.max(m.goal ? m.goal * 1.15 : 0, vmax * 1.1) || 1;
  const n = items.length,
    mid = Math.floor((n - 1) / 2);
  const out = items.map((it, i) => {
    const d = it.bk.d;
    const tick =
      gran === 'd'
        ? n <= 14
          ? fmt(d, { weekday: 'narrow' })
          : i === 0 || i === mid || i === n - 1
            ? d.getDate()
            : ''
        : gran === 'w'
          ? i === 0 || i === n - 1
            ? fmt(d, { month: 'short', day: 'numeric' })
            : ''
          : gran === 'm'
            ? n <= 12
              ? fmt(d, { month: 'narrow' })
              : i === 0 || i === n - 1
                ? fmt(d, { month: 'short' }) + yr(d, tl.today)
                : ''
            : d.getFullYear();
    const [num, u] = tl.fmt(m, it.v);
    let unit = u;
    if (gran !== 'd' && it.v != null) unit = (unit ? unit + ' ' : '') + `avg/${m.per || 'day'}`;
    return {
      v: it.v,
      cls: it.cls,
      on: 'on' in it ? it.on : false,
      live: 'live' in it ? it.live : false,
      tick,
      label: tl.bucketLabel(it.bk, gran),
      num,
      unit,
      none: it.v == null
    };
  });
  let override: { d: number; text: string } | null = null;
  if (!S.single && goodGoal) {
    let met = 0,
      days = 0;
    for (let i = S.a; i <= S.bc; i++) {
      days++;
      if ((m.src(i) ?? -Infinity) >= m.goal!) met++;
    }
    override = { d: 0, text: `Goal hit ${met} of ${days} days` };
  }
  return { data: { key: `${gran}:${n}:${ctx}`, items: out, max, goal: m.goal || 0, goalText: compact(m.goal || 0) }, items: out, override };
}

/* ---------- Activity grid ---------- */
export function heatView(
  tl: Timeline,
  m: Metric,
  S: DaySpan
): { data: HeatData; cells: (HeatCell & ScrubPoint)[]; override: { d: number; text: string } | null } {
  const endWeek = S.end - tl.dowOf(S.end);
  let start = S.aRaw - tl.dowOf(S.aRaw);
  let ncols = (endWeek - start) / 7 + 1;
  if (ncols < 26) {
    start = endWeek - 25 * 7;
    ncols = 26;
  }
  if (ncols > 53) {
    start = endWeek - 52 * 7;
    ncols = 53;
  }
  const wide = S.end - S.aRaw + 1 >= 7;
  const cells: (HeatCell & ScrubPoint)[] = [],
    months: { col: number; text: string }[] = [];
  let lastLabel = -9;
  for (let c = 0; c < ncols; c++) {
    for (let r = 0; r < 7; r++) {
      const i = start + c * 7 + r,
        d = tl.dateOf(i);
      const v = tl.mv(m, i);
      const lvl = !v ? 0 : 1 + m.heat.filter(t => v >= t).length;
      if (d.getDate() === 1 && c - lastLabel >= 3) {
        months.push({ col: c, text: MON(d).slice(0, 3) });
        lastLabel = c;
      }
      const inSel = i >= S.aRaw && i <= S.end;
      let [num, unit] = tl.fmt(m, v);
      if (m.rest && !v) {
        num = 'Rest';
        unit = '';
      }
      const none = i < 0 || i > tl.last;
      cells.push({
        v,
        lvl,
        none,
        out: wide && !inSel,
        sel: !wide && inSel,
        live: i === tl.last,
        label:
          fmt(d, { weekday: 'short', month: 'short', day: 'numeric' }) +
          (d.getFullYear() !== tl.today.getFullYear() ? ` ’${String(d.getFullYear()).slice(2)}` : ''),
        num,
        unit
      });
    }
  }
  const target = m.goal || m.heat[1] || 0;
  let hit = 0,
    days = 0;
  for (let i = S.a; i <= S.bc; i++) {
    days++;
    if ((m.src(i) || 0) >= target) hit++;
  }
  return {
    data: { key: `${start}:${ncols}`, ncols, cells, months },
    cells,
    override: S.single ? null : { d: 0, text: `On target ${hit} of ${days} days` }
  };
}

/* ---------- Card sparkline: the last 12 units at the selection's scale, ending with the selection ---------- */
export function sparkView(tl: Timeline, m: Metric, S: DaySpan, level: Selection['level']): LineData {
  const endD = tl.dateOf(S.b);
  const pts: { t: number; v: number }[] = [];
  for (let k = 11; k >= 0; k--) {
    let a: number, b: number;
    if (level === 'd') a = b = S.b - k;
    else if (level === 'w') {
      b = S.b - endD.getDay() + 6 - 7 * k;
      a = b - 6;
    } else if (level === 'm') {
      const m0 = new Date(endD.getFullYear(), endD.getMonth() - k, 1);
      a = tl.dayIdx(m0);
      b = tl.dayIdx(new Date(m0.getFullYear(), m0.getMonth() + 1, 0));
    } else {
      const y = endD.getFullYear() - k;
      if (y < tl.start.getFullYear()) continue;
      a = tl.dayIdx(new Date(y, 0, 1));
      b = tl.dayIdx(new Date(y, 11, 31));
    }
    if (b < 0) continue;
    b = Math.min(b, S.b);
    const v = m.state ? (tl.latest(m, b, a)?.v ?? null) : m.total && level !== 'd' ? tl.sum(m, a, b) : tl.avg(m, a, b);
    if (v != null) pts.push({ t: 0, v });
  }
  if (pts.length === 1) pts.unshift({ t: 0, v: pts[0]!.v });
  pts.forEach((p, i) => (p.t = i));
  return { pts, t0: 0, t1: Math.max(0, pts.length - 1), live: S.live };
}

/* ---------- Recovery ---------- */
export interface RecoveryView {
  none: boolean;
  score: number;
  state: [string, MTintName];
  qual: string;
  sub: string;
  hard: string;
  last: string;
  sleep: string;
  label: string;
}
// Worked out from training: effort-weighted hard sets (volume when there's no effort) and cardio, fading over the
// following days, against your usual, and nudged by the night's sleep check-in
export function recoveryView(tl: Timeline, S: DaySpan): RecoveryView {
  const s = tl.ser;
  const raw = S.single ? (s.rec[S.b] ?? null) : tl.avgOf(s.rec, S.a, S.b),
    none = raw == null,
    score = Math.round(raw || 0);
  let hard = 0;
  for (let i = Math.max(0, S.b - 2); i <= S.b; i++) hard += s.hard[i] || 0;
  let last = -1;
  for (let i = S.b; i >= 0 && last < 0; i--) if (s.sessions[i]) last = i;
  const lastText = last < 0 ? '—' : S.b === last ? 'Today' : `${S.b - last}d ago`;
  const sl = S.single ? (s.sleep[S.b] ?? null) : tl.avgOf(s.sleep, S.a, S.b),
    slText = sl == null ? '—' : S.single ? String(sl) : sl.toFixed(1);
  const state: [string, MTintName] = none
    ? ['Nothing yet', 'none']
    : score >= 67
      ? ['Primed', 'good']
      : score >= 34
        ? ['Moderate', 'warn']
        : ['Low', 'bad'];
  return {
    none,
    score,
    state,
    qual: S.single ? 'Readiness' : `${S.n}-day avg`,
    sub: none ? 'no training yet' : S.single ? (S.isToday ? 'today' : tl.shortDate(S.b)) : 'average',
    hard: nf(hard),
    last: lastText,
    sleep: slText,
    label: none
      ? 'Recovery: nothing to go on yet. Log a lift or a run.'
      : `Recovery ${score}%, ${state[0]}. ${nf(hard)} hard sets in the last 3 days, last session ${lastText.toLowerCase()}, sleep ${slText} out of 5`
  };
}

/* ---------- Fuel ---------- */
export const MACROS: [k: 'p' | 'c' | 'f', name: string, colour: string, kcalPerGram: number][] = [
  ['p', 'Protein', '--m-p', 4],
  ['c', 'Carbs', '--m-c', 4],
  ['f', 'Fat', '--m-f', 9]
];
export interface FuelView {
  qual: string;
  kcal: number;
  goal: number;
  pct: string;
  meta: string;
  grams: number[];
  /** Each macro's share of the ring as [visible length, offset] */
  segs: { len: number; off: number; on: boolean }[];
  label: string;
}
export const C_RING = 2 * Math.PI * 52;
export function fuelView(tl: Timeline, S: DaySpan, goals: Goals): FuelView {
  const s = tl.ser;
  const val = (k: 'kcal' | 'p' | 'c' | 'f') => (S.single ? s[k][S.b] : tl.avgOf(s[k], S.a, S.bc)) || 0;
  const kcal = val('kcal'),
    goal = goals.kcal;
  // The ring fills toward the goal, split into macro segments by their share of energy. Round caps reach 5 units
  // past each dash, so a 13-unit cut leaves a 3-unit gap between segments.
  const grams = MACROS.map(([k]) => val(k)),
    energy = grams.map((g, i) => g * MACROS[i]![3]);
  const total = energy.reduce((a, b) => a + b, 0) || 1;
  const fillLen = C_RING * Math.min(1, kcal / goal),
    GAP = 13,
    closed = fillLen > C_RING - GAP;
  let at = 0;
  const segs = MACROS.map((_, i) => {
    const len = (fillLen * energy[i]!) / total;
    const vis = Math.max(0, len - (i < MACROS.length - 1 || closed ? GAP : 0));
    const seg = { len: vis, off: -at, on: vis > 0.5 };
    at += len;
    return seg;
  });
  return {
    qual: S.isToday ? 'So far' : S.single ? 'Day total' : 'Avg/day',
    kcal,
    goal,
    pct: `${Math.round((kcal / goal) * 100)}%`,
    meta: kcal <= goal ? `${nf(goal - kcal)} left` : `${nf(kcal - goal)} over`,
    grams,
    segs,
    label: `Calories ${nf(kcal)} of ${nf(goal)}. ${MACROS.map(([k, name], i) => `${name} ${nf(grams[i]!)} of ${nf(goals[k])} grams`).join(', ')}`
  };
}
