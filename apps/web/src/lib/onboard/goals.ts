/* Daily goals as the Tune flow sets them: calories, and a split of them into protein, carbs and fat */
import type { Goals } from '../data/types.ts';

export type Split = { p: number; c: number; f: number };
export type SplitId = 'balanced' | 'protein' | 'lowcarb';

/** Shares of the day's calories */
export const SPLITS: { id: SplitId; name: string; split: Split }[] = [
  { id: 'balanced', name: 'Balanced', split: { p: 0.28, c: 0.46, f: 0.26 } },
  { id: 'protein', name: 'High protein', split: { p: 0.36, c: 0.39, f: 0.25 } },
  { id: 'lowcarb', name: 'Lower carb', split: { p: 0.32, c: 0.24, f: 0.44 } }
];

export const KCAL = { min: 1200, max: 4800, step: 50 };
const PER_G = { p: 4, c: 4, f: 9 };
const to5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

/** Grams of each macro for a day's calories, split by shares */
export function gramsFor(kcal: number, s: Split): Split {
  return { p: to5((kcal * s.p) / PER_G.p), c: to5((kcal * s.c) / PER_G.c), f: to5((kcal * s.f) / PER_G.f) };
}

/** The shares of calories some grams come to (all zero when there are none) */
export function splitOf(g: Split): Split {
  const p = g.p * PER_G.p,
    c = g.c * PER_G.c,
    f = g.f * PER_G.f,
    all = p + c + f;
  return all ? { p: p / all, c: c / all, f: f / all } : { p: 0, c: 0, f: 0 };
}

/** The named split nearest some goals, if one is close (each share within two points) */
export function nearestSplit(g: Pick<Goals, 'p' | 'c' | 'f'>): SplitId | null {
  const s = splitOf(g);
  for (const x of SPLITS)
    if (Math.abs(x.split.p - s.p) <= 0.02 && Math.abs(x.split.c - s.c) <= 0.02 && Math.abs(x.split.f - s.f) <= 0.02) return x.id;
  return null;
}

/** Calories snapped to the dial's steps and kept inside its range */
export const snapKcal = (v: number): number => Math.min(KCAL.max, Math.max(KCAL.min, Math.round(v / KCAL.step) * KCAL.step));
