/* Sync against the real project: two devices of one user converge, another user sees none of it, and deleting an
   account removes what was synced for it. Throwaway users are made and deleted through the admin API. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { LogoutDB } from '#lib/data/db.ts';
import { uuidv7 } from '#lib/data/ids.ts';
import type { EntryRow } from '#lib/data/types.ts';
import { supabaseRemote } from '#lib/sync/supabase.ts';
import { Syncer } from '#lib/sync/sync.ts';

const URL = process.env.SUPABASE_URL ?? '';
const KEY = process.env.SUPABASE_KEY ?? '';
const SECRET = process.env.SUPABASE_SECRET_KEY ?? '';
if (!URL || !KEY || !SECRET) throw new Error('Set SUPABASE_URL, SUPABASE_KEY and SUPABASE_SECRET_KEY to run the live tests');

const admin = createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const run = Math.random().toString(36).slice(2, 8);
const users: { id: string; email: string; password: string }[] = [];

async function makeUser(tag: string) {
  const email = `sync-${tag}-${run}@example.com`,
    password = `pw-${uuidv7()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const u = { id: data.user.id, email, password };
  users.push(u);
  return u;
}
/** A signed-in client: one per device */
async function device(u: { email: string; password: string }): Promise<SupabaseClient> {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password });
  if (error) throw error;
  return c;
}
const entry = (text: string, over: Partial<EntryRow> = {}): EntryRow => ({
  id: uuidv7(),
  date: '2026-10-11',
  time: 600,
  mode: 'food',
  text,
  units: { load: 'kg', dist: 'km' },
  updatedAt: Date.now(),
  deleted: 0,
  dirty: 1,
  ...over
});
const texts = async (d: LogoutDB) => (await d.entries.filter(e => !e.deleted).toArray()).map(e => e.text).sort();

let alice: Awaited<ReturnType<typeof makeUser>>, bob: Awaited<ReturnType<typeof makeUser>>;
beforeAll(async () => {
  alice = await makeUser('a');
  bob = await makeUser('b');
});
afterAll(async () => {
  for (const u of users) await admin.auth.admin.deleteUser(u.id).catch(() => {});
});

test('two devices of one user converge, and another user sees none of it', async () => {
  const [a1, a2, b] = [new LogoutDB(`live-a1-${run}`), new LogoutDB(`live-a2-${run}`), new LogoutDB(`live-b-${run}`)];
  const sa1 = new Syncer(a1, supabaseRemote(await device(alice)));
  const sa2 = new Syncer(a2, supabaseRemote(await device(alice)));
  const sb = new Syncer(b, supabaseRemote(await device(bob)));

  const oats = entry('oats 100g 380kcal 13p 67c 7f'),
    rice = entry('rice 100g');
  await a1.entries.bulkPut([oats, rice]);
  await a1.aliases.put({ id: 'food:oats', name: 'porridge oats', updatedAt: Date.now(), deleted: 0, dirty: 1 });
  await a1.settings.put({ key: 'widgets', value: { line: 'calories' }, updatedAt: Date.now(), dirty: 1 });
  expect((await sa1.run()).pushed).toBe(4);

  const got = await sa2.run();
  expect(await texts(a2)).toEqual(['oats 100g 380kcal 13p 67c 7f', 'rice 100g']);
  expect(got.aliases).toBe(true);
  expect((await a2.settings.get('widgets'))!.value).toEqual({ line: 'calories' });
  expect(got.engine).toBeGreaterThanOrEqual(1);

  // A removal on one device reaches the other
  await a2.entries.put({ ...(await a2.entries.get(rice.id))!, deleted: 1, dirty: 1, updatedAt: Date.now() });
  await sa2.run();
  await sa1.run();
  expect(await texts(a1)).toEqual(['oats 100g 380kcal 13p 67c 7f']);

  // Bob's device gets nothing of Alice's
  await sb.run();
  expect(await b.entries.count()).toBe(0);
});

test('a line that failed to read can be sent, but not read back', async () => {
  const c = await device(bob);
  const { error } = await c.from('unread_lines').insert([{ mode: 'food', kind: 'food', reason: 'bad', line: '‹name› 2 3', engine: 1 }]);
  expect(error).toBeNull();
  const { data } = await c.from('unread_lines').select('*');
  expect(data ?? []).toEqual([]);
});

test('deleting an account removes everything synced for it', async () => {
  const c = await device(alice);
  const { error } = await c.rpc('delete_account');
  expect(error).toBeNull();
  const { count } = await admin.from('entries').select('id', { count: 'exact', head: true }).eq('user_id', alice.id);
  expect(count).toBe(0);
  const { data } = await admin.auth.admin.getUserById(alice.id);
  expect(data.user).toBeNull();
});
