<!-- Recovery: a ring of readiness, worked out from recent training and sleep, and on the wide board the week behind it -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { DaySpan, Timeline } from '../logic/metrics.ts';
  import { MTINT } from '../logic/palette.ts';
  import { flash, roll } from '../ui/motion.ts';
  import Chip from './Chip.svelte';
  import { C_RING, recoveryView } from './compute.ts';

  let { tl, S, dir, style }: { tl: Timeline; S: DaySpan; dir: number; style: string } = $props();
  const r = $derived(recoveryView(tl, S));
  // The ring fills in once it's on screen
  let ready = $state(false);
  onMount(() => requestAnimationFrame(() => (ready = true)));
</script>

<article
  class="widget w-recovery wenter"
  class:none={r.none}
  class:blank={r.none}
  {style}
  style:--mc={MTINT[r.state[1]][1]}
  aria-label={r.label}
  use:flash={[`${S.a}:${S.b}`, `${r.score}|${r.hard}|${r.sleep}`]}
>
  <Chip qual={r.qual} name={r.state[0]} tint={MTINT[r.state[1]]} icon="battery" {dir} wide />
  <div class="wbody rec-body">
    <div class="ring-wrap">
      <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="52" />
        <circle
          class="ring-arc"
          data-s={r.state[1]}
          cx="60"
          cy="60"
          r="52"
          style="stroke-dasharray:{C_RING};stroke-dashoffset:{ready ? C_RING * (1 - r.score / 100) : C_RING}"
        />
      </svg>
      <div class="ring-c">
        <span class="ring-num"><span class="roll" use:roll={{ text: r.none ? '—' : r.score, dir }}></span><small>%</small></span>
        <span class="ring-sub roll" use:roll={{ text: r.sub, dir }}></span>
      </div>
    </div>
    <!-- The week up to the selection's end, a bar a day; only the wide board has room for it -->
    <div class="rweek" aria-hidden="true">
      {#each r.week as d, i (i)}
        <span class="rday" class:on={d.on} data-s={d.state} style="--k:{i}">
          <span class="rbar"><i style="height:{ready && d.v != null ? Math.max(4, d.v) : 0}%"></i></span>
          <small>{d.day}</small>
        </span>
      {/each}
    </div>
    <div class="rrows">
      <div class="rrow"><span>Hard sets 3d</span><b><span class="roll" use:roll={{ text: r.hard, dir }}></span></b></div>
      <div class="rrow"><span>Last session</span><b><span class="roll" use:roll={{ text: r.last, dir }}></span></b></div>
      <div class="rrow"><span>Sleep</span><b><span class="roll" use:roll={{ text: r.sleep, dir }}></span><small>/5</small></b></div>
    </div>
  </div>
</article>
