/* The three modes the composer logs in */
import type { Mode } from '@logout/engine';
import type { IconName } from '../ui/icons.ts';
import type { TintName } from '../logic/palette.ts';

export type DayKey = 'lifts' | 'sets' | 'volume' | 'time' | 'dist' | 'steps' | 'kcal' | 'p' | 'c' | 'f';

export interface ModeInfo {
  label: string;
  icon: IconName;
  /** What its items are called in suggestions */
  noun: string;
  /** The typewriter placeholder: a hint, then examples */
  placeholders: string[];
  /** The day so far: [what, label, icon or a letter, tint] */
  day: [DayKey, string, IconName | string, TintName][];
  /** What the stepper counts in the caret's line */
  stepUnit: string;
}

export const MODES: Record<Mode, ModeInfo> = {
  strength: {
    label: 'Strength',
    icon: 'dumbbell',
    noun: 'Exercises',
    placeholders: [
      'Log a lift · its name, then sets × reps and load',
      'bench press 3x8 60kg @8',
      'pull-ups 4x8 +10kg',
      'squat 100x5, 110x3, 120x1'
    ],
    day: [
      ['lifts', 'Exercises', 'dumbbell', 'lime'],
      ['sets', 'Sets', 'logs', 'blue'],
      ['volume', 'Volume', 'weight', 'teal']
    ],
    stepUnit: 'sets'
  },
  cardio: {
    label: 'Cardio',
    icon: 'foot',
    noun: 'Activities',
    placeholders: [
      'Log an activity · its name, then distance or time',
      'easy run 8km 46:30 145bpm',
      'track intervals 6x800m',
      'steps 9400'
    ],
    day: [
      ['time', 'Time', 'clock', 'teal'],
      ['dist', 'Distance', 'route', 'blue'],
      ['steps', 'Steps', 'foot', 'lime']
    ],
    stepUnit: 'rounds'
  },
  food: {
    label: 'Food',
    icon: 'utensils',
    noun: 'Foods',
    placeholders: [
      'Log a meal · name and amount, plus kcal p c f the first time',
      'chicken breast 200g 330kcal 62p 0c 7f',
      'oats 80g /100g 380kcal 13p 67c 7f',
      '3 eggs, sourdough 2 slices, water 500ml'
    ],
    day: [
      ['kcal', 'Calories', 'flame', 'ember'],
      ['p', 'Protein', 'P', 'lime'],
      ['c', 'Carbs', 'C', 'blue'],
      ['f', 'Fat', 'F', 'ember']
    ],
    stepUnit: 'servings'
  }
};

export const MODE_ORDER: Mode[] = ['strength', 'cardio', 'food'];

/** What a logged entry is called in its confirmation */
export const LOGGED: Record<string, string> = {
  food: 'Meal logged',
  strength: 'Session logged',
  cardio: 'Session logged',
  steps: 'Steps logged',
  water: 'Water logged',
  checkin: 'Check-in logged',
  measure: 'Measurement logged'
};
