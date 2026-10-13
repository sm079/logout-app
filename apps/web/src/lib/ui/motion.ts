/* Motion helpers shared by every part of the app: rolling text, replayed animations, reduced motion */

/** Whether the user asked for less motion; read once, as the page loads */
export const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Restarts a CSS animation by removing and re-adding its class */
export function replay(el: Element | null | undefined, cls: string): void {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

type Rolling = HTMLElement & { _rollT?: ReturnType<typeof setTimeout> };

/** Sets an element's text so the old text rolls out and the new rolls in, the width easing between them.
    `dir` is 1 to roll up (forward, more) and -1 to roll down. The first text is set without motion. */
export function rollTo(el: HTMLElement, text: string | number, dir = 1): void {
  const value = String(text);
  if (el.dataset.v === value) return;
  const first = el.dataset.v === undefined;
  el.dataset.v = value;
  const s = document.createElement('span');
  s.className = 'r';
  s.textContent = value;
  if (first || REDUCE || !el.isConnected) {
    el.replaceChildren(s);
    return;
  }
  const w0 = el.offsetWidth;
  for (const o of [...el.children] as HTMLElement[]) {
    o.classList.remove('r-in');
    o.classList.add('r-out');
    o.style.setProperty('--dir', String(dir));
    o.addEventListener('animationend', () => o.remove(), { once: true });
  }
  s.classList.add('r-in');
  s.style.setProperty('--dir', String(dir));
  el.append(s);
  const w1 = s.offsetWidth;
  el.style.width = `${w0}px`;
  void el.offsetWidth;
  el.style.width = `${w1}px`;
  const r = el as Rolling;
  clearTimeout(r._rollT);
  r._rollT = setTimeout(() => {
    el.style.width = '';
  }, 480);
}

/** Sets an element's text at once (while scrubbing a chart), keeping it ready to roll later */
export function setNow(el: HTMLElement, text: string | number): void {
  const value = String(text);
  if (el.dataset.v === value) return;
  el.dataset.v = value;
  const s = document.createElement('span');
  s.className = 'r';
  s.textContent = value;
  el.replaceChildren(s);
  el.style.width = '';
}

export interface RollParams {
  text: string | number;
  dir?: number;
  /** Change at once, without rolling (while scrubbing a chart) */
  instant?: boolean;
}

/** `use:roll={{ text, dir }}`: the element's text rolls whenever it changes */
export function roll(node: HTMLElement, params: RollParams) {
  const set = (p: RollParams) => (p.instant ? setNow(node, p.text) : rollTo(node, p.text, p.dir ?? 1));
  set(params);
  return { update: set };
}

/** `use:rollNum={text}`: a number that rolls up when it grows and down when it shrinks */
export function rollNum(node: HTMLElement, text: string) {
  const val = (t: string | undefined) => parseFloat(String(t ?? '').replace(/,/g, '')) || 0;
  rollTo(node, text);
  return {
    update(next: string) {
      rollTo(node, next, val(next) >= val(node.dataset.v) ? 1 : -1);
    }
  };
}

/** `use:flash={[what, value]}`: replays the element's `flash` animation when its value changes while `what` it shows
    stays the same, so a widget lights up as something is logged or synced in but not as the selection moves */
export function flash(node: HTMLElement, [what, value]: [string, string]) {
  let shown = what,
    v = value;
  return {
    update([w, val]: [string, string]) {
      if (w === shown && val !== v && !REDUCE) replay(node, 'flash');
      shown = w;
      v = val;
    }
  };
}
