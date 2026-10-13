/* Which mode a draft reads as: its values, the names it was logged under before, and words for a lift, an activity
   or a food */
import { generate } from '@logout/sample';
import { describe, expect, test } from 'vitest';
import { WORDS } from '../src/detect';
import * as E from '../src/index';
import type { Entry, Mode } from '../src/index';

const detect = (text: string, book: Parameters<typeof E.detect>[0] = null) => E.detect(book, text);

describe('a line reads as the mode its values belong to', () => {
  test.each<[string, Mode]>([
    ['bench press 3x8 60kg @8', 'strength'],
    ['3x8', 'strength'],
    ['pull-ups 4x8 +10kg', 'strength'],
    ['squat 100x5, 110x3, 120x1', 'strength'],
    ['curls 12 reps', 'strength'],
    ['wall sit 60s', 'strength'],
    ['easy run 8km 46:30 145bpm', 'cardio'],
    ['track intervals 6x800m', 'cardio'],
    ['steps 9400', 'cardio'],
    ['8000 steps', 'cardio'],
    ['5k', 'cardio'],
    ['session 40min 300kcal', 'cardio'],
    ['chicken breast 200g 330kcal 62p 0c 7f', 'food'],
    ['oats 80g /100g 380kcal 13p 67c 7f', 'food'],
    ['3 eggs, sourdough 2 slices, water 500ml', 'food'],
    ['lunch 650kcal', 'food'],
    ['shake 30p', 'food']
  ])('%s', (text, mode) => expect(detect(text)).toBe(mode));
});

describe('a name says what a line is before its values do', () => {
  test.each<[string, Mode]>([
    ['squat', 'strength'],
    ['lat pulldown', 'strength'],
    ['push-ups', 'strength'],
    ['easy run', 'cardio'],
    ['stair climber 20min 180kcal', 'cardio'],
    ['incline walk 30min 220kcal', 'cardio'],
    ['3 eggs', 'food'],
    ['berries', 'food'],
    ['flat white 1', 'food'],
    ['rice 1kg', 'food']
  ])('%s', (text, mode) => expect(detect(text)).toBe(mode));

  test('a name logged before counts for the mode it was logged in', () => {
    const book = E.build([
      { id: 'a', date: '2026-01-01', time: 600, mode: 'strength', text: 'zercher 3x5 80kg' },
      { id: 'b', date: '2026-01-01', time: 700, mode: 'food', text: 'zucchini 200g 34kcal' }
    ]);
    expect(detect('zercher')).toBeNull();
    expect(detect('zercher', book)).toBe('strength');
    expect(detect('zucchini 2', book)).toBe('food');
    // A renamed item keeps its mode
    const renamed = E.build(book.entries, { aliases: { 'strength:zercher': 'zercher squat' } });
    expect(detect('zercher squat', renamed)).toBe('strength');
  });
});

describe('lines that mean the same in every mode', () => {
  test('water counts for food', () => {
    expect(detect('water 500ml')).toBe('food');
    expect(detect('water 2')).toBe('food');
  });
  test('check-ins and measurements count for none', () => {
    for (const text of ['sleep 4/5', 'mood 3/5, energy 4/5', 'weight 80kg', 'waist 84cm, neck 38cm']) expect(detect(text)).toBeNull();
  });
  test('they leave the rest of the draft to decide', () => {
    expect(detect('bench 3x8 60kg, water 500ml')).toBe('strength');
    expect(detect('run 5km, sleep 4/5')).toBe('cardio');
  });
});

test('nothing to go on reads as nothing', () => {
  for (const text of ['', '   ', 'b', 'something', '12']) expect(detect(text)).toBeNull();
});

test('a tie goes to the earlier mode', () => {
  // `10x30s` is as much a hold as an interval
  expect(detect('10x30s')).toBe('strength');
});

test('every listed word names its own mode, and only that one', () => {
  for (const [mode, words] of Object.entries(WORDS)) for (const w of words) expect(detect(w), w).toBe(mode);
});

describe('the sample history', () => {
  const sample: Entry[] = generate(new Date(2024, 0, 1), new Date(2024, 11, 31), 24 * 60);
  const book = E.build(sample);
  test.each([
    ['with nothing logged before', null],
    ['with its own history', book]
  ] as const)('every entry reads in the mode it was logged in, %s', (_, b) => {
    expect(new Set(sample.map(e => e.mode)).size).toBe(3);
    const wrong = sample.filter(e => (E.detect(b, e.text) ?? 'food') !== e.mode).map(e => `${e.mode}: ${e.text}`);
    expect(wrong).toEqual([]);
  });
});
