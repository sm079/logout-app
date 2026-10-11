/* Every write goes through here: it's stored on the device, marked to sync, and sent to the book's worker */
import type { Mode, Units } from '@logout/engine';
import type { EngineClient } from '../engine/client.svelte.ts';
import { db } from './db.ts';
import { uuidv7 } from './ids.ts';
import {
  DEFAULT_DEVICE,
  defaultProfile,
  type Aliases,
  type AliasRow,
  type Device,
  type EntryRow,
  type Profile,
  type SettingKey,
  type SettingRow,
  type SettingValue,
  type WidgetPicks
} from './types.ts';

type Listener = () => void;
const listeners = new Set<Listener>();
/** Called after any change that should sync */
export function onLocalChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach(fn => fn());

export interface Loaded {
  entries: EntryRow[];
  aliases: Aliases;
  sampleEdits: [string, string | null][];
  profile: Profile | null;
  widgets: WidgetPicks;
  device: Device;
}

/** Everything stored on this device */
export async function load(): Promise<Loaded> {
  const d = db();
  const [entries, aliasRows, edits, profile, widgets, device] = await Promise.all([
    d.entries.filter(e => !e.deleted).toArray(),
    d.aliases.toArray(),
    d.sampleEdits.toArray(),
    d.settings.get('profile'),
    d.settings.get('widgets'),
    d.local.get('device')
  ]);
  return {
    entries,
    aliases: aliasesOf(aliasRows),
    sampleEdits: edits.map(e => [e.id, e.text]),
    profile: (profile?.value as Profile | undefined) ?? null,
    widgets: (widgets?.value as WidgetPicks | undefined) ?? {},
    device: { ...DEFAULT_DEVICE, ...((device?.value as Partial<Device> | undefined) ?? {}) }
  };
}

export const aliasesOf = (rows: AliasRow[]): Aliases =>
  Object.fromEntries(rows.filter(r => !r.deleted && r.name).map(r => [r.id, r.name as string]));

export class Repo {
  constructor(private engine: EngineClient) {}

  /** Keeps a new entry; returns its id */
  async log(text: string, mode: Mode, date: string, time: number, units: Units): Promise<string> {
    const row: EntryRow = { id: uuidv7(), date, time, mode, text, units: { ...units }, updatedAt: Date.now(), deleted: 0, dirty: 1 };
    await db().entries.put(row);
    this.engine.change({ t: 'upsert', entry: entryOf(row) });
    changed();
    return row.id;
  }

  /** Changes an entry's text (and its time, when one was typed). A sample entry's edit stays on this device. */
  async edit(id: string, text: string, time?: number): Promise<void> {
    const row = await db().entries.get(id);
    if (!row) {
      await db().sampleEdits.put({ id, text });
      this.engine.change({ t: 'sampleEdit', id, text });
      return;
    }
    const next: EntryRow = { ...row, text, time: time ?? row.time, updatedAt: Date.now(), dirty: 1 };
    await db().entries.put(next);
    this.engine.change({ t: 'upsert', entry: entryOf(next) });
    changed();
  }

  /** Removes an entry. Its removal is kept until it has synced, so other devices drop it too. */
  async remove(id: string): Promise<void> {
    const row = await db().entries.get(id);
    if (!row) {
      await db().sampleEdits.put({ id, text: null });
      this.engine.change({ t: 'sampleEdit', id, text: null });
      return;
    }
    await db().entries.put({ ...row, deleted: 1, updatedAt: Date.now(), dirty: 1 });
    this.engine.change({ t: 'remove', id });
    changed();
  }

  /** Gives an item a new name (or takes one away, with null); returns every alias now */
  async setAlias(id: string, name: string | null): Promise<Aliases> {
    await db().aliases.put({ id, name, updatedAt: Date.now(), deleted: name ? 0 : 1, dirty: 1 });
    const aliases = aliasesOf(await db().aliases.toArray());
    this.engine.change({ t: 'aliases', aliases });
    changed();
    return aliases;
  }

  async saveProfile(p: Profile): Promise<void> {
    await saveSetting('profile', p);
    this.engine.change({ t: 'profile', profile: { sex: p.sex, heightCm: p.heightCm } });
    changed();
  }

  async saveWidgets(w: WidgetPicks): Promise<void> {
    await saveSetting('widgets', w);
    changed();
  }

  async saveDevice(d: Device): Promise<void> {
    await db().local.put({ key: 'device', value: $plain(d) });
  }

  /** Shows or hides the sample history */
  async setSample(on: boolean, device: Device): Promise<void> {
    await this.saveDevice({ ...device, sample: on });
    this.engine.change({ t: 'sample', on });
  }
}

async function saveSetting<K extends SettingKey>(key: K, value: SettingValue[K]): Promise<void> {
  const row: SettingRow<K> = { key, value: $plain(value), updatedAt: Date.now(), dirty: 1 };
  await db().settings.put(row as unknown as SettingRow);
}

/** A copy without reactive proxies, which IndexedDB can't clone */
function $plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const entryOf = (r: EntryRow) => ({ id: r.id, date: r.date, time: r.time, mode: r.mode, text: r.text, units: r.units });

export { defaultProfile };
