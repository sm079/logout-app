/* The account: sign in with a code sent by email, and keep this device's log in step with the others.
   Without a Supabase project configured, none of this runs and the app keeps everything on the device. */
import { version as ENGINE_VERSION } from '@logout/engine';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '$app/env/public';
import { db } from '../data/db.ts';
import { entryOf, load, onLocalChange } from '../data/repo.ts';
import type { Profile, WidgetPicks } from '../data/types.ts';
import { app } from '../state/app.svelte.ts';
import { clockNow, isoOf } from '../logic/dates.ts';
import type { Remote } from './remote.ts';
import { Syncer, type SyncResult } from './sync.ts';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export const account = $state({
  /** A project is configured, so signing in is possible */
  configured: !!(SUPABASE_URL && SUPABASE_KEY),
  user: null as { id: string; email: string } | null,
  /** Signing in: asking for an email, waiting for its code, or checking it */
  step: 'email' as 'email' | 'sending' | 'code' | 'verifying',
  email: '',
  error: '',
  status: 'idle' as SyncStatus,
  lastSync: 0,
  /** A device of this user's reads lines with a newer engine */
  newerEngine: false
});

let sb: SupabaseClient | null = null;
let syncer: Syncer | null = null;
let stopTriggers: (() => void) | null = null;

/** Connects to the project and picks up a signed-in session; call once the app has booted */
export async function initAccount(): Promise<void> {
  if (!account.configured || sb) return;
  const { connect, supabaseRemote } = await import('./supabase.ts');
  sb = connect(SUPABASE_URL, SUPABASE_KEY);
  const session = (await sb.auth.getSession()).data.session;
  sb.auth.onAuthStateChange((_event, s) => {
    const user = s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null;
    if (user?.id === account.user?.id) return;
    account.user = user;
    if (user) void begin(supabaseRemote(sb!));
    else end();
  });
  if (session?.user) {
    account.user = { id: session.user.id, email: session.user.email ?? '' };
    void begin(supabaseRemote(sb));
  }
}

/** Sends a sign-in code to an email address */
export async function sendCode(email: string): Promise<void> {
  if (!sb) return;
  account.email = email.trim();
  account.error = '';
  account.step = 'sending';
  const { error } = await sb.auth.signInWithOtp({ email: account.email, options: { shouldCreateUser: true } });
  if (error) {
    account.step = 'email';
    account.error = error.status === 429 ? 'Too many tries. Wait a minute, then send again.' : error.message;
    return;
  }
  account.step = 'code';
}

/** Checks the code from the email; signed in, sync starts */
export async function verifyCode(code: string): Promise<void> {
  if (!sb) return;
  account.error = '';
  account.step = 'verifying';
  const { error } = await sb.auth.verifyOtp({ email: account.email, token: code.replace(/\s/g, ''), type: 'email' });
  if (error) {
    account.step = 'code';
    account.error = /expired|invalid/i.test(error.message) ? "That code didn't work. Check it, or send a new one." : error.message;
    return;
  }
  account.step = 'email';
}

export function useAnotherEmail(): void {
  account.step = 'email';
  account.error = '';
}

/** Signs out and removes the log from this device (it stays in the account). With changes not yet synced, it
    stops and says so unless `force`. */
export async function signOut(force = false): Promise<'done' | 'unsynced'> {
  if (!sb) return 'done';
  await runSync();
  if (!force && syncer && (await syncer.pending())) return 'unsynced';
  await sb.auth.signOut({ scope: 'local' });
  end();
  db().close();
  await db().delete();
  location.reload();
  return 'done';
}

/* ---------- Keeping in step ---------- */
async function begin(remote: Remote) {
  syncer = new Syncer(db(), remote);
  // A device that was another account's starts its cursors over
  const known = (await db().local.get('account'))?.value;
  if (known && known !== account.user?.id) await db().local.where('key').startsWith('cursor:').delete();
  await db().local.put({ key: 'account', value: account.user?.id });
  stopTriggers?.();
  stopTriggers = triggers();
  await runSync();
}
function end() {
  stopTriggers?.();
  stopTriggers = null;
  syncer = null;
  account.status = 'idle';
}

let running: Promise<void> | null = null,
  again = false;
/** Runs one sync, or another straight after the one under way */
export function runSync(): Promise<void> {
  if (!syncer) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (!navigator.onLine) {
        account.status = 'offline';
        break;
      }
      account.status = 'syncing';
      try {
        const result = await syncer!.run();
        await applyPulled(result);
        account.status = 'idle';
        account.lastSync = Date.now();
        account.newerEngine = result.engine > ENGINE_VERSION;
      } catch (err) {
        console.warn(err);
        account.status = navigator.onLine ? 'error' : 'offline';
        break;
      }
    } while (again && syncer);
    running = null;
  })();
  return running;
}

/** Sync runs after changes here (once typing settles), when the network returns, when the app comes back to the
    front, and every few minutes */
function triggers(): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(t);
    t = setTimeout(() => void runSync(), 1500);
  };
  const visible = () => {
    if (document.visibilityState === 'visible') void runSync();
  };
  const off = onLocalChange(soon);
  const every = setInterval(() => void runSync(), 5 * 60 * 1000);
  addEventListener('online', soon);
  document.addEventListener('visibilitychange', visible);
  return () => {
    off();
    clearTimeout(t);
    clearInterval(every);
    removeEventListener('online', soon);
    document.removeEventListener('visibilitychange', visible);
  };
}

/** What came down reaches the book and the settings */
async function applyPulled(r: SyncResult) {
  if (r.entries.length > 300) {
    // Many changes (a first sync): read the whole store again
    const data = await load();
    app.engine.change({
      t: 'init',
      state: {
        entries: data.entries.map(entryOf),
        sampleEdits: data.sampleEdits,
        aliases: data.aliases,
        profile: { sex: app.profile.sex, heightCm: app.profile.heightCm },
        sample: app.device.sample,
        today: isoOf(app.today),
        nowMin: clockNow()
      }
    });
  } else {
    for (const e of r.entries) app.engine.change(e.deleted ? { t: 'remove', id: e.id } : { t: 'upsert', entry: entryOf(e) });
  }
  if (r.aliases) {
    const { aliases } = await load();
    app.aliases = aliases;
    app.engine.change({ t: 'aliases', aliases });
  }
  for (const s of r.settings) {
    if (s.key === 'profile') {
      const p = s.value as Profile;
      app.profile = { ...app.profile, ...p, goals: { ...app.profile.goals, ...p.goals } };
      app.engine.change({ t: 'profile', profile: { sex: p.sex, heightCm: p.heightCm } });
    } else app.widgets = s.value as WidgetPicks;
  }
  if (r.entries.length || r.aliases) {
    await app.engine.settled();
    app.emit({ t: 'renamed' });
  }
}
