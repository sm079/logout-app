import { describe, expect, test } from 'vitest';
import { cellLabel, coverage, describe as describeSel, focusDate, markOf, unitsFor, type Selection } from '#lib/logic/calendar.ts';
import { addDays } from '#lib/logic/dates.ts';

const today = new Date(2026, 9, 11); // Sunday, Oct 11 2026
const start = new Date(2025, 9, 11);
const day = (d: Date): Selection => ({ level: 'd', from: d, to: d, n: 1, anchor: d });

describe('the units each scale shows', () => {
  test("a day's week, Sunday first", () => {
    const u = unitsFor('d', today, start, today);
    expect(u).toHaveLength(7);
    expect(u[0]!.a.getDay()).toBe(0);
    expect(+u[0]!.a).toBe(+today);
  });
  test("a month's weeks cover the whole month", () => {
    const u = unitsFor('w', today, start, today);
    expect(+u[0]!.a).toBeLessThanOrEqual(+new Date(2026, 9, 1));
    expect(+u.at(-1)!.b).toBeGreaterThanOrEqual(+new Date(2026, 9, 31));
  });
  test('every year from the start', () => {
    expect(unitsFor('y', today, new Date(2019, 0, 14), today).map(u => u.a.getFullYear())).toEqual([
      2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026
    ]);
  });
});

describe('the selection', () => {
  test('a view follows today while the selection holds it, else the selection start', () => {
    expect(+focusDate(day(today), today)).toBe(+today);
    const past = day(new Date(2026, 6, 31));
    expect(+focusDate(past, today)).toBe(+past.from);
  });
  test('full and partial coverage', () => {
    const weeks = unitsFor('w', today, start, today);
    const p: Selection = { level: 'd', from: new Date(2026, 9, 5), to: new Date(2026, 9, 7), n: 3, anchor: new Date(2026, 9, 5) };
    const { full, part } = coverage(weeks, p, start, today);
    expect(full).toEqual([]);
    expect(part).toHaveLength(1);
  });
  test('titles in words', () => {
    expect(describeSel(day(today), today, start)).toEqual({ title: 'Today', eyebrow: 'Sun, Oct 11' });
    expect(describeSel(day(addDays(today, -1)), today, start).title).toBe('Yesterday');
    expect(describeSel(day(addDays(today, -3)), today, start).title).toBe('Thursday');
    const range: Selection = { level: 'd', from: addDays(today, -6), to: today, n: 7, anchor: today };
    expect(describeSel(range, today, start)).toEqual({ title: '7 days', eyebrow: 'Oct 5 – 11' });
    const year: Selection = { level: 'y', from: new Date(2024, 0, 1), to: new Date(2024, 11, 31), n: 1, anchor: new Date(2024, 0, 1) };
    expect(describeSel(year, today, start).title).toBe('2024');
  });
});

describe('marks', () => {
  const sessions = (iso: string) => ({ '2026-10-11': 2, '2026-10-09': 5 })[iso] ?? 0;
  test('dots for a day, at most three, and a ring for an empty today', () => {
    expect(markOf('d', { a: today, b: today }, sessions, today)).toEqual({ kind: 'dots', n: 2, ring: false });
    expect(markOf('d', { a: addDays(today, -2), b: addDays(today, -2) }, sessions, today)).toEqual({ kind: 'dots', n: 3, ring: false });
    expect(markOf('d', { a: today, b: today }, () => 0, today)).toEqual({ kind: 'dots', n: 0, ring: true });
  });
  test('a tick per day of a week, none for days to come', () => {
    const m = markOf('w', { a: new Date(2026, 9, 4), b: new Date(2026, 9, 10) }, sessions, today);
    expect(m).toEqual({ kind: 'ticks', on: [false, false, false, false, false, true, false] });
    const next = markOf('w', { a: new Date(2026, 9, 11), b: new Date(2026, 9, 17) }, sessions, today);
    expect(next.kind === 'ticks' && next.on.slice(1).every(x => x === null)).toBe(true);
  });
  test('a label says how many sessions', () => {
    expect(cellLabel('d', { a: today, b: today }, sessions, start, today)).toBe('Sunday, October 11, 2026, 2 sessions');
    expect(cellLabel('d', { a: addDays(today, 1), b: addDays(today, 1) }, sessions, start, today)).toMatch(/upcoming$/);
  });
});
