<!--
  The day's calories as a ring. Dragging the knob round (or the arrow keys, or holding − and +) fills it, and the
  fill is coloured by how the calories split into protein, carbs and fat. It winds up to its value as it arrives.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { nf } from '../logic/format.ts';
  import Icon from '../ui/Icon.svelte';
  import { REDUCE } from '../ui/motion.ts';
  import { KCAL, snapKcal, type Split } from './goals.ts';

  let { kcal = $bindable(), split }: { kcal: number; split: Split } = $props();

  const R = 100,
    C = 2 * Math.PI * R,
    GAP = 5;
  let svg: SVGSVGElement;
  let dragging = $state(false);
  // It arrives empty and winds up to its value; the number counts up with it
  let wound = $state(REDUCE);
  onMount(() => {
    const t = setTimeout(() => (wound = true), 260);
    return () => clearTimeout(t);
  });
  const shown = new Tween(0, { easing: cubicOut });
  let first = true;
  $effect(() => {
    if (!wound) return;
    void shown.set(kcal, { duration: REDUCE ? 0 : first ? 900 : 420 });
    first = false;
  });

  // The ring holds up to the dial's most; the fill is what's chosen, in three arcs
  const fill = $derived((wound ? kcal : 0) / KCAL.max);
  const arcs = $derived.by(() => {
    const out: { k: 'p' | 'c' | 'f'; len: number; start: number }[] = [];
    let start = 0;
    for (const k of ['p', 'c', 'f'] as const) {
      const len = fill * C * split[k];
      out.push({ k, len: Math.max(0, len - GAP), start });
      start += len;
    }
    return out;
  });

  function set(v: number) {
    const next = snapKcal(v);
    if (next !== kcal && dragging) navigator.vibrate?.(3);
    kcal = next;
  }
  function fromPointer(e: PointerEvent) {
    const b = svg.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) + Math.PI / 2;
    const f = (a < 0 ? a + 2 * Math.PI : a) / (2 * Math.PI);
    // Round past the top, it stops at the end it came from rather than jumping to the other
    if (fill > 0.85 && f < 0.15) return set(KCAL.max);
    if (fill < 0.3 && f > 0.85) return set(KCAL.min);
    set(f * KCAL.max);
  }
  function onDown(e: PointerEvent) {
    if ((e.target as Element).closest('button')) return;
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    fromPointer(e);
  }
  function onKey(e: KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -5, PageUp: 5 };
    if (e.key in step) set(kcal + step[e.key]! * KCAL.step);
    else if (e.key === 'Home') set(KCAL.min);
    else if (e.key === 'End') set(KCAL.max);
    else return;
    e.preventDefault();
  }

  // Holding − or + keeps stepping, faster after a moment
  function hold(node: HTMLButtonElement, d: number) {
    let t: ReturnType<typeof setTimeout> | undefined;
    const stop = () => clearTimeout(t);
    const go = (wait: number) => {
      set(kcal + d * KCAL.step);
      t = setTimeout(() => go(Math.max(40, wait * 0.8)), wait);
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      go(380);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      set(kcal + d * KCAL.step);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('keydown', key);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) node.addEventListener(ev, stop);
    return { destroy: stop };
  }
</script>

<div class="dl" class:dragging>
  <svg
    viewBox="-130 -130 260 260"
    role="slider"
    tabindex="0"
    aria-label="Calories a day"
    aria-valuemin={KCAL.min}
    aria-valuemax={KCAL.max}
    aria-valuenow={kcal}
    aria-valuetext="{nf(kcal)} kcal"
    bind:this={svg}
    onpointerdown={onDown}
    onpointermove={e => dragging && fromPointer(e)}
    onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)}
    onkeydown={onKey}
  >
    <circle class="dl-track" r={R} />
    {#each Array.from({ length: 48 }, (_, i) => i) as i (i)}
      <line class="dl-tick" class:on={i / 48 < fill} x1="0" y1={-R - 17} x2="0" y2={-R - (i % 4 ? 13 : 11)} transform="rotate({i * 7.5})" />
    {/each}
    {#each arcs as a (a.k)}
      <circle class="dl-arc dl-{a.k}" r={R} style="stroke-dasharray:{a.len} {C};stroke-dashoffset:{-a.start}" transform="rotate(-90)" />
    {/each}
    <g class="dl-knob" style="transform: rotate({fill * 360}deg)">
      <circle cy={-R} r="15" />
      <circle class="dl-knob-dot" cy={-R} r="5" />
    </g>
  </svg>
  <span class="dl-val" aria-hidden="true"><b>{nf(shown.current)}</b><small>kcal a day</small></span>
  <button type="button" class="dl-step less press" aria-label="50 kcal less" tabindex="-1" use:hold={-1}><Icon name="minus" /></button>
  <button type="button" class="dl-step more press" aria-label="50 kcal more" tabindex="-1" use:hold={1}><Icon name="plus" /></button>
</div>
