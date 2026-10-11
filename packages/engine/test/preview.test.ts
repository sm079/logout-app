/* A draft placed where it will be saved reads as it will once saved */
import { generate } from '@logout/sample';
import { describe, expect, test } from 'vitest';
import * as E from '../src/index';
import type { Entry, Mode } from '../src/index';

let seq = 0;
const entry = (date: string, text: string, mode: Mode = 'food', time = 720): Entry => ({
  id: `e${String(++seq).padStart(4, '0')}`,
  date,
  time,
  mode,
  text
});

describe('preview with a placement', () => {
  const first = entry('2026-01-01', 'chicken 100g 165kcal 31p 0c 4f');
  const newer = entry('2026-01-10', 'chicken 100g 120kcal 25p 0c 2f');
  const book = E.build([first, newer]);

  test('a value stated on a past day gives way to a newer statement, as it will once saved', () => {
    const text = 'chicken 100g 200kcal';
    const place = { date: '2026-01-05', time: 720 };
    expect(E.preview(book, text, 'food', undefined, place).res[0]!.v.kcal).toBe(120);
    const saved = entry(place.date, text);
    expect(E.build([first, newer, saved]).byId.get(saved.id)!.res[0]!.v.kcal).toBe(120);
    // Unplaced, the draft is read as the newest entry
    expect(E.preview(book, text, 'food').res[0]!.v.kcal).toBe(200);
  });

  test('a value stated today is the newest, placed or not', () => {
    const text = 'chicken 100g 200kcal';
    expect(E.preview(book, text, 'food', undefined, { date: '2026-01-11', time: 600 }).res[0]!.v.kcal).toBe(200);
  });

  test('editing the line that stated the values falls back to the statement before it', () => {
    const p = E.preview(book, 'chicken 100g', 'food', undefined, { date: newer.date, time: newer.time, id: newer.id });
    expect(p.res[0]!.v.kcal).toBe(165);
    expect(E.build([first, { ...newer, text: 'chicken 100g' }]).byId.get(newer.id)!.res[0]!.v.kcal).toBe(165);
  });

  test('editing an older statement keeps the newer one', () => {
    const p = E.preview(book, 'chicken 100g 300kcal', 'food', undefined, { date: first.date, time: first.time, id: first.id });
    expect(p.res[0]!.v.kcal).toBe(120);
  });

  test('an item new to the book reads its own values', () => {
    const p = E.preview(book, 'tofu 100g 76kcal 8p 2c 4f, tofu 200g', 'food', undefined, { date: '2026-01-03', time: 720 });
    expect(p.res.map(r => r.v.kcal)).toEqual([76, 152]);
  });

  test('without a book, a draft reads its own values', () => {
    expect(E.preview(null, 'oats 50g /100g 380kcal', 'food', undefined, { date: '2026-01-03', time: 720 }).res[0]!.v.kcal).toBe(190);
  });
});

test('every entry of the sample history, previewed in its own place, reads as it does in the book', () => {
  const entries = generate(new Date(2019, 0, 14), new Date(2020, 6, 1), 720);
  const book = E.build(entries, { today: '2020-07-01' });
  let checked = 0;
  for (const e of book.entries) {
    const p = E.preview(book, e.text, e.mode, e.units, { date: e.date, time: e.time, id: e.id });
    expect(
      p.res.map(r => [r.st, r.v]),
      `${e.date} ${e.text}`
    ).toEqual(e.res.map(r => [r.st, r.v]));
    checked++;
  }
  expect(checked).toBeGreaterThan(5000);
});
