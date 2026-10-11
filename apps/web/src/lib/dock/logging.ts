/* Logging: what the composer, the water button and check-ins share */
import { readEntry, preview, type Mode, type Preview } from '@logout/engine';
import type { ViewEntry } from '../engine/core.ts';
import { app } from '../state/app.svelte.ts';
import { clockNow, isoOf, monthDay } from '../logic/dates.ts';
import { kindOf, sumParts, waterFmt } from '../logic/format.ts';
import { LOGGED } from './modes.ts';

/** A draft read as it will be once logged: on the day LOG writes to, at its typed time or now */
export function readDraft(text: string, mode: Mode): Preview {
  const units = app.units;
  const at = readEntry(text, mode, units)
    .map(l => l.line.at)
    .find(t => t != null);
  return preview(app.book, text, mode, units, { date: isoOf(app.logDate), time: at ?? clockNow() });
}

/** Keeps the text as an entry on the day LOG writes to, and returns it as read once the book has caught up */
export async function commit(text: string, mode: Mode, time: number): Promise<ViewEntry | null> {
  const date = isoOf(app.logDate),
    before = app.sessions(date);
  const id = await app.repo.log(text, mode, date, time, app.units);
  await app.engine.settled();
  const e = await app.engine.entry(id);
  app.emit({ t: 'logged', id, date, before });
  return e;
}

/** `today`, or `on Oct 8` */
export const dayWord = (d: Date): string => (+d === +app.today ? 'today' : `on ${monthDay(d, app.today)}`);
/** `Meal logged`, or `Meal logged to Oct 8` */
export const loggedTitle = (e: ViewEntry): string => {
  const k = LOGGED[kindOf(e)] ?? 'Logged',
    d = app.logDate;
  return +d === +app.today ? k : `${k} to ${monthDay(d, app.today)}`;
};

/** Says it was logged, unless the log is open and shows it */
export function confirmLogged(e: ViewEntry, quick = false): void {
  app.announce = `Logged ${e.text}`;
  if (app.logsOpen) return;
  const parts = sumParts(e.sum, app.units).map(p => p[1]);
  let sub = parts.slice(0, quick ? undefined : 2).join(' · ');
  if (kindOf(e) === 'water') {
    const day = app.book?.days.get(e.date);
    sub = `${parts[0]} · ${waterFmt(day?.water ?? 0)} ${dayWord(app.logDate)}`;
  }
  app.toast(loggedTitle(e), sub);
}

/** Water and check-ins: a line logged in one tap, the same as if it had been typed */
export async function quickLog(text: string): Promise<void> {
  const e = await commit(text, app.mode, clockNow());
  if (e) confirmLogged(e, true);
}
