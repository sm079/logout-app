/* A draft (the composer's text, or an entry being edited) read before it's saved */
import { readAliased } from './aliases';
import { byWhen, cardFor, learn, settle, sum } from './book';
import { foodOf } from './foods';
import { MODE_KINDS } from './read';
import type { Card, Line, Mode, Placement, Preview, PreviewBook, Statement } from './types';
import type { Dim } from './units';
import { DEFAULT_UNITS, type Units } from './units';

const NEWEST: Placement = { date: '9999-12-31', time: 0, id: '\uffff' };

// Statements in the order they were made; within one entry, the later line wins
const cmp = (a: Statement, b: Statement) => byWhen(a, b) || a.seq - b.seq;

/* The card an item would have with the draft saved where it's placed: the draft's own statements join the book's
   (an edited entry's old ones leave), and for each kind of amount the newest stands. */
function placedCard(book: PreviewBook | null, id: string, lines: Line[], place: Placement): Card {
  const c = book && book.cards.get(id);
  const own = new Map<string, Card>();
  // A copy of the book's card (or a new one) that the draft's lines are learned into
  const card = c ? { ...c, bases: { ...c.bases }, from: { ...c.from }, repeat: [] } : null;
  if (card) own.set(id, card);
  const draftId = place.id ?? NEWEST.id!;
  const at = { id: draftId, date: place.date, time: place.time };
  const mine: Statement[] = [];
  for (const line of lines) {
    learn(own, line, at);
    if (line.kind === 'food' && line.f.stated)
      mine.push({ ...at, seq: Number.MAX_SAFE_INTEGER - 1000 + mine.length, stated: line.f.stated });
  }
  const out = own.get(id) ?? cardFor(own, lines[0] as Line);
  const all: Statement[] = [];
  if (c) for (const list of Object.values(c.history)) for (const st of list) if (st.id !== draftId) all.push(st);
  all.push(...mine);
  all.sort(cmp);
  const bases: Card['bases'] = {},
    from: Card['from'] = {};
  let newest: Dim | null = null;
  for (const st of all) {
    bases[st.stated.dim] = st.stated;
    from[st.stated.dim] = st.id;
    newest = st.stated.dim;
  }
  return { ...out, bases, from, newest };
}

/** Reads a draft against the book, as the entry it would be once saved. Without a placement the draft is read as
    the newest entry; with one (its day and time, and the id of the entry it replaces when editing) a value it states
    applies only where it would be the newest statement. */
export function preview(book: PreviewBook | null, text: string, mode: Mode, units: Units = DEFAULT_UNITS, place?: Placement): Preview {
  const lines = readAliased(text, mode, units, book && book.aliases);
  const own = new Map<string, Card | null>();
  if (place) {
    const byCard = new Map<string, Line[]>();
    for (const { line } of lines) {
      if (!line.key || !MODE_KINDS.has(line.kind)) continue;
      const id = `${line.kind}:${line.key}`;
      const list = byCard.get(id);
      if (list) list.push(line);
      else byCard.set(id, [line]);
    }
    for (const [id, list] of byCard) own.set(id, placedCard(book, id, list, place));
  } else {
    const draft = { id: NEWEST.id!, date: NEWEST.date };
    for (const { line } of lines) {
      if (!line.key || !MODE_KINDS.has(line.kind)) continue;
      const id = `${line.kind}:${line.key}`;
      if (!own.has(id)) {
        const c = book && book.cards.get(id);
        own.set(id, c ? { ...c, bases: { ...c.bases }, repeat: [] } : null);
      }
      const prior = own.get(id);
      const tmp = new Map<string, Card>(prior ? [[id, prior]] : []);
      learn(tmp, line, draft);
      own.set(id, tmp.get(id) ?? null);
    }
  }
  const U = book ? book.U : 600,
    foods = book && book.foods;
  const res = lines.map(({ line, s }) =>
    settle(line, line.key ? own.get(`${line.kind}:${line.key}`) : null, U, s, line.kind === 'food' ? foodOf(foods, line.key) : null)
  );
  const at = res.map(r => r.line.at).find(t => t != null);
  return { res, sum: sum(res), at: at == null ? null : at };
}
