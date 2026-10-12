<!-- The profile's form: sex and height (body fat needs both), units, daily goals and the sample history -->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Units } from '@logout/engine';
  import { GOALS, type Goals, type Sex } from '../data/types.ts';
  import type { ProfileValues } from './profile.ts';

  let { initial: given }: { initial: ProfileValues } = $props();
  // The form starts from these and then keeps its own values
  const initial = untrack(() => given);

  const GOAL_ROWS: [keyof Goals, string, string, number][] = [
    ['kcal', 'Calories', 'kcal', 50],
    ['p', 'Protein', 'g', 5],
    ['c', 'Carbs', 'g', 5],
    ['f', 'Fat', 'g', 5],
    ['water', 'Water', 'L', 0.25],
    ['steps', 'Steps', '', 500]
  ];
  const inchesOf = (cm: number) => Math.round(cm / 2.54);

  let sex = $state(initial.sex);
  let load = $state(initial.units.load);
  let dist = $state(initial.units.dist);
  let sample = $state(initial.sample);
  const h0 = initial.heightCm,
    in0 = h0 ? inchesOf(h0) : null;
  let cm = $state<number | null>(h0 ? Math.round(h0) : null);
  let ft = $state<number | null>(in0 == null ? null : Math.floor(in0 / 12));
  let inch = $state<number | null>(in0 == null ? null : in0 % 12);
  let goals = $state(Object.fromEntries(GOAL_ROWS.map(([k]) => [k, initial.goals[k]])) as Record<keyof Goals, number | null>);
  let badHeight = $state(false);

  const numIn = (v: number | null | undefined) => (v != null && Number.isFinite(v) && v > 0 ? v : null);
  // Height in cm as typed, from whichever fields are showing; null if blank
  function heightOf(imperial = load === 'lb'): number | null {
    if (!imperial) return numIn(cm);
    const f = numIn(ft),
      i = numIn(inch);
    return f == null && i == null ? null : ((f || 0) * 12 + (i || 0)) * 2.54;
  }
  // The weight unit also switches height between cm and feet and inches, keeping its value
  function setLoad(next: Units['load']) {
    if (next === load) return;
    const h = heightOf();
    load = next;
    const t = h ? inchesOf(h) : null;
    cm = h ? Math.round(h) : null;
    ft = t == null ? null : Math.floor(t / 12);
    inch = t == null ? null : t % 12;
  }

  /** What the form says, or null (with the height marked) when a height was typed that can't be right */
  export function read(): ProfileValues | null {
    const heightCm = heightOf();
    badHeight = heightCm != null && (heightCm < 100 || heightCm > 250);
    if (badHeight) return null;
    const g = {} as Goals;
    for (const [k] of GOAL_ROWS) g[k] = numIn(goals[k]) || GOALS[k];
    return { sex, heightCm: heightCm && Math.round(heightCm * 10) / 10, units: { load, dist }, goals: g, sample };
  }
</script>

{#snippet seg<T extends string>(label: string, opts: [T, string][], cur: T | null, pick: (v: T) => void)}
  <div class="su-seg" role="radiogroup" aria-label={label}>
    {#each opts as [v, t] (v)}
      <button type="button" role="radio" aria-checked={v === cur} onclick={() => pick(v)}>{t}</button>
    {/each}
  </div>
{/snippet}

<div class="su-group" style="--d:80">
  <span class="su-label">You</span>
  <div class="su-rows">
    <div class="su-row">
      <span class="su-name">Sex</span>
      {@render seg<Sex>(
        'Sex',
        [
          ['male', 'Male'],
          ['female', 'Female']
        ],
        sex,
        v => (sex = v)
      )}
    </div>
    <div class="su-row">
      <span class="su-name" id="suHeight">Height</span>
      {#if load === 'lb'}
        <span class="su-num" role="group" aria-labelledby="suHeight">
          <input
            type="number"
            inputmode="decimal"
            class="short"
            min="0"
            placeholder="–"
            aria-label="Feet"
            aria-invalid={badHeight}
            bind:value={ft}
          /><small>ft</small>
          <input
            type="number"
            inputmode="decimal"
            class="short"
            min="0"
            placeholder="–"
            aria-label="Inches"
            aria-invalid={badHeight}
            bind:value={inch}
          /><small>in</small>
        </span>
      {:else}
        <span class="su-num" role="group" aria-labelledby="suHeight">
          <input
            type="number"
            inputmode="decimal"
            min="0"
            placeholder="–"
            aria-label="Centimetres"
            aria-invalid={badHeight}
            bind:value={cm}
          /><small>cm</small>
        </span>
      {/if}
    </div>
  </div>
</div>
<div class="su-group" style="--d:130">
  <span class="su-label">Units</span>
  <div class="su-rows">
    <div class="su-row">
      <span class="su-name">Weight</span>{@render seg<Units['load']>(
        'Weight in',
        [
          ['kg', 'kg'],
          ['lb', 'lb']
        ],
        load,
        setLoad
      )}
    </div>
    <div class="su-row">
      <span class="su-name">Distance</span>{@render seg<Units['dist']>(
        'Distance in',
        [
          ['km', 'km'],
          ['mi', 'mi']
        ],
        dist,
        v => (dist = v)
      )}
    </div>
  </div>
</div>
<div class="su-group" style="--d:180">
  <span class="su-label">Daily goals</span>
  <div class="su-rows">
    {#each GOAL_ROWS as [k, name, unit, step] (k)}
      <label class="su-row">
        <span class="su-name">{name}</span>
        <span class="su-num"><input type="number" inputmode="decimal" min="0" {step} bind:value={goals[k]} /><small>{unit}</small></span>
      </label>
    {/each}
  </div>
</div>
<div class="su-group" style="--d:230">
  <div class="su-rows">
    <div class="su-row">
      <span class="su-name" id="suSample"
        >Sample history<span class="su-hint"
          >Years of made-up logs to explore with. Turning it off later leaves your own entries as they are.</span
        ></span
      >
      <button
        type="button"
        class="su-switch press"
        role="switch"
        aria-checked={sample}
        aria-labelledby="suSample"
        onclick={() => (sample = !sample)}
      ></button>
    </div>
  </div>
</div>
