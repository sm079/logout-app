import { beforeEach, describe, expect, test } from 'vitest';
import { clearEntries, exportData, importMerge, importReplace, readExport } from '#lib/data/backup.ts';
import { LogoutDB, useDB, db } from '#lib/data/db.ts';
import { UUID_RE, uuidv7 } from '#lib/data/ids.ts';
import { load, Repo } from '#lib/data/repo.ts';
import { EngineClient, inlineTransport } from '#lib/engine/client.svelte.ts';

let k = 0;
beforeEach(() => {
  useDB(new LogoutDB(`test-${++k}`));
});

function engine() {
  const e = new EngineClient(inlineTransport());
  e.change({
    t: 'init',
    state: { entries: [], sampleEdits: [], aliases: {}, profile: {}, sample: false, today: '2026-10-11', nowMin: 720 }
  });
  return e;
}

describe('ids', () => {
  test('UUID v7, sorting in the order they were made', () => {
    const ids = Array.from({ length: 50 }, () => uuidv7());
    expect(ids.every(id => UUID_RE.test(id) && id[14] === '7')).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('the repository', () => {
  test('logging, editing and removing keep the book and the store in step', async () => {
    const eng = engine(),
      repo = new Repo(eng);
    const id = await repo.log('oats 100g 380kcal 13p 67c 7f', 'food', '2026-10-11', 480, { load: 'kg', dist: 'km' });
    expect((await eng.settled()).days.get('2026-10-11')!.kcal).toBe(380);
    await repo.edit(id, 'oats 50g 190kcal', 450);
    expect((await eng.entry(id))!.time).toBe(450);
    await repo.remove(id);
    expect((await eng.settled()).days.has('2026-10-11')).toBe(false);
    // The removal is kept to sync
    const row = await db().entries.get(id);
    expect([row!.deleted, row!.dirty]).toEqual([1, 1]);
    expect((await load()).entries).toHaveLength(0);
  });

  test('aliases are rows, and a removed one stays as a mark', async () => {
    const eng = engine(),
      repo = new Repo(eng);
    expect(await repo.setAlias('food:chiken', 'chicken')).toEqual({ 'food:chiken': 'chicken' });
    expect(await repo.setAlias('food:chiken', null)).toEqual({});
    expect((await db().aliases.get('food:chiken'))!.deleted).toBe(1);
  });

  test('a sample entry edit stays on the device', async () => {
    const eng = engine(),
      repo = new Repo(eng);
    await repo.edit('s2019-01-14-00', 'weight 86kg');
    expect(await db().sampleEdits.get('s2019-01-14-00')).toEqual({ id: 's2019-01-14-00', text: 'weight 86kg' });
    expect(await db().entries.count()).toBe(0);
  });
});

describe('your data', () => {
  const file = (entries: object[], extra = {}) =>
    JSON.stringify({ app: 'logout', version: 1, exported: '', profile: null, entries, aliases: {}, widgets: {}, ...extra });

  test("reads this app's exports and the prototype's, and nothing else", () => {
    expect(readExport('nope')).toBeNull();
    expect(readExport('{"app":"other"}')).toBeNull();
    const id = uuidv7();
    const x = readExport(
      file([{ id, date: '2026-10-11', time: 600, mode: 'food', text: 'oats', units: { load: 'kg', dist: 'km' } }, { date: 'bad' }])
    )!;
    expect(x.entries.map(e => e.id)).toEqual([id]);
    const legacy = readExport(
      JSON.stringify({
        app: 'repflow',
        version: 1,
        profile: { sex: 'female', heightCm: 168, goals: { kcal: 2100 }, sample: false, since: '2026-10-01' },
        log: {
          entries: [{ id: 'u1', date: '2026-10-11', time: 600, mode: 'strength', text: 'bench 3x8 60', units: { load: 'lb', dist: 'mi' } }],
          units: { load: 1, dist: 1 },
          aliases: { 'strength:bench': 'bench press', bad: 'x' }
        }
      })
    )!;
    expect(UUID_RE.test(legacy.entries[0]!.id)).toBe(true);
    expect(legacy.entries[0]!.units).toEqual({ load: 'lb', dist: 'mi' });
    expect(legacy.aliases).toEqual({ 'strength:bench': 'bench press' });
    expect(legacy.profile).toMatchObject({ sex: 'female', heightCm: 168, since: '2026-10-01', units: { load: 'lb', dist: 'mi' } });
    expect(legacy.profile!.goals.kcal).toBe(2100);
  });

  test('merge keeps both, the newer version of an entry winning', async () => {
    const repo = new Repo(engine());
    const mine = await repo.log('oats 50g', 'food', '2026-10-10', 480, { load: 'kg', dist: 'km' });
    const row = (await db().entries.get(mine))!;
    const x = readExport(
      file([
        { ...row, text: 'oats 60g', updatedAt: row.updatedAt + 1000 },
        { id: uuidv7(), date: '2026-10-11', time: 600, mode: 'food', text: 'rice 100g' }
      ])
    )!;
    expect(await importMerge(x)).toEqual({ added: 1, updated: 1 });
    expect((await db().entries.get(mine))!.text).toBe('oats 60g');
  });

  test('replace and clear leave removal marks to sync', async () => {
    const repo = new Repo(engine());
    const mine = await repo.log('oats 50g', 'food', '2026-10-10', 480, { load: 'kg', dist: 'km' });
    await importReplace(readExport(file([{ id: uuidv7(), date: '2026-10-11', time: 600, mode: 'food', text: 'rice 100g' }]))!);
    expect((await db().entries.get(mine))!.deleted).toBe(1);
    expect((await exportData()).entries.map(e => e.text)).toEqual(['rice 100g']);
    await clearEntries();
    expect((await exportData()).entries).toEqual([]);
    expect(
      await db()
        .entries.filter(e => e.deleted === 1 && e.dirty === 1)
        .count()
    ).toBe(2);
  });
});
