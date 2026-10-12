/* What a line was read as, piece by piece: the First line flow shows each as a labelled chip as it's typed */
import type { Kind, Line, Mode, Role, Token } from '@logout/engine';
import { tokClass } from '../logic/markup.ts';

export interface Piece {
  /** Stays the same while a piece grows as it's typed, so its chip updates in place */
  key: string;
  label: string;
  text: string;
  cls: string;
}

const NAMED: Record<Kind, string> = {
  strength: 'Exercise',
  cardio: 'Activity',
  food: 'Food',
  steps: 'Steps',
  water: 'Water',
  checkin: 'Check-in',
  measure: 'Measurement'
};
const MACRO = { kcal: 'Calories', p: 'Protein', c: 'Carbs', f: 'Fat' } as const;
const LABEL: Record<Role, string> = {
  name: '',
  macro: '',
  sets: 'Sets',
  load: 'Load',
  effort: 'Effort',
  hold: 'Hold',
  amount: 'Amount',
  count: 'Count',
  basis: 'Per',
  kcal: 'Calories',
  distance: 'Distance',
  duration: 'Time',
  pace: 'Pace',
  hr: 'Heart rate',
  interval: 'Intervals',
  steps: 'Steps',
  water: 'Water',
  score: 'Score',
  measure: 'Value',
  time: 'At',
  note: 'Note',
  bad: 'Not read',
  num: 'Not read'
};

function labelOf(tk: Token, kind: Kind): string {
  if (tk.role === 'name') return NAMED[kind];
  if (tk.role === 'macro') return MACRO[tk.k ?? 'kcal'];
  if (tk.role === 'sets' && tk.reps != null) return tk.sets != null && tk.sets > 1 ? 'Sets × reps' : 'Reps';
  return LABEL[tk.role];
}

/** The pieces of a line, in the order they were typed. `at` tells lines apart within one entry. */
export function piecesOf(line: Line, at = 0): Piece[] {
  return line.tokens.map(tk => ({
    key: `${at}:${tk.s}:${tk.role}`,
    label: labelOf(tk, line.kind),
    text: line.text.slice(tk.s, tk.e),
    cls: tokClass(tk, line.kind, line.key, null)
  }));
}

/** What each mode's chips will say, before anything is typed */
export const EXPECTED: Record<Mode, string[]> = {
  strength: ['Exercise', 'Sets × reps', 'Load'],
  cardio: ['Activity', 'Distance', 'Time'],
  food: ['Food', 'Amount', 'Calories']
};
