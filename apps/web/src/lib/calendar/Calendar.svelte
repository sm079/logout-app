<!--
  The calendar: a title chip (tap returns to today), the D · W · M · Y scale, and a strip of days, weeks, months or
  years with session marks. Tap selects one; hold another to select the span between them.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { app } from '../state/app.svelte.ts';
  import {
    cellLabel,
    cellText,
    coverage,
    describe,
    focusDate,
    isNow,
    LEVELS,
    markOf,
    selectable,
    UNIT,
    unitsFor,
    type Level,
    type Mark,
    type Span
  } from '../logic/calendar.ts';
  import { isoOf } from '../logic/dates.ts';
  import { REDUCE, replay, roll } from '../ui/motion.ts';
  import Icon from '../ui/Icon.svelte';

  let { onProfile, el = $bindable() }: { onProfile: () => void; el?: HTMLElement } = $props();

  const LEVEL_NAME: Record<Level, string> = { d: 'Days', w: 'Weeks', m: 'Months', y: 'Years' };
  const PREVIEW_AFTER = 110,
    GROW = 310;

  let level = $state<Level>('d');
  let units = $state.raw<Span[]>([]);
  /** Bumped on every redraw of the strip, so the cells enter again */
  let gen = $state(0);
  /** The scale cells enter from (0: no entrance) */
  let zIn = $state(0);
  let out = $state(false);
  let zo = $state(1);
  let scrolled = $state(false),
    more = $state(false),
    scaleAnim = $state(false);
  const fill = $derived(level === 'd' || level === 'w');

  let strip: HTMLDivElement,
    track: HTMLDivElement,
    band: HTMLSpanElement,
    scaleEl: HTMLDivElement,
    scaleInd: HTMLSpanElement,
    thumb: HTMLSpanElement;
  const cells: HTMLButtonElement[] = $state([]);
  let taps = 0,
    hinted = false,
    viewT: ReturnType<typeof setTimeout> | undefined;
  /** The last selection was made on the strip itself, which has already drawn it */
  let ownPick = false;

  const today = $derived(app.today);
  const start = $derived(app.start);
  const head = $derived(describe(app.pick, today, app.joined));
  const isDefault = $derived(app.pick.level === 'd' && +app.pick.from === +today && +app.pick.to === +today);

  /* ---------- Drawing ---------- */
  function renderView(z: number) {
    units = unitsFor(level, focusDate(app.pick, today), start, today);
    zIn = z;
    out = false;
    gen++;
    tick().then(() => {
      band.classList.add('instant');
      renderSelection();
      void band.offsetWidth;
      band.classList.remove('instant');
      // A hidden-overflow strip keeps its old scroll offset, so reset it for the fixed views
      if (fill) strip.scrollLeft = 0;
      else {
        const m = cover();
        const idx = m.full.length ? m.full[m.full.length - 1]! : (m.part[0] ?? units.length - 1);
        const c = cells[idx];
        if (c) strip.scrollLeft = 6 + c.offsetLeft + c.offsetWidth / 2 - strip.clientWidth / 2;
      }
      syncFades();
    });
  }
  const cover = () => coverage(units, app.pick, start, today);

  function placeBand(lo: number, hi: number, range: boolean) {
    const L = cells[lo],
      R = cells[hi];
    if (!L || !R) return;
    band.style.transform = `translateX(${L.offsetLeft}px)`;
    band.style.width = `${R.offsetLeft + R.offsetWidth - L.offsetLeft}px`;
    band.classList.toggle('range', range);
  }
  /** Marks the selected cells and moves the band over them */
  function renderSelection() {
    const { full, part } = cover();
    const lo = full[0]!,
      hi = full[full.length - 1]!,
      range = full.length > 1;
    units.forEach((_, i) => {
      const c = cells[i];
      if (!c) return;
      const f = full.includes(i),
        sel = f && (i === lo || i === hi);
      c.classList.toggle('sel', sel);
      c.classList.toggle('mid', f && !sel);
      c.classList.toggle('end', range && sel);
      c.classList.toggle('contains', part.includes(i));
      c.setAttribute('aria-pressed', String(f));
    });
    if (full.length) {
      placeBand(lo, hi, range);
      band.classList.remove('faded');
    } else band.classList.add('faded');
  }
  function syncFades() {
    scrolled = !fill && strip.scrollLeft > 2;
    more = !fill && strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
  }

  // A selection made elsewhere (back to today, an entry opened on another day) moves the view to hold it
  $effect(() => {
    const p = app.pick;
    untrack(() => {
      if (ownPick) {
        ownPick = false;
        return;
      }
      if (!units.length || g) return;
      const want = unitsFor(level, focusDate(p, today), start, today);
      if (+want[0]!.a !== +units[0]!.a || want.length !== units.length) {
        zo = 0.96;
        out = true;
        clearTimeout(viewT);
        viewT = setTimeout(() => renderView(0.94), REDUCE ? 0 : 150);
        return;
      }
      renderSelection();
      if (!fill) {
        const c = cells[units.findIndex(u => u.a <= p.to && u.b >= p.from)];
        if (c) strip.scrollTo({ left: 6 + c.offsetLeft + c.offsetWidth / 2 - strip.clientWidth / 2, behavior: REDUCE ? 'auto' : 'smooth' });
      }
    });
  });

  // The first day and today can move (the sample switched, midnight): draw again in place
  let drawnFor = '';
  $effect(() => {
    const key = `${+start}|${+today}`;
    untrack(() => {
      if (drawnFor && drawnFor !== key) renderView(0);
      drawnFor = key;
    });
  });

  // The title chip pulses when the title changes
  let lastTitle = '';
  $effect(() => {
    const t = head.title;
    if (lastTitle && t !== lastTitle) replay(thumb, 'pulse');
    lastTitle = t;
  });

  /* ---------- Selecting: a tap selects one unit; holding another selects the span between them ---------- */
  function anchorIndex(): number {
    const i = units.findIndex(u => u.a <= app.pick.anchor && u.b >= app.pick.anchor && selectable(u, start, today));
    if (i >= 0) return i;
    const { full, part } = cover();
    return full[0] ?? part[0] ?? units.length - 1;
  }
  function lastSelectable(): number {
    let i = units.length - 1;
    while (i > 0 && !selectable(units[i]!, start, today)) i--;
    return i;
  }
  function setPick(ai: number, t: number, dir: number): boolean {
    t = Math.min(t, lastSelectable());
    const lo = Math.min(ai, t),
      hi = Math.max(ai, t);
    const from = units[lo]!.a,
      to = units[hi]!.b;
    const p = app.pick;
    if (+p.from === +from && +p.to === +to && p.level === level) return false;
    app.dir = dir;
    ownPick = true;
    app.pick = { level, from, to, n: hi - lo + 1, anchor: units[ai]!.a };
    renderSelection();
    return true;
  }
  function tapSelect(i: number) {
    const prevHi = cover().full.slice(-1)[0] ?? anchorIndex();
    const changed = setPick(i, i, i >= prevHi ? 1 : -1);
    replay(cells[i], 'bump');
    if (!changed) return;
    taps++;
    if (taps >= 2 && !hinted) {
      hinted = true;
      const c = cells[i]!;
      setTimeout(() => app.hint(c, `Hold another ${UNIT[level]} to select a range`), 380);
    }
  }

  interface Gesture {
    i: number;
    ai: number;
    x: number;
    sl: number;
    mouse: boolean;
    held: boolean;
    scrolling: boolean;
    dead?: boolean;
    raf?: number;
    t1?: ReturnType<typeof setTimeout>;
    t2?: ReturnType<typeof setTimeout>;
  }
  let g: Gesture | null = null;

  // While a cell is held, the band grows from the anchor towards it
  function startPreview() {
    if (!g || g.held) return;
    const a = g.ai,
      t = g.i;
    if (t === a) return;
    const A = cells[a]!;
    const lo = Math.min(a, t),
      hi = Math.max(a, t);
    const from = { x: A.offsetLeft, w: A.offsetWidth };
    const to = { x: cells[lo]!.offsetLeft, w: cells[hi]!.offsetLeft + cells[hi]!.offsetWidth - cells[lo]!.offsetLeft };
    band.classList.add('instant', 'range');
    band.classList.remove('faded');
    cells.forEach(c => c?.classList.remove('sel', 'mid', 'end', 'contains'));
    A.classList.add('sel', 'end');
    const t0 = performance.now();
    const step = (now: number) => {
      if (!g || g.held || g.dead) return;
      const p = Math.min(1, (now - t0) / GROW),
        e = 1 - Math.pow(1 - p, 2);
      const x = from.x + (to.x - from.x) * e,
        w = from.w + (to.w - from.w) * e;
      band.style.transform = `translateX(${x}px)`;
      band.style.width = `${w}px`;
      cells.forEach((c, i) => {
        if (!c || i === a || i === t) return;
        const cx = c.offsetLeft + c.offsetWidth / 2;
        c.classList.toggle('mid', cx > x && cx < x + w);
      });
      if (p < 1) g.raf = requestAnimationFrame(step);
    };
    g.raf = requestAnimationFrame(step);
  }
  function endGesture(restore: boolean) {
    if (!g) return;
    g.dead = true;
    clearTimeout(g.t1);
    clearTimeout(g.t2);
    if (g.raf) cancelAnimationFrame(g.raf);
    cells[g.i]?.classList.remove('pressing');
    band.classList.remove('instant');
    if (restore) renderSelection();
    g = null;
  }

  function onPointerDown(e: PointerEvent) {
    const c = (e.target as Element).closest<HTMLButtonElement>('.cell');
    if (!c || c.disabled || e.button > 0 || g) return;
    const i = +c.dataset.i!;
    g = { i, ai: anchorIndex(), x: e.clientX, sl: strip.scrollLeft, mouse: e.pointerType === 'mouse', held: false, scrolling: false };
    c.classList.add('pressing');
    g.t1 = setTimeout(startPreview, PREVIEW_AFTER);
    g.t2 = setTimeout(() => {
      if (!g) return;
      if (g.raf) cancelAnimationFrame(g.raf);
      g.held = true;
      c.classList.remove('pressing');
      band.classList.remove('instant');
      if (!setPick(g.ai, i, 1)) renderSelection();
      replay(c, 'bump');
    }, PREVIEW_AFTER + GROW);
  }
  function onPointerMove(e: PointerEvent) {
    if (!g) return;
    const dx = e.clientX - g.x;
    if (g.scrolling) {
      strip.scrollLeft = g.sl - dx;
      return;
    }
    if (!g.held) {
      if (Math.abs(dx) > 7) {
        const keep = { i: g.i, x: g.x, sl: g.sl };
        const canScroll = g.mouse && !fill;
        endGesture(true);
        if (canScroll) g = { ...keep, ai: 0, scrolling: true, mouse: true, held: false };
      }
      return;
    }
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const c = over && over.closest<HTMLButtonElement>('.cell');
    if (c && track.contains(c)) setPick(g.ai, +c.dataset.i!, +c.dataset.i! >= g.ai ? 1 : -1);
    if (!fill) {
      const r = strip.getBoundingClientRect();
      if (e.clientX < r.left + 36) strip.scrollLeft -= 8;
      else if (e.clientX > r.right - 36) strip.scrollLeft += 8;
    }
  }
  function onPointerUp() {
    if (!g) return;
    if (g.scrolling) {
      g = null;
      return;
    }
    if (g.held) {
      endGesture(false);
      return;
    }
    const i = g.i;
    endGesture(false);
    tapSelect(i);
  }
  // Pointer taps are handled above; this is keyboard activation
  function onClick(e: MouseEvent) {
    if (e.detail !== 0) return;
    const c = (e.target as Element).closest<HTMLButtonElement>('.cell');
    if (!c || c.disabled) return;
    const i = +c.dataset.i!;
    if (e.shiftKey) setPick(anchorIndex(), i, 1);
    else tapSelect(i);
  }
  function onWheel(e: WheelEvent) {
    if (!fill && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      strip.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }

  /* ---------- The scale: D · W · M · Y ---------- */
  function placeScale() {
    const b = scaleEl.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!b) return;
    scaleInd.style.width = `${b.offsetWidth}px`;
    scaleInd.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  function setLevel(l: Level) {
    if (l === level) return;
    endGesture(false);
    const coarser = LEVELS.indexOf(l) > LEVELS.indexOf(level);
    level = l;
    tick().then(placeScale);
    zo = coarser ? 0.88 : 1.08;
    out = true;
    clearTimeout(viewT);
    viewT = setTimeout(() => renderView(coarser ? 1.16 : 0.86), REDUCE ? 0 : 150);
  }

  function resetToToday() {
    if (!isDefault) app.resetToToday();
  }

  /* ---------- Something logged: a new session adds a dot ---------- */
  function onLogged(date: string, before: number) {
    const d = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));
    if (app.sessions(isoOf(d)) <= before) return;
    units.forEach((u, i) => {
      if (u.a > d || u.b < d || !cells[i]) return;
      if (level === 'd') {
        const dots = cells[i]!.querySelectorAll('.dot');
        dots[dots.length - 1]?.classList.add('fresh');
      } else replay(cells[i], 'fresh-ind');
    });
  }

  onMount(() => {
    renderView(0);
    placeScale();
    requestAnimationFrame(() => requestAnimationFrame(() => (scaleAnim = true)));
    const resize = () => {
      placeScale();
      renderSelection();
      syncFades();
    };
    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
    addEventListener('pointercancel', () => endGesture(true));
    addEventListener('resize', resize);
    document.fonts?.ready.then(resize);
    const off = app.on(e => {
      if (e.t === 'logged') tick().then(() => onLogged(e.date, e.before));
    });
    return () => {
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('resize', resize);
      off();
    };
  });
