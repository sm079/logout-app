<!--
  The profile's settings, a card each, worked with the same controls as the setup. The body slides along a ruler and
  shows the body fat it gives; units show how a typed line reads in them; the day's calories fill a dial, with each
  macro, water and steps a step at a time. A card with something unsaved in it is marked.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { navy, preview, readout, type Mode, type Units } from '@logout/engine';
  import type { Goals, Sex } from '../data/types.ts';
  import { fmt, fromIso } from '../logic/dates.ts';
  import { nf } from '../logic/format.ts';
  import { markup } from '../logic/markup.ts';
  import { MTINT, thumbStyle, type MTintName } from '../logic/palette.ts';
  import { measures } from '../logic/record.ts';
  import Dial from '../onboard/Dial.svelte';
  import { gramsFor, nearestSplit, SPLITS, splitOf } from '../onboard/goals.ts';
  import Ruler from '../onboard/Ruler.svelte';
  import { heightText, litres } from '../onboard/words.ts';
  import { app } from '../state/app.svelte.ts';
  import { hold } from '../ui/hold.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { REDUCE, roll } from '../ui/motion.ts';
  import Count from './Count.svelte';
  import type { ProfileValues } from './profile.ts';
  import Seg from './Seg.svelte';

  let { v = $bindable(), was }: { v: ProfileValues; was: ProfileValues } = $props();

  const tint = (t: MTintName) => thumbStyle(MTINT[t]);
  const imperial = $derived(v.units.load === 'lb');

  /* ---------- Body ---------- */
  // The ruler always shows a height; it counts once it's moved or a sex is picked, as in the setup
  const AVERAGE = { male: 176, female: 163 };
  let ruler = $state(untrack(() => v.heightCm) ?? 170);
  function pickSex(s: Sex) {
    v.sex = v.sex === s ? null : s;
    if (v.sex && v.heightCm == null) v.heightCm = ruler = AVERAGE[v.sex];
  }
  const meas = $derived(app.book ? measures(app.book.days) : null);
  const bodyFat = $derived.by(() => {
    if (!meas) return null;
    const bf = navy(v.sex, meas.height ?? v.heightCm, meas.waist, meas.neck, meas.hips);
    return bf != null && bf > 2 && bf < 60 ? bf : null;
  });
  // What's still to type for body fat, read as the composer would
  const missing = $derived.by(() => {
    const want: [string, string][] = [
      ['waist', v.sex === 'female' ? '72cm' : '84cm'],
      ['neck', v.sex === 'female' ? '32cm' : '38cm']
    ];
    if (v.sex === 'female') want.push(['hips', '98cm']);
    const text = want
      .filter(([k]) => meas?.[k as 'waist'] == null)
      .map(([k, x]) => `${k} ${x}`)
      .join(', ');
    return text ? markup(text, preview(null, text, 'strength').res) : '';
  });

  /* ---------- Units ---------- */
  const line = (text: string, mode: Mode, u: Units) => {
    const res = preview(null, text, mode, u).res;
    return { html: markup(text, res), out: res.map(readout).filter(Boolean).join(' · ') };
  };
  const lift = $derived(line('squat 5x5 100', 'strength', v.units));
  const run = $derived(line('run 5', 'cardio', v.units));

  /* ---------- Targets ---------- */
  const MACROS = [
    ['p', 'Protein', 'm-p'],
    ['c', 'Carbs', 'm-c'],
    ['f', 'Fat', 'm-f']
  ] as const;
  const split = $derived(splitOf(v.goals));
  const splitId = $derived(nearestSplit(v.goals));
  // Turning the dial keeps the grams in the shares they're in
  let lastKcal = untrack(() => v.goals.kcal);
  $effect(() => {
    const k = v.goals.kcal;
    untrack(() => {
      if (k === lastKcal) return;
      lastKcal = k;
      Object.assign(v.goals, gramsFor(k, splitId ? SPLITS.find(x => x.id === splitId)!.split : split));
    });
  });
  const nudge = (k: keyof Goals, d: number, by: number, min: number, max: number) => {
    v.goals[k] = Math.min(max, Math.max(min, Math.round((v.goals[k] + d * by) / by) * by));
  };

  const changed = $derived({
    body: v.sex !== was.sex || v.heightCm !== was.heightCm,
    units: v.units.load !== was.units.load || v.units.dist !== was.units.dist,
    goals: (Object.keys(was.goals) as (keyof Goals)[]).some(k => v.goals[k] !== was.goals[k])
  });

  function fadeIn(_: Element) {
    return { duration: REDUCE ? 0 : 380, css: (t: number) => `opacity:${t}` };
  }
</script>

