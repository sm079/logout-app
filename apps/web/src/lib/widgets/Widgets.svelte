<!--
  The widgets: a 6 × 2 grid paged two columns at a time (four or six columns show at once on a wide pane).
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
  // Grid columns, with an empty column after each page so pages snap cleanly
  const gcol = (c: number) => c + Math.floor(c / 2) + 1;
  const styleOf = (c: Cfg, k: number) =>
    `grid-column:${gcol(c.col)} / span ${c.w};grid-row:${c.row + 1} / span ${c.h};--d:${300 + Math.min(k, 3) * 70}`;

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
  let wd: { x: number; sl: number; t: number; moved: boolean } | null = null;
  function onDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    wd = { x: e.clientX, sl: wscroll.scrollLeft, t: performance.now(), moved: false };
  }
  let wheelLock = 0;
  function onWheel(e: WheelEvent) {
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
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
<div class="wscroll" class:dragging class:locked bind:this={wscroll} onscroll={onScroll} onpointerdown={onDown} onwheel={onWheel}>
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
