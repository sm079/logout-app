<!--
  First line: the reading comes first. The logo puts itself together, then LogOut types a line of its own and shows
  what it read, piece by piece, as it goes. The person changes it or types their own, and LOG (which keeps nothing
  here) adds it up. Then the few choices that matter on day one: what bare numbers are in, and what to start with.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { backOut, cubicOut } from 'svelte/easing';
  import { preview as read, readout, type Mode, type Units } from '@logout/engine';
  import type { Sex } from '../data/types.ts';
  import { MODE_ORDER, MODES } from '../dock/modes.ts';
  import { sumParts } from '../logic/format.ts';
  import { markup } from '../logic/markup.ts';
  import Icon from '../ui/Icon.svelte';
  import { REDUCE, replay, roll } from '../ui/motion.ts';
  import { placeReadouts } from '../ui/readouts.ts';
  import type { FlowProps } from './flows.ts';
  import Mark from './Mark.svelte';
  import { EXPECTED, piecesOf } from './reading.ts';
  import StartChoice from './StartChoice.svelte';
  import { play, run, typeOut, type Run } from './timeline.ts';

  let { values, onfinish, onskip, onsignin }: FlowProps = $props();
  const start = untrack(() => values);

  // The lines it offers, in the units it guessed
  const imperial = start.units.load === 'lb';
  const EXAMPLES: { mode: Mode; text: string }[] = [
    { mode: 'strength', text: imperial ? 'bench press 3x8 135lb' : 'bench press 3x8 60kg' },
    { mode: 'cardio', text: imperial ? 'easy run 3mi 28:00' : 'easy run 5km 28:00' },
    { mode: 'food', text: 'oats 80g 300kcal 10p 54c 6f' }
  ];
  const WORD = 'LogOut';
  const PART: Record<string, string> = {
    kcal: 'Calories',
    sets: 'Sets',
    vol: 'Volume',
    dist: 'Distance',
    time: 'Time',
    steps: 'Steps',
    water: 'Water'
  };
  const TAG = ['Log', 'it', 'like', 'you’d', 'say', 'it.'];
  // Each word rises in on its own; the spaces between them still let the line wrap
  const GAP = ' ';

  let beat = $state<'hello' | 'try' | 'yours'>('hello');

  /* ---------- Trying a line ---------- */
  let mode = $state<Mode>('strength');
  let dir = $state(1);
  let text = $state('');
  let auto = $state(false),
    handed = $state(false),
    focused = $state(false);
  let busy = $state(false),
    done = $state(false),
    clearing = $state(false);
  let logged = $state.raw<[string, string][] | null>(null);
  const title = $derived(logged ? 'That’s logging.' : 'Type what you did.');
  let units = $state<Units>({ ...start.units });

  const draft = $derived(text.trim() ? read(null, text, mode, units) : null);
  const pieces = $derived(draft ? draft.res.flatMap((r, i) => piecesOf(r.line, i)) : []);
  let lastSum = $state('');
  const sum = $derived.by(() => {
    if (!draft) return '';
    const p = sumParts(draft.sum, units);
    const s = p
      .slice(0, 2)
      .map(x => x[1])
      .join(' · ');
    return s && p[0]![0] === 'kcal' ? '+' + s : s;
  });
  $effect(() => {
    if (sum) lastSum = sum;
  });

  let composer = $state<HTMLDivElement>(),
    field = $state<HTMLDivElement>(),
    mirror = $state<HTMLDivElement>(),
    ghost = $state<HTMLDivElement>(),
    ta = $state<HTMLTextAreaElement>(),
    seg = $state<HTMLDivElement>(),
    segInd = $state<HTMLSpanElement>();

  // The mirror is drawn by hand, as in the app's composer; while LogOut types it draws its own caret
  function draw() {
    if (!mirror || !field || !ta) return;
    const html = markup(text, draft ? draft.res : [], { readouts: true });
    // eslint-disable-next-line svelte/no-dom-manipulating
    mirror.innerHTML = `${html}${auto ? '<span class="ob-caret"></span>' : ''}\u200b`;
    placeReadouts(mirror);
    field.style.height = `${Math.max(42, Math.min(mirror.offsetHeight, 128))}px`;
    ta.scrollTop = 0;
  }
  $effect(() => {
    void draft;
    void auto;
    void mirror;
    untrack(draw);
  });

  function placeInd() {
    const b = seg?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!b || !segInd) return;
    segInd.style.width = `${b.offsetWidth}px`;
    segInd.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  async function setMode(m: Mode) {
    if (m === mode) return;
    dir = MODE_ORDER.indexOf(m) > MODE_ORDER.indexOf(mode) ? 1 : -1;
    mode = m;
    await tick();
    replay(seg?.querySelector('[aria-pressed="true"]'), 'bounce');
    placeInd();
    replay(ghost, 'swap');
  }

  // LogOut types a line, then the field is theirs
  let r: Run = run();
  function type(line: { mode: Mode; text: string }, pace = 1, first = false) {
    r.stop();
    r = play(run(), async r => {
      if (first) await r.wait(REDUCE ? 0 : 650);
      await setMode(line.mode);
      if (text) {
        clearing = true;
        await r.wait(REDUCE ? 0 : 220);
        clearing = false;
      }
      text = '';
      auto = true;
      await r.wait(REDUCE ? 0 : 260);
      await typeOut(r, line.text, s => (text = s), 0, pace);
      auto = false;
      handed = true;
    });
  }
  function takeOver() {
    if (!auto) return;
    r.stop();
    auto = false;
    handed = true;
  }

  // The last text typed, for guessing units from it
  let lineText = '';
  $effect(() => {
    if (text.trim()) lineText = text;
  });
  async function doLog() {
    if (busy) return;
    if (!text.trim()) {
      replay(composer, 'shake');
      replay(ghost, 'nudge');
      return;
    }
    takeOver();
    busy = true;
    const parts = sumParts(draft!.sum, units);
    const sent = text;
    await new Promise(res => setTimeout(res, REDUCE ? 0 : 650));
    done = true;
    clearing = text === sent;
    await new Promise(res => setTimeout(res, REDUCE ? 0 : 240));
    if (text === sent) text = '';
    clearing = false;
    logged = parts.length ? parts.slice(0, 4) : [['entry', '1 entry']];
    // Units typed in the line say which ones they think in
    const said = (re: RegExp) => re.test(lineText);
    if (said(/\d\s*(?:lbs?|pounds?)\b/i)) units.load = 'lb';
    else if (said(/\d\s*(?:kgs?|kilos?)\b/i)) units.load = 'kg';
    if (said(/\d\s*(?:mi|miles?)\b/i)) units.dist = 'mi';
    else if (said(/\d\s*(?:km|kms)\b/i)) units.dist = 'km';
    setTimeout(() => (beat = 'yours'), REDUCE ? 900 : 1900);
  }

  /* ---------- Making it yours ---------- */
  let sample = $state(start.sample);
  let sex = $state<Sex | null>(start.sex);
  let heightCm = $state<number | null>(start.heightCm);
  let about = $state(!!(start.sex || start.heightCm));
  let badHeight = $state(false);
  let startBtn = $state<HTMLButtonElement>();
  const UNIT_LINES: { mode: Mode; text: string; key: keyof Units; icon: 'weight' | 'distance'; name: string; opts: string[] }[] = [
    { mode: 'strength', text: 'squat 5x5 100', key: 'load', icon: 'weight', name: 'Weight', opts: ['kg', 'lb'] },
    { mode: 'cardio', text: 'run 5', key: 'dist', icon: 'distance', name: 'Distance', opts: ['km', 'mi'] }
  ];
  function setUnit(k: keyof Units, v: string) {
    if (k === 'load') units.load = v as Units['load'];
    else units.dist = v as Units['dist'];
  }
  const feet = $derived(heightCm == null ? null : Math.floor(Math.round(heightCm / 2.54) / 12));
  const inches = $derived(heightCm == null ? null : Math.round(heightCm / 2.54) % 12);
  const num = (v: string) => (v.trim() && Number.isFinite(+v) && +v > 0 ? +v : null);
  function setFtIn(ft: number | null, inch: number | null) {
    heightCm = ft == null && inch == null ? null : ((ft || 0) * 12 + (inch || 0)) * 2.54;
    badHeight = false;
  }
  function finish() {
    badHeight = heightCm != null && (heightCm < 100 || heightCm > 250);
    if (badHeight) {
      about = true;
      replay(startBtn, 'shake');
      return;
    }
    onfinish({
      sex,
      heightCm: heightCm && Math.round(heightCm * 10) / 10,
      units: { ...units },
      goals: start.goals,
      sample
    });
  }

  /* ---------- Beats ---------- */
  let helloT: ReturnType<typeof setTimeout> | undefined;
  async function toTry() {
    if (beat !== 'hello') return;
    clearTimeout(helloT);
    beat = 'try';
    await tick();
    placeInd();
    type(EXAMPLES[0]!, 1, true);
  }

  onMount(() => {
    helloT = setTimeout(toTry, REDUCE ? 900 : 3000);
    const resize = () => {
      placeInd();
      draw();
    };
    addEventListener('resize', resize);
    document.fonts?.ready.then(resize);
    return () => {
      r.stop();
      clearTimeout(helloT);
      removeEventListener('resize', resize);
    };
  });

  // A chip arrives with a little overshoot
  function pop(_: Element) {
    return {
      duration: REDUCE ? 0 : 480,
      easing: backOut,
      css: (t: number) =>
        `opacity:${Math.min(1, t * 1.6)};transform:translateY(${(1 - t) * 8}px) scale(${0.7 + 0.3 * t});filter:blur(${Math.max(0, 1 - t) * 3}px)`
    };
  }
  function lift(_: Element) {
    return { duration: REDUCE ? 0 : 160, css: (t: number) => `opacity:${t};transform:scale(${0.9 + 0.1 * t})` };
  }
