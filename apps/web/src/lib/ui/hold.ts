/** `use:hold={step}`: a press steps once and holding keeps stepping, faster after a moment. Enter and Space step once. */
export function hold(node: HTMLElement, step: () => void) {
  let fn = step;
  let t: ReturnType<typeof setTimeout> | undefined;
  const stop = () => clearTimeout(t);
  const go = (wait: number) => {
    fn();
    t = setTimeout(() => go(Math.max(40, wait * 0.8)), wait);
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    go(380);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    fn();
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('keydown', key);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) node.addEventListener(ev, stop);
  return {
    update(next: () => void) {
      fn = next;
    },
    destroy: stop
  };
}
