import { expect, test } from 'vitest';
import { generate } from '../src/index';

test.each([
  [new Date(2019, 0, 14), new Date(2026, 9, 11), 13 * 60 + 30],
  [new Date(2019, 0, 14), new Date(2026, 9, 11), 6 * 60],
  [new Date(2024, 1, 29), new Date(2025, 2, 1), 23 * 60 + 59]
])('the same entries from %s to %s at minute %i', (joined, today, now) => {
  const fresh = generate(joined, today, now);
  expect(fresh.length).toBeGreaterThan(100);
  expect(fresh).toEqual(generate(joined, today, now));
});

test('today only has what has happened yet', () => {
  const today = new Date(2026, 9, 11);
  const early = generate(new Date(2026, 9, 1), today, 6 * 60).filter(e => e.date === '2026-10-11');
  const late = generate(new Date(2026, 9, 1), today, 22 * 60).filter(e => e.date === '2026-10-11');
  expect(early.every(e => e.time <= 6 * 60)).toBe(true);
  expect(late.length).toBeGreaterThan(early.length);
});
