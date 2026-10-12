<!--
  A ruler to scrub: it slides under a fixed needle and settles on each mark. Touch and trackpads scroll it, a mouse
  drags it, arrow keys step it. Centimetres, or inches marked by the foot; its value is in centimetres. Set from
  outside, it glides to the new value; moved by hand, it says so through `onpick`.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { REDUCE } from '../ui/motion.ts';

  let { value = $bindable(), imperial, label, onpick }: { value: number; imperial: boolean; label: string; onpick?: () => void } = $props();

  const scale = $derived(
    imperial ? { min: 48, max: 90, gap: 15, mid: 6, major: 12, unit: 2.54 } : { min: 120, max: 220, gap: 10, mid: 5, major: 10, unit: 1 }
  );
  const marks = $derived(
    Array.from({ length: scale.max - scale.min + 1 }, (_, i) => {
      const v = scale.min + i;
      return { v, major: v % scale.major === 0, mid: v % scale.mid === 0, text: imperial ? `${v / 12}′` : String(v) };
    })
  );
  // Marks from the start of the scale, for a height in centimetres
  const markOf = (cm: number) => Math.min(scale.max, Math.max(scale.min, Math.round(cm / scale.unit))) - scale.min;
  const at = $derived(markOf(value));

  let track: HTMLDivElement;
  // A person is moving it (so its scrolling sets the height), and the height it last set itself
  let moved = false;
  let own = untrack(() => value);
  let lastMark = -1;

  function goTo(i: number, smooth: boolean) {
    track.scrollTo({ left: i * scale.gap, behavior: smooth && !REDUCE ? 'smooth' : 'instant' });
  }
  function set(i: number) {
    const m = Math.min(marks.length - 1, Math.max(0, i));
    if (m === markOf(value)) return;
    if (lastMark !== -1 && m !== lastMark) navigator.vibrate?.(3);
    lastMark = m;
    own = value = Math.round((scale.min + m) * scale.unit * 10) / 10;
    onpick?.();
  }
  function onScroll() {
    if (moved) set(Math.round(track.scrollLeft / scale.gap));
  }
  function grab() {
    moved = true;
  }

  // A mouse drags the ruler like a finger would
  let drag: { x: number; left: number } | null = null;
  function onDown(e: PointerEvent) {
    grab();
    if (e.pointerType !== 'mouse') return;
    drag = { x: e.clientX, left: track.scrollLeft };
    track.setPointerCapture(e.pointerId);
    track.classList.add('dragging');
  }
  function onMove(e: PointerEvent) {
    if (drag) track.scrollLeft = drag.left - (e.clientX - drag.x);
  }
  function onUp() {
    if (!drag) return;
    drag = null;
    track.classList.remove('dragging');
    goTo(Math.round(track.scrollLeft / scale.gap), true);
  }
  function onKey(e: KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 };
    let i = at;
    if (e.key in step) i += step[e.key]!;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = marks.length - 1;
    else return;
    e.preventDefault();
    moved = false;
    set(i);
    goTo(markOf(value), true);
  }

  // A height set from outside: glide to it, without the glide setting heights on the way
  $effect(() => {
    const v = value;
    if (v === own) return;
    own = v;
    moved = false;
    untrack(() => goTo(markOf(v), true));
  });
  onMount(() => goTo(at, false));

  const valueText = $derived.by(() => {
    if (!imperial) return `${Math.round(value)} centimetres`;
    const inches = Math.round(value / 2.54);
    return `${Math.floor(inches / 12)} feet ${inches % 12} inches`;
  });
</script>

<div class="rl">
  <div
    class="rl-track"
    style="--gap:{scale.gap}px"
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-valuemin={scale.min}
    aria-valuemax={scale.max}
    aria-valuenow={scale.min + at}
    aria-valuetext={valueText}
    bind:this={track}
    onscroll={onScroll}
    onwheel={grab}
    ontouchstart={grab}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    onkeydown={onKey}
  >
    {#each marks as m (m.v)}
      <span class="rl-mark" class:mid={m.mid} class:major={m.major}
        >{#if m.major}<b>{m.text}</b>{/if}</span
      >
    {/each}
  </div>
  <span class="rl-needle" aria-hidden="true"></span>
</div>
