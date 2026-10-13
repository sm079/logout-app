<!--
  The widgets: a 6 × 2 grid paged two columns at a time, or on a wide pane a 4 × 3 board that shows them all at once.
  Widgets only display; every number comes from the log.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../state/app.svelte.ts';
  import { CHOICES, Timeline, type MetricId } from '../logic/metrics.ts';
  import { REDUCE } from '../ui/motion.ts';
  import ChartWidget from './ChartWidget.svelte';
  import FuelWidget from './FuelWidget.svelte';
  import RecoveryWidget from './RecoveryWidget.svelte';
  import StatWidget from './StatWidget.svelte';
  import { closePicker, picker } from './picker.svelte.ts';

  type Cfg = {
    id: string;
    type: 'recovery' | 'fuel' | 'line' | 'bars' | 'heat' | 'stat';
    col: number;
    row: number;
    w: number;
    h: number;
    metric?: MetricId;
  };
  const LAYOUT: Cfg[] = [
    { id: 'recovery', type: 'recovery', col: 0, row: 0, w: 1, h: 2 },
    { id: 'stat1', type: 'stat', col: 1, row: 0, w: 1, h: 1, metric: 'volume' },
    { id: 'stat2', type: 'stat', col: 1, row: 1, w: 1, h: 1, metric: 'sleep' },
    { id: 'fuel', type: 'fuel', col: 2, row: 0, w: 2, h: 1 },
    { id: 'line', type: 'line', col: 2, row: 1, w: 2, h: 1, metric: 'weight' },
    { id: 'heat', type: 'heat', col: 4, row: 0, w: 2, h: 1, metric: 'exercise' },
    { id: 'bars', type: 'bars', col: 4, row: 1, w: 2, h: 1, metric: 'steps' }
  ];
  // The wide pane's board: readiness down the left, food and weight beside it, the cards on the right, and the two
  // long-range charts across the bottom
  const BOARD: Record<string, [col: number, row: number, w: number, h: number]> = {
    recovery: [0, 0, 1, 2],
    fuel: [1, 0, 2, 1],
    stat1: [3, 0, 1, 1],
    line: [1, 1, 2, 1],
    stat2: [3, 1, 1, 1],
    heat: [0, 2, 2, 1],
    bars: [2, 2, 2, 1]
  };
  // Grid columns, with an empty column after each page so pages snap cleanly
  const gcol = (c: number) => c + Math.floor(c / 2) + 1;
  // Both placements ride along; the stylesheet picks one by the pane's width. On the board, widgets enter
  // diagonally from the top left.
  const styleOf = (c: Cfg, k: number) => {
    const [bc, br, bw, bh] = BOARD[c.id]!;
    return (
      `--gc:${gcol(c.col)} / span ${c.w};--gr:${c.row + 1} / span ${c.h};--dm:${300 + Math.min(k, 3) * 70};` +
      `--bc:${bc + 1} / span ${bw};--br:${br + 1} / span ${bh};--db:${260 + (bc + br) * 60}`
    );
  };

  let wscroll: HTMLDivElement, wgrid: HTMLDivElement;
  let dragging = $state(false),
    locked = $state(false);
  /** Bumped to stop every scrub */
  let reset = $state(0);

  const tl = $derived(app.book ? new Timeline(app.book, app.start, app.today, app.profile.goals, app.units) : null);
  // The widgets follow the selection a moment later, so picking stays quick while they redraw
  let wpick = $state.raw(app.pick);
  let wdir = $state(1);
  $effect(() => {
    const p = app.pick,
      d = app.dir;
    const t = setTimeout(() => {
      wpick = p;
      wdir = d;
    }, 70);
    return () => clearTimeout(t);
  });
  const S = $derived(tl ? tl.span(wpick) : null);
  const bodyKnown = $derived(!!(app.profile.sex && app.profile.heightCm));
  const metricOf = (c: Cfg): MetricId => {
    const want = app.widgets[c.id] as MetricId | undefined;
    const choices = CHOICES[c.type as keyof typeof CHOICES];
    return want && choices?.includes(want) ? want : (c.metric as MetricId);
  };

  /* Paging: native snap for touch and trackpads, plus mouse drag and the wheel */
  const pageW = () => {
    const snaps = wgrid.querySelectorAll<HTMLElement>('.wsnap');
    return snaps[1]!.offsetLeft - snaps[0]!.offsetLeft || wscroll.clientWidth;
  };
  const curPage = () => Math.round(wscroll.scrollLeft / pageW());
  function goPage(p: number, after?: () => void) {
    p = Math.max(0, Math.min(2, p));
    wscroll.scrollTo({ left: p * pageW(), behavior: REDUCE ? 'auto' : 'smooth' });
    if (after) setTimeout(after, REDUCE ? 0 : 480);
  }
  function onScroll() {
    if (!locked) reset++;
    if (picker.target) closePicker();
  }
  // The board shows every widget, so there's nothing to page
  const pages = () => wscroll.scrollWidth > wscroll.clientWidth + 2;
  let wd: { x: number; sl: number; t: number; moved: boolean } | null = null;
  function onDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !pages()) return;
    wd = { x: e.clientX, sl: wscroll.scrollLeft, t: performance.now(), moved: false };
  }
  // On the board a light follows the mouse across a widget (drawn by the stylesheet)
  function onHover(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const w = (e.target as Element).closest<HTMLElement>('.widget');
    if (!w) return;
    const r = w.getBoundingClientRect();
    w.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
    w.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
  }
  let wheelLock = 0;
  function onWheel(e: WheelEvent) {
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || !pages()) return;
    // A tall pane scrolls the widgets up and down; otherwise the wheel pages
    const canvas = wscroll.parentElement!;
    if (canvas.scrollHeight > canvas.clientHeight + 2) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock || Math.abs(e.deltaY) < 4) return;
    wheelLock = now + 520;
    goPage(curPage() + (e.deltaY > 0 ? 1 : -1));
  }

  onMount(() => {
    const move = (e: PointerEvent) => {
      if (!wd) return;
      const dx = e.clientX - wd.x;
      if (!wd.moved && Math.abs(dx) > 6) {
        wd.moved = true;
        dragging = true;
        reset++;
      }
      if (wd.moved) wscroll.scrollLeft = wd.sl - dx;
    };
    const up = (e: PointerEvent) => {
      if (!wd) return;
      const d = wd;
      wd = null;
      if (!d.moved) return;
      const dx = e.clientX - d.x,
        v = dx / Math.max(1, performance.now() - d.t);
      let p = Math.round(d.sl / pageW());
      if (dx < -40 || v < -0.35) p++;
      else if (dx > 40 || v > 0.35) p--;
      goPage(p, () => (dragging = false));
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    return () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="wscroll"
  class:dragging
  class:locked
  bind:this={wscroll}
  onscroll={onScroll}
  onpointerdown={onDown}
  onpointermove={onHover}
  onwheel={onWheel}
>
  <div class="wgrid" bind:this={wgrid}>
    <span class="wsnap" style="grid-column:1"></span>
    <span class="wsnap" style="grid-column:4"></span>
    <span class="wsnap" style="grid-column:7"></span>
    {#if tl && S}
      {#each LAYOUT as c, k (c.id)}
        {@const style = styleOf(c, k)}
        {#if c.type === 'recovery'}
          <RecoveryWidget {tl} {S} dir={wdir} {style} />
        {:else if c.type === 'fuel'}
          <FuelWidget {tl} {S} goals={app.profile.goals} dir={wdir} {style} />
        {:else if c.type === 'stat'}
          <StatWidget id={c.id} metric={tl.met[metricOf(c)]} {tl} {S} pick={wpick} dir={wdir} {bodyKnown} {style} />
        {:else}
          <ChartWidget
            id={c.id}
            type={c.type}
            metric={tl.met[metricOf(c)]}
            {tl}
            {S}
            pick={wpick}
            dir={wdir}
            {bodyKnown}
            {style}
            {reset}
            onlock={on => (locked = on)}
            onlive={text => (app.announce = text)}
          />
        {/if}
      {/each}
    {/if}
  </div>
</div>
