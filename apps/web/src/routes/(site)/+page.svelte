<script lang="ts">
  import { resolve } from '$app/paths';
  import { build, type Mode } from '@logout/engine';
  import Line from '#lib/site/Line.svelte';
  import Showcase from '#lib/site/Showcase.svelte';
  import { reveal } from '#lib/site/reveal.ts';
  import Icon from '#lib/ui/Icon.svelte';
  import type { IconName } from '#lib/ui/icons.ts';

  const TITLE = ['Log', 'it', 'like', 'you’d', 'say', 'it.'];
  // Each word rises in on its own; the spaces between them still let the title wrap
  const GAP = ' ';
  // Lines that drift past in two rows, each read the way the app reads it
  const ROWS: [Mode, string][][] = [
    [
      ['strength', 'squat 5x5 100kg @8'],
      ['food', 'chicken breast 200g 330kcal 62p 0c 7f'],
      ['cardio', 'easy run 8km 46:30 145bpm'],
      ['strength', 'pull-ups 4x8 +10kg'],
      ['food', 'sleep 4/5, mood 3/5'],
      ['cardio', 'ride 1h20m 32km 640kcal'],
      ['strength', 'bench 60x8, 70x6, 80x4']
    ],
    [
      ['food', 'oats 80g /100g 380kcal 13p 67c 7f'],
      ['cardio', 'track intervals 6x800m'],
      ['strength', 'deadlift 3x5 140kg @9'],
      ['food', 'weight 78.4kg'],
      ['cardio', 'steps 9,400'],
      ['food', '2 eggs per piece 72kcal 6p 0c 5f'],
      ['strength', 'plank 3x60s'],
      ['food', 'water 2 glasses @9am']
    ]
  ];
  const read = (lines: [Mode, string][]) =>
    build(lines.map(([mode, text], i) => ({ id: `x${i}`, date: '2026-01-01', time: i, mode, text }))).entries;
  const FACTS: [IconName, string][] = [
    ['bolt', 'Reads as you type'],
    ['download', 'Works offline'],
    ['cloud', 'Syncs across devices'],
    ['check', 'Free']
  ];
</script>

<svelte:head>
  <title>Logout · a fitness log you type into</title>
  <meta
    name="description"
    content="Log training and food the way you'd say it. Logout reads every line as you type, on your device, and adds up your day."
  />
  <meta property="og:title" content="Logout · a fitness log you type into" />
  <meta
    property="og:description"
    content="Log training and food the way you'd say it. Logout reads every line as you type, on your device."
  />
  <meta property="og:image" content="/icon-512.png" />
</svelte:head>

<main>
  <section class="s-hero">
    <div class="s-aura" aria-hidden="true"></div>
    <p class="s-pill s-in" style="--d:0"><i></i>Strength · Cardio · Food</p>
    <h1 class="s-title">
      {#each TITLE as w, i (i)}<span class="s-w" style="--d:{90 + i * 70}">{w}</span>{GAP}{/each}
    </h1>
    <p class="s-sub s-in" style="--d:520">Type your training and meals in plain words. Logout adds up your day.</p>
    <div class="s-ctas s-in" style="--d:620">
      <a class="s-cta" href={resolve('/app')} data-sveltekit-reload>Start logging</a>
      <a class="s-cta alt" href={resolve('/demo')} data-sveltekit-reload>Try the demo</a>
    </div>
    <div class="s-stage s-in" style="--d:760">
      <Showcase />
    </div>
    <p class="s-hint s-in" style="--d:1400"><i></i>Tap it and type your own</p>
  </section>

  <section class="s-reads" id="reads" aria-labelledby="reads-h">
    <h2 id="reads-h" use:reveal>Write it however you’d say it.</h2>
    <div class="s-rows" use:reveal style="--d:120">
      {#each ROWS as lines, r (r)}
        {@const entries = read(lines)}
        <div class="s-row" class:rev={r % 2 === 1}>
          {#each [0, 1] as copy (copy)}
            <ul aria-hidden={copy === 1 ? 'true' : undefined}>
              {#each entries as e (e.id)}<Line text={e.text} res={e.res} />{/each}
            </ul>
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <section class="s-end" use:reveal>
    <div class="s-end-glow" aria-hidden="true"></div>
    <h2>Start with one line.</h2>
    <div class="s-ctas center">
      <a class="s-cta" href={resolve('/app')} data-sveltekit-reload>Open Logout</a>
    </div>
    <ul class="s-facts">
      {#each FACTS as [icon, label] (label)}
        <li><span class="ic"><Icon name={icon} /></span>{label}</li>
      {/each}
    </ul>
  </section>
</main>
