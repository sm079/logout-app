<!--
  The setup's screens: one question a screen, each answered with something that moves. A plate flips between
  kilograms and pounds and a road's marks stretch to miles; a ruler slides under a needle while the logo's bar
  grows with it; a dial fills with the day's calories, coloured by their split.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { cubicIn, expoOut } from 'svelte/easing';
  import type { Units } from '@logout/engine';
  import type { Sex } from '../data/types.ts';
  import { nf } from '../logic/format.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { REDUCE, replay, roll } from '../ui/motion.ts';
  import Dial from './Dial.svelte';
  import { gramsFor, nearestSplit, SPLITS, splitOf, type SplitId } from './goals.ts';
  import Mark from './Mark.svelte';
  import Ruler from './Ruler.svelte';
  import type { SetupValues } from './setup.svelte.ts';
  import { heightText, litres } from './words.ts';

  let {
    values,
    onfinish,
    onskip,
    onsignin
  }: {
    /** Where the answers start */
    values: SetupValues;
    onfinish: (v: SetupValues) => void;
    onskip: () => void;
    /** Opens sign-in, when there's an account to sign in to */
    onsignin: (() => void) | null;
  } = $props();
  const start = untrack(() => values);

  const STEPS: { icon: IconName; name: string }[] = [
    { icon: 'weight', name: 'Units' },
    { icon: 'user', name: 'Body' },
    { icon: 'flame', name: 'Targets' }
  ];
  const ACTION = ['BEGIN', 'NEXT', 'NEXT', 'START'];
  const MACROS = [
    ['p', 'Protein'],
    ['c', 'Carbs'],
    ['f', 'Fat']
  ] as const;

  let step = $state(0),
    dir = $state(1);
  let units = $state<Units>({ ...start.units });
  let sex = $state<Sex | null>(start.sex);
  let heightCm = $state<number | null>(start.heightCm);
  let kcal = $state(start.goals.kcal);
  let grams = $state({ p: start.goals.p, c: start.goals.c, f: start.goals.f });
  let splitId = $state<SplitId | null>(nearestSplit(start.goals));
  let water = $state(start.goals.water);
  let steps = $state(start.goals.steps);
  let titleEl = $state<HTMLElement>();

  const imperial = $derived(units.load === 'lb');
  const split = $derived(splitOf(grams));

  // A named split sets the grams from the calories; without one, the grams keep their shares
  let lastKcal = untrack(() => kcal);
  $effect(() => {
    const k = kcal;
    untrack(() => {
      if (k === lastKcal) return;
      lastKcal = k;
      grams = gramsFor(k, splitId ? SPLITS.find(x => x.id === splitId)!.split : split);
    });
  });
  function pickSplit(id: SplitId) {
    splitId = id;
    grams = gramsFor(kcal, SPLITS.find(x => x.id === id)!.split);
  }

  let plate = $state<HTMLElement>();
  function setUnit<K extends keyof Units>(k: K, v: Units[K]) {
    if (units[k] === v) return;
    units[k] = v;
    if (k === 'load') replay(plate, 'tn-flip');
  }

  async function go(d: number) {
    if (step + d > STEPS.length) {
      onfinish({ sex, heightCm, units: { ...units }, goals: { kcal, ...grams, water, steps } });
      return;
    }
    dir = d;
    step = Math.max(0, step + d);
    await tick();
    titleEl?.focus({ preventScroll: true });
  }

  // Each screen comes in from the side it's heading to, and the last one leaves towards the other
  function enter(_: Element) {
    const d = dir;
    return {
      duration: REDUCE ? 0 : 640,
      easing: expoOut,
      css: (t: number, u: number) => `opacity:${t};transform:translateX(${u * 64 * d}px) scale(${1 - u * 0.04});filter:blur(${u * 8}px)`
    };
  }
  function leave(_: Element) {
    const d = dir;
    return {
      duration: REDUCE ? 0 : 260,
      easing: cubicIn,
      css: (t: number, u: number) => `opacity:${t};transform:translateX(${-u * 40 * d}px) scale(${1 - u * 0.03});filter:blur(${u * 6}px)`
    };
  }

  const bar = $derived(heightCm == null ? 1 : Math.min(1.3, Math.max(0.7, 1 + (heightCm - 172) / 120)));
  const nudge = (v: number, d: number, by: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round((v + d * by) / by) * by));
