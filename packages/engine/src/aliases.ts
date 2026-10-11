/* Renamed and merged items.
   An alias gives an item's name a new one: `{ 'food:chiken': 'chicken' }`. Its lines key to the new name (following
   renames of renames), so they share a card, but their text stays as typed; `typed` keeps the key it had. */
import { readEntry, MODE_KINDS } from './read';
import type { Aliases, EntryLine, Kind, Line, Mode } from './types';
import type { Units } from './units';

/** How a name is keyed: trimmed, single-spaced, lower-case */
export const keyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** What a name reads as: its key and name at the end of its renames (name null when it has none) */
export function resolveName(kind: Kind, key: string, aliases: Aliases | null | undefined): { key: string; name: string | null } {
  let name: string | null = null;
  for (let hop = 0; aliases && hop < 8; hop++) {
    const to: unknown = aliases[`${kind}:${key}`];
    if (typeof to !== 'string' || !to.trim()) break;
    name = to.trim().replace(/\s+/g, ' ');
    if (keyOf(to) === key) break;
    key = keyOf(to);
  }
  return { key, name };
}

export function aliased(line: Line, aliases: Aliases | null | undefined): Line {
  if (!aliases || !line.key || !MODE_KINDS.has(line.kind)) return line;
  const r = resolveName(line.kind, line.key, aliases);
  return r.name == null ? line : { ...line, key: r.key, name: r.name, typed: line.key };
}

/** An entry's lines, read through the aliases */
export const readAliased = (text: string, mode: Mode, units: Units, aliases: Aliases | null | undefined): EntryLine[] =>
  readEntry(text, mode, units).map(({ line, s }) => ({ line: aliased(line, aliases), s }));
