<!--
  The dock: the log (always open on a wide screen; on a phone it grows up to the calendar), the day so far, the
  composer, and the action row (logs, mode switch, LOG).
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { app } from '../state/app.svelte.ts';
  import { clockNow, fmt, monthDay } from '../logic/dates.ts';
  import { sumParts } from '../logic/format.ts';
  import LogPanel from '../log/LogPanel.svelte';
  import Icon from '../ui/Icon.svelte';
  import { REDUCE, replay, roll } from '../ui/motion.ts';
  import Composer from './Composer.svelte';
  import DayRow from './DayRow.svelte';
  import Toast from './Toast.svelte';
  import { commit, confirmLogged, readDraft } from './logging.ts';
  import { MODE_ORDER, MODES } from './modes.ts';
  import { track } from '../observe/analytics.ts';

  let { calEl, el = $bindable() }: { calEl: HTMLElement | undefined; el?: HTMLElement } = $props();

  const MERGE = 7;
  let composer: Composer;
  let logsEl = $state<HTMLDivElement>(),
    logsPanel = $state<HTMLDivElement>();
  let seg: HTMLDivElement, segInd: HTMLSpanElement, logsIc: HTMLSpanElement;
  let fieldH = $state(42);
  let busy = $state(false),
    done = $state(false),
    segAnim = $state(false);
  let opening = $state(false),
    closing = $state(false);
  let fresh = $state(false);

  /* ---------- LOG ---------- */
  const past = $derived(!app.isToday);
  const logDay = $derived(past ? `\u00a0·\u00a0${monthDay(app.logDate, app.today).toUpperCase()}` : '');
  const logTo = $derived(past ? ` to ${fmt(app.logDate, { weekday: 'long', month: 'long', day: 'numeric' })}` : '');
  // LOG shows what the draft adds up to while there is one
  let lastSum = $state('');
  const sum = $derived.by(() => {
    const d = app.draft;
    const parts = d ? sumParts(d.sum, app.units) : [];
    let s = parts
      .slice(0, 2)
      .map(p => p[1])
      .join(' · ');
    if (s && parts[0]![0] === 'kcal') s = '+' + s;
    if (!s && d && d.sum.needs) s = 'needs values';
    return s;
  });
  $effect(() => {
    if (sum) lastSum = sum;
  });

  function doLog() {
    if (busy) return;
    const text = composer.text();
    if (!text) {
      composer.nudge();
      return;
    }
    busy = true;
    const mode = app.mode;
    setTimeout(
      async () => {
        done = true;
        // A time typed in the text wins; otherwise now
        const p = readDraft(text, mode);
        composer.clearAfterLog();
        const e = await commit(text, mode, p.at ?? clockNow());
        if (e) confirmLogged(e);
      },
      REDUCE ? 0 : 650
    );
    setTimeout(
      () => {
        busy = false;
        done = false;
      },
      REDUCE ? 900 : 2000
    );
  }

  /* ---------- Mode switch ---------- */
  function placeInd() {
    const b = seg?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!b) return;
    segInd.style.width = `${b.offsetWidth}px`;
    segInd.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  async function setMode(m: typeof app.mode, btn: HTMLElement) {
    if (m === app.mode) return;
    app.dir = MODE_ORDER.indexOf(m) > MODE_ORDER.indexOf(app.mode) ? 1 : -1;
    app.mode = m;
    track('mode switched', { mode: m });
    replay(btn, 'bounce');
    await tick();
    placeInd();
    composer.modeChanged();
  }

  /* ---------- Opening the log: the dock's top edge travels up while its bottom stays put, and it tucks under
     the calendar's bottom padding so the two read as one container ---------- */
  export function layoutDock() {
    if (!el || !logsEl || !logsPanel) return;
    if (app.wide) {
      logsEl.style.height = logsPanel.style.height = el.style.marginTop = '';
      return;
    }
    let lift = 0;
    if (app.logsOpen && calEl) {
      const field = el.querySelector<HTMLElement>('.field');
      const bottom = el.offsetTop + el.offsetHeight;
      const closedH = el.offsetHeight - logsEl.offsetHeight + (fieldH - (field?.offsetHeight ?? fieldH));
      lift = Math.max(0, bottom - closedH - (calEl.offsetTop + calEl.offsetHeight) + MERGE);
      logsPanel.style.height = `${Math.max(0, lift - 6)}px`;
    }
    logsEl.style.height = `${lift}px`;
    el.style.marginTop = `${42 - fieldH - lift}px`;
  }
  let toggleT: ReturnType<typeof setTimeout> | undefined;
  function setLogs(open: boolean) {
    if (open === app.logsOpen) return;
    app.logsOpen = open;
    opening = open;
    closing = !open;
    clearTimeout(toggleT);
    toggleT = setTimeout(
      () => {
        opening = closing = false;
      },
      open ? 700 : 450
    );
    fresh = false;
    layoutDock();
    if (logsIc) replay(logsIc, 'swap');
  }
  $effect(() => {
    void app.wide;
    void app.logsOpen;
    tick().then(layoutDock);
  });
  // A new entry while the log is closed puts a dot on its button
  $effect(() =>
    app.on(e => {
      if (e.t === 'logged' && !app.logsOpen) fresh = true;
    })
  );

  onMount(() => {
    placeInd();
    requestAnimationFrame(() => requestAnimationFrame(() => (segAnim = true)));
    const resize = () => {
      placeInd();
      layoutDock();
    };
    addEventListener('resize', resize);
    document.fonts?.ready.then(resize);
    const esc = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        app.logsOpen &&
        !e.defaultPrevented &&
        !app.sheet &&
        !app.wide &&
        !document.querySelector('.lentry.editing, .mpick')
      )
        setLogs(false);
    };
    document.addEventListener('keydown', esc);
    return () => {
      removeEventListener('resize', resize);
      document.removeEventListener('keydown', esc);
    };
  });
