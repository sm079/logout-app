/* What is stored. Only typed text and a few settings are kept; everything shown is worked out from them. */
import type { Entry, Mode, Units } from '@logout/engine';

export type Sex = 'male' | 'female';

export interface Goals {
  kcal: number;
  p: number;
  c: number;
  f: number;
  /** Litres */
  water: number;
  steps: number;
}

/** Settings that follow the user to every device */
export interface Profile {
  /** The day they started, YYYY-MM-DD */
  since: string;
  sex: Sex | null;
  heightCm: number | null;
  goals: Goals;
  /** What bare loads and distances are read in, and what numbers are shown in */
  units: Units;
}

/** Settings for this device only */
export interface Device {
  /** Years of made-up logs to explore with; never synced */
  sample: boolean;
  /** The first-run setup was finished or skipped */
  setupDone: boolean;
  /** Share lines that fail to read, with names removed, to improve reading */
  shareUnread: boolean;
}

/** Which metric each widget shows: `{ widgetId: metricId }` */
export type WidgetPicks = Record<string, string>;

/** Item names given new ones: `{ 'food:chiken': 'chicken' }` */
export type Aliases = Record<string, string>;

export const GOALS: Goals = { kcal: 2600, p: 180, c: 290, f: 75, water: 3, steps: 10000 };
export const DEFAULT_DEVICE: Device = { sample: false, setupDone: false, shareUnread: false };
export const MODES: readonly Mode[] = ['strength', 'cardio', 'food'];

export const defaultProfile = (since: string): Profile => ({
  since,
  sex: null,
  heightCm: null,
  goals: { ...GOALS },
  units: { load: 'kg', dist: 'km' }
});

/** 0 or 1, since IndexedDB can't index booleans */
export type Flag = 0 | 1;

/** A stored entry. `updatedAt` (ms) decides which of two versions wins; `deleted` keeps a removal so it can sync. */
export interface EntryRow extends Entry {
  units: Units;
  updatedAt: number;
  deleted: Flag;
  /** Changed here and not yet sent */
  dirty: Flag;
}

/** One alias; a null name is a removed one */
export interface AliasRow {
  id: string;
  name: string | null;
  updatedAt: number;
  deleted: Flag;
  dirty: Flag;
}

/** A synced setting: the profile or the widget picks */
export interface SettingRow<K extends SettingKey = SettingKey> {
  key: K;
  value: SettingValue[K];
  updatedAt: number;
  dirty: Flag;
}
export interface SettingValue {
  profile: Profile;
  widgets: WidgetPicks;
}
export type SettingKey = keyof SettingValue;

/** Device-only values: settings, sync cursors */
export interface LocalRow {
  key: string;
  value: unknown;
}

/** An edit to a sample entry, kept on this device only; a null text removes it */
export interface SampleEditRow {
  id: string;
  text: string | null;
}
