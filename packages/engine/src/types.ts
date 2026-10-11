import type { Dim, UnitName, Units } from './units';

/** The three things the composer logs; each reads a line with its own patterns */
export type Mode = 'food' | 'strength' | 'cardio';
/** What a line turned out to be: a mode's own kind, or one of the lines that mean the same in every mode */
export type Kind = Mode | 'steps' | 'water' | 'checkin' | 'measure';
export type MacroKey = 'kcal' | 'p' | 'c' | 'f';
export type MeasureWhat = 'weight' | 'waist' | 'neck' | 'hips' | 'height';

/** One LOG press. Only this is stored; everything else is worked out from the text. */
export interface Entry {
  id: string;
  /** Local date, YYYY-MM-DD */
  date: string;
  /** Minutes after midnight */
  time: number;
  mode: Mode;
  text: string;
  /** The unit toggles when it was logged; bare loads and distances read in these */
  units?: Units;
}

export type Role =
  | 'time'
  | 'num'
  | 'basis'
  | 'amount'
  | 'macro'
  | 'load'
  | 'effort'
  | 'sets'
  | 'hold'
  | 'steps'
  | 'interval'
  | 'pace'
  | 'duration'
  | 'hr'
  | 'kcal'
  | 'distance'
  | 'water'
  | 'measure'
  | 'score'
  | 'name'
  | 'note'
  | 'bad'
  | 'count';

export interface Amount {
  value: number;
  unit: UnitName;
  /** The text it was read from, to type it again */
  text?: string;
}

export interface Distance {
  value: number;
  unit: UnitName;
  /** In metres */
  m: number;
}

/** A stretch of a line and what it was read as. Which value fields are set depends on the pattern that matched. */
export interface Token {
  s: number;
  e: number;
  role: Role;
  min?: number;
  v?: number;
  basis?: Amount;
  amount?: Amount;
  k?: MacroKey;
  w?: number;
  u?: UnitName;
  added?: boolean;
  bw?: boolean;
  rpe?: number | null;
  rir?: number;
  sets?: number;
  reps?: number;
  hold?: number;
  steps?: number;
  n?: number;
  sec?: number;
  dist?: Distance;
  pace?: number;
  per?: 'km' | 'mi';
  kmh?: number;
  hr?: number;
  kcal?: number;
  ml?: number;
  score?: number;
}

/** Values a food line states, for the amount they are given for */
export interface Stated {
  kcal?: number;
  p?: number;
  c?: number;
  f?: number;
  /** The macro worked out from the other three, if one was */
  worked: MacroKey | null;
  unit: UnitName;
  value: number;
  /** The amount in its dimension's base unit */
  base: number;
  dim: Dim;
}

export interface FoodFields {
  amount: Amount | null;
  count: number | null;
  basis: Amount | null;
  macros: Partial<Record<MacroKey, number>>;
  stated: Stated | null;
}

export interface StrengthFields {
  sets: number | null;
  reps: number | null;
  w: number | null;
  u: UnitName | null;
  added: boolean;
  bw: boolean;
  rpe: number | null;
  rir: number | null;
  hold: number | null;
}

export interface Interval {
  n: number;
  dist: Distance | null;
  sec: number | null;
}

export interface CardioFields {
  dist: Distance | null;
  sec: number | null;
  interval: Interval | null;
  pace: number | null;
  per: 'km' | 'mi' | null;
  kmh: number | null;
  hr: number | null;
  kcal: number | null;
  steps: number | null;
}

export interface CheckinFields {
  score: number | null;
}

export interface WaterFields {
  ml: number | null;
}

export interface MeasureFields {
  what: MeasureWhat;
  v: number | null;
  u: UnitName | null;
  /** Weights in kg, lengths in cm */
  si: number | null;
}

interface LineBase {
  text: string;
  tokens: Token[];
  /** The words before the first value, as typed; null when there are none */
  name: string | null;
  /** The name, lower-case, as items are keyed */
  key: string | null;
  /** A typed time of day, in minutes after midnight */
  at: number | null;
  /** Carries on the line before it, which named the item */
  cont?: boolean;
  /** The key it was typed with, when an alias renamed it */
  typed?: string;
}

export type FoodLine = LineBase & { kind: 'food'; f: FoodFields };
export type StrengthLine = LineBase & { kind: 'strength'; f: StrengthFields };
export type CardioLine = LineBase & { kind: 'cardio' | 'steps'; f: CardioFields };
export type WaterLine = LineBase & { kind: 'water'; f: WaterFields };
export type CheckinLine = LineBase & { kind: 'checkin'; f: CheckinFields };
export type MeasureLine = LineBase & { kind: 'measure'; f: MeasureFields };
export type Line = FoodLine | StrengthLine | CardioLine | WaterLine | CheckinLine | MeasureLine;

