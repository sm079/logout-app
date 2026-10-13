/* Suggestions: what you've logged before, newest first, with what to type to repeat it; then foods from the food
   tables that the typed words could be */
import { amountText, nf } from './format';
import { foodOf, foodsLike, SOURCE_LABEL, type Food, type Foods } from './foods';
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

/** A food table entry in a few words: its values per 100 g and the table */
export const foodMeta = (f: Food): string => `≈${nf(f.kcal)} kcal / 100 g · ${SOURCE_LABEL[f.src]}`;

/** A card in a few words: a food's values and what they're for, or what was done last time */
export function cardMeta(c: Card, foods?: Foods | null): string {
  if (c.kind === 'food') {
    const b = c.newest && c.bases[c.newest];
    if (!b) {
      const f = foodOf(foods, c.key);
      return f ? foodMeta(f) : 'needs values';
    }
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
    first; then built-in lines; then, for food, food table entries with every typed word that aren't logged items
    already (unless `tables` is false). Taking one writes its short name. */
export function suggest(
  book: (Pick<Book, 'cards'> & Partial<Pick<Book, 'foods'>>) | null,
  mode: Mode | null,
  query: string,
  n = 6,
  tables = true
): Suggestion[] {
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
    for (const c of cards.slice(0, n))
      out.push({ name: c.name, meta: cardMeta(c, book.foods), insert: cardInsert(c), last: c.last, kind: c.kind });
  }
  if (q) {
    for (const [name, meta, insert] of BUILT_IN) {
      if (out.length < n && name.startsWith(q) && !out.some(o => o.name.toLowerCase() === name))
        out.push({ name, meta, insert, last: null, kind: 'any' });
    }
  }
  const foods = book && book.foods;
  if (tables && foods && q && (!mode || mode === 'food') && out.length < n) {
    // Not an entry a logged food's name already reads as
    const logged = new Set<Food>();
    for (const c of book.cards.values()) {
      const f = c.kind === 'food' ? foodOf(foods, c.key) : null;
      if (f) logged.add(f);
    }
    for (const f of foodsLike(foods, query, n - out.length, f => logged.has(f) || out.some(o => o.name.toLowerCase() === f.name)))
      out.push({ name: f.name, meta: foodMeta(f), insert: f.name, last: null, kind: 'food', src: f.src });
  }
  return out;
}
