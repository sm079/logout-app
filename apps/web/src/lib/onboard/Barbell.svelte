<!--
  What a bare 100 means: a bar loaded to 100 kilograms, or to 100 pounds. Switching unloads the plates outwards
  and slides the new ones on, so the difference shows as weight on the bar.
-->
<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import type { Units } from '@logout/engine';
  import { REDUCE, roll } from '../ui/motion.ts';
  import { loadOf } from './units.ts';

  let { unit }: { unit: Units['load'] } = $props();

  const LB = 0.4536;
  const L = 88,
    R = 232,
    Y = 44;
  // Each side, loaded from the collar outwards: bigger plates are taller and thicker
  const plates = $derived.by(() => {
    const out: { key: string; x: number; y: number; w: number; h: number; tone: number; side: -1 | 1; i: number }[] = [];
    const side = loadOf(100, unit).side;
    for (const s of [-1, 1] as const) {
      let at = s < 0 ? L : R;
      side.forEach((p, i) => {
        const kg = unit === 'lb' ? p * LB : p;
        const h = Math.min(66, Math.max(20, 16 + kg * 1.8)),
          w = kg >= 10 ? 13 : kg >= 2 ? 9 : 7;
        const x = s < 0 ? at - w : at;
        at += s * (w + 2);
        out.push({ key: `${unit}${s}${i}`, x, y: Y - h / 2, w, h, tone: kg >= 18 ? 1 : kg >= 8 ? 0.72 : 0.48, side: s, i });
      });
    }
    return out;
  });

  function on(_: Element, { side, i }: { side: number; i: number }) {
    return {
      delay: REDUCE ? 0 : 160 + i * 80,
      duration: REDUCE ? 0 : 620,
      easing: backOut,
      css: (t: number, u: number) => `transform:translateX(${side * u * 48}px);opacity:${Math.min(1, t * 2.5)}`
    };
  }
  function off(_: Element, { side, i }: { side: number; i: number }) {
    return {
      delay: REDUCE ? 0 : i * 30,
      duration: REDUCE ? 0 : 240,
      easing: cubicIn,
      css: (t: number, u: number) => `transform:translateX(${side * u * 64}px);opacity:${t}`
    };
  }
</script>

<div class="bb" aria-hidden="true">
  <span class="bb-n"><b>100</b><span class="roll" use:roll={{ text: unit, dir: unit === 'lb' ? 1 : -1 }}></span></span>
  <svg viewBox="0 0 320 88" preserveAspectRatio="xMidYMid meet">
    <rect class="bb-sleeve" x="14" y={Y - 4} width={L - 14} height="8" rx="2" />
    <rect class="bb-sleeve" x={R} y={Y - 4} width={320 - 14 - R} height="8" rx="2" />
    <rect class="bb-shaft" x={L} y={Y - 2.5} width={R - L} height="5" rx="2.5" />
    <rect class="bb-collar" x={L - 1} y={Y - 10} width="5" height="20" rx="1.5" />
    <rect class="bb-collar" x={R - 4} y={Y - 10} width="5" height="20" rx="1.5" />
    {#each plates as p (p.key)}
      <rect
        class="bb-plate"
        x={p.x - p.side * 4}
        y={p.y}
        width={p.w}
        height={p.h}
        rx="2.5"
        style="--tone:{p.tone}"
        in:on={{ side: p.side, i: p.i }}
        out:off={{ side: p.side, i: p.i }}
      />
    {/each}
  </svg>
</div>
