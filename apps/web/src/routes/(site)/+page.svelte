<script lang="ts">
  import { resolve } from '$app/paths';
  import { build, type Mode } from '@logout/engine';
  import Line from '#lib/site/Line.svelte';
  import Showcase from '#lib/site/Showcase.svelte';
  import { reveal } from '#lib/site/reveal.ts';

  const TITLE = ['Log', 'it', 'like', 'you’d', 'say', 'it.'];
  // Each word rises in on its own; the spaces between them still let the title wrap
  const GAP = ' ';
  // Lines that drift past in two rows, each read the way the app reads it: the day's food and check-ins, then training
  const ROWS: [Mode, string][][] = [
    [
      ['food', 'oats 80g /100g 380kcal 13p 67c 7f'],
      ['food', 'water 500ml'],
      ['food', 'chicken breast 200g 330kcal 62p 0c 7f'],
      ['food', 'weight 78.4kg'],
      ['food', '2 eggs per piece 72kcal 6p 0c 5f'],
      ['food', 'sleep 4/5, mood 3/5'],
      ['food', 'water 2 glasses @9am'],
      ['cardio', 'steps 9,400']
    ],
    [
      ['strength', 'squat 5x5 100kg @8'],
      ['cardio', 'easy run 8km 46:30 145bpm'],
      ['strength', 'pull-ups 4x8 +10kg'],
      ['cardio', 'ride 1h20m 32km 640kcal'],
      ['strength', 'bench 60x8, 70x6, 80x4'],
      ['cardio', 'track intervals 6x800m'],
      ['strength', 'deadlift 3x5 140kg @9'],
      ['strength', 'plank 3x60s']
    ]
  ];
  const read = (lines: [Mode, string][]) =>
    build(lines.map(([mode, text], i) => ({ id: `x${i}`, date: '2026-01-01', time: i, mode, text }))).entries;

  const STEPS: [string, string, string][] = [
    ['Type it', 'One line for a meal, a drink or a set, the way you’d say it.', 'oats 70g, banana 120g'],
    ['Watch it read', 'Each amount lights up as it’s understood, and the total shows before you log.', 'LOG +379 kcal'],
    ['See your day', 'Calories, macros and water left for today, with training and sleep beside them.', '2,221 kcal left']
  ];
  const FEATURES: { tag: string; title: string; body: string; shot: string; alt: string; w: number; h: number }[] = [
    {
      tag: 'Food',
      title: 'It knows the food.',
      body: 'Start typing a food and LogOut suggests matches from about 8,400 foods in the USDA and Indian food tables. Add an amount and the calories and macros follow. For anything else, give its values once and LogOut remembers them.',
      shot: '/shots/food.webp',
      alt: 'The composer with “oats 70g, banana 120g, paneer” typed: oats and banana show their calories, and paneer dishes from the Indian food tables are suggested',
      w: 1082,
      h: 1297
    },
    {
      tag: 'Your day',
      title: 'Your whole day in one list.',
      body: 'Meals, water, weight, steps, sleep and mood sit in one log, in the order they happened. Edit any line and the totals follow.',
      shot: '/shots/day.webp',
      alt: 'Today’s log: a sleep and energy check-in, breakfast with its calories and macros, two glasses of water and a step count',
      w: 966,
      h: 1045
    },
    {
      tag: 'Training',
      title: 'Training, too.',
      body: 'Lifts, runs and rides read the same way: sets, reps, load, distance and pace. Volume and readiness build up as you go.',
      shot: '/shots/training.webp',
      alt: 'Widgets for readiness at 71 percent, 5.1 tonnes of volume so far today, and last night’s sleep',
      w: 1082,
      h: 1150
    }
  ];
  const INSTALL: [string, string][] = [
    ['iPhone and iPad', 'Open LogOut in Safari, tap Share, then Add to Home Screen.'],
    ['Android', 'Open it in Chrome, tap the ⋮ menu, then Install app.'],
    ['Computer', 'In Chrome or Edge, click the install button at the right of the address bar.']
  ];
  const FAQ: [string, string][] = [
    ['Is it free?', 'Yes. No ads and no subscription.'],
    [
      'Do I need an account?',
      'No. Without one, everything stays on the device you’re using. Sign in with your email (a one-time code, no password) when you want your log on more than one device.'
    ],
    [
      'Which foods does it know?',
      'About 8,400: the USDA’s food tables, plus Indian dishes and ingredients from INDB and IFCT 2017. Start typing a name and it suggests matches, with values from the tables marked ≈. For anything else, packaged food included, type its values once, like “protein bar 1 220kcal 20p 25c 7f”, and it reads that name from then on.'
    ],
    [
      'Does it use AI?',
      'No. LogOut reads your lines with plain rules that run on your device. The same line always reads the same way, it’s instant, and nothing you type is sent to an AI service.'
    ],
    [
      'Can I get my data out?',
      'Yes. Export gives you your whole log as one file, any time, from the profile. Deleting your account removes everything stored with it.'
    ],
    [
      'Is it in the App Store or Google Play?',
      'Not for now. It installs from your browser instead and works like any app on your home screen, offline included.'
    ]
  ];
