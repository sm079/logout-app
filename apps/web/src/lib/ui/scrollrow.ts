/* A horizontal row that scrolls: edge fades that follow the scroll, the wheel scrolls it sideways, a mouse drags it */

export function scrollRow(el: HTMLElement) {
  const sync = () => {
    el.classList.toggle('scrolled', el.scrollLeft > 2);
    el.classList.toggle('end', el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  };
  const wheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };
  let drag: { x: number; s: number; moved: boolean } | null = null,
    suppress = false;
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, s: el.scrollLeft, moved: false };
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) {
      drag.moved = true;
      el.classList.add('dragging');
    }
    if (drag.moved) el.scrollLeft = drag.s - dx;
  };
  const up = () => {
    if (!drag) return;
    if (drag.moved) {
      suppress = true;
      setTimeout(() => (suppress = false), 0);
    }
    el.classList.remove('dragging');
    drag = null;
  };
  // A drag that ends over a button doesn't press it
  const click = (e: MouseEvent) => {
    if (suppress) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const ro = new ResizeObserver(sync);
  ro.observe(el);
  el.addEventListener('scroll', sync, { passive: true });
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('pointerdown', down);
  el.addEventListener('click', click, true);
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  sync();
  return {
    destroy() {
      ro.disconnect();
      el.removeEventListener('scroll', sync);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('click', click, true);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    }
  };
}
