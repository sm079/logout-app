import { describe, expect, test } from 'vitest';
import { factsText, readAnswer, topicsOf } from '#lib/onboard/answers.ts';
import { flowAsked, guessUnits } from '#lib/onboard/flows.ts';
import { gramsFor, nearestSplit, snapKcal, splitOf, SPLITS } from '#lib/onboard/goals.ts';
import { piecesOf } from '#lib/onboard/reading.ts';
import { heightText } from '#lib/onboard/words.ts';
import { GOALS } from '#lib/data/types.ts';
import { preview } from '@logout/engine';

describe('which flow and which units', () => {
  test('?onboard= names a flow, and anything else there opens the default', () => {
    expect(flowAsked('?onboard=tune')).toBe('tune');
    expect(flowAsked('?onboard=script&x=1')).toBe('script');
    expect(flowAsked('?onboard')).toBe('line');
    expect(flowAsked('?onboard=nope')).toBe('line');
    expect(flowAsked('')).toBeNull();
  });

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

describe('First line: what a line was read as', () => {
  test('each piece of a lift gets its label, in the order it was typed', () => {
    const line = preview(null, 'bench press 3x8 60kg @8', 'strength').res[0]!.line;
    expect(piecesOf(line).map(p => [p.label, p.text])).toEqual([
      ['Exercise', 'bench press'],
      ['Sets × reps', '3x8'],
      ['Load', '60kg'],
      ['Effort', '@8']
    ]);
  });

  test('a food names its macros, coloured as the composer colours them', () => {
    const line = preview(null, 'oats 80g 300kcal 10p', 'food').res[0]!.line;
    expect(piecesOf(line).map(p => [p.label, p.cls])).toEqual([
      ['Food', 'tk-name'],
      ['Amount', 'tk-v'],
      ['Calories', 'tk-kcal'],
      ['Protein', 'tk-p']
    ]);
  });

  test("a piece keeps its key while it's still being typed", () => {
    const at = (t: string) => piecesOf(preview(null, t, 'strength').res[0]!.line)[0]!.key;
    expect(at('bench')).toBe(at('bench press'));
  });
});

describe('Tune: goals from a dial', () => {
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

  test('a height reads in centimetres, or feet and inches', () => {
    expect(heightText(181, false)).toBe('181 cm');
    expect(heightText(180.3, true)).toBe('5′ 11″');
    expect(heightText(null, true)).toBeNull();
  });
});

describe('Script: setup answers typed as lines', () => {
  const read = (t: string, asked?: Parameters<typeof readAnswer>[1]) => readAnswer(t, asked);

  test('units, in any of the ways people say them', () => {
    expect(read('kg km').facts).toEqual({ load: 'kg', dist: 'km' });
    expect(read('pounds and miles').facts).toEqual({ load: 'lb', dist: 'mi' });
    expect(read('imperial').facts).toEqual({ load: 'lb', dist: 'mi' });
    expect(read('kilos, but miles').unread).toBe(1);
  });

  test('a height in centimetres, metres, or feet and inches', () => {
    expect(read('male 181cm').facts).toEqual({ sex: 'male', heightCm: 181 });
    expect(read('female 1.65m').facts).toEqual({ sex: 'female', heightCm: 165 });
    expect(read(`5'11"`).facts.heightCm).toBeCloseTo(180.3, 1);
    expect(read('6ft 1in man').facts).toMatchObject({ sex: 'male', heightCm: 185.4 });
    expect(read('I am 6 foot').facts.heightCm).toBeCloseTo(182.9, 1);
  });

  test('a number on its own is what was asked', () => {
    expect(read('178', 'body').facts).toEqual({ heightCm: 178 });
    expect(read('70', 'body').facts).toEqual({ heightCm: 177.8 });
    expect(read('2400', 'goals').facts).toEqual({ kcal: 2400 });
    expect(read('2400').unread).toBe(1);
  });

  test('goals, written like a meal, with water and steps', () => {
    expect(read('2600kcal 180p 290c 75f').facts).toEqual({ kcal: 2600, p: 180, c: 290, f: 75 });
    expect(read('150g protein, 2,200 calories').facts).toEqual({ p: 150, kcal: 2200 });
    expect(read('water 3L 10k steps').facts).toEqual({ water: 3, steps: 10000 });
    expect(read('2500ml of water').facts).toEqual({ water: 2.5 });
  });

  test('numbers that cannot be right are marked, not taken', () => {
    const a = read('male 30cm');
    expect(a.facts).toEqual({ sex: 'male' });
    expect(a.marks.find(m => m.cls === 'tk-bad')).toMatchObject({ s: 5, e: 9 });
  });

  test('passing, starting, signing in', () => {
    expect(read('skip').pass).toBe(true);
    expect(read('keep defaults').pass).toBe(true);
    expect(read('sample please').facts).toEqual({ sample: true });
    expect(read('empty').facts).toEqual({ sample: false });
    expect(read('me@example.com').email).toBe('me@example.com');
  });

  test('one answer can cover several questions', () => {
    const a = read('lb mi, male 6ft');
    expect([...topicsOf(a.facts)].sort()).toEqual(['body', 'units']);
    expect(factsText(a.facts, true)).toBe('lb · mi · male · 6′ 0″');
  });

  test('every word is marked, so the line shows how it was read', () => {
    const a = read('kg and km plz');
    expect(a.marks.map(m => m.cls)).toEqual(['tk-v', 'tk-note', 'tk-v', 'tk-bad']);
    expect(a.unread).toBe(1);
  });
});
