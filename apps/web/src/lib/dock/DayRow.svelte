<!--
  The day so far: what the day LOG writes to adds up to in this mode. Display only. A number the draft would change
  shows, in lime, what it will be once logged.
-->
<script lang="ts">
  import { clock } from '@logout/engine';
  import { app } from '../state/app.svelte.ts';
  import { isoOf, monthDay } from '../logic/dates.ts';
  import { distFmt, nf, volFmt } from '../logic/format.ts';
  import { TINTS } from '../logic/palette.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { replay, roll } from '../ui/motion.ts';
  import { scrollRow } from '../ui/scrollrow.ts';
  import { MODES, type DayKey } from './modes.ts';

  type Numbers = Record<DayKey, number | null>;

  function numbers(withDraft: boolean): Numbers {
    const d = app.book?.days.get(isoOf(app.logDate)),
      draft = withDraft ? app.draft : null,
      x = draft?.sum;
    const v = (k: 'kcal' | 'p' | 'c' | 'f' | 'sets' | 'volume' | 'cardioS' | 'distM') => (d ? d[k] : 0) + (x ? x[k] : 0);
    const lifts = new Set(d?.liftKeys ?? []);
    if (draft) for (const r of draft.res) if (r.line.kind === 'strength' && r.line.key) lifts.add(r.line.key);
    return {
      kcal: v('kcal'),
      p: v('p'),
      c: v('c'),
      f: v('f'),
      sets: v('sets'),
      volume: v('volume'),
      time: v('cardioS'),
      dist: v('distM'),
      lifts: lifts.size,
      // A step count is the day's newest, so the draft's replaces it
      steps: x && x.steps != null ? x.steps : d && d.steps != null ? d.steps : null
    };
  }
  function text(k: DayKey, n: number | null): string {
    if (k === 'kcal' || k === 'p' || k === 'c' || k === 'f') {
      const goal = app.profile.goals[k],
        g = k === 'kcal' ? '' : ' g',
        v = n ?? 0;
      return v <= goal ? `${nf(goal - v)}${g} ${app.isToday ? 'left' : 'under'}` : `${nf(v - goal)}${g} over`;
    }
    if (k === 'volume') return volFmt(n ?? 0, app.units.load).join(' ');
    if (k === 'time') return n ? clock(n) : '0:00';
    if (k === 'dist') return distFmt(n ?? 0, app.units.dist);
    if (k === 'steps') return n == null ? '—' : nf(n);
    return nf(n ?? 0);
  }

  const was = $derived(numbers(false));
  const now = $derived(numbers(true));
  const row = $derived(MODES[app.mode].day);
  const when = $derived(app.isToday ? 'Today' : monthDay(app.logDate, app.today));

  // The icons swap in turn when the mode changes
  const icos: HTMLSpanElement[] = $state([]);
  let shownMode = app.mode;
  $effect(() => {
    const m = app.mode;
    if (m === shownMode) return;
    shownMode = m;
    icos.forEach((el, i) => {
      if (!el) return;
      el.style.animationDelay = `${i * 40}ms`;
      replay(el, 'swap');
    });
  });
</script>

<div class="scroller" role="group" aria-label="{when} so far" use:scrollRow>
  {#each [0, 1, 2, 3] as i (i)}
    {@const c = row[i]}
    {#if c}
      {@const [k, label, icon, tint] = c}
      {@const val = text(k, now[k])}
      {@const moved = now[k] !== was[k]}
      <div class="ctx enter" class:set={moved} style="--d:{120 + i * 55}" aria-label="{label}: {val}{moved ? ' once this is logged' : ''}">
        <span class="thumb" class:letter={icon.length === 1} style="--tc:{TINTS[tint][0]};--ti:{TINTS[tint][1]}">
          <span class="ico ic" bind:this={icos[i]}
            >{#if icon.length === 1}{icon}{:else}<Icon name={icon as IconName} />{/if}</span
          >
        </span>
        <span class="ctx-text">
          <span class="ctx-label roll" use:roll={{ text: label, dir: app.dir }}></span>
          <span class="ctx-value roll" use:roll={{ text: val, dir: app.dir }}></span>
        </span>
      </div>
    {/if}
  {/each}
</div>
