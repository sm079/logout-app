import type { Units } from '@logout/engine';
import type { Goals, Sex } from '../data/types.ts';
import { nf } from '../logic/format.ts';
import { heightText, litres } from '../onboard/words.ts';

/** What the profile form says */
export interface ProfileValues {
  sex: Sex | null;
  heightCm: number | null;
  units: Units;
  goals: Goals;
}

const GOAL_WORDS: [keyof Goals, (v: number) => string][] = [
  ['kcal', v => `${nf(v)} kcal`],
  ['p', v => `${nf(v)} g protein`],
  ['c', v => `${nf(v)} g carbs`],
  ['f', v => `${nf(v)} g fat`],
  ['water', v => `${litres(v)} water`],
  ['steps', v => `${nf(v)} steps`]
];

/** Each thing that differs from what was saved, in a word or two, in the order the form asks them */
export function changes(was: ProfileValues, now: ProfileValues): string[] {
  const out: string[] = [];
  if (now.sex !== was.sex) out.push(now.sex === 'male' ? 'Male' : now.sex === 'female' ? 'Female' : 'No sex');
  if (now.heightCm !== was.heightCm) out.push(heightText(now.heightCm, now.units.load === 'lb') ?? 'No height');
  const units = (['load', 'dist'] as const).filter(k => now.units[k] !== was.units[k]).map(k => now.units[k]);
  if (units.length) out.push(units.join(' · '));
  for (const [k, say] of GOAL_WORDS) if (now.goals[k] !== was.goals[k]) out.push(say(now.goals[k]));
  return out;
}