<section class="pf-card" style="--d:140;--mc:{MTINT.body[1]}" aria-labelledby="pfBody">
  <header class="pf-head">
    {@render head('user', 'body', 'pfBody', 'Body', 'For body fat', changed.body)}
    <Seg
      label="Sex"
      opts={[
        ['male', 'Male'],
        ['female', 'Female']
      ]}
      value={v.sex}
      onpick={pickSex}
    />
  </header>
  <div class="pf-height" class:unset={v.heightCm == null} aria-hidden="true">
    {#if imperial}<b>{heightText(ruler, true)}</b>{:else}<b>{Math.round(ruler)}</b><small>cm</small>{/if}
    {#if v.heightCm == null}<em>Not set · slide to set it</em>{/if}
  </div>
  {#key imperial}
    <div in:fadeIn>
      <Ruler bind:value={ruler} {imperial} label="Height" onpick={() => (v.heightCm = ruler)} />
    </div>
  {/key}
  <div class="pf-foot">
    {#if bodyFat != null}
      <span class="pf-bf"><b><Count value={bodyFat} format={n => `${n.toFixed(1)}%`} /></b> body fat</span>
      <small>from your measurements on {fmt(fromIso(meas!.date!), { month: 'short', day: 'numeric' })}</small>
    {:else if !v.sex || v.heightCm == null}
      <small>Body fat needs your sex and height.</small>
    {:else if missing}
      <small>Then type</small><code class="wex">{@html missing}</code>
    {/if}
  </div>
</section>

<section class="pf-card" style="--d:200;--mc:{MTINT.training[1]}" aria-labelledby="pfUnits">
  <header class="pf-head">
    {@render head('weight', 'training', 'pfUnits', 'Units', 'What numbers without one are read in', changed.units)}
  </header>
  <div class="pf-rows">
    <div class="pf-row">
      {@render unit('Weight', 'Lifts and body weight', lift)}
      <Seg
        label="Weight in"
        opts={[
          ['kg', 'kg'],
          ['lb', 'lb']
        ]}
        value={v.units.load}
        onpick={u => (v.units.load = u)}
      />
    </div>
    <div class="pf-row">
      {@render unit('Distance', 'Runs, rides and walks', run)}
      <Seg
        label="Distance in"
        opts={[
          ['km', 'km'],
          ['mi', 'mi']
        ]}
        value={v.units.dist}
        onpick={u => (v.units.dist = u)}
      />
    </div>
  </div>
</section>

<section class="pf-card pf-targets" style="--d:260;--mc:{MTINT.nutrition[1]}" aria-labelledby="pfGoals">
  <header class="pf-head">
    {@render head('flame', 'nutrition', 'pfGoals', 'Daily targets', 'Food counts down from these', changed.goals)}
  </header>
  <Dial bind:kcal={v.goals.kcal} {split} />
  <div class="tn-splits" role="radiogroup" aria-label="Split">
    {#each SPLITS as s (s.id)}
      <button
        type="button"
        class="press"
        role="radio"
        aria-checked={splitId === s.id}
        onclick={() => Object.assign(v.goals, gramsFor(v.goals.kcal, s.split))}>{s.name}</button
      >
    {/each}
  </div>
  <ul class="pf-macros">
    {#each MACROS as [k, name, cls] (k)}
      <li class={cls} role="group" aria-label="{name} {v.goals[k]} g">
        <span class="pf-macro-name"><i></i>{name}</span>
        <span class="pf-macro-val">
          <button type="button" class="step press" aria-label="Less {name.toLowerCase()}" use:hold={() => nudge(k, -1, 5, 0, 995)}
            ><Icon name="minus" /></button
          >
          <b><span class="roll" use:roll={{ text: `${v.goals[k]} g`, dir: v.goals[k] >= was.goals[k] ? 1 : -1 }}></span></b>
          <button type="button" class="step press" aria-label="More {name.toLowerCase()}" use:hold={() => nudge(k, 1, 5, 0, 995)}
            ><Icon name="plus" /></button
          >
        </span>
      </li>
    {/each}
  </ul>
  <div class="tn-more">
    {@render stepper('drop', 'hydration', 'Water', litres(v.goals.water), d => nudge('water', d, 0.25, 0.5, 8))}
    {@render stepper('foot', 'activity', 'Steps', nf(v.goals.steps), d => nudge('steps', d, 500, 1000, 40000))}
  </div>
</section>

{#snippet head(icon: IconName, t: MTintName, id: string, name: string, caption: string, dirty: boolean)}
  <span class="thumb tn-thumb" style={tint(t)}><Icon name={icon} /></span>
  <span class="tn-card-name">
    <b {id}>{name}<i class="pf-dirty" class:on={dirty} aria-hidden="true"></i></b>
    <small>{caption}</small>
  </span>
{/snippet}

{#snippet unit(name: string, caption: string, ex: { html: string; out: string })}
  <span class="pf-unit">
    <b>{name}</b><small>{caption}</small>
    <span class="pf-ex"><code>{@html ex.html}</code><span class="pf-ro roll" use:roll={{ text: ex.out }}></span></span>
  </span>
{/snippet}

{#snippet stepper(icon: IconName, t: MTintName, name: string, value: string, step: (d: number) => void)}
  <div class="tn-stepper">
    <span class="thumb tn-thumb" style={tint(t)}><Icon name={icon} /></span>
    <span class="tn-card-name"><small>{name}</small><b><span class="roll" use:roll={{ text: value }}></span></b></span>
    <button type="button" class="step press" aria-label="Less {name.toLowerCase()}" use:hold={() => step(-1)}
      ><span class="ic"><Icon name="minus" /></span></button
    >
    <button type="button" class="step press" aria-label="More {name.toLowerCase()}" use:hold={() => step(1)}
      ><span class="ic"><Icon name="plus" /></span></button
    >
  </div>
{/snippet}