</script>

<div class="fl" class:hello={beat === 'hello'} data-beat={beat}>
  <header class="ob-top">
    <div class="ob-dots" aria-hidden="true">
      <i class:on={beat === 'try'}></i><i class:on={beat === 'yours'}></i>
    </div>
    <div class="ob-top-acts">
      {#if onsignin}<button type="button" class="ob-link press" onclick={onsignin}>Sign in</button>{/if}
      <button type="button" class="ob-link press" onclick={onskip}>Skip</button>
    </div>
  </header>

  <div class="fl-hero">
    <div class="fl-lockup">
      <Mark size={34} still={REDUCE} />
      <span class="fl-word" aria-label={WORD}>
        {#each WORD as ch, i (i)}<span style="--i:{i}" aria-hidden="true">{ch}</span>{/each}
      </span>
    </div>
    <p class="fl-tag">
      {#each TAG as w, i (i)}<span style="--i:{i}">{w}</span>{GAP}{/each}
    </p>
  </div>

  {#if beat === 'hello'}
    <button type="button" class="fl-continue" aria-label="Continue" onclick={toTry}></button>
  {:else if beat === 'try'}
    <section class="fl-stage fl-try" aria-labelledby="flTitle">
      <h1 class="fl-title enter" id="flTitle" style="--d:60">
        <span class="vh">{title}</span><span class="roll" aria-hidden="true" use:roll={{ text: title }}></span>
      </h1>
      <p class="fl-sub enter" style="--d:120">
        <span
          class="roll"
          use:roll={{
            text: logged
              ? 'One line, any time. Your day adds up.'
              : handed
                ? 'Change it, or try another. Nothing here is kept.'
                : 'LogOut reads each word as you type.'
          }}
        ></span>
      </p>

      <div class="fl-read enter" class:logged={!!logged} style="--d:180" aria-live="polite">
        <div class="fl-read-head">
          <span>{logged ? 'Today so far' : 'Read as'}</span>
          {#if logged}<span class="fl-ok"><Icon name="check" />Logged</span>{/if}
        </div>
        <div class="fl-chips">
          {#if logged}
            {#each logged as [k, v], i (k)}
              <span class="fl-chip big" style="--k:{i}" in:pop><small>{PART[k] ?? 'Logged'}</small><b>{v}</b></span>
            {/each}
          {:else if pieces.length}
            {#each pieces as p (p.key)}
              <span class="fl-chip" animate:flip={{ duration: REDUCE ? 0 : 420, easing: cubicOut }} in:pop out:lift
                ><small>{p.label}</small><b class={p.cls}>{p.text}</b></span
              >
            {/each}
          {:else}
            {#each EXPECTED[mode] as label (mode + label)}
              <span class="fl-chip empty" in:pop><small>{label}</small><b>&nbsp;</b></span>
            {/each}
          {/if}
        </div>
      </div>

      {#if !logged}
        <div class="fl-examples" role="group" aria-label="Examples">
          {#each EXAMPLES as ex, i (ex.text)}
            <button type="button" class="fl-ex press enter" style="--d:{260 + i * 60}" onclick={() => type(ex, 0.55)}>
              <span class="ic"><Icon name={MODES[ex.mode].icon} /></span><span>{ex.text}</span>
            </button>
          {/each}
        </div>
      {/if}
    </section>
  {:else if beat === 'yours'}
    <section class="fl-stage fl-yours" aria-labelledby="flTitle2">
      <h1 class="fl-title enter" id="flTitle2" style="--d:40">Make it yours.</h1>
      <p class="fl-sub enter" style="--d:100">All of it lives in your profile, to change any time.</p>

      <div class="ob-card enter" style="--d:160">
        <span class="ob-label">Numbers on their own</span>
        {#each UNIT_LINES as u (u.key)}
          {@const res = read(null, u.text, u.mode, units).res}
          <div class="fl-unit">
            <span class="thumb" style="--tc:#2f3034;--ti:#eeeef0"><Icon name={u.icon} /></span>
            <span class="fl-unit-text">
              <span class="fl-unit-name">{u.name}</span>
              <code class="fl-unit-line"
                >{@html markup(u.text, res)}<i>→</i><span class="roll" use:roll={{ text: readout(res[0]!) }}></span></code
              >
            </span>
            <div class="su-seg" role="radiogroup" aria-label="{u.name} in">
              {#each u.opts as o (o)}
                <button type="button" role="radio" aria-checked={units[u.key] === o} onclick={() => setUnit(u.key, o)}>{o}</button>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <span class="ob-label out enter" style="--d:230">Start with</span>
      <div class="enter" style="--d:260"><StartChoice bind:sample /></div>

      <div class="ob-card fl-about enter" class:open={about} style="--d:320">
        <button type="button" class="fl-about-head" aria-expanded={about} onclick={() => (about = !about)}>
          <span><b>About you</b><small>Body fat needs both · optional</small></span>
          <span class="ic fl-chev"><Icon name="chevDown" /></span>
        </button>
        {#if about}
          <div class="fl-about-body">
            <div class="su-seg" role="radiogroup" aria-label="Sex">
              {#each [['male', 'Male'], ['female', 'Female']] as [v, t] (v)}
                <button type="button" role="radio" aria-checked={sex === v} onclick={() => (sex = sex === v ? null : (v as Sex))}
                  >{t}</button
                >
              {/each}
            </div>
            <span class="su-num" role="group" aria-label="Height">
              {#if units.load === 'lb'}
                <input
                  type="number"
                  inputmode="numeric"
                  class="short"
                  placeholder="–"
                  aria-label="Feet"
                  aria-invalid={badHeight}
                  value={feet ?? ''}
                  oninput={e => setFtIn(num(e.currentTarget.value), inches)}
                /><small>ft</small>
                <input
                  type="number"
                  inputmode="numeric"
                  class="short"
                  placeholder="–"
                  aria-label="Inches"
                  aria-invalid={badHeight}
                  value={inches ?? ''}
                  oninput={e => setFtIn(feet, num(e.currentTarget.value))}
                /><small>in</small>
              {:else}
                <input
                  type="number"
                  inputmode="numeric"
                  placeholder="–"
                  aria-label="Height in centimetres"
                  aria-invalid={badHeight}
                  value={heightCm == null ? '' : Math.round(heightCm)}
                  oninput={e => {
                    heightCm = num(e.currentTarget.value);
                    badHeight = false;
                  }}
                /><small>cm</small>
              {/if}
            </span>
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <footer class="fl-dock" class:shown={beat !== 'hello'}>
    {#if beat !== 'yours'}
      <div class="dock fl-dock-in" out:lift>
        <div class="composer" bind:this={composer}>
          <div class="field" class:has-text={!!text} class:focused class:clearing bind:this={field}>
            <label for="obEntry" class="vh">What you did, as you'd say it</label>
            <div class="ghost" bind:this={ghost} aria-hidden="true">
              <span>{MODES[mode].placeholders[0]}</span><span class="gcaret"></span>
            </div>
            <div class="mirror" bind:this={mirror} aria-hidden="true"></div>
            <textarea
              id="obEntry"
              rows="1"
              spellcheck="false"
              autocomplete="off"
              maxlength="600"
              tabindex={beat === 'try' ? 0 : -1}
              bind:this={ta}
              bind:value={text}
              onpointerdown={takeOver}
              onfocus={() => {
                takeOver();
                focused = true;
              }}
              onblur={() => (focused = false)}
              oninput={takeOver}
              onkeydown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void doLog();
                }
              }}></textarea>
          </div>
        </div>
        <div class="actions">
          <div class="seg" bind:this={seg} role="group" aria-label="What you're logging">
            <span class="seg-ind" bind:this={segInd}></span>
            {#each MODE_ORDER as m (m)}
              <button
                type="button"
                class="seg-btn press"
                aria-pressed={mode === m}
                tabindex={beat === 'try' ? 0 : -1}
                onclick={() => {
                  takeOver();
                  void setMode(m);
                }}><span class="ic"><Icon name={MODES[m].icon} /></span><span>{MODES[m].label}</span></button
              >
            {/each}
          </div>
          <button
            type="button"
            class="log"
            class:busy
            class:done
            class:ob-beckon={handed && !!text.trim() && !busy}
            tabindex={beat === 'try' ? 0 : -1}
            aria-label={sum ? `Log it: ${sum}` : 'Log'}
            onclick={doLog}
          >
            <span class="log-fill"></span>
            <span class="log-face">
              <span class="log-title">LOG</span>
              <span class="log-meta" class:has-sum={!!sum}><span class="roll log-sum" use:roll={{ text: sum || lastSum, dir }}></span></span
              >
            </span>
            <span class="log-done" aria-hidden="true"><span class="ic"><Icon name="check" /></span>LOGGED</span>
          </button>
        </div>
      </div>
    {:else}
      <div class="ob-cta" in:pop>
        <button type="button" class="log" aria-label="Start" bind:this={startBtn} onclick={finish}>
          <span class="log-face"><span class="log-title">START</span></span>
        </button>
      </div>
    {/if}
  </footer>
</div>
