import { describe, expect, test } from 'vitest';
import type { Entry } from '@logout/engine';
import { BookCore } from '#lib/engine/core.ts';
import { grid, levelOf, lifetime, measures, streak } from '#lib/logic/record.ts';
import { changes } from '#lib/sheets/profile.ts';
import { GOALS } from '#lib/data/types.ts';

// A Tuesday
const today = new Date(2026, 9, 13);
let n = 0;
const e = (date: string, text: string, mode: Entry['mode'] = 'food'): Entry => ({ id: `e${++n}`, date, time: 600, mode, text });
function book(entries: Entry[]) {
  const core = new BookCore();
  core.init({ entries, sampleEdits: [], aliases: {}, profile: {}, sample: false, today: '2026-10-13', nowMin: 720 });
  return core.rebuild(1);
}

describe('streaks', () => {
  test('count back from today, or from yesterday while today is open', () => {
    expect(streak(['2026-10-11', '2026-10-12', '2026-10-13'], today)).toEqual({ now: 3, best: 3, days: 3, today: true });
    expect(streak(['2026-10-11', '2026-10-12'], today)).toMatchObject({ now: 2, today: false });
    expect(streak(['2026-10-10', '2026-10-11'], today).now).toBe(0);
  });
  test('the best run is kept, and days ahead of today are left out', () => {
    const s = streak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-13', '2026-10-20'], today);
    expect(s).toEqual({ now: 1, best: 4, days: 5, today: true });
  });
});

describe('the grid of recent weeks', () => {
  test("columns are weeks from Sunday, ending with today's", () => {
    const g = grid(iso => (iso === '2026-10-12' ? 3 : iso === '2026-10-06' ? 8 : 0), today, 3);
    expect(g.cols).toHaveLength(3);
    expect(g.cols[0]![0]!.iso).toBe('2026-09-27');
    const last = g.cols[2]!;
    expect(last[0]!.iso).toBe('2026-10-11');
    expect(last[1]).toMatchObject({ iso: '2026-10-12', n: 3, level: 2 });
    expect(g.cols[1]![2]).toMatchObject({ iso: '2026-10-06', n: 8, level: 4 });
    expect(last[2]).toMatchObject({ today: true, future: false });
    expect(last[3]).toMatchObject({ future: true, n: 0 });
  });
  test("a month's name sits over the week its first day falls in", () => {
    expect(grid(() => 0, today, 6).months).toEqual([{ col: 3, name: 'Oct' }]);
  });
  test('levels are quarters of the fullest day, taken as at least four entries', () => {
    expect([0, 1, 2, 3, 4].map(n => levelOf(n, 4))).toEqual([0, 1, 2, 3, 4]);
    expect([1, 6, 7, 12].map(n => levelOf(n, 12))).toEqual([1, 2, 3, 4]);
    expect(levelOf(1, 1)).toBe(1);
  });
});

test('lifetime totals add up every day', () => {
  const b = book([
    e('2026-10-12', 'squat 5x5 100kg', 'strength'),
    e('2026-10-12', 'run 5km 28:00', 'cardio'),
    e('2026-10-13', 'oats 100g 380kcal 13p 67c 7f\nbanana', 'food')
  ]);
  expect(lifetime(b.days.values())).toMatchObject({ entries: 3, volume: 2500, distM: 5000 });
  expect(lifetime(b.days.values()).foods).toBeGreaterThanOrEqual(1);
});

describe('the newest body measurements', () => {
  test('each within 30 days of the newest day with any', () => {
    const b = book([e('2026-08-01', 'hips 99cm'), e('2026-09-20', 'neck 38cm, height 181cm'), e('2026-10-10', 'waist 84cm')]);
    expect(measures(b.days)).toEqual({ date: '2026-10-10', waist: 84, neck: 38, hips: null, height: 181 });
  });
  test('nothing measured', () => {
    expect(measures(book([e('2026-10-10', 'weight 80kg')]).days)).toMatchObject({ date: null, waist: null });
  });
});

describe('what the profile will save', () => {
  const was = { sex: null, heightCm: null, units: { load: 'kg', dist: 'km' }, goals: { ...GOALS } } as const;
  test('nothing changed', () => {
    expect(changes(was, structuredClone(was))).toEqual([]);
  });
  test('each change, said the way the setup says it', () => {
    const now = { sex: 'female', heightCm: 164, units: { load: 'lb', dist: 'km' }, goals: { ...GOALS, kcal: 2400, p: 150 } } as const;
    expect(changes(was, now)).toEqual(['Female', '5′ 5″', 'lb', '2,400 kcal', '150 g protein']);
  });
});
