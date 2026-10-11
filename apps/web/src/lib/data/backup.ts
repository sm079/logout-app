/* Your data as one file: export it, bring a file back (merged in, or in place of what's here), or clear entries.
   Removals are kept as marks until they've synced, so a cleared or replaced entry goes from other devices too. */
import { isoOf, ISO_RE } from '../logic/dates.ts';
import { db } from './db.ts';
import { UUID_RE, uuidv7 } from './ids.ts';
import { DEFAULT_DEVICE, defaultProfile, GOALS, type Aliases, type EntryRow, type Profile, type WidgetPicks } from './types.ts';
import type { Mode, Units } from '@logout/engine';

const MODES = new Set<Mode>(['food', 'strength', 'cardio']);
const ALIAS_RE = /^(food|strength|cardio):./;

export interface ExportFile {
  app: 'logout';
  version: 1;
  exported: string;
  profile: Profile | null;
  entries: Omit<EntryRow, 'dirty' | 'deleted'>[];
  aliases: Aliases;
  widgets: WidgetPicks;
}

export async function exportData(): Promise<ExportFile> {
  const d = db();
  const [entries, aliases, profile, widgets] = await Promise.all([
    d.entries.toArray(),
    d.aliases.toArray(),
    d.settings.get('profile'),
    d.settings.get('widgets')
  ]);
  return {
    app: 'logout',
    version: 1,
    exported: new Date().toISOString(),
    profile: (profile?.value as Profile | undefined) ?? null,
    entries: entries.filter(e => !e.deleted).map(({ dirty: _d, deleted: _x, ...e }) => e),
    aliases: Object.fromEntries(aliases.filter(a => !a.deleted && a.name).map(a => [a.id, a.name as string])),
    widgets: (widgets?.value as WidgetPicks | undefined) ?? {}
  };
}

