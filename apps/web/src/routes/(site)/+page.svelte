<script lang="ts">
  import { resolve } from '$app/paths';
  import { build, type Mode } from '@logout/engine';
  import Line from '#lib/site/Line.svelte';
  import TryIt from '#lib/site/TryIt.svelte';

  const GROUPS = [
    {
      name: 'Strength',
      note: 'Sets × reps and a load, effort as @8 or 2 rir. A line without a name carries on the lift before it.',
      lines: ['squat 5x5 100kg @8', 'bench 60x8, 70x6, 80x4', 'pull-ups 4x8 +10kg', 'plank 3x60s']
    },
    {
      name: 'Cardio',
      note: 'Distance and time give your pace; intervals, heart rate and energy read too. Steps on their own are the day’s total.',
      lines: ['easy run 8km 46:30 145bpm', 'track intervals 6x800m', 'ride 1h20m 32km 640kcal', 'steps 9,400']
    },
    {
      name: 'Food',
      note: 'State a food’s values once, for any amount or per 100g. After that its name and an amount are enough.',
      lines: ['chicken breast 200g 330kcal 62p 0c 7f', 'oats 80g /100g 380kcal 13p 67c 7f', 'oats 50g', '2 eggs per piece 72kcal 6p 0c 5f']
    },
    {
      name: 'Any mode',
      note: 'Check-ins out of five, body measurements and a time of day work wherever you type them.',
      lines: ['sleep 4/5, mood 3/5', 'weight 78.4kg', 'waist 84cm, neck 38cm', 'water 2 glasses @9am']
    }
  ] as const;
  const MODE: Record<string, Mode> = { Strength: 'strength', Cardio: 'cardio', Food: 'food', 'Any mode': 'food' };
  // Each group is read as a short log, oldest line first, so a food named after its values were stated uses them
  const read = (name: string, lines: readonly string[]) =>
    build(lines.map((text, i) => ({ id: `x${i}`, date: '2026-01-01', time: i, mode: MODE[name]!, text }))).entries;
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
    <div class="s-hero-copy">
      <p class="s-kicker">Strength · Cardio · Food</p>
      <h1>Log your training the way you’d say it.</h1>
      <p class="s-lede">
        Type <code>bench press 3x8 60kg @8</code> or <code>oats 80g</code>. Logout reads every line as you type, shows how it read it, and
        adds up your day. No forms, no questions, no menus to tap through.
      </p>
      <div class="s-ctas">
        <a class="s-cta" href={resolve('/app')} data-sveltekit-reload>Start your log</a>
        <a class="s-cta alt" href={resolve('/demo')} data-sveltekit-reload>See it with 7 years of data</a>
      </div>
      <p class="s-small">Free. Works offline. Your log stays on your device unless you sign in to sync it.</p>
    </div>
    <div class="s-hero-try">
      <TryIt />
      <p class="s-small center">This is the real reader, running in your browser. Try your own lines.</p>
    </div>
  </section>

  <section class="s-points" aria-label="How it works">
    <article>
      <h2>Text is the record</h2>
      <p>
        Only what you type is kept, exactly as you typed it. Every number is worked out from your words, so correcting one line corrects
        everything that depends on it.
      </p>
    </article>
    <article>
      <h2>Read, not asked</h2>
      <p>
        Fixed rules read each line. Colour shows how a line was read and its result sits at the end before you log it, so a typo shows up as
        you make it.
      </p>
    </article>
    <article>
      <h2>Yours, on your device</h2>
      <p>
        All the reading happens in your browser and it works offline. Sync keeps your text on your other devices; the server stores it and
        never reads it.
      </p>
    </article>
  </section>

  <section class="s-grammar" aria-labelledby="grammar">
    <h2 id="grammar">Write it the way you would anyway</h2>
    <div class="s-groups">
      {#each GROUPS as g (g.name)}
        <div class="s-group">
          <h3>{g.name}</h3>
          <p>{g.note}</p>
          <ul>
            {#each read(g.name, g.lines) as e (e.id)}<Line text={e.text} res={e.res} />{/each}
          </ul>
        </div>
      {/each}
    </div>
  </section>

  <section class="s-close">
    <h2>Your day, added up as you type</h2>
    <p>
      Recovery from your training, calories and macros against your goals, volume, distance, sleep and weight over any day, week, month or
      year.
    </p>
    <div class="s-ctas center">
      <a class="s-cta" href={resolve('/app')} data-sveltekit-reload>Start your log</a>
      <a class="s-cta alt" href={resolve('/demo')} data-sveltekit-reload>Open the demo</a>
    </div>
  </section>
</main>