/** A line of an entry, with where it starts in the entry's text */
export interface EntryLine {
  line: Line;
  s: number;
}

export type Status = 'ok' | 'needs' | 'noname';

/** A resolved line's numbers. Which are set depends on its kind. */
export interface Values {
  amount?: Amount;
  /** A food with values for another kind of amount only */
  other?: boolean;
  worked?: MacroKey | null;
  kcal?: number | null;
  p?: number | null;
  c?: number | null;
  f?: number | null;
  sets?: number;
  reps?: number | null;
  kg?: number;
  unit?: UnitName | null;
  volume?: number;
  hard?: number;
  load?: number;
  hold?: number | null;
  distM?: number;
  sec?: number;
  hr?: number | null;
  steps?: number | null;
  ml?: number;
  score?: number;
  what?: MeasureWhat;
  si?: number;
}

/** A line resolved against the cards */
export interface Resolved {
  line: Line;
  st: Status;
  v: Values;
  s: number;
}

/** What an entry, a draft or a day adds up to */
export interface Totals {
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Food lines that resolved */
  food: number;
  /** Lines that still need a value */
  needs: number;
  /** Millilitres */
  water: number;
  sets: number;
  hard: number;
  reps: number;
  /** Kilograms lifted */
  volume: number;
  lifts: number;
  cardioS: number;
  distM: number;
  /** Energy from activities, kcal */
  burned: number;
  cardio: number;
  /** The day's step count; the newest one stands */
  steps: number | null;
  check: Record<string, number>;
  meas: Partial<Record<MeasureWhat, number>>;
  /** Fatigue in hard-set units */
  load: number;
}

export interface Sum extends Totals {
  kinds: Partial<Record<Kind, number>>;
  activitySteps?: number;
}

export interface Day extends Totals {
  date: string;
  sessions: number;
  entries: number;
  minutes: number;
}

/** A food's stated values, and which entry stated them */
export interface Statement {
  id: string;
  date: string;
  time: number;
  /** Order among all statements, as they were read */
  seq: number;
  stated: Stated;
}

/** What is known about an item (a food, lift or activity) from every line that names it */
export interface Card {
  id: string;
  kind: Mode;
  key: string;
  name: string;
  uses: number;
  /** Date it was last logged */
  last: string | null;
  lastEntry: string | null;
  /** Its lines in the entry that last logged it */
  repeat: Line[];
  /** The newest stated values for each kind of amount */
  bases: Partial<Record<Dim, Stated>>;
  /** The entry that stated each kind of amount's values */
  from: Partial<Record<Dim, string>>;
  /** The kind of amount stated most recently */
  newest: Dim | null;
  /** The newest amount it was logged with */
  amount: Amount | null;
  /** Every statement for each kind of amount, oldest first */
  history: Partial<Record<Dim, Statement[]>>;
}

/** Item names given new ones: `{ 'food:chiken': 'chicken' }` */
export type Aliases = Record<string, string>;

export interface Profile {
  sex?: 'male' | 'female' | null;
  heightCm?: number | null;
}

/** An entry as read */
export interface BookEntry extends Entry {
  lines: EntryLine[];
  res: Resolved[];
  sum: Sum;
}

/** Everything worked out from the entries */
export interface Book {
  entries: BookEntry[];
  byId: Map<string, BookEntry>;
  cards: Map<string, Card>;
  days: Map<string, Day>;
  /** A usual set: the median load × reps */
  U: number;
  profile: Profile;
  aliases: Aliases;
  recovery: Map<string, number>;
  bodyFat: Map<string, number>;
}

/** What a draft needs from the book to be read like a logged entry */
export type PreviewBook = Pick<Book, 'cards' | 'U' | 'aliases'>;

export interface BuildOptions {
  today?: string;
  profile?: Profile;
  aliases?: Aliases;
}

export interface Preview {
  res: Resolved[];
  sum: Sum;
  /** The first typed time of day, if any */
  at: number | null;
}

/** Where a draft would land: its day and time, and the entry it replaces when it's an edit */
export interface Placement {
  date: string;
  time: number;
  id?: string;
}

export interface Suggestion {
  name: string;
  meta: string;
  insert: string;
  last: string | null;
  kind: Mode | 'any';
}
