/* A stand-in for the Supabase project: Postgres in WASM running the real migration, with Supabase's auth.uid()
   reading the signed-in user from a setting, as it does from the request's token. */
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import type { Cursor, PullPage, PushBatch, Remote, Table } from '#lib/sync/remote.ts';

const MIGRATIONS = new URL('../../../../supabase/migrations/', import.meta.url);

const AUTH = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema auth, public to anon, authenticated;
`;

export async function server(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(AUTH);
  for (const f of readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(new URL(f, MIGRATIONS), 'utf8'));
  return db;
}

export async function addUser(db: PGlite): Promise<string> {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id) values ($1)', [id]);
  return id;
}

/** Runs queries as a signed-in user (or as nobody, with null), under row-level security */
export function as<T>(db: PGlite, uid: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return fn(tx);
  });
}

const COLUMNS: Record<Table, string> = {
  entries: `id::text, to_char(date, 'YYYY-MM-DD') as date, time, mode, text, units, updated_at, deleted, version`,
  aliases: 'id, name, updated_at, deleted, version',
  settings: 'key, value, updated_at, version'
};
const ID: Record<Table, string> = { entries: 'id', aliases: 'id', settings: 'key' };

/** What sync talks to, for one user */
export function remoteFor(db: PGlite, uid: string): Remote {
  return {
    async push(b: PushBatch) {
      const r = await as(db, uid, tx =>
        tx.query<{ v: number }>('select public.sync_push($1::jsonb, $2::jsonb, $3::jsonb, $4) as v', [
          JSON.stringify(b.entries),
          JSON.stringify(b.aliases),
          JSON.stringify(b.settings),
          b.engine
        ])
      );
      return Number(r.rows[0]!.v);
    },
    async pull<T extends Table>(table: T, after: Cursor, limit: number): Promise<PullPage[T]> {
      const id = ID[table];
      const r = await as(db, uid, tx =>
        tx.query<Record<string, unknown>>(
          `select ${COLUMNS[table]} from public.${table}
           where version > $1 or (version = $1 and ${id}::text > $2)
           order by version, ${id}::text limit $3`,
          [after.v, after.id, limit]
        )
      );
      return r.rows.map(({ updated_at, version, ...rest }) => ({
        ...rest,
        updatedAt: Number(updated_at),
        version: Number(version)
      })) as unknown as PullPage[T];
    },
    async engineVersion() {
      const r = await as(db, uid, tx => tx.query<{ engine_version: number }>('select engine_version from public.sync_state'));
      return r.rows[0]?.engine_version ?? 0;
    }
  };
}