</script>

<div class="tn" data-step={step}>
  <header class="ob-top">
    {#if step > 0}
      <button type="button" class="ob-round press" aria-label="Back" onclick={() => go(-1)}
        ><span class="ic tn-back"><Icon name="chevDown" /></span></button
      >
    {:else}
      <span class="ob-round ghosted" aria-hidden="true"></span>
    {/if}
    <ol class="tn-progress" class:shown={step > 0} aria-label="Step {step} of {STEPS.length}">
      {#each STEPS as s, i (s.name)}
        <li class:done={step > i + 1} class:now={step === i + 1}><span class="vh">{s.name}</span></li>
      {/each}
    </ol>
    <div class="ob-top-acts">
      {#if onsignin && step === 0}<button type="button" class="ob-link press" onclick={onsignin}>Sign in</button>{/if}
      <button type="button" class="ob-link press" onclick={onskip}>Skip</button>
    </div>
  </header>

  <div class="tn-stage">
    {#key step}
      <section class="tn-step" in:enter out:leave aria-labelledby="tnTitle">
        {#if step === 0}
          <div class="tn-hello">
            <div class="tn-mark"><Mark size={92} still={REDUCE} /></div>
            <h1 class="tn-title enter" id="tnTitle" tabindex="-1" style="--d:700" bind:this={titleEl}>Let’s tune LogOut to you.</h1>
            <p class="tn-sub enter" style="--d:780">Three quick things. Change any of them later.</p>
            <ul class="tn-coming">
              {#each STEPS as s, i (s.name)}
                <li class="enter" style="--d:{880 + i * 70}"><span class="ic"><Icon name={s.icon} /></span>{s.name}</li>
              {/each}
            </ul>
          </div>
        {:else if step === 1}
          <h1 class="tn-title enter" id="tnTitle" tabindex="-1" style="--d:40" bind:this={titleEl}>How do you measure?</h1>
          <p class="tn-sub enter" style="--d:90">A number typed on its own is read in these.</p>
          <div class="tn-units">
            <div class="tn-inst enter" style="--d:150">
              <div class="tn-plate" bind:this={plate} aria-hidden="true">
                <svg viewBox="-64 -64 128 128">
                  <circle r="62" class="tn-disc" />
                  <circle r="52" class="tn-ring" />
                  <circle r="34" class="tn-ring faint" />
                </svg>
                <span class="tn-plate-n"
                  ><span class="roll" use:roll={{ text: imperial ? '45' : '20' }}></span><small>{units.load}</small></span
                >
              </div>
              <span class="tn-inst-name">Weight</span>
              {@render seg('Weight in', 'load', ['kg', 'lb'])}
            </div>
            <div class="tn-inst enter" style="--d:210">
              <div class="tn-road" class:mi={units.dist === 'mi'} aria-hidden="true">
                <span class="tn-road-ticks"></span>
                <span class="tn-road-span"><span class="roll" use:roll={{ text: `1 ${units.dist}` }}></span></span>
              </div>
              <span class="tn-inst-name">Distance</span>
              {@render seg('Distance in', 'dist', ['km', 'mi'])}
            </div>
          </div>
        {:else if step === 2}
          <h1 class="tn-title enter" id="tnTitle" tabindex="-1" style="--d:40" bind:this={titleEl}>For body fat.</h1>
          <p class="tn-sub enter" style="--d:90">It needs your sex and height. Leave them if you’d rather not.</p>
          <div class="tn-sex enter" style="--d:150" role="radiogroup" aria-label="Sex">
            {#each [['male', 'Male'], ['female', 'Female']] as [v, t] (v)}
              <button
                type="button"
                class="tn-tile press"
                role="radio"
                aria-checked={sex === v}
                onclick={() => (sex = sex === v ? null : (v as Sex))}
              >
                <span>{t}</span><span class="ob-tick" aria-hidden="true"></span>
              </button>
            {/each}
          </div>
          <div class="tn-height enter" style="--d:220">
            <div class="tn-height-top">
              <Mark size={58} still {bar} />
              <span class="tn-height-n" class:unset={heightCm == null}>
                <b>{heightText(heightCm, imperial) ?? '—'}</b>
                <small>{heightCm == null ? 'Slide to set your height' : 'Height'}</small>
              </span>
              {#if heightCm != null}
                <button type="button" class="ob-link press" onclick={() => (heightCm = null)}>Clear</button>
              {/if}
            </div>
            <Ruler bind:value={heightCm} {imperial} rest={imperial ? 175 : 172} label="Height" />
          </div>
        {:else}
          <h1 class="tn-title enter" id="tnTitle" tabindex="-1" style="--d:40" bind:this={titleEl}>Your daily targets.</h1>
          <p class="tn-sub enter" style="--d:90">Drag round the ring. Food counts down from these.</p>
          <div class="enter" style="--d:150"><Dial bind:kcal {split} /></div>
          <div class="tn-splits enter" style="--d:210" role="radiogroup" aria-label="Split">
            {#each SPLITS as s (s.id)}
              <button type="button" class="press" role="radio" aria-checked={splitId === s.id} onclick={() => pickSplit(s.id)}
                >{s.name}</button
              >
            {/each}
          </div>
          <ul class="tn-macros enter" style="--d:250">
            {#each MACROS as [k, name] (k)}
              <li class="m-{k}"><i></i><b>{grams[k]} g</b><small>{name}</small></li>
            {/each}
          </ul>
          <div class="tn-more enter" style="--d:300">
            {@render stepper(
              'drop',
              'Water',
              litres(water),
              () => (water = nudge(water, -1, 0.25, 0.5, 8)),
              () => (water = nudge(water, 1, 0.25, 0.5, 8))
            )}
            {@render stepper(
              'foot',
              'Steps',
              nf(steps),
              () => (steps = nudge(steps, -1, 500, 1000, 40000)),
              () => (steps = nudge(steps, 1, 500, 1000, 40000))
            )}
          </div>
        {/if}
      </section>
    {/key}
  </div>

  <footer class="ob-cta">
    <button type="button" class="log" aria-label={ACTION[step]!.charAt(0) + ACTION[step]!.slice(1).toLowerCase()} onclick={() => go(1)}>
      <span class="log-face"><span class="log-title"><span class="roll" use:roll={{ text: ACTION[step]!, dir }}></span></span></span>
    </button>
  </footer>
</div>

{#snippet seg(label: string, k: keyof Units, opts: string[])}
  <div class="su-seg" role="radiogroup" aria-label={label}>
    {#each opts as o (o)}
      <button type="button" role="radio" aria-checked={units[k] === o} onclick={() => setUnit(k, o as Units[typeof k])}>{o}</button>
    {/each}
  </div>
{/snippet}

{#snippet stepper(icon: IconName, name: string, value: string, less: () => void, more: () => void)}
  <div class="tn-stepper">
    <span class="ic"><Icon name={icon} /></span>
    <span class="tn-stepper-text"><small>{name}</small><b>{value}</b></span>
    <button type="button" class="step press" aria-label="Less {name.toLowerCase()}" onclick={less}
      ><span class="ic"><Icon name="minus" /></span></button
    >
    <button type="button" class="step press" aria-label="More {name.toLowerCase()}" onclick={more}
      ><span class="ic"><Icon name="plus" /></span></button
    >
  </div>
{/snippet}
