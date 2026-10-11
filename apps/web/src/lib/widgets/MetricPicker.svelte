<!-- What a widget shows: a list of metrics with today's value, anchored to the widget's chip -->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../state/app.svelte.ts';
  import { CHOICES, Timeline } from '../logic/metrics.ts';
  import { MTINT } from '../logic/palette.ts';
  import Icon from '../ui/Icon.svelte';
  import { REDUCE, replay } from '../ui/motion.ts';
  import { track } from '../observe/analytics.ts';
  import { closePicker, picker, type ChartType } from './picker.svelte.ts';

  let { screen }: { screen: HTMLElement } = $props();

  const TYPE_NAME: Record<ChartType, string> = { line: 'line chart', bars: 'bar chart', heat: 'activity grid', stat: 'card' };
  let el = $state<HTMLDivElement>(),
    list = $state<HTMLUListElement>();
  let idx = $state(0);
  let shown = $state(false),
    leaving = $state(false),
    stagger = $state(false);
  let pos = $state({ left: 0, top: 0, origin: '' });
  const t = $derived(picker.target);
  const keys = $derived(t ? CHOICES[t.type] : []);
  const tl = $derived(t && app.book ? new Timeline(app.book, app.start, app.today, app.profile.goals, app.units) : null);

  // Opens below the chip when there's room above the dock (or, beside the dock, above the screen's bottom)
  async function place() {
    if (!t || !el) return;
    await tick();
    const sr = screen.getBoundingClientRect(),
      cr = t.chip.getBoundingClientRect();
    const dock = screen.querySelector('.dock');
    const dockTop = app.wide || !dock ? sr.height - 8 : dock.getBoundingClientRect().top - sr.top;
    const cl = cr.left - sr.left,
      ct = cr.top - sr.top,
      cb = cr.bottom - sr.top;
    const pw = el.offsetWidth,
      ph = el.offsetHeight,
      SW = screen.offsetWidth;
    const below = cb + 8 + ph <= dockTop || ct - 8 - ph < 60;
    const left = Math.max(12, Math.min(SW - pw - 12, cl));
    pos = {
      left,
      top: below ? cb + 8 : ct - 8 - ph,
      origin: `${Math.max(12, Math.min(pw - 12, cl - left + 24))}px ${below ? '0' : '100%'}`
    };
    replay(el, 'in');
    stagger = true;
    setTimeout(() => (stagger = false), 520);
    list?.children[idx]?.scrollIntoView({ block: 'nearest' });
    list?.focus({ preventScroll: true });
  }

  let lastId = '';
  $effect(() => {
    const target = picker.target;
    if (target) {
      idx = Math.max(0, CHOICES[target.type].indexOf(target.metric));
      leaving = false;
      shown = true;
      if (target.id !== lastId) place();
      lastId = target.id;
    } else if (shown) {
      lastId = '';
      if (REDUCE) shown = false;
      else {
        leaving = true;
        setTimeout(() => {
          if (!picker.target) {
            shown = false;
            leaving = false;
          }
        }, 170);
      }
    }
  });

  function move(i: number) {
    idx = Math.max(0, Math.min(keys.length - 1, i));
    list?.children[idx]?.scrollIntoView({ block: 'nearest' });
  }
  function choose(i: number) {
    if (!t) return;
    const key = keys[i]!,
      chip = t.chip,
      id = t.id;
    closePicker();
    chip.focus({ preventScroll: true });
    if (key === t.metric) return;
    app.widgets[id] = key;
    track('widget changed', { widget: id, metric: key });
    void app.repo.saveWidgets($state.snapshot(app.widgets));
  }
  function onkey(e: KeyboardEvent) {
    if (!t) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(idx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(idx - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(idx);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      const chip = t.chip;
      closePicker();
      chip.focus({ preventScroll: true });
    }
  }
  // A press outside closes it
  $effect(() => {
    if (!t) return;
    const off = (e: PointerEvent) => {
      if (!picker.target || el?.contains(e.target as Node) || picker.target.chip.contains(e.target as Node)) return;
      closePicker();
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  });
</script>

{#if shown}
  <div
    class="mpick"
    class:out={leaving}
    class:stagger
    bind:this={el}
    style="left:{pos.left}px;top:{pos.top}px;transform-origin:{pos.origin}"
  >
    <div class="pop-head"><span>Show on this {t ? TYPE_NAME[t.type] : ''}</span><span>↑↓ to move</span></div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <ul role="listbox" tabindex="-1" aria-label="Metrics" aria-activedescendant="mopt-{idx}" bind:this={list} onkeydown={onkey}>
      {#if tl}
        {#each keys as k, i (k)}
          {@const m = tl.met[k]}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            class="opt"
            role="option"
            id="mopt-{i}"
            aria-selected={i === idx}
            data-cur={t && k === t.metric ? '' : undefined}
            style="--k:{i}"
            onpointermove={() => i !== idx && move(i)}
            onclick={() => choose(i)}
          >
            <span class="opt-thumb" style="--tc:{MTINT[m.tint][0]};--ti:{MTINT[m.tint][1]}"><Icon name={m.icon} /></span>
            <span class="opt-text"><span class="opt-name">{m.name}</span><span class="opt-meta">{tl.todayText(m)}</span></span>
            <span class="opt-check"><Icon name="check" /></span>
          </li>
        {/each}
      {/if}
    </ul>
  </div>
{/if}
