<!-- A card: one metric's number over the selection, with a sparkline of the units before it -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Selection } from '../logic/calendar.ts';
  import type { DaySpan, Metric, Timeline } from '../logic/metrics.ts';
  import { MTINT } from '../logic/palette.ts';
  import { flash } from '../ui/motion.ts';
  import Chip from './Chip.svelte';
  import Stat from './Stat.svelte';
  import { linePlot, watchSize, type LineData, type Plot } from './plots.ts';
  import { headline, sparkView } from './compute.ts';
  import { picker, togglePicker } from './picker.svelte.ts';

  let {
    id,
    metric,
    tl,
    S,
    pick,
    dir,
    bodyKnown,
    style
  }: { id: string; metric: Metric; tl: Timeline; S: DaySpan; pick: Selection; dir: number; bodyKnown: boolean; style: string } = $props();

  let host: HTMLDivElement,
    chip = $state<HTMLElement>();
  let plot: Plot<LineData> | null = null;
  const head = $derived(headline(tl, metric, S, pick, true, bodyKnown));
  const spark = $derived(sparkView(tl, metric, S, pick.level));
  const tint = $derived(MTINT[metric.tint]);

  onMount(() => {
    plot = linePlot(host, { axes: false, area: true, id: `sp-${id}` });
    return watchSize(host, () => {
      if (plot && spark.pts.length && !head.none) plot.render(spark);
    });
  });
  $effect(() => {
    const d = spark;
    if (plot && d.pts.length && !head.none) plot.render(d);
  });
</script>

<article
  class="widget w-stat wenter"
  class:empty={head.none}
  class:blank={head.blank}
  {style}
  style:--mc={tint[1]}
  aria-label="{metric.name}: {head.num} {head.unit}. {head.meta}"
  use:flash={[`${S.a}:${S.b}:${pick.level}:${metric.id}`, head.num]}
>
  <Chip
    qual={head.qual}
    name={head.name}
    {tint}
    icon={metric.icon}
    {dir}
    selectable
    wide
    open={picker.target?.id === id}
    label="{metric.name}. Change what this card shows"
    bind:el={chip}
    onclick={() => chip && togglePicker({ id, type: 'stat', metric: metric.id, chip })}
  />
  <div class="wbody stat-body">
    <Stat num={head.num} unit={head.unit} meta={head.meta} d={head.d} up={head.up} {dir} inline={false} />
    <div class="plot spark" bind:this={host}></div>
    <div class="wempty">{@html head.empty}</div>
  </div>
</article>
