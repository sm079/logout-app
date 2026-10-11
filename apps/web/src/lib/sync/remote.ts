/* The server, as sync sees it: push changed rows, pull rows changed after a cursor. The server never parses text. */
import type { Mode, Units } from '@logout/engine';

/** Where a pull left off: the last row's version, and its id to break ties within one version */
export interface Cursor {
  v: number;
  id: string;
}

export interface WireEntry {
  id: string;
  date: string;
  time: number;
  mode: Mode;
  text: string;
  units: Units;
  updatedAt: number;
  deleted: boolean;
}
export interface WireAlias {
  id: string;
  name: string | null;
  updatedAt: number;
  deleted: boolean;
}
export interface WireSetting {
  key: 'profile' | 'widgets';
  value: unknown;
  updatedAt: number;
}

export interface PushBatch {
  entries: WireEntry[];
  aliases: WireAlias[];
  settings: WireSetting[];
  /** The engine version this device reads with */
  engine: number;
}

/** A row as pulled, with the version the server stamped it with */
export type Pulled<T> = T & { version: number };

export interface PullPage {
  entries: Pulled<WireEntry>[];
  aliases: Pulled<WireAlias>[];
  settings: Pulled<WireSetting>[];
}
export type Table = keyof PullPage;

export interface Remote {
  /** Applies changes; returns the version they were stamped with */
  push(batch: PushBatch): Promise<number>;
  /** Rows of a table changed after the cursor, in version order, at most `limit` */
  pull<T extends Table>(table: T, after: Cursor, limit: number): Promise<PullPage[T]>;
  /** The newest engine version any of the user's devices has used */
  engineVersion(): Promise<number>;
}

/** The most a push sends at once, matching the server's limit */
export const PUSH_LIMIT = 500;
export const PULL_LIMIT = 1000;
