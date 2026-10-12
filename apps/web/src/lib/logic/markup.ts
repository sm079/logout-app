/* Reading what was typed, as markup: shared by the composer, the log rows and the edit field.
   Colour and underlines only, so a mirror keeps a textarea's exact glyph widths. */
import { readout, type Kind, type Resolved, type Role, type Token } from '@logout/engine';

const TK: Partial<Record<Role, string>> = {
  amount: 'v',
  count: 'v',
  sets: 'v',
  load: 'v',
  hold: 'v',
  distance: 'v',
  duration: 'v',
  interval: 'v',
  steps: 'v',
  basis: 'basis',
  pace: 'pace',
  effort: 'effort',
  hr: 'hr',
  kcal: 'kcal',
  time: 'time',
  water: 'water',
  score: 'score',
  measure: 'measure',
  note: 'note',
  bad: 'bad',
  num: 'bad'
};
const ANY = new Set<Kind>(['water', 'checkin', 'measure']);
const ITEM_KINDS = new Set<Kind>(['food', 'strength', 'cardio']);

export const esc = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Whether an item already has a card (a name never seen before is underlined) */
export type Known = (kind: Kind, key: string) => boolean;

function tokClass(tk: Token, kind: Kind, key: string | null, known: Known | null): string {
  if (tk.role === 'name') {
    if (ANY.has(kind)) return `tk-name k-${kind}`;
    return !known || (key && known(kind, key)) ? 'tk-name' : 'tk-name new';
  }
  if (tk.role === 'macro') return tk.k === 'kcal' ? 'tk-kcal' : `tk-${tk.k}`;
  return 'tk-' + (TK[tk.role] || 'v');
}

export interface MarkupOptions {
  /** Each line's result at the end of its row */
  readouts?: boolean;
  /** Ghost text after the last line, taken with Tab */
  completion?: string;
  /** A line whose result is left out (the one being completed) */
  hide?: number;
  /** Item names become buttons that open the item (in log rows) */
  items?: boolean;
  known?: Known | null;
}

/** Text as markup: each read token coloured by what it is */
export function markup(
  text: string,
  res: Resolved[],
  { readouts = false, completion = '', hide = -1, items = false, known = null }: MarkupOptions = {}
): string {
  let html = '',
    at = 0;
  res.forEach((r, i) => {
    const l = r.line;
    html += esc(text.slice(at, r.s));
    let pos = 0,
      seg = '';
    for (const tk of l.tokens) {
      const btn =
        items && tk.role === 'name' && ITEM_KINDS.has(l.kind)
          ? ` data-item="${i}" role="button" tabindex="0" aria-label="${esc(l.name ?? '')}: open"`
          : '';
      seg +=
        esc(l.text.slice(pos, tk.s)) + `<span class="${tokClass(tk, l.kind, l.key, known)}"${btn}>${esc(l.text.slice(tk.s, tk.e))}</span>`;
      pos = tk.e;
    }
    html += `<span class="sg">${seg}${esc(l.text.slice(pos))}</span>`;
    const ro = readouts && i !== hide ? readout(r) : '';
    if (ro) html += `<span class="ro${r.st === 'ok' ? '' : ' needs'}" data-name="${esc(l.name ?? '')}">${esc(ro)}</span>`;
    at = r.s + l.text.length;
  });
  html += esc(text.slice(at));
  if (completion) html += `<span class="cmp">${esc(completion)}</span>`;
  return html;
}
