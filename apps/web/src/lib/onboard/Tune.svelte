<!--
  The setup's screens: a welcome, then three questions, one a screen, each answered with something that moves. The
  units load a barbell and stretch a track; the height slides along a ruler; the day's calories fill a dial,
  coloured by their split. Where there's an account to have, a last screen offers one, as easily passed by as taken:
  signing in sends the log across to another device. The steps in the header, the button and the light
  behind carry through from screen to screen, and the button always says what it will save.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { cubicIn } from 'svelte/easing';
  import type { Units } from '@logout/engine';
  import type { Sex } from '../data/types.ts';
  import { nf } from '../logic/format.ts';
  import { MTINT, thumbStyle, type MTintName } from '../logic/palette.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { account } from '../sync/account.svelte.ts';
  import { REDUCE, roll } from '../ui/motion.ts';
  import Barbell from './Barbell.svelte';
  import Devices from './Devices.svelte';
  import Dial from './Dial.svelte';
  import EmailCode from './EmailCode.svelte';
  import { gramsFor, nearestSplit, SPLITS, splitOf, type SplitId } from './goals.ts';
  import Mark from './Mark.svelte';
  import Ruler from './Ruler.svelte';
  import type { SetupValues } from './setup.svelte.ts';
  import Track from './Track.svelte';
  import { heightText, litres } from './words.ts';

  let {
    values,
    leaving = false,
    onfinish,
    onskip,
    onsignin,
    sync = false,
    onkeep
  }: {
    /** Where the answers start */
    values: SetupValues;
    /** The setup is handing over to the app: the button becomes LOG */
    leaving?: boolean;
    onfinish: (v: SetupValues) => void;
    onskip: () => void;
    /** Opens sign-in, when there's an account to sign in to */
    onsignin: (() => void) | null;
    /** Ends with a screen offering an account */
    sync?: boolean;
    /** Keeps the answers as signing in begins, so a new account takes them up */
    onkeep?: (v: SetupValues) => Promise<void>;
  } = $props();
  const start = untrack(() => values);

  // Each question keeps the colour the app gives its kind of numbers. The account's screen is there from the start or
  // not at all, so signing in on it doesn't take it away
  const STEPS: { icon: IconName; name: string; tint: MTintName }[] = [
    { icon: 'weight', name: 'Units', tint: 'training' },
    { icon: 'user', name: 'Body', tint: 'body' },
    { icon: 'flame', name: 'Targets', tint: 'nutrition' },
    ...(untrack(() => sync) ? [{ icon: 'cloud', name: 'Sync', tint: 'sleep' } as const] : [])
  ];
  const SYNC = STEPS.length === 4 ? 4 : -1;
  const ACTION = ['BEGIN', ...STEPS.slice(1).map(() => 'NEXT'), 'START'];
  const TITLES = ['', 'How do you measure?', 'For body fat.', 'Your daily targets.', 'Keep your log safe.'];
  const MACROS = [
    ['p', 'Protein'],
    ['c', 'Carbs'],
    ['f', 'Fat']
  ] as const;
  const SEXES = [
    ['male', 'Male'],
    ['female', 'Female']
  ] as const;
  const tint = (t: MTintName) => thumbStyle(MTINT[t]);

  let step = $state(0),
    dir = $state(1);
  let root: HTMLDivElement;
  let titleEl = $state<HTMLElement>();

  /* ---------- Answers ---------- */
  let units = $state<Units>({ ...start.units });
  const imperial = $derived(units.load === 'lb');
  function setUnit(k: keyof Units, v: string) {
    if (k === 'load') units.load = v as Units['load'];
    else units.dist = v as Units['dist'];
  }

  // The ruler shows a height from the start. It's kept once it's moved or a sex is picked; picking a sex first
  // glides it to that sex's average height
  const AVERAGE = { male: 176, female: 163 };
  let sex = $state<Sex | null>(start.sex);
  let heightCm = $state(start.heightCm ?? 170);
  let heightSet = $state(start.heightCm != null);
  function pickSex(v: Sex) {
    sex = sex === v ? null : v;
    if (sex && !heightSet) heightCm = AVERAGE[sex];
  }
  const keepHeight = $derived(!!sex || heightSet);

  let kcal = $state(start.goals.kcal);
  let grams = $state({ p: start.goals.p, c: start.goals.c, f: start.goals.f });
  let splitId = $state<SplitId | null>(nearestSplit(start.goals));
  let water = $state(start.goals.water);
  let steps = $state(start.goals.steps);
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
  const nudge = (v: number, d: number, by: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round((v + d * by) / by) * by));

  /* ---------- The button: what's next, and what it will save ---------- */
  const label = $derived(leaving ? 'LOG' : ACTION[step]!);
  const meta = $derived.by(() => {
    if (leaving) return '';
    if (step === 1) return `${units.load} · ${units.dist}`;
    if (step === 2) {
      const h = heightText(heightCm, imperial)!;
      if (sex) return `${sex === 'male' ? 'Male' : 'Female'} · ${h}`;
      return heightSet ? h : 'Leave for now';
    }
    if (step === 3) return `${nf(kcal)} kcal · ${grams.p} g protein`;
    if (step === SYNC) return account.user ? account.user.email : 'Without an account';
    return '';
  });

  const answers = (): SetupValues => ({
    sex,
    heightCm: keepHeight ? Math.round(heightCm * 10) / 10 : null,
    units: { ...units },
    goals: { kcal, ...grams, water, steps }
  });
  const finish = () => onfinish(answers());

  /* ---------- Moving between screens ---------- */
  // Leaving the welcome, its steps fly up into the header and become the progress
  let flying = $state(false);
  async function go(d: number) {
    if (step + d > STEPS.length) return finish();
    const from = step === 0 && d > 0 ? [...root.querySelectorAll<HTMLElement>('.tn-coming li')].map(e => e.getBoundingClientRect()) : null;
    flying = !!from;
    dir = Math.sign(d);
    step = Math.max(0, step + d);
    await tick();
    if (from && !REDUCE) flyUp(from);
    titleEl?.focus({ preventScroll: true });
  }
  function flyUp(from: DOMRect[]) {
    const easing = getComputedStyle(root).getPropertyValue('--spring-soft').trim() || 'ease-out';
    root.querySelectorAll<HTMLElement>('.tn-steps li').forEach((el, i) => {
      const a = from[i],
        b = el.getBoundingClientRect();
      if (!a) return;
      const dx = a.left + a.width / 2 - (b.left + b.width / 2),
        dy = a.top + a.height / 2 - (b.top + b.height / 2);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(1.15)`, opacity: 1 },
          { transform: 'none', opacity: 1 }
        ],
        {
          duration: 820,
          delay: i * 70,
          easing,
          fill: 'backwards'
        }
      );
    });
  }
  // The screen going leaves quickly the other way; the next one's parts arrive one after another (CSS)
  function leave(_: Element) {
    const d = dir;
    return {
      duration: REDUCE ? 0 : 220,
      easing: cubicIn,
      css: (t: number, u: number) => `opacity:${t};transform:translateX(${-u * 28 * d}px);filter:blur(${u * 6}px)`
    };
  }
</script>

<div class="tn" data-step={step} style="--aura:{step ? MTINT[STEPS[step - 1]!.tint][1] : 'var(--lime)'}" bind:this={root}>
  <div class="tn-aura" aria-hidden="true"></div>

  <header class="ob-top">
    {#if step > 0}
      <button type="button" class="ob-round press" aria-label="Back" onclick={() => go(-1)}
        ><span class="ic tn-back"><Icon name="chevDown" /></span></button
      >
    {:else}
      <span class="ob-round ghosted" aria-hidden="true"></span>
    {/if}
    <ol class="tn-steps" class:shown={step > 0} aria-label="Step {step} of {STEPS.length}">
      {#each STEPS as s, i (s.name)}
        {@const n = i + 1}
        <li class:now={step === n} class:done={step > n} style={tint(s.tint)}>
          <button
            type="button"
            class="press"
            disabled={step <= n}
            aria-current={step === n ? 'step' : undefined}
            aria-label={step > n ? `Back to ${s.name}` : s.name}
            onclick={() => go(n - step)}
          >
            {#key step > n}<span class="ic tn-ico"><Icon name={step > n ? 'check' : s.icon} /></span>{/key}
            <span class="tn-steps-name"><span>{s.name}</span></span>
          </button>
        </li>
      {/each}
    </ol>
    <div class="ob-top-acts">
      {#if onsignin && step === 0}<button type="button" class="ob-link press" onclick={onsignin}>Sign in</button>{/if}
      <!-- On the account's screen, the button is the way past it: Skip there would read as skipping the account -->
      <button type="button" class="ob-link press" class:gone={step === SYNC} inert={step === SYNC} onclick={onskip}>Skip</button>
    </div>
  </header>

  <div class="tn-stage">
    {#key step}
      <section class="tn-step" style="--dir:{dir}" out:leave aria-labelledby="tnTitle">
        {#if step === 0}
          <div class="tn-hello">
            <div class="tn-mark"><Mark size={96} still={REDUCE} /></div>
            <h1 class="tn-title enter" id="tnTitle" tabindex="-1" style="--d:760" bind:this={titleEl}>Let’s tune LogOut to you.</h1>
            <p class="tn-sub enter" style="--d:840">
              {SYNC > 0 ? 'Three quick things, then sync if you want it.' : 'Three quick things.'} Change any of them later.
            </p>
            <ul class="tn-coming" class:flown={flying}>
              {#each STEPS as s, i (s.name)}
                <li class="enter" style="--d:{960 + i * 80};{tint(s.tint)}"><span class="ic"><Icon name={s.icon} /></span>{s.name}</li>
              {/each}
            </ul>
          </div>
        {:else}
          <header class="tn-head">
            <h1 class="tn-title tn-in" id="tnTitle" tabindex="-1" style="--k:0" bind:this={titleEl}>
              {TITLES[step]}
            </h1>
            <p class="tn-sub tn-in" style="--k:1">
              {#if step === 1}
                Numbers typed without a unit, like <code><i class="tk-name">squat</i> <i class="tk-v">5x5 100</i></code> or
                <code><i class="tk-name">run</i> <i class="tk-v">5</i></code>, are read in these.
              {:else if step === 2}
                LogOut works it out from your sex and height. Leave them if you’d rather.
              {:else if step === 3}
                Drag round the ring. Food counts down from these.
              {:else}
                Sign in to back it up and have it on every device you use. It’s optional: without an account, it all stays on this one.
              {/if}
            </p>
          </header>

          {#if step === 1}
            <div class="tn-card tn-in" style="--k:2">
              <div class="tn-card-head">
                {@render head('weight', 'training', 'Weight', 'Lifts and body weight')}
                {@render seg('Weight in', 'load', ['kg', 'lb'])}
              </div>
              <Barbell unit={units.load} />
            </div>
            <div class="tn-card tn-in" style="--k:3">
              <div class="tn-card-head">
                {@render head('route', 'activity', 'Distance', 'Runs, rides and walks')}
                {@render seg('Distance in', 'dist', ['km', 'mi'])}
              </div>
              <Track unit={units.dist} />
            </div>
          {:else if step === 2}
            <div class="tn-card tn-in" style="--k:2">
              <div class="tn-card-head">
                {@render head('user', 'body', 'Sex', 'The formula differs')}
                <div class="su-seg tn-seg" role="radiogroup" aria-label="Sex">
                  {#each SEXES as [v, t] (v)}
                    <button type="button" role="radio" aria-checked={sex === v} onclick={() => pickSex(v)}>{t}</button>
                  {/each}
                </div>
              </div>
            </div>
            <div class="tn-card tn-in" style="--k:3">
              <div class="tn-card-head">
                {@render head('distance', 'body', 'Height', imperial ? 'Feet and inches' : 'Centimetres', 'upright')}
              </div>
              <div class="tn-height" class:kept={keepHeight} aria-hidden="true">
                {#if imperial}<b>{heightText(heightCm, true)}</b>{:else}<b>{Math.round(heightCm)}</b><small>cm</small>{/if}
              </div>
              <Ruler bind:value={heightCm} {imperial} label="Height" onpick={() => (heightSet = true)} />
            </div>
          {:else if step === 3}
            <div class="tn-card tn-cal tn-in" style="--k:2">
              <div class="tn-card-head">
                {@render head('flame', 'nutrition', 'Calories', 'And how they split')}
              </div>
              <Dial bind:kcal {split} />
              <div class="tn-splits" role="radiogroup" aria-label="Split">
                {#each SPLITS as s (s.id)}
                  <button type="button" class="press" role="radio" aria-checked={splitId === s.id} onclick={() => pickSplit(s.id)}
                    >{s.name}</button
                  >
                {/each}
              </div>
              <ul class="tn-macros">
                {#each MACROS as [k, name] (k)}
                  <li class="m-{k}"><i></i><b>{grams[k]} g</b><small>{name}</small></li>
                {/each}
              </ul>
            </div>
            <div class="tn-more tn-in" style="--k:3">
              {@render stepper(
                'drop',
                'hydration',
                'Water',
                litres(water),
                () => (water = nudge(water, -1, 0.25, 0.5, 8)),
                () => (water = nudge(water, 1, 0.25, 0.5, 8))
              )}
              {@render stepper(
                'foot',
                'activity',
                'Steps',
                nf(steps),
                () => (steps = nudge(steps, -1, 500, 1000, 40000)),
                () => (steps = nudge(steps, 1, 500, 1000, 40000))
              )}
            </div>
          {:else}
            <div class="tn-card tn-in" style="--k:2">
              <div class="tn-card-head">
                {@render head('cloud', 'sleep', 'Sync', 'Backed up, and on every device')}
              </div>
              <Devices state={account.user ? 'on' : account.step === 'email' ? 'off' : 'waiting'} />
            </div>
            <div class="tn-in tn-after" style="--k:3">
              <EmailCode beforeVerify={() => onkeep?.(answers()) ?? Promise.resolve()} />
            </div>
          {/if}
        {/if}
      </section>
    {/key}
  </div>

  <footer class="ob-cta">
    <button
      type="button"
      class="log"
      aria-label={label.charAt(0) + label.slice(1).toLowerCase() + (meta ? `: ${meta}` : '')}
      onclick={() => go(1)}
    >
      <span class="log-face">
        <span class="log-title"><span class="roll" use:roll={{ text: label, dir }}></span></span>
        <span class="log-meta" class:has-sum={!!meta}><span class="roll" use:roll={{ text: meta || ' ', dir }}></span></span>
      </span>
    </button>
  </footer>
</div>

{#snippet head(icon: IconName, t: MTintName, name: string, caption: string, cls = '')}
  <span class="thumb tn-thumb {cls}" style={tint(t)}><Icon name={icon} /></span>
  <span class="tn-card-name"><b>{name}</b><small>{caption}</small></span>
{/snippet}

{#snippet seg(label: string, k: keyof Units, opts: string[])}
  <div class="su-seg tn-seg" role="radiogroup" aria-label={label}>
    {#each opts as o (o)}
      <button type="button" role="radio" aria-checked={units[k] === o} onclick={() => setUnit(k, o)}>{o}</button>
    {/each}
  </div>
{/snippet}

{#snippet stepper(icon: IconName, t: MTintName, name: string, value: string, less: () => void, more: () => void)}
  <div class="tn-stepper">
    <span class="thumb tn-thumb" style={tint(t)}><Icon name={icon} /></span>
    <span class="tn-card-name"><small>{name}</small><b>{value}</b></span>
    <button type="button" class="step press" aria-label="Less {name.toLowerCase()}" onclick={less}
      ><span class="ic"><Icon name="minus" /></span></button
    >
    <button type="button" class="step press" aria-label="More {name.toLowerCase()}" onclick={more}
      ><span class="ic"><Icon name="plus" /></span></button
    >
  </div>
{/snippet}
