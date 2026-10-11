/* Placing each line's result at the end of its row in a mirror.
   Lines that share a row share one result: what still needs a value, else results in one unit added up.
   A result that doesn't fit beside the row's text, or that a shared row can't show, moves to a row under the field
   instead of hiding, so every line's result can be read. */
import { nf } from '../logic/format.ts';

const RO_SUM = /^([\d,.]+) (kcal|kg|lb|reps|ml|steps)$/;

export interface Overflow {
  name: string;
  text: string;
  needs: boolean;
}

/** The right edge of the text on each row of a mirror, by the row's top */
function rowEnds(root: HTMLElement): { top: number; bottom: number; right: number }[] {
  const rows: { top: number; bottom: number; right: number }[] = [];
  const add = (r: DOMRect) => {
    if (!r.width) return;
    const row = rows.find(x => r.top < x.bottom - 2 && r.bottom > x.top + 2);
    if (row) row.right = Math.max(row.right, r.right);
    else rows.push({ top: r.top, bottom: r.bottom, right: r.right });
  };
  const range = document.createRange();
  for (const n of root.childNodes) {
    if (n instanceof HTMLElement) {
      if (n.classList.contains('ro')) continue;
      for (const r of n.getClientRects()) add(r);
    } else if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r);
    }
  }
  return rows;
}

export function placeReadouts(root: HTMLElement): Overflow[] {
  const byRow = new Map<number, HTMLElement[]>();
  for (const ro of root.querySelectorAll<HTMLElement>('.ro')) {
    const list = byRow.get(ro.offsetTop);
    if (list) list.push(ro);
    else byRow.set(ro.offsetTop, [ro]);
  }
  if (!byRow.size) return [];
  const ends = rowEnds(root);
  const over: Overflow[] = [];
  const own = (ro: HTMLElement): Overflow => ({
    name: ro.dataset.name ?? '',
    text: ro.textContent ?? '',
    needs: ro.classList.contains('needs')
  });
  byRow.forEach(list => {
    const last = list[list.length - 1]!;
    const items = list.map(own);
    // What the row's end says, and which lines' results move under the field anyway
    let spilled: Overflow[] = [];
    if (list.length > 1) {
      const needs = items.find(o => o.needs);
      const parts = items.map(o => RO_SUM.exec(o.text));
      if (needs) {
        last.textContent = needs.text;
        last.classList.add('needs');
        spilled = items.filter(o => o !== needs);
      } else if (parts.every(p => p && p[2] === parts[0]![2])) {
        last.textContent = `${nf(parts.reduce((s, p) => s + parseFloat(p![1]!.replace(/,/g, '')), 0))} ${parts[0]![2]}`;
      } else spilled = items.slice(0, -1);
      list.slice(0, -1).forEach(ro => ro.classList.add('gone'));
    }
    // Too close to the row's text: every line of the row reads under the field instead
    const r = last.getBoundingClientRect();
    const row = ends.find(x => r.top < x.bottom - 2 && r.bottom > x.top + 2);
    const left = r.left + parseFloat(getComputedStyle(last).paddingLeft);
    if (row && row.right + 8 > left) {
      last.classList.add('gone');
      over.push(...items);
    } else over.push(...spilled);
  });
  return over;
}
