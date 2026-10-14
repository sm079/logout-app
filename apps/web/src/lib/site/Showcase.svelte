<!--
  The landing page's phone: the bottom of the app's screen. It types on its own, the real reader colouring each line
  and the switch following what it reads, until a visitor taps it; then it's theirs to type in. Nothing is kept: LOG
  clears the field. Its own typing runs only while it's in view, starts again after the visitor leaves it empty for a
  while, and with reduced motion holds one typed line.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { clock, detect, preview, type Mode, type Sum } from '@logout/engine';
  import { GOALS } from '../data/types.ts';
  import { DEFAULT_MODE, MODE_ORDER, MODES, type DayKey } from '../dock/modes.ts';
  import { distFmt, nf, sumParts, volFmt } from '../logic/format.ts';
  import { esc, markup } from '../logic/markup.ts';
  import { TINTS } from '../logic/palette.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { REDUCE, replay, roll } from '../ui/motion.ts';
  import { placeReadouts } from '../ui/readouts.ts';

  // What it types, in turn. `take` is how much of the name is typed before its completion is taken
  const SCRIPT: { text: string; take?: number }[] = [
    { text: 'chicken breast 200g 330kcal 62p', take: 5 },
    { text: 'water 500ml' },
    { text: 'squat 5x5 100kg @8' },
    { text: 'easy run 8km 46:30 145bpm', take: 4 }
  ];
  const UNITS = { load: 'kg', dist: 'km' } as const;
  // How long the field sits empty after the visitor leaves it before it types on its own again
  const RESUME = 8000;

  // The day so far is only ever what's in the field
  function dayOf(s: Sum | undefined): Record<DayKey, number> {
    return {
      lifts: s?.lifts ?? 0,
      sets: s?.sets ?? 0,
      volume: s?.volume ?? 0,
      time: s?.cardioS ?? 0,
      dist: s?.distM ?? 0,
      steps: s?.steps ?? 0,
      kcal: s?.kcal ?? 0,
      p: s?.p ?? 0,
      c: s?.c ?? 0,
      f: s?.f ?? 0
    };
  }
  // Worded as the app words it
  function show(k: DayKey, n: number): string {
    if (k === 'kcal' || k === 'p' || k === 'c' || k === 'f') {
      const goal = GOALS[k],
        g = k === 'kcal' ? '' : ' g';
      return n <= goal ? `${nf(goal - n)}${g} left` : `${nf(n - goal)}${g} over`;
    }
    if (k === 'volume') return volFmt(n).join(' ');
    if (k === 'time') return n ? clock(n) : '0:00';
    if (k === 'dist') return distFmt(n);
    if (k === 'steps') return n ? nf(n) : '—';
    return nf(n);
  }

  let mode = $state<Mode>(DEFAULT_MODE);
  /** The visitor picked a mode: it holds until LOG */
  let picked = false;
  let dir = $state(1);
  let text = $state('');
  let completion = $state('');
  let auto = $state(true),
    focused = $state(false),
    typing = $state(false),
    clearing = $state(false);
  let pressed = $state(false),
    busy = $state(false),
    done = $state(false);

  let device: HTMLElement, phone: HTMLDivElement;
  let screen: HTMLDivElement, composer: HTMLDivElement, field: HTMLDivElement, mirror: HTMLDivElement, ghost: HTMLDivElement;
  let ta: HTMLTextAreaElement, seg: HTMLDivElement, segInd: HTMLSpanElement;
  const icos: HTMLSpanElement[] = $state([]);

  const draft = $derived(text.trim() ? preview(null, text, mode, UNITS) : null);
  const now = $derived(dayOf(draft?.sum));
  const row = $derived(MODES[mode].day);
  const ring = $derived(focused || (auto && (!!text || typing || busy)));
  let lastSum = $state('');
  const sum = $derived.by(() => {
    if (!draft) return '';
    const p = sumParts(draft.sum, UNITS);
    const s = p
      .slice(0, 2)
      .map(x => x[1])
      .join(' · ');
    return s && p[0]![0] === 'kcal' ? '+' + s : s;
  });
  $effect(() => {
    if (sum) lastSum = sum;
  });

  // The mirror is drawn by hand, as in the app's composer. While it types on its own it draws its own caret
  function draw() {
    if (!mirror) return;
    const html = markup(text, draft ? draft.res : [], { readouts: true, hide: completion ? 0 : -1 });
    const caret = auto ? '<span class="s-caret"></span>' : '';
    const cmp = completion ? `<span class="cmp">${esc(completion)}</span>` : '';
    // eslint-disable-next-line svelte/no-dom-manipulating
    mirror.innerHTML = `${html}${caret}${cmp}\u200b`;
    placeReadouts(mirror);
    field.style.height = `${Math.max(42, mirror.offsetHeight)}px`;
    ta.scrollTop = 0;
  }
  $effect(() => {
    void draft;
    void completion;
    void auto;
    draw();
  });

  function placeInd() {
    const b = seg?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!b) return;
    segInd.style.width = `${b.offsetWidth}px`;
    segInd.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  async function setMode(m: Mode) {
    if (m === mode) return;
    dir = MODE_ORDER.indexOf(m) > MODE_ORDER.indexOf(mode) ? 1 : -1;
    mode = m;
    await tick();
    replay(seg.querySelector('[aria-pressed="true"]'), 'bounce');
    placeInd();
    icos.forEach((el, i) => {
      if (!el) return;
      el.style.animationDelay = `${i * 40}ms`;
      replay(el, 'swap');
    });
    replay(ghost, 'swap');
  }
  // As in the app, the mode follows what's typed unless the visitor picked one
  $effect(() => {
    const m = detect(null, text, UNITS) ?? DEFAULT_MODE;
    if (!picked) void setMode(m);
  });

  // LOG keeps nothing: the field lifts away and the phone is as it was
  let resetT: ReturnType<typeof setTimeout> | undefined;
  async function doLog() {
    if (busy) return;
    if (!text.trim()) {
      replay(composer, 'shake');
      replay(ghost, 'nudge');
      return;
    }
    busy = true;
    done = false;
    clearTimeout(resetT);
    const logged = text;
    await new Promise(r => setTimeout(r, REDUCE ? 0 : 650));
    done = true;
    // Unless the visitor has started a line of their own meanwhile
    clearing = text === logged;
    await new Promise(r => setTimeout(r, REDUCE ? 0 : 240));
    if (text === logged) {
      picked = false;
      text = '';
    }
    clearing = false;
    resetT = setTimeout(() => (busy = done = false), REDUCE ? 600 : 1200);
  }

  /* ---------- Typing on its own ---------- */
  const STOP = Symbol('stop');
  let run: { stopped: boolean } = { stopped: true };
  let alive = true,
    seen = false;
  let waiting: (() => void)[] = [];
  const wake = () => {
    for (const w of waiting) w();
    waiting = [];
  };
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  // A pause that holds while the phone is out of view, and ends the typing once the visitor takes over
  async function wait(r: typeof run, ms: number) {
    await new Promise(res => setTimeout(res, ms));
    while (alive && !r.stopped && !seen) await new Promise<void>(res => waiting.push(res));
    if (!alive || r.stopped) throw STOP;
  }

  async function type(r: typeof run, line: (typeof SCRIPT)[number]) {
    typing = true;
    const full = line.text;
    const nameEnd = /^\D+?(?=\s\d)/.exec(full)?.[0].length ?? 0;
    let i = 0;
    while (i < full.length) {
      if (line.take && i === line.take) {
        completion = full.slice(i, nameEnd);
        await wait(r, 560);
        text = full.slice(0, nameEnd);
        completion = '';
        i = nameEnd;
        await wait(r, rand(160, 260));
        continue;
      }
      text = full.slice(0, ++i);
      await wait(r, full[i - 1] === ' ' ? rand(110, 190) : rand(42, 96));
    }
    typing = false;
  }

  async function script(r: typeof run) {
    await wait(r, 1200);
    for (;;) {
      for (const line of SCRIPT) {
        await type(r, line);
        await wait(r, 900);
        pressed = true;
        await wait(r, 130);
        pressed = false;
        void doLog();
        await wait(r, 1700);
      }
      await wait(r, 2000);
    }
  }
  function start() {
    run.stopped = true;
    run = { stopped: false };
    auto = true;
    picked = false;
    void setMode(DEFAULT_MODE);
    script(run).catch(e => {
      if (e !== STOP) throw e;
    });
  }
  // The visitor's turn: it stops typing, and unless they're logging what it typed, the field is theirs
  let resumeT: ReturnType<typeof setTimeout> | undefined;
  function takeOver(keep = false) {
    if (auto) {
      run.stopped = true;
      wake();
      auto = typing = pressed = false;
      if (completion) text += completion;
      completion = '';
      if (!keep && !busy) text = '';
    }
    later();
  }
  // Once the visitor has left it empty for a while, it types on its own again
  function later() {
    clearTimeout(resumeT);
    if (!REDUCE)
      resumeT = setTimeout(() => {
        if (auto) return;
        if (!focused && !text.trim()) start();
        else later();
      }, RESUME);
  }
  function write(line: string) {
    takeOver();
    const t = text.trim();
    text = t ? `${t}\n${line}` : line;
    ta.focus();
  }

  // The phone is drawn at an iPhone's width and scaled to the room it has, so its row of buttons fits as in the app
  const WIDTH = 440;
  function fit() {
    const s = Math.min(1, device.clientWidth / WIDTH);
    device.style.setProperty('--s', String(s));
    device.style.height = `${phone.offsetHeight * s}px`;
    device.classList.add('sized');
  }

  onMount(() => {
    fit();
    const sizes = new ResizeObserver(fit);
    sizes.observe(device);
    sizes.observe(phone);
    placeInd();
    const resize = () => {
      placeInd();
      draw();
    };
    addEventListener('resize', resize);
    document.fonts?.ready.then(resize);
    let inView = false;
    const update = () => {
      seen = inView && document.visibilityState === 'visible';
      if (seen) wake();
    };
    const io = new IntersectionObserver(([e]) => {
      inView = !!e?.isIntersecting;
      update();
    });
    io.observe(screen);
    document.addEventListener('visibilitychange', update);
    if (REDUCE) {
      auto = false;
      text = SCRIPT[0]!.text;
    } else start();
    return () => {
      alive = false;
      run.stopped = true;
      wake();
      clearTimeout(resumeT);
      clearTimeout(resetT);
      io.disconnect();
      sizes.disconnect();
      document.removeEventListener('visibilitychange', update);
      removeEventListener('resize', resize);
    };
  });