</script>

{#snippet marks(m: Mark)}
  {#if m.kind === 'dots'}
    <span class="ind">
      {#if m.n}
        {#each { length: m.n } as _, k (k)}<i class="dot"></i>{/each}
      {:else}
        <i class="dot {m.ring ? 'ring' : 'empty'}"></i>
      {/if}
    </span>
  {:else if m.kind === 'ticks'}
    <span class="ind ticks">
      {#each m.on as on, k (k)}<i class="tick" class:fut={on === null} class:on></i>{/each}
    </span>
  {:else if m.kind === 'quarters'}
    <span class="ind">
      {#each m.o as o, k (k)}<i
          class="q"
          class:fut={o === false}
          class:on={typeof o === 'number'}
          style={typeof o === 'number' ? `--o:${o}` : undefined}
        ></i>{/each}
    </span>
  {:else}
    <span class="ind"
      ><span class="ygrid">
        {#each m.o as o, k (k)}<i
            class:fut={o === false}
            class:on={typeof o === 'number'}
            style={typeof o === 'number' ? `--o:${o}` : undefined}
          ></i>{/each}
      </span></span
    >
  {/if}
{/snippet}

<header class="cal" bind:this={el}>
  <div class="cal-top">
    <!-- The chip becomes a button only while there's somewhere to go back to -->
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_no_noninteractive_tabindex -->
    <div
      class="cal-chip cal-title drop"
      class:resettable={!isDefault}
      style="--d:120"
      role={isDefault ? undefined : 'button'}
      tabindex={isDefault ? undefined : 0}
      aria-label={isDefault ? undefined : `${head.title}. Tap to go back to today`}
      onclick={resetToToday}
      onkeydown={e => {
        if ((e.key === 'Enter' || e.key === ' ') && !isDefault) {
          e.preventDefault();
          resetToToday();
        }
      }}
    >
      <span class="thumb" bind:this={thumb} style="--tc:#363d12;--ti:#e3fb5c"><span class="ic"><Icon name="calendar" /></span></span>
      <span class="cal-text">
        <span class="cal-eyebrow"><span class="roll" use:roll={{ text: head.eyebrow, dir: app.dir }}></span></span>
        <!-- svelte-ignore a11y_missing_content -->
        <h1 class="cal-h" aria-label={head.title}>
          <span class="roll" aria-hidden="true" use:roll={{ text: head.title, dir: app.dir }}></span>
        </h1>
      </span>
    </div>
    <div class="scale drop" class:no-anim={!scaleAnim} bind:this={scaleEl} role="radiogroup" aria-label="Calendar view" style="--d:170">
      <span class="scale-ind" bind:this={scaleInd}></span>
      {#each LEVELS as l (l)}
        <button type="button" role="radio" aria-checked={level === l} aria-label={LEVEL_NAME[l]} onclick={() => setLevel(l)}
          >{l.toUpperCase()}</button
        >
      {/each}
    </div>
    <button type="button" class="avatar press drop" style="--d:210" aria-label="Profile and settings" onclick={onProfile}>
      <span class="ic"><Icon name="user" /></span>
    </button>
  </div>
  <div class="tray">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="strip lvl-{level}"
      class:fill
      class:scrolled
      class:more
      bind:this={strip}
      onscroll={syncFades}
      onwheel={onWheel}
      oncontextmenu={e => e.preventDefault()}
      ontouchmove={e => {
        if (g && g.held) e.preventDefault();
      }}
    >
      <!-- Cells are buttons; the group handles taps and holds across them -->
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <div
        class="track"
        class:out
        style="--zo:{zo}"
        bind:this={track}
        role="group"
        aria-label="Select a period. Hold another to select a range."
        onpointerdown={onPointerDown}
        onclick={onClick}
      >
        <span class="band" bind:this={band}></span>
        {#key gen}
          {#each units as u, i (+u.a)}
            {@const t = cellText(level, u)}
            {@const now = isNow(u, today)}
            <button
              type="button"
              class="cell"
              class:now
              class:in={zIn && !REDUCE}
              data-i={i}
              disabled={!selectable(u, start, today)}
              style="--k:{i};--z:{zIn || 1}"
              aria-label={cellLabel(level, u, app.sessions, start, today)}
              aria-current={now ? 'date' : undefined}
              bind:this={cells[i]}
            >
              <span class="cc">
                {#if t.top}<span class="top" aria-hidden="true">{t.top}</span>{/if}
                <span class="main" aria-hidden="true">{t.main}</span>
                {@render marks(markOf(level, u, app.sessions, today))}
              </span>
            </button>
          {/each}
        {/key}
      </div>
    </div>
  </div>
</header>
