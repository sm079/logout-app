import { describe, expect, test } from 'vitest';
import type { Entry, Units } from '@logout/engine';
import { BookCore } from '#lib/engine/core.ts';
import { GOALS } from '#lib/data/types.ts';
import { Timeline, unitSuffix } from '#lib/logic/metrics.ts';
import { distFmt, measureFmt, volFmt } from '#lib/logic/format.ts';
import type { Selection } from '#lib/logic/calendar.ts';
import { fuelView, headline, recoveryView } from '#lib/widgets/compute.ts';

const today = new Date(2026, 9, 11);
const start = new Date(2026, 8, 1);
let n = 0;
const e = (date: string, text: string, mode: Entry['mode'] = 'food', time = 600): Entry => ({ id: `e${++n}`, date, time, mode, text });

function timeline(entries: Entry[], units: Units = { load: 'kg', dist: 'km' }) {
  const core = new BookCore();
  core.init({
    entries,
    sampleEdits: [],
    aliases: {},
    profile: { sex: 'male', heightCm: 180 },
    sample: false,
    today: '2026-10-11',
    nowMin: 720
  });
  return new Timeline(core.rebuild(1), start, today, GOALS, units);
}
const day = (d: Date): Selection => ({ level: 'd', from: d, to: d, n: 1, anchor: d });

describe('metrics over the selection', () => {
  const tl = timeline([
    e('2026-10-09', 'weight 80kg'),
    e('2026-10-10', 'weight 79.5kg'),
    e('2026-10-10', 'squat 5x5 100kg', 'strength'),
    e('2026-10-11', 'oats 100g 380kcal 13p 67c 7f'),
    e('2026-10-11', 'sleep 4/5')
  ]);

  test('a reading is the latest one, compared with the week before', () => {
    const S = tl.span(day(today));
    expect(tl.spanValue(tl.met.weight, S, false)).toEqual({ v: 79.5, q: 'Latest' });
  });
  test("today's amount is so far, and against its goal", () => {
    const S = tl.span(day(today));
    expect(tl.spanValue(tl.met.calories, S, false)).toEqual({ v: 380, q: 'So far' });
    expect(tl.spanDelta(tl.met.calories, S, false, day(today)).text).toBe('15% of goal');
  });
  test('a rest day says so', () => {
    const d = new Date(2026, 9, 9);
    expect(tl.spanDelta(tl.met.volume, tl.span(day(d)), false, day(d)).text).toBe('Rest day');
  });
  test('a period totals what can be totalled', () => {
    const p: Selection = { level: 'd', from: new Date(2026, 9, 5), to: today, n: 7, anchor: today };
    expect(tl.spanValue(tl.met.volume, tl.span(p), true)).toEqual({ v: 2500, q: 'Total' });
  });
  test('a metric never logged reads as such', () => {
    expect(tl.ever(tl.met.steps)).toBe(false);
    expect(tl.ever(tl.met.weight)).toBe(true);
  });
  test('a widget with nothing for the selection is blank', () => {
    const S = tl.span(day(today)),
      head = (m: keyof typeof tl.met, s = S, p = day(today)) => headline(tl, tl.met[m], s, p, true, true);
    // Never logged, and logged but not in the selection
    expect(head('steps')).toMatchObject({ none: true, blank: true });
    expect(head('volume')).toMatchObject({ none: false, blank: true });
    const before = new Date(2026, 9, 10);
    expect(head('volume', tl.span(day(before)), day(before)).blank).toBe(false);
    // A reading carries on until the next one
    expect(head('weight').blank).toBe(false);
    expect(fuelView(tl, S, GOALS).blank).toBe(false);
    expect(fuelView(tl, tl.span(day(before)), GOALS).blank).toBe(true);
  });
  test('check-ins read without a stray space', () => {
    expect(tl.todayText(tl.met.sleep)).toBe('4.0/5 today');
    expect(unitSuffix('%')).toBe('%');
    expect(unitSuffix('kg')).toBe(' kg');
  });
});

describe('numbers in the units picked', () => {
  test('weight and volume in pounds', () => {
    const tl = timeline([e('2026-10-11', 'weight 80kg'), e('2026-10-11', 'squat 5x5 100kg', 'strength')], { load: 'lb', dist: 'mi' });
    const S = tl.span(day(today));
    expect(tl.fmt(tl.met.weight, tl.spanValue(tl.met.weight, S, false).v)).toEqual(['176.4', 'lb']);
    expect(tl.fmt(tl.met.volume, tl.spanValue(tl.met.volume, S, false).v)).toEqual(['5.5k', 'lb']);
  });
  test('formatting helpers', () => {
    expect(volFmt(850)).toEqual(['850', 'kg']);
    expect(volFmt(12300)).toEqual(['12.3', 't']);
    expect(distFmt(5000, 'mi')).toBe('3.11 mi');
    expect(measureFmt('waist', 81.28, 'lb')).toBe('waist 32.0 in');
  });
});

describe('readiness over the week behind the selection', () => {
  const tl = timeline([
    e('2026-10-08', 'squat 5x5 100kg @8', 'strength'),
    e('2026-10-10', 'deadlift 3x5 140kg @9', 'strength'),
    e('2026-10-11', 'sleep 4/5')
  ]);

  test("a day ends the week, and only it is the selection's", () => {
    const r = recoveryView(tl, tl.span(day(today)));
    expect(r.week.map(d => d.day).join('')).toBe('MTWTFSS');
    expect(r.week.map(d => d.on)).toEqual([false, false, false, false, false, false, true]);
    expect(r.week[6]!.v).toBe(r.score);
    expect(r.week[6]!.state).toBe(r.state[1]);
  });
  test('a week selected is all lit', () => {
    const p: Selection = { level: 'd', from: new Date(2026, 9, 5), to: today, n: 7, anchor: today };
    expect(recoveryView(tl, tl.span(p)).week.every(d => d.on)).toBe(true);
  });
  test('days before the log has anything read as nothing', () => {
    const r = recoveryView(tl, tl.span(day(new Date(2026, 8, 2))));
    expect(r.week.slice(0, 5).every(d => d.v == null && d.state === 'none')).toBe(true);
  });
});
