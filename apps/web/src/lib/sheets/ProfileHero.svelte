<!--
  The profile's first card: the log so far. Days in a row, days logged and entries count up as it opens; the last
  twenty weeks fill in as a wave, and a finger or the mouse reads any day of them; what it all adds up to is shown in
  the units being picked below, so switching one converts it on the spot.
-->
<script lang="ts">
  import type { Units } from '@logout/engine';
  import { fmt, fromIso } from '../logic/dates.ts';
  import { distIn, nf, volFmt } from '../logic/format.ts';
  import { MTINT, thumbStyle, type MTintName } from '../logic/palette.ts';
  import { grid, lifetime, streak, type GridDay } from '../logic/record.ts';
  import { app } from '../state/app.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import Count from './Count.svelte';

  let { units }: { units: Units } = $props();

  const WEEKS = 20;
  const days = $derived([...(app.book?.days.values() ?? [])].filter(d => d.entries > 0));
  const run = $derived(
    streak(
      days.map(d => d.date),
      app.today
    )
  );
  const all = $derived(lifetime(days));
  const weeks = $derived(grid(iso => app.book?.days.get(iso)?.entries ?? 0, app.today, WEEKS));
  const inGrid = $derived(weeks.cols.flat().filter(d => d.n > 0).length);

  // The day under a finger or the mouse; a finger's stays a moment after it lifts, to be read
  let over = $state<GridDay | null>(null);
  let letGo: ReturnType<typeof setTimeout> | undefined;
  function read(e: PointerEvent) {
    const el = (e.target as Element).closest<HTMLElement>('[data-c]');
    if (!el) return;
    clearTimeout(letGo);
    over = weeks.cols[+el.dataset.c!]![+el.dataset.r!]!;
  }
  function leave(e: PointerEvent) {
    clearTimeout(letGo);
    if (e.pointerType === 'mouse') over = null;
    else letGo = setTimeout(() => (over = null), 2200);
  }
  const plural = (n: number, one: string, many: string) => `${nf(n)} ${n === 1 ? one : many}`;
  const caption = $derived.by(() => {
    if (over && !over.future) {
      const day = fmt(fromIso(over.iso), { weekday: 'short', month: 'short', day: 'numeric' });
      return `${day} · ${over.n ? plural(over.n, 'entry', 'entries') : 'nothing logged'}`;
    }
    if (!days.length) return 'Each day you log fills a square';
    return `${plural(inGrid, 'day', 'days')} in ${WEEKS} weeks${run.best > 1 ? ` · best run ${nf(run.best)} days` : ''}`;
  });

  const distText = (m: number) => {
    const v = distIn(m, units.dist);
    return `${v >= 100 ? nf(v) : +v.toFixed(1)} ${units.dist}`;
  };
  const tint = (t: MTintName) => thumbStyle(MTINT[t]);
</script>

<section class="pf-card pf-hero" style="--d:70" aria-label="Your log so far">
  <div class="pf-stats">
    <div class="pf-stat pf-run" class:lit={run.today} class:due={!run.today && run.now > 0}>
      <span class="pf-flame" aria-hidden="true"><Icon name="flame" /></span>
      <b><Count value={run.now} /></b>
      <small>{!run.today && run.now > 0 ? 'log today to keep it' : run.now === 1 ? 'day in a row' : 'days in a row'}</small>
    </div>
    <div class="pf-stat">
      <b><Count value={run.days} delay={90} /></b>
      <small>{run.days === 1 ? 'day logged' : 'days logged'}</small>
    </div>
    <div class="pf-stat">
      <b><Count value={all.entries} delay={180} /></b>
      <small>{all.entries === 1 ? 'entry' : 'entries'}</small>
    </div>
  </div>

  <figure class="pf-grid" style="--w:{WEEKS}">
    <div class="pf-months" aria-hidden="true">
      {#each weeks.months as m (m.col)}<span style="--c:{m.col}">{m.name}</span>{/each}
    </div>
    <div
      class="pf-cells"
      role="img"
      aria-label="{plural(inGrid, 'day', 'days')} logged in the last {WEEKS} weeks"
      onpointermove={read}
      onpointerdown={read}
      onpointerleave={leave}
    >
      {#each weeks.cols as col, c (col[0]!.iso)}
        {#each col as d, r (d.iso)}
          <i
            class="l{d.level}"
            class:today={d.today}
            class:future={d.future}
            class:over={over === d}
            style="--k:{c + r}"
            data-c={c}
            data-r={r}
          ></i>
        {/each}
      {/each}
    </div>
    <figcaption aria-live="polite">{caption}</figcaption>
  </figure>

  <ul class="pf-life">
    {@render total('dumbbell', 'training', 'lifted', all.volume, n => volFmt(n, units.load).join(' '), units.load, 240)}
    {@render total('route', 'activity', 'covered', all.distM, distText, units.dist, 300)}
    {@render total('utensils', 'nutrition', all.foods === 1 ? 'food logged' : 'foods logged', all.foods, nf, '', 360)}
  </ul>
</section>

{#snippet total(icon: IconName, t: MTintName, what: string, v: number, format: (n: number) => string, unit: string, delay: number)}
  <li>
    <span class="thumb pf-life-ico" style={tint(t)}><Icon name={icon} /></span>
    <span class="pf-life-text"><b><Count value={v} {format} {unit} {delay} /></b><small>{what}</small></span>
  </li>
{/snippet}
