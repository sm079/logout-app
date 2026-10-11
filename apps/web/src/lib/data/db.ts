/* The on-device store (IndexedDB through Dexie). It holds what was typed and a few settings; nothing worked out
   from them is stored. */
import Dexie, { type EntityTable } from 'dexie';
import type { AliasRow, EntryRow, LocalRow, SampleEditRow, SettingRow } from './types.ts';

export class LogoutDB extends Dexie {
  entries!: EntityTable<EntryRow, 'id'>;
  aliases!: EntityTable<AliasRow, 'id'>;
  settings!: EntityTable<SettingRow, 'key'>;
  local!: EntityTable<LocalRow, 'key'>;
  sampleEdits!: EntityTable<SampleEditRow, 'id'>;

  constructor(name = 'logout') {
    super(name);
    this.version(1).stores({
      entries: 'id, date, dirty',
      aliases: 'id, dirty',
      settings: 'key, dirty',
      local: 'key',
      sampleEdits: 'id'
    });
  }
}

let current: LogoutDB | null = null;

/** The app's database, opened on first use */
export function db(): LogoutDB {
  return (current ??= new LogoutDB());
}

/** Uses another database (tests, the demo) */
export function useDB(next: LogoutDB): void {
  current = next;
}
