<!--
  A chart widget: a line chart, bar chart or activity grid of one metric, with its headline number.
  Scrub by hovering with a mouse, pressing and holding on touch, or with the arrow keys.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Selection } from '../logic/calendar.ts';
  import type { DaySpan, Metric, Timeline } from '../logic/metrics.ts';
  import { MTINT } from '../logic/palette.ts';
  import { flash } from '../ui/motion.ts';
  import Chip from './Chip.svelte';
  import Stat from './Stat.svelte';
  import { barPlot, heatPlot, linePlot, watchSize, type Plot } from './plots.ts';
  import { barView, headline, heatView, lineView, type ScrubPoint } from './compute.ts';
  import { picker, togglePicker } from './picker.svelte.ts';

  let {
    id,
    type,
    metric,
    tl,
    S,
    pick,
    dir,
    bodyKnown,
    style,
    reset,
    onlock,
    onlive
  }: {
    id: string;
    type: 'line' | 'bars' | 'heat';
    metric: Metric;
    tl: Timeline;
    S: DaySpan;
    pick: Selection;
    dir: number;
    bodyKnown: boolean;
    style: string;
    /** Changes whenever scrubbing everywhere should stop */
    reset: number;
    /** A touch hold locks the widgets' paging while it scrubs */
    onlock: (on: boolean) => void;
    /** Says what's under the scrub for screen readers */
    onlive: (text: string) => void;
  } = $props();

  const TYPE_NAME = { line: 'line chart', bars: 'bar chart', heat: 'activity grid' };
  let host: HTMLDivElement,
    chip = $state<HTMLElement>();
  let plot: Plot<never> | null = null;
  let cur = $state<number | null>(null);
  /** Just stopped scrubbing: the headline rolls back down */
  let unscrub = $state(false);

  const view = $derived.by(() => {
    if (type === 'line') {
      const v = lineView(tl, metric, S);
      return { data: v.data, pts: v.pts as ScrubPoint[], override: null };
    }
    if (type === 'bars') {
      const v = barView(tl, metric, S);
      return { data: v.data, pts: v.items as ScrubPoint[], override: v.override };
    }
    const v = heatView(tl, metric, S);
    return { data: v.data, pts: v.cells as ScrubPoint[], override: v.override };
  });
  const head = $derived(headline(tl, metric, S, pick, false, bodyKnown, view.override));
  const nothingInDays = $derived(type === 'line' && !head.none && !view.pts.length);
  const empty = $derived(head.none ? head.empty : nothingInDays ? '<span>Nothing logged in these days</span>' : '');
  const shown = $derived(cur != null ? view.pts[cur] : null);
  const tint = $derived(MTINT[metric.tint]);

  onMount(() => {
    plot = (
      type === 'line' ? linePlot(host, { axes: true, area: true, id: `lg-${id}` }) : type === 'bars' ? barPlot(host) : heatPlot(host)
    ) as Plot<never>;
    return watchSize(host, () => {
      if (plot && !empty) plot.render(view.data as never);
    });
  });
  // Draws whenever what it shows changes; a chart not shown can't be measured, so it waits
  $effect(() => {
    const d = view.data;
    if (plot && !empty) plot.render(d as never);
  });
  $effect(() => {
    void reset;
    end();
  });

  function show(i: number) {
    const p = view.pts[i];
    if (!p) return;
    cur = i;
    plot?.mark(i);
    onlive(`${p.label}: ${p.num} ${p.unit || ''}`);
  }
  function end() {
    if (cur == null) return;
    cur = null;
    unscrub = true;
    setTimeout(() => (unscrub = false), 0);
    plot?.mark(-1);
  }
  const at = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    return plot ? plot.nearest(e.clientX - r.left, e.clientY - r.top, document.elementFromPoint(e.clientX, e.clientY)) : -1;
  };
  let hold: { x: number; y: number; t: ReturnType<typeof setTimeout> } | null = null,
    held = false;
  function onmove(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (host.closest('.wscroll.dragging')) return;
      const i = at(e);
      if (i >= 0) {
        if (i !== cur) show(i);
      } else end();
      return;
    }
    if (held) {
      const i = at(e);
      if (i >= 0 && i !== cur) show(i);
    } else if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) {
      clearTimeout(hold.t);
      hold = null;
    }
  }
  function ondown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    hold = {
      x: e.clientX,
      y: e.clientY,
      t: setTimeout(() => {
        held = true;
        onlock(true);
        const i = at(e);
        if (i >= 0) show(i);
      }, 260)
    };
  }
  function release() {
    if (hold) clearTimeout(hold.t);
    hold = null;
    if (held) {
      held = false;
      onlock(false);
      end();
    }
  }
  function onkey(e: KeyboardEvent) {
    const pts = view.pts,
      n = pts.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      let i = cur == null ? n : cur;
      do i += e.key === 'ArrowRight' ? 1 : -1;
      while (i >= 0 && i < n && (pts[i]!.v == null || pts[i]!.none));
      if (i >= 0 && i < n) show(i);
    } else if (e.key === 'Escape') end();
  }
</script>

<article
  class="widget w-{type} wenter"
  class:empty={!!empty}
  class:scrub={cur != null}
  {style}
  style:--mc={tint[1]}
  aria-label="{metric.name} {TYPE_NAME[type]}"
  use:flash={[`${S.a}:${S.b}:${pick.level}:${metric.id}`, `${head.num}|${head.meta}`]}
>
  <div class="wtop">
    <Chip
      qual={head.qual}
      name={head.name}
      {tint}
      icon={metric.icon}
      {dir}
      selectable
      open={picker.target?.id === id}
      label="{metric.name}. Change what this {TYPE_NAME[type]} shows"
      bind:el={chip}
      onclick={() => chip && togglePicker({ id, type, metric: metric.id, chip })}
    />
    <Stat
      num={shown ? shown.num : head.num}
      unit={shown ? shown.unit || '' : head.unit}
      meta={shown ? shown.label : head.meta}
      d={head.d}
      up={head.up}
      dir={unscrub ? -1 : dir}
      instant={!!shown}
    />
  </div>
  <div class="wbody">
    <!-- A chart is read point by point with the arrow keys -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="plot"
      class:heat={type === 'heat'}
      bind:this={host}
      tabindex="0"
      role="img"
      aria-label="{metric.name}, {head.num} {head.unit}. {head.meta}. Use the arrow keys to read each point."
      onpointermove={onmove}
      onpointerleave={e => e.pointerType === 'mouse' && end()}
      onpointerdown={ondown}
      onpointerup={release}
      onpointercancel={release}
      ontouchmove={e => held && e.preventDefault()}
      oncontextmenu={e => e.preventDefault()}
      onkeydown={onkey}
      onblur={end}
    ></div>
    <div class="wempty">{@html empty}</div>
  </div>
</article>
