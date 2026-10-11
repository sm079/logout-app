/* Sync: push what changed here, pull what changed elsewhere since the last time, and the newer write wins.
   It works on the device's store; the app is told what changed so the book and the settings follow. */
import { version as ENGINE_VERSION } from '@logout/engine';
import type { LogoutDB } from '../data/db.ts';
import type { AliasRow, EntryRow, SettingKey, SettingRow } from '../data/types.ts';
import { PULL_LIMIT, PUSH_LIMIT, type Cursor, type PullPage, type Remote, type Table } from './remote.ts';

export interface Applied {
  /** Entries that changed here, removals included */
  entries: EntryRow[];
  /** Whether any alias changed */
  aliases: boolean;
  /** Settings that changed here */
  settings: SettingRow[];
}

export interface SyncResult extends Applied {
  pushed: number;
  /** The newest engine version the user's devices have used */
  engine: number;
}

const cursorKey = (t: Table) => `cursor:${t}`;
const START: Cursor = { v: 0, id: '' };

export interface SyncOptions {
  pushLimit?: number;
  pullLimit?: number;
}

export class Syncer {
  private pushLimit: number;
  private pullLimit: number;
  constructor(
    private db: LogoutDB,
    private remote: Remote,
    { pushLimit = PUSH_LIMIT, pullLimit = PULL_LIMIT }: SyncOptions = {}
  ) {
    this.pushLimit = pushLimit;
    this.pullLimit = pullLimit;
  }

  /** One round: on a device's first sync the server's settings win, then this device's changes go up, then
      everything changed elsewhere comes down */
  async run(): Promise<SyncResult> {
    const first = !(await this.db.local.get(cursorKey('entries')));
    const applied: Applied = { entries: [], aliases: false, settings: [] };
    if (first) merge(applied, await this.pull(true));
    const pushed = await this.push();
    merge(applied, await this.pull(false));
    const engine = await this.remote.engineVersion();
    return { ...applied, pushed, engine };
  }

  /** Sends every changed row, a batch at a time; a row is marked sent only if it hasn't changed again meanwhile */
  async push(): Promise<number> {
    let sent = 0;
    for (;;) {
      const d = this.db;
      const [entries, aliases, settings] = await Promise.all([
        d.entries.where('dirty').equals(1).limit(this.pushLimit).toArray(),
        d.aliases.where('dirty').equals(1).limit(this.pushLimit).toArray(),
        d.settings.where('dirty').equals(1).toArray()
      ]);
      if (!entries.length && !aliases.length && !settings.length) return sent;
      await this.remote.push({
        entries: entries.map(e => ({
          id: e.id,
          date: e.date,
          time: e.time,
          mode: e.mode,
          text: e.text,
          units: e.units,
          updatedAt: e.updatedAt,
          deleted: !!e.deleted
        })),
        aliases: aliases.map(a => ({ id: a.id, name: a.name, updatedAt: a.updatedAt, deleted: !!a.deleted })),
        settings: settings.map(s => ({ key: s.key, value: s.value, updatedAt: s.updatedAt })),
        engine: ENGINE_VERSION
      });
      await d.transaction('rw', d.entries, d.aliases, d.settings, async () => {
        for (const e of entries) {
          const cur = await d.entries.get(e.id);
          if (cur && cur.updatedAt === e.updatedAt) await d.entries.update(e.id, { dirty: 0 });
        }
        for (const a of aliases) {
          const cur = await d.aliases.get(a.id);
          if (cur && cur.updatedAt === a.updatedAt) await d.aliases.update(a.id, { dirty: 0 });
        }
        for (const s of settings) {
          const cur = await d.settings.get(s.key);
          if (cur && cur.updatedAt === s.updatedAt) await d.settings.update(s.key, { dirty: 0 });
        }
      });
      sent += entries.length + aliases.length + settings.length;
      if (entries.length < this.pushLimit && aliases.length < this.pushLimit) return sent;
    }
  }

  /** Brings down everything changed after each table's cursor. With `serverWins`, a setting from the server
      replaces this device's even if it changed here (a fresh device's defaults shouldn't overwrite a real profile). */
  async pull(serverWins: boolean): Promise<Applied> {
    const out: Applied = { entries: [], aliases: false, settings: [] };
    for (const table of ['entries', 'aliases', 'settings'] as const) {
      let at = ((await this.db.local.get(cursorKey(table)))?.value as Cursor | undefined) ?? START;
      for (;;) {
        const rows = await this.remote.pull(table, at, this.pullLimit);
        if (rows.length) {
          await this.apply(table, rows, out, serverWins);
          const last = rows[rows.length - 1]!;
          at = { v: last.version, id: 'id' in last ? last.id : (last as { key: string }).key };
        }
        await this.db.local.put({ key: cursorKey(table), value: at });
        if (rows.length < this.pullLimit) break;
      }
    }
    return out;
  }

  private async apply<T extends Table>(table: T, rows: PullPage[T], out: Applied, serverWins: boolean) {
    const d = this.db;
    if (table === 'entries') {
      await d.transaction('rw', d.entries, async () => {
        for (const r of rows as PullPage['entries']) {
          const cur = await d.entries.get(r.id);
          // A newer change here wins; it goes up on the next push
          if (cur && cur.updatedAt > r.updatedAt) continue;
          if (cur && !cur.dirty && cur.updatedAt === r.updatedAt && !!cur.deleted === r.deleted) continue;
          const row: EntryRow = {
            id: r.id,
            date: r.date,
            time: r.time,
            mode: r.mode,
            text: r.text,
            units: r.units,
            updatedAt: r.updatedAt,
            deleted: r.deleted ? 1 : 0,
            dirty: 0
          };
          await d.entries.put(row);
          out.entries.push(row);
        }
      });
    } else if (table === 'aliases') {
      await d.transaction('rw', d.aliases, async () => {
        for (const r of rows as PullPage['aliases']) {
          const cur = await d.aliases.get(r.id);
          if (cur && cur.updatedAt > r.updatedAt) continue;
          if (cur && !cur.dirty && cur.updatedAt === r.updatedAt) continue;
          const row: AliasRow = { id: r.id, name: r.deleted ? null : r.name, updatedAt: r.updatedAt, deleted: r.deleted ? 1 : 0, dirty: 0 };
          await d.aliases.put(row);
          out.aliases = true;
        }
      });
    } else {
      await d.transaction('rw', d.settings, async () => {
        for (const r of rows as PullPage['settings']) {
          const cur = await d.settings.get(r.key as SettingKey);
          if (cur && !serverWins && cur.updatedAt > r.updatedAt) continue;
          if (cur && !cur.dirty && cur.updatedAt === r.updatedAt) continue;
          const row = { key: r.key, value: r.value, updatedAt: r.updatedAt, dirty: 0 } as SettingRow;
          await d.settings.put(row);
          out.settings.push(row);
        }
      });
    }
  }

  /** How many changes haven't gone up yet */
  async pending(): Promise<number> {
    const d = this.db;
    const [e, a, s] = await Promise.all([
      d.entries.where('dirty').equals(1).count(),
      d.aliases.where('dirty').equals(1).count(),
      d.settings.where('dirty').equals(1).count()
    ]);
    return e + a + s;
  }
}

function merge(into: Applied, more: Applied) {
  into.entries.push(...more.entries);
  into.aliases ||= more.aliases;
  into.settings.push(...more.settings);
}
