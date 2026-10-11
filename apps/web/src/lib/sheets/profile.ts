import type { Units } from '@logout/engine';
import type { Goals, Sex } from '../data/types.ts';

/** What the profile form says */
export interface ProfileValues {
  sex: Sex | null;
  heightCm: number | null;
  units: Units;
  goals: Goals;
  sample: boolean;
}
