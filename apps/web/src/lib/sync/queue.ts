/* Unread lines waiting to be sent: kept on the device until a signed-in sync sends them, at most a few hundred */
import { db } from '../data/db.ts';
import type { UnreadLine } from './unread.ts';

const KEY = 'unread';
const MAX = 200;

export async function queueUnread(lines: UnreadLine[]): Promise<void> {
  if (!lines.length) return;
  const have = ((await db().local.get(KEY))?.value as UnreadLine[] | undefined) ?? [];
  await db().local.put({ key: KEY, value: [...have, ...lines].slice(-MAX) });
}

/** Hands the waiting lines to `send`; they're dropped once it succeeds */
export async function flushUnread(send: (lines: UnreadLine[]) => Promise<void>): Promise<number> {
  const lines = ((await db().local.get(KEY))?.value as UnreadLine[] | undefined) ?? [];
  if (!lines.length) return 0;
  await send(lines);
  const now = ((await db().local.get(KEY))?.value as UnreadLine[] | undefined) ?? [];
  await db().local.put({ key: KEY, value: now.slice(lines.length) });
  return lines.length;
}