</script>

<svelte:head>
  <title>LogOut · a food and training log you type into</title>
  <meta
    name="description"
    content="Log meals, workouts and cardio the way you'd say it. LogOut reads every line as you type and adds up your day. Free, no account needed."
  />
  <meta property="og:title" content="LogOut · a food and training log you type into" />
  <meta
    property="og:description"
    content="Log meals, workouts and cardio the way you'd say it. LogOut reads every line as you type and adds up your day."
  />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://logout.fit/" />
  <meta property="og:image" content="https://logout.fit/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main>
  <section class="s-hero">
    <div class="s-aura" aria-hidden="true"></div>
    <p class="s-pill s-in" style="--d:0"><i></i>Food · Workouts · Cardio</p>
    <h1 class="s-title">
      {#each TITLE as w, i (i)}<span class="s-w" style="--d:{90 + i * 70}">{w}</span>{GAP}{/each}
    </h1>
    <p class="s-sub s-in" style="--d:520">Type what you eat, drink and lift in plain words. LogOut adds up your day.</p>
    <div class="s-ctas s-in" style="--d:620">
      <a class="s-cta" href={resolve('/app')} data-sveltekit-reload>Start logging</a>
    </div>
    <a class="s-quiet s-in" style="--d:680" href={resolve('/demo')} data-sveltekit-reload>or look around with sample data</a>
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

  <section class="s-sec" id="how" aria-labelledby="how-h">
    <header class="s-sec-head" use:reveal>
      <p class="s-eyebrow">How it works</p>
      <h2 id="how-h">One line at a time.</h2>
    </header>
    <ol class="s-steps">
      {#each STEPS as [title, body, eg], i (title)}
        <li use:reveal style="--d:{i * 90}">
          <span class="s-step-n">0{i + 1}</span>
          <h3>{title}</h3>
          <p>{body}</p>
          <code>{eg}</code>
        </li>
      {/each}
    </ol>
  </section>

  <section class="s-sec" aria-label="Features">
    {#each FEATURES as f, i (f.tag)}
      <article class="s-feat" class:flip={i % 2 === 1}>
        <div class="s-feat-text" use:reveal>
          <p class="s-eyebrow">{f.tag}</p>
          <h2>{f.title}</h2>
          <p>{f.body}</p>
        </div>
        <figure class="s-shot" use:reveal style="--d:120">
          <img src={f.shot} alt={f.alt} width={f.w} height={f.h} loading="lazy" decoding="async" />
        </figure>
      </article>
    {/each}
    <article class="s-feat wide">
      <div class="s-feat-text" use:reveal>
        <p class="s-eyebrow">On a computer</p>
        <h2>Everything at a glance.</h2>
        <p>On a wider screen, your log sits beside a board of every chart at once.</p>
      </div>
      <figure class="s-shot" use:reveal style="--d:120">
        <img
          src="/shots/board.webp"
          alt="LogOut on a desktop: the day’s log on the left, and a board of charts for readiness, calories, weight, sleep, exercise and steps"
          width="2880"
          height="1800"
          loading="lazy"
          decoding="async"
        />
      </figure>
    </article>
  </section>

  <section class="s-sec" id="install" aria-labelledby="install-h">
    <header class="s-sec-head" use:reveal>
      <p class="s-eyebrow">Get the app</p>
      <h2 id="install-h">On your phone and your computer.</h2>
      <p>LogOut runs in your browser and installs like an app, with its own icon. Nothing to download from a store.</p>
    </header>
    <ul class="s-install">
      {#each INSTALL as [where, how], i (where)}
        <li use:reveal style="--d:{i * 90}">
          <h3>{where}</h3>
          <p>{how}</p>
        </li>
      {/each}
    </ul>
    <p class="s-note" use:reveal>Sign in with your email to keep your devices in sync. It’s optional.</p>
  </section>

  <section class="s-sec" id="faq" aria-labelledby="faq-h">
    <header class="s-sec-head" use:reveal>
      <p class="s-eyebrow">FAQ</p>
      <h2 id="faq-h">Questions.</h2>
    </header>
    <div class="s-faq" use:reveal>
      {#each FAQ as [q, a] (q)}
        <details>
          <summary>{q}</summary>
          <p>{a}</p>
        </details>
      {/each}
    </div>
    <p class="s-note" use:reveal>Something else? Write to <a href="mailto:contact@logout.fit">contact@logout.fit</a>.</p>
  </section>

  <section class="s-end" use:reveal>
    <div class="s-end-glow" aria-hidden="true"></div>
    <h2>Start with one line.</h2>
    <div class="s-ctas center">
      <a class="s-cta" href={resolve('/app')} data-sveltekit-reload>Open LogOut</a>
    </div>
    <p class="s-end-sub">Free. No account needed.</p>
  </section>
</main>