</script>

<figure class="s-device" bind:this={device}>
  <figcaption class="vh">
    LogOut's composer. It types a few lines on its own; type your own to see how they read. Nothing is saved.
  </figcaption>
  <div class="s-phone" bind:this={phone}>
    <div class="s-phone-screen" class:focus={ring} bind:this={screen}>
      <div class="s-peek" aria-hidden="true">
        <span class="s-peek-rows"><span>Hard sets 3d<b>43</b></span><span>Sleep<b>4 <i>/5</i></b></span></span>
        <span>
          <svg viewBox="0 0 160 48" preserveAspectRatio="none"
            ><path d="M0 34 C14 34 16 8 30 10 S44 40 58 36 S78 14 92 18 S112 42 126 30 S146 6 160 12" /></svg
          >
        </span>
      </div>
      <div class="glow" aria-hidden="true"></div>
      <section class="dock" aria-label="Try the composer">
        <div class="scroller" aria-hidden="true">
          {#each [0, 1, 2, 3] as i (i)}
            {@const c = row[i]}
            {#if c}
              {@const [k, label, icon, tint] = c}
              <div class="ctx" class:set={!!draft && now[k] !== 0}>
                <span class="thumb" class:letter={icon.length === 1} style="--tc:{TINTS[tint][0]};--ti:{TINTS[tint][1]}">
                  <span class="ico ic" bind:this={icos[i]}
                    >{#if icon.length === 1}{icon}{:else}<Icon name={icon as IconName} />{/if}</span
                  >
                </span>
                <span class="ctx-text">
                  <span class="ctx-label roll" use:roll={{ text: label, dir }}></span>
                  <span class="ctx-value roll" use:roll={{ text: show(k, now[k]), dir }}></span>
                </span>
              </div>
            {/if}
          {/each}
        </div>

        <div class="composer" class:s-focus={ring} bind:this={composer}>
          <div class="field" class:has-text={!!text} class:focused class:typing class:clearing bind:this={field}>
            <label for="try" class="vh">Type a line to see how LogOut reads it</label>
            <div class="ghost" bind:this={ghost} aria-hidden="true">
              <span>{MODES[mode].placeholders[0]}</span><span class="gcaret"></span>
            </div>
            <div class="mirror" bind:this={mirror} aria-hidden="true"></div>
            <textarea
              id="try"
              rows="1"
              spellcheck="false"
              autocomplete="off"
              maxlength="600"
              bind:this={ta}
              bind:value={text}
              onpointerdown={() => takeOver()}
              onfocus={() => {
                takeOver();
                focused = true;
              }}
              onblur={() => {
                focused = false;
                later();
              }}
              onkeydown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void doLog();
                }
              }}></textarea>
          </div>
          <div class="scroller tools">
            <span class="tool sq" aria-hidden="true"><span class="ic"><Icon name="at" /></span></span>
            <button type="button" class="tool water press" aria-label="Add 250 ml of water" onclick={() => write('water 250ml')}
              ><span class="ic"><Icon name="drop" /></span><span>250 ml</span></button
            >
            <button type="button" class="tool ck press" aria-label="Add a check-in" onclick={() => write('sleep 4/5, mood 4/5')}
              ><span class="ic"><Icon name="heartS" /></span><span>Check-in</span></button
            >
            {#if mode !== 'food'}
              <span class="tool" aria-hidden="true"
                ><span class="ic"><Icon name={mode === 'cardio' ? 'distance' : 'weight'} /></span><span
                  >{mode === 'cardio' ? 'km' : 'kg'}</span
                ></span
              >
            {/if}
            <span class="tool stepper" aria-hidden="true">
              <span class="step"><span class="ic"><Icon name="minus" /></span></span>
              <span class="step-val">–<span class="step-unit">{MODES[mode].stepUnit}</span></span>
              <span class="step"><span class="ic"><Icon name="plus" /></span></span>
            </span>
          </div>
        </div>

        <div class="actions">
          <span class="logs-btn" aria-hidden="true"
            ><span class="lb-face"><span class="ic"><Icon name="logs" /></span><span>Logs</span></span></span
          >
          <div class="seg" bind:this={seg} role="group" aria-label="What you're logging">
            <span class="seg-ind" bind:this={segInd}></span>
            {#each MODE_ORDER as m (m)}
              <button
                type="button"
                class="seg-btn press"
                aria-pressed={mode === m}
                onclick={() => {
                  takeOver(true);
                  picked = true;
                  void setMode(m);
                }}><span class="ic"><Icon name={MODES[m].icon} /></span><span>{MODES[m].label}</span></button
              >
            {/each}
          </div>
          <button
            type="button"
            class="log"
            class:s-press={pressed}
            class:busy
            class:done
            aria-label={sum ? `Log it: ${sum}. Nothing is saved here` : 'Log. Nothing is saved here'}
            onclick={() => {
              takeOver(true);
              void doLog();
            }}
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
      </section>
      <span class="s-homebar" aria-hidden="true"></span>
    </div>
  </div>
</figure>
