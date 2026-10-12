import { describe, expect, test } from 'vitest';
import { gramsFor, nearestSplit, snapKcal, splitOf, SPLITS } from '#lib/onboard/goals.ts';
import { guessUnits } from '#lib/onboard/units.ts';
import { heightText } from '#lib/onboard/words.ts';
import { GOALS } from '#lib/data/types.ts';

describe('the units a first run starts with', () => {
  test('the time zone decides the units, and en-US alone does not', () => {
    expect(guessUnits('America/Chicago', ['en-US'])).toEqual({ load: 'lb', dist: 'mi' });
    expect(guessUnits('America/Indiana/Indianapolis', ['en'])).toEqual({ load: 'lb', dist: 'mi' });
    expect(guessUnits('Asia/Kolkata', ['en-US'])).toEqual({ load: 'kg', dist: 'km' });
    expect(guessUnits('America/Toronto', ['en-CA'])).toEqual({ load: 'kg', dist: 'km' });
    expect(guessUnits('Europe/London', ['en-GB'])).toEqual({ load: 'kg', dist: 'km' });
  });

  test('without a regional time zone, a language tag that names a region decides', () => {
    expect(guessUnits('UTC', ['en-US'])).toEqual({ load: 'lb', dist: 'mi' });
    expect(guessUnits('Etc/GMT+5', ['de-DE', 'en-US'])).toEqual({ load: 'kg', dist: 'km' });
    expect(guessUnits(undefined, ['en'])).toEqual({ load: 'kg', dist: 'km' });
  });
});

describe('goals from the dial', () => {
  test('the default goals are the balanced split, and grams follow the calories', () => {
    expect(nearestSplit(GOALS)).toBe('balanced');
    expect(gramsFor(2000, SPLITS[0]!.split)).toEqual({ p: 140, c: 230, f: 60 });
  });

  test('grams split back into shares of their calories', () => {
    const s = splitOf({ p: 100, c: 100, f: 0 });
    expect(s).toEqual({ p: 0.5, c: 0.5, f: 0 });
    expect(splitOf({ p: 0, c: 0, f: 0 })).toEqual({ p: 0, c: 0, f: 0 });
  });

  test('calories snap to the dial and stay inside it', () => {
    expect(snapKcal(2612)).toBe(2600);
    expect(snapKcal(100)).toBe(1200);
    expect(snapKcal(9999)).toBe(4800);
  });
});

describe('the height ruler', () => {
  test('a height reads in centimetres, or feet and inches', () => {
    expect(heightText(181, false)).toBe('181 cm');
    expect(heightText(180.3, true)).toBe('5′ 11″');
    expect(heightText(null, true)).toBeNull();
  });
});