</script>

<section class="dock" class:opening class:closing bind:this={el} aria-label="Log and review">
  <Toast />

  <div
    class="logs"
    id="logs"
    bind:this={logsEl}
    role="region"
    aria-label="Your logs for the selected period"
    inert={!app.logsOpen && !app.wide}
  >
    <div class="logs-panel" bind:this={logsPanel}>
      <LogPanel open={app.logsOpen || app.wide} />
    </div>
  </div>

  <DayRow />

  <Composer bind:this={composer} bind:fieldH onresize={layoutDock} onlog={doLog} />

  <div class="actions enter" style="--d:260">
    <button
      type="button"
      class="logs-btn press"
      class:new={fresh}
      aria-expanded={app.logsOpen}
      aria-controls="logs"
      aria-label={app.logsOpen ? 'Hide your logs' : 'Show your logs'}
      onclick={() => setLogs(!app.logsOpen)}
    >
      <span class="lb-face">
        <span class="ico ic" bind:this={logsIc}><Icon name={app.logsOpen ? 'chevDown' : 'logs'} /></span>
        <span class="roll" use:roll={{ text: app.logsOpen ? 'Hide' : 'Logs', dir: app.logsOpen ? 1 : -1 }}></span>
      </span>
      <i class="logs-dot" aria-hidden="true"></i>
    </button>
    <div class="seg" class:no-anim={!segAnim} bind:this={seg} role="group" aria-label="What you're logging">
      <span class="seg-ind" bind:this={segInd}></span>
      {#each MODE_ORDER as m (m)}
        <button type="button" class="seg-btn press" aria-pressed={app.mode === m} onclick={e => setMode(m, e.currentTarget)}>
          <span class="ic"><Icon name={MODES[m].icon} /></span><span>{MODES[m].label}</span>
        </button>
      {/each}
    </div>
    <button
      type="button"
      class="log"
      class:busy
      class:done
      aria-label={sum ? `Log it${logTo}: ${sum}` : `Log ${app.mode === 'food' ? 'meal' : 'session'}${logTo}`}
      onclick={doLog}
    >
      <span class="log-fill"></span>
      <span class="log-face">
        <span class="log-title">LOG<span class="roll" use:roll={{ text: logDay, dir: app.dir }}></span></span>
        <span class="log-meta" class:has-sum={!!sum}
          ><span class="roll log-sum" use:roll={{ text: sum || lastSum, dir: app.dir }}></span></span
        >
      </span>
      <span class="log-done" aria-hidden="true"><span class="ic"><Icon name="check" /></span>LOGGED</span>
    </button>
  </div>
</section>