export function downloadExport(data: ExportFile): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `logout-${isoOf(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file read back, with only well-formed entries kept */
export interface Imported {
  profile: Profile | null;
  entries: EntryRow[];
  aliases: Aliases;
  widgets: WidgetPicks;
}

const unitsOf = (u: unknown): Units => {
  const x = (u ?? {}) as Partial<Record<'load' | 'dist', unknown>>;
  // The prototype stored the toggles as 0/1
  const load = x.load === 'lb' || x.load === 1 ? 'lb' : 'kg';
  const dist = x.dist === 'mi' || x.dist === 1 ? 'mi' : 'km';
  return { load, dist };
};

/** Reads an export: this app's, or the prototype's (`repflow`), whose ids are given new ones. Null if it's neither. */
export function readExport(text: string, now = Date.now()): Imported | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object') return null;
  const legacy = d.app === 'repflow';
  if (d.app !== 'logout' && !legacy) return null;
  const log = (legacy ? d.log : d) as Record<string, unknown> | undefined;
  if (!log || !Array.isArray(log.entries)) return null;
  const fallbackUnits = unitsOf(log.units);
  const entries: EntryRow[] = [];
  for (const raw of log.entries as Record<string, unknown>[]) {
    if (!raw || typeof raw.text !== 'string' || typeof raw.date !== 'string' || !ISO_RE.test(raw.date)) continue;
    if (!Number.isFinite(raw.time) || !MODES.has(raw.mode as Mode)) continue;
    const id = typeof raw.id === 'string' && UUID_RE.test(raw.id) ? raw.id : uuidv7();
    entries.push({
      id,
      date: raw.date,
      time: Math.max(0, Math.min(1439, Math.round(raw.time as number))),
      mode: raw.mode as Mode,
      text: raw.text,
      units: raw.units ? unitsOf(raw.units) : fallbackUnits,
      updatedAt: Number.isFinite(raw.updatedAt) ? (raw.updatedAt as number) : now,
      deleted: 0,
      dirty: 1
    });
  }
  const aliases: Aliases = {};
  for (const [k, v] of Object.entries((log.aliases ?? {}) as Record<string, unknown>))
    if (ALIAS_RE.test(k) && typeof v === 'string' && v.trim()) aliases[k] = v;
  const p = (d.profile ?? null) as Partial<Profile> | null;
  const profile = p && typeof p === 'object' ? normalProfile(p, legacy ? fallbackUnits : undefined) : null;
  const widgets = d.widgets && typeof d.widgets === 'object' ? (d.widgets as WidgetPicks) : {};
  return { profile, entries, aliases, widgets };
}

function normalProfile(p: Partial<Profile>, units?: Units): Profile {
  const base = defaultProfile(typeof p.since === 'string' && ISO_RE.test(p.since) ? p.since : isoOf(new Date()));
  const goals = { ...GOALS };
  for (const k of Object.keys(GOALS) as (keyof typeof GOALS)[]) {
    const v = p.goals?.[k];
    if (typeof v === 'number' && v > 0) goals[k] = v;
  }
  return {
    since: base.since,
    sex: p.sex === 'male' || p.sex === 'female' ? p.sex : null,
    heightCm: typeof p.heightCm === 'number' && p.heightCm >= 100 && p.heightCm <= 250 ? p.heightCm : null,
    goals,
    units: units ?? (p.units ? unitsOf(p.units) : base.units)
  };
}

/** Adds a file's entries and names to what's here; where both have an entry, the newer version stays */
export async function importMerge(x: Imported): Promise<{ added: number; updated: number }> {
  const d = db();
  let added = 0,
    updated = 0;
  await d.transaction('rw', d.entries, d.aliases, async () => {
    for (const e of x.entries) {
      const have = await d.entries.get(e.id);
      if (!have) {
        await d.entries.put(e);
        added++;
      } else if (have.updatedAt < e.updatedAt) {
        await d.entries.put({ ...e, updatedAt: Date.now() });
        updated++;
      }
    }
    const now = Date.now();
    for (const [id, name] of Object.entries(x.aliases))
      if (!(await d.aliases.get(id))) await d.aliases.put({ id, name, updatedAt: now, deleted: 0, dirty: 1 });
  });
  return { added, updated };
}

/** Puts a file in place of what's here: entries and names, and the profile and widgets it has */
export async function importReplace(x: Imported): Promise<void> {
  const d = db();
  const now = Date.now();
  await d.transaction('rw', [d.entries, d.aliases, d.settings, d.sampleEdits, d.local], async () => {
    await removeAll(now);
    await d.entries.bulkPut(x.entries.map(e => ({ ...e, updatedAt: now })));
    await d.aliases.bulkPut(
      Object.entries(x.aliases).map(([id, name]) => ({ id, name, updatedAt: now, deleted: 0 as const, dirty: 1 as const }))
    );
    if (x.profile) await d.settings.put({ key: 'profile', value: x.profile, updatedAt: now, dirty: 1 });
    await d.settings.put({ key: 'widgets', value: x.widgets, updatedAt: now, dirty: 1 });
    const dev = await d.local.get('device');
    await d.local.put({ key: 'device', value: { ...DEFAULT_DEVICE, ...(dev?.value as object), setupDone: true } });
  });
}

/** Deletes every entry logged here and the names given to items; the profile stays */
export async function clearEntries(): Promise<void> {
  const d = db();
  await d.transaction('rw', [d.entries, d.aliases, d.sampleEdits], () => removeAll(Date.now()));
}

async function removeAll(now: number) {
  const d = db();
  const live = await d.entries.filter(e => !e.deleted).toArray();
  await d.entries.bulkPut(live.map(e => ({ ...e, deleted: 1 as const, dirty: 1 as const, updatedAt: now })));
  const names = await d.aliases.filter(a => !a.deleted).toArray();
  await d.aliases.bulkPut(names.map(a => ({ ...a, name: null, deleted: 1 as const, dirty: 1 as const, updatedAt: now })));
  await d.sampleEdits.clear();
}
