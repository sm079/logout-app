/* Parity: the prototype's engine (kept verbatim in ./legacy) and this one read the sample history the same way */
import { generate } from '@logout/sample';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';
import * as E from '../src/index';

const require = createRequire(import.meta.url);
const Legacy = require('./legacy/engine.cjs');

const TODAY = '2026-10-11';
const entries = generate(new Date(2019, 0, 14), new Date(2026, 9, 11), 13 * 60 + 30);
const profile = { sex: 'male' as const, heightCm: 181 };
const aliases = { 'food:chicken breast': 'chicken', 'strength:back squat': 'squat' };
const fresh = E.build(entries, { today: TODAY, profile, aliases });
const old = Legacy.build(entries, { today: TODAY, profile, aliases });

const plainDays = (days: Map<string, unknown>) => Object.fromEntries([...days].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));

describe('parity with the prototype engine over the sample history', () => {
  test('the history is long enough to mean something', () => {
    expect(entries.length).toBeGreaterThan(30000);
    expect(fresh.days.size).toBe(old.days.size);
  });

  test("every day's totals", () => {
    expect(plainDays(fresh.days)).toEqual(plainDays(old.days));
  });

  test('recovery and body fat', () => {
    expect(Object.fromEntries(fresh.recovery)).toEqual(Object.fromEntries(old.recovery));
    expect(Object.fromEntries(fresh.bodyFat)).toEqual(Object.fromEntries(old.bodyFat));
    expect(fresh.U).toBe(old.U);
  });

  test("every line's result and readout", () => {
    expect(fresh.entries.length).toBe(old.entries.length);
    fresh.entries.forEach((e, i) => {
      const o = old.entries[i];
      expect(e.id).toBe(o.id);
      expect(e.res.map(r => [r.st, r.v, E.readout(r)])).toEqual(
        o.res.map((r: never) => [(r as { st: string }).st, (r as { v: unknown }).v, Legacy.readout(r)])
      );
    });
  });

  test('cards and suggestions', () => {
    expect([...fresh.cards.keys()]).toEqual([...old.cards.keys()]);
    for (const [id, c] of fresh.cards) {
      const o = old.cards.get(id);
      expect([c.name, c.uses, c.last, c.lastEntry, c.bases, c.from, c.newest]).toEqual([
        o.name,
        o.uses,
        o.last,
        o.lastEntry,
        o.bases,
        o.from,
        o.newest
      ]);
    }
    for (const mode of ['food', 'strength', 'cardio'] as const) {
      for (const q of ['', 'b', 'ch', 'run', 'w', 'squat', 'oats']) expect(E.suggest(fresh, mode, q)).toEqual(Legacy.suggest(old, mode, q));
    }
  });

  test('a draft reads the same', () => {
    const drafts: [string, 'food' | 'strength' | 'cardio'][] = [
      ['chicken 250g, rice 2x90g, water 500ml', 'food'],
      ['oats 80g @7:30am, banana', 'food'],
      ['squat 5x5 120kg @8, bench press 100x5, 90x8', 'strength'],
      ['easy run 8km 44:10 148bpm, steps 12,400', 'cardio'],
      ['weight 172, waist 33in, sleep 4/5', 'strength']
    ];
    for (const [text, mode] of drafts) {
      for (const units of [E.DEFAULT_UNITS, { load: 'lb', dist: 'mi' } as const]) {
        const a = E.preview(fresh, text, mode, units),
          b = Legacy.preview(old, text, mode, units);
        expect([a.res.map(r => [r.st, r.v]), a.sum, a.at]).toEqual([
          b.res.map((r: { st: string; v: unknown }) => [r.st, r.v]),
          b.sum,
          b.at
        ]);
      }
    }
  });
});
