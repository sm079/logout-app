/* The Supabase project: sign-in by an emailed code, and the remote that sync talks to.
   Loaded only when the app is built with a project's URL and key, so without one nothing of it ships. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Cursor, PullPage, PushBatch, Remote, Table } from './remote.ts';

export function connect(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    // A sign-in link from the email lands back on /app with the session in the URL, which is picked up from there
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'logout.auth' }
  });
}

const COLUMNS: Record<Table, string> = {
  entries: 'id,date,time,mode,text,units,updated_at,deleted,version',
  aliases: 'id,name,updated_at,deleted,version',
  settings: 'key,value,updated_at,version'
};
const ID: Record<Table, string> = { entries: 'id', aliases: 'id', settings: 'key' };

type Row = Record<string, unknown> & { updated_at: number | string; version: number | string };
// bigint columns can come back as strings
const n = (v: unknown) => Number(v);

export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async push(b: PushBatch) {
      const { data, error } = await sb.rpc('sync_push', {
        p_entries: b.entries,
        p_aliases: b.aliases,
        p_settings: b.settings,
        p_engine: b.engine
      });
      if (error) throw new Error(`Sync push failed: ${error.message}`);
      return n(data);
    },
    async pull<T extends Table>(table: T, after: Cursor, limit: number): Promise<PullPage[T]> {
      const id = ID[table];
      // Rows after the cursor: a later version, or the same version and a later id
      const quoted = JSON.stringify(after.id);
      const filter = after.id ? `version.gt.${after.v},and(version.eq.${after.v},${id}.gt.${quoted})` : `version.gt.${after.v}`;
      const { data, error } = await sb.from(table).select(COLUMNS[table]).or(filter).order('version').order(id).limit(limit);
      if (error) throw new Error(`Sync pull failed: ${error.message}`);
      return ((data ?? []) as unknown as Row[]).map(r => {
        const { updated_at, version, ...rest } = r;
        return { ...rest, updatedAt: n(updated_at), version: n(version) };
      }) as unknown as PullPage[T];
    },
    async engineVersion() {
      const { data, error } = await sb.from('sync_state').select('engine_version').maybeSingle();
      if (error) throw new Error(`Sync state failed: ${error.message}`);
      return data ? n(data.engine_version) : 0;
    }
  };
}
