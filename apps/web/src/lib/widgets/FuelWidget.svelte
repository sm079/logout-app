<!-- Fuel: calories against the goal as a ring split by macros, and each macro against its goal -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Goals } from '../data/types.ts';
  import { nf } from '../logic/format.ts';
  import type { DaySpan, Timeline } from '../logic/metrics.ts';
  import { MTINT } from '../logic/palette.ts';
  import { roll } from '../ui/motion.ts';
  import Chip from './Chip.svelte';
  import Stat from './Stat.svelte';
  import { C_RING, fuelView, MACROS } from './compute.ts';

  let { tl, S, goals, dir, style }: { tl: Timeline; S: DaySpan; goals: Goals; dir: number; style: string } = $props();
  const f = $derived(fuelView(tl, S, goals));
  // The ring fills in once it's on screen
  let ready = $state(false);
  onMount(() => requestAnimationFrame(() => (ready = true)));
</script>

<article class="widget w-fuel wenter" {style} style:--mc={MTINT.nutrition[1]} aria-label={f.label}>
  <div class="wtop">
    <Chip qual={f.qual} name="Calories" tint={MTINT.nutrition} icon="flame" {dir} />
    <Stat num={nf(f.kcal)} unit="kcal" meta={f.meta} {dir} />
  </div>
  <div class="wbody fuel-body">
    <div class="fring">
      <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="52" />
        {#each MACROS as [k, , c], i (k)}
          <circle
            class="f-seg"
            cx="60"
            cy="60"
            r="52"
            style="--c:var({c});stroke-dasharray:{ready ? f.segs[i]!.len.toFixed(2) : 0} {(C_RING * 2).toFixed(
              2
            )};stroke-dashoffset:{f.segs[i]!.off.toFixed(2)};opacity:{ready && f.segs[i]!.on ? 1 : 0}"
          />
        {/each}
      </svg>
      <div class="ring-c">
        <span class="g-pct roll" use:roll={{ text: f.pct, dir }}></span>
        <span class="g-sub">of <span class="roll" use:roll={{ text: nf(f.goal), dir }}></span></span>
      </div>
    </div>
    <div class="mrows">
      {#each MACROS as [k, name, c], i (k)}
        <div class="mrow" style="--c:var({c});--k:{i}">
          <span class="mname">{name}</span>
          <span class="mval"
            ><b class="roll" use:roll={{ text: nf(f.grams[i]!), dir }}></b><small
              >/ <span class="roll" use:roll={{ text: nf(goals[k]), dir }}></span> g</small
            ></span
          >
          <span class="mbar"><i style="width:{!ready ? 0 : Math.min(100, (f.grams[i]! / goals[k]) * 100)}%"></i></span>
        </div>
      {/each}
    </div>
  </div>
</article>
