/* Suggestions: what you've logged before, newest first, with what to type to repeat it */
import { amountText, nf } from './format';
import { valuesText } from './read';
import type { Book, Card, Mode, Suggestion } from './types';

const BUILT_IN: [string, string, string][] = [
  ['water', 'Water · any mode', 'water '],
  ['weight', 'Body weight · any mode', 'weight '],
  ['waist', 'Measurement · any mode', 'waist '],
  ['neck', 'Measurement · any mode', 'neck '],
  ['hips', 'Measurement · any mode', 'hips '],
  ['sleep', 'Check-in · out of 5', 'sleep '],
  ['mood', 'Check-in · out of 5', 'mood '],
  ['energy', 'Check-in · out of 5', 'energy ']
];

/** A card in a few words: a food's values and what they're for, or what was done last time */
export function cardMeta(c: Card): string {
  if (c.kind === 'food') {
    const b = c.newest && c.bases[c.newest];
    if (!b) return 'needs values';
    const head =
      b.kcal != null
        ? `${nf(b.kcal)} kcal`
        : (['p', 'c', 'f'] as const)
            .filter(m => b[m] != null)
            .map(m => `${nf(b[m] as number)}${m}`)
            .join(' ');
    return `${head} / ${amountText(b)}`;
  }
  return c.repeat.map(valuesText).join(', ') || 'no values yet';
}

/** What taking a suggestion writes: the name and what was done last time (a food's amount) */
export function cardInsert(c: Card): string {
  if (c.kind === 'food') return c.amount && c.amount.text ? `${c.name} ${c.amount.text}` : c.name;
  const repeat = c.repeat.map(valuesText).filter(Boolean).join(', ');
  return repeat ? `${c.name} ${repeat}` : c.name;
}

/** Items of a mode (of every mode when it's null) whose name (or a word of it) starts with the query, the newest
    first; then built-in lines */
export function suggest(book: Pick<Book, 'cards'> | null, mode: Mode | null, query: string, n = 6): Suggestion[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' '),
    flat = (s: string) => s.replace(/[\s-]/g, '');
  const fits = (key: string) => !q || flat(key).startsWith(flat(q)) || key.split(/[\s-]/).some(w => w.startsWith(q));
  const out: Suggestion[] = [];
  if (book) {
    const cards = [...book.cards.values()].filter(c => (!mode || c.kind === mode) && fits(c.key));
    cards.sort(
      (a, b) =>
        Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)) ||
        ((a.last ?? '') < (b.last ?? '') ? 1 : (a.last ?? '') > (b.last ?? '') ? -1 : 0) ||
        b.uses - a.uses
    );
    for (const c of cards.slice(0, n)) out.push({ name: c.name, meta: cardMeta(c), insert: cardInsert(c), last: c.last, kind: c.kind });
  }
  if (q) {
    for (const [name, meta, insert] of BUILT_IN) {
      if (out.length < n && name.startsWith(q) && !out.some(o => o.name.toLowerCase() === name))
        out.push({ name, meta, insert, last: null, kind: 'any' });
    }
  }
  return out;
}
