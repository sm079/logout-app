/* Sync against the real migration, running in Postgres compiled to WASM */
import { beforeEach, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { LogoutDB } from '#lib/data/db.ts';
import { uuidv7 } from '#lib/data/ids.ts';
import type { EntryRow } from '#lib/data/types.ts';
import { defaultProfile } from '#lib/data/types.ts';
import { Syncer } from '#lib/sync/sync.ts';
import { addUser, as, remoteFor, server } from './support/server.ts';

let pg: PGlite,
  alice: string,
  bob: string,
  n = 0;
beforeEach(async () => {
  pg = await server();
  alice = await addUser(pg);
  bob = await addUser(pg);
});

const units = { load: 'kg', dist: 'km' } as const;
const entry = (text: string, over: Partial<EntryRow> = {}): EntryRow => ({
  id: uuidv7(),
  date: '2026-10-11',
  time: 600,
  mode: 'food',
  text,
  units,
  updatedAt: 1000,
  deleted: 0,
  dirty: 1,
  ...over
});
const wire = (e: EntryRow) => ({
  id: e.id,
  date: e.date,
  time: e.time,
  mode: e.mode,
  text: e.text,
  units: e.units,
  updatedAt: e.updatedAt,
  deleted: !!e.deleted
});
const device = () => new LogoutDB(`device-${++n}`);
const texts = async (d: LogoutDB) => (await d.entries.filter(e => !e.deleted).toArray()).map(e => e.text).sort();

describe('the server', () => {
  test('stamps each push with the next version, and the newer write wins', async () => {
    const r = remoteFor(pg, alice);
    const e = entry('oats 50g');
    expect(await r.push({ entries: [wire(e)], aliases: [], settings: [], engine: 1 })).toBe(1);
    // An older write of the same entry changes nothing
    expect(await r.push({ entries: [{ ...wire(e), text: 'oats 40g', updatedAt: 500 }], aliases: [], settings: [], engine: 1 })).toBe(2);
    await r.push({ entries: [{ ...wire(e), text: 'oats 60g', updatedAt: 2000 }], aliases: [], settings: [], engine: 1 });
    const rows = await r.pull('entries', { v: 0, id: '' }, 10);
    expect(rows.map(x => [x.text, x.version])).toEqual([['oats 60g', 3]]);
    expect(await r.engineVersion()).toBe(1);
  });

  test("a user reads only their own rows, and can't overwrite anyone else's", async () => {
    const e = entry('secret 1g');
    await remoteFor(pg, alice).push({ entries: [wire(e)], aliases: [], settings: [], engine: 1 });
    expect(await remoteFor(pg, bob).pull('entries', { v: 0, id: '' }, 10)).toEqual([]);
    // Bob pushing an entry with Alice's id doesn't touch hers
    await remoteFor(pg, bob).push({ entries: [{ ...wire(e), text: 'taken', updatedAt: 9999 }], aliases: [], settings: [], engine: 1 });
    expect((await remoteFor(pg, alice).pull('entries', { v: 0, id: '' }, 10)).map(x => x.text)).toEqual(['secret 1g']);
  });

  test('nobody signed in can push or read, and tables take no direct writes', async () => {
    await expect(as(pg, null, tx => tx.query(`select public.sync_push('[]', '[]', '[]', 1)`))).rejects.toThrow();
    await expect(
      as(pg, alice, tx =>
        tx.query(
          `insert into public.entries (id, user_id, date, time, mode, text, updated_at, version) values (gen_random_uuid(), $1, '2026-10-11', 1, 'food', 'x', 1, 1)`,
          [alice]
        )
      )
    ).rejects.toThrow();
    await expect(as(pg, null, tx => tx.query('select * from public.entries'))).rejects.toThrow();
  });

  test('rejects bad rows and oversized pushes', async () => {
    const r = remoteFor(pg, alice);
    await expect(
      r.push({ entries: [{ ...wire(entry('x')), mode: 'yoga' as never }], aliases: [], settings: [], engine: 1 })
    ).rejects.toThrow();
    const many = Array.from({ length: 1001 }, () => wire(entry('x')));
    await expect(r.push({ entries: many, aliases: [], settings: [], engine: 1 })).rejects.toThrow(/Too many/);
  });
});

describe('two devices', () => {
  test('one logs, the other gets it; removals and renames travel too', async () => {
    const a = device(),
      b = device();
    const ra = new Syncer(a, remoteFor(pg, alice)),
      rb = new Syncer(b, remoteFor(pg, alice));
    const oats = entry('oats 100g 380kcal'),
      rice = entry('rice 100g');
    await a.entries.bulkPut([oats, rice]);
    await a.aliases.put({ id: 'food:oats', name: 'porridge oats', updatedAt: 1000, deleted: 0, dirty: 1 });
    expect((await ra.run()).pushed).toBe(3);
    expect(await ra.pending()).toBe(0);

    const got = await rb.run();
    expect(await texts(b)).toEqual(['oats 100g 380kcal', 'rice 100g']);
    expect(got.entries).toHaveLength(2);
    expect(got.aliases).toBe(true);

    // B removes the rice; A sees it go
    await b.entries.put({ ...(await b.entries.get(rice.id))!, deleted: 1, dirty: 1, updatedAt: 2000 });
    await rb.run();
    const back = await ra.run();
    expect(await texts(a)).toEqual(['oats 100g 380kcal']);
    expect(back.entries.map(e => [e.id, e.deleted])).toEqual([[rice.id, 1]]);
  });

  test('the same entry changed on both: the later change wins on both', async () => {
    const a = device(),
      b = device();
    const ra = new Syncer(a, remoteFor(pg, alice)),
      rb = new Syncer(b, remoteFor(pg, alice));
    const e = entry('bench 3x8 60kg', { mode: 'strength' });
    await a.entries.put(e);
    await ra.run();
    await rb.run();
    await a.entries.put({ ...e, text: 'bench 3x8 62.5kg', updatedAt: 3000, dirty: 1 });
    await b.entries.put({ ...e, text: 'bench 3x8 65kg', updatedAt: 4000, dirty: 1 });
    await ra.run();
    await rb.run();
    await ra.run();
    expect((await a.entries.get(e.id))!.text).toBe('bench 3x8 65kg');
    expect((await b.entries.get(e.id))!.text).toBe('bench 3x8 65kg');
  });

  test("a fresh device's default settings don't overwrite the profile already synced", async () => {
    const a = device(),
      b = device();
    const real = { ...defaultProfile('2026-01-01'), sex: 'female' as const, heightCm: 170 };
    await a.settings.put({ key: 'profile', value: real, updatedAt: 1000, dirty: 1 });
    await new Syncer(a, remoteFor(pg, alice)).run();
    // B was set up later, so its defaults are newer, but it has never synced
    await b.settings.put({ key: 'profile', value: defaultProfile('2026-10-11'), updatedAt: 5000, dirty: 1 });
    const got = await new Syncer(b, remoteFor(pg, alice)).run();
    expect((await b.settings.get('profile'))!.value).toEqual(real);
    expect(got.settings.map(s => s.key)).toEqual(['profile']);
    expect(await new Syncer(b, remoteFor(pg, alice)).pending()).toBe(0);
  });

  test('many changes go in batches and come back in pages, without missing rows that share a version', async () => {
    const a = device(),
      b = device();
    const rows = Array.from({ length: 23 }, (_, i) => entry(`water ${i + 1}00ml`));
    await a.entries.bulkPut(rows);
    await new Syncer(a, remoteFor(pg, alice), { pushLimit: 10 }).run();
    await new Syncer(b, remoteFor(pg, alice), { pullLimit: 4 }).run();
    expect(await b.entries.count()).toBe(23);
  });

  test('a change made while a push is under way stays marked to send', async () => {
    const a = device();
    const e = entry('oats 50g');
    await a.entries.put(e);
    const remote = remoteFor(pg, alice);
    const slow = {
      ...remote,
      push: async (batch: Parameters<typeof remote.push>[0]) => {
        await a.entries.put({ ...e, text: 'oats 70g', updatedAt: 5000, dirty: 1 });
        return remote.push(batch);
      }
    };
    await new Syncer(a, slow).push().catch(() => 0);
    expect((await a.entries.get(e.id))!.dirty).toBe(1);
  });
});
