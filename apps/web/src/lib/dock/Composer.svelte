<!--
  The composer: a text field read as it's typed. A mirror under the textarea colours each token and puts each line's
  result at its end; a ghost completes the last name (Tab); suggestions offer what was logged before; the toolbar
  writes lines (water, check-ins), switches the unit bare numbers are read in, and steps the count in the caret's line.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { suggest, type Suggestion } from '@logout/engine';
  import { app } from '../state/app.svelte.ts';
  import { ago, isoOf } from '../logic/dates.ts';
  import { initials } from '../logic/format.ts';
  import { markup } from '../logic/markup.ts';
  import { itemTint, MTINT, thumbStyle } from '../logic/palette.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { REDUCE, replay, roll } from '../ui/motion.ts';
  import { placeReadouts, type Overflow } from '../ui/readouts.ts';
  import { scrollRow } from '../ui/scrollrow.ts';
  import { dayWord, quickLog, readDraft } from './logging.ts';
  import { MODES } from './modes.ts';

  let { fieldH = $bindable(42), onresize, onlog }: { fieldH?: number; onresize: () => void; onlog: () => void } = $props();

  let composer: HTMLDivElement, field: HTMLDivElement, ta: HTMLTextAreaElement, mirror: HTMLDivElement, ghost: HTMLDivElement;
  let popEl = $state<HTMLDivElement>(),
    checkBtn: HTMLButtonElement,
    unitIc: HTMLSpanElement;
  let hasText = $state(false),
    focused = $state(false),
    clearing = $state(false);
  let overflow = $state.raw<Overflow[]>([]);
  let ghostText = $state('');
  /** Bumps whenever the caret moves, so the stepper follows it */
  let caret = $state(0);

  const info = $derived(MODES[app.mode]);
  const isFood = $derived(app.mode === 'food');
  const unitNow = $derived(app.mode === 'cardio' ? app.units.dist : app.units.load);

  /* ---------- Reading the text ---------- */
  // Ghost completion for the last line while it's still only a name and the caret sits at the end
  const NAME_ONLY = /^[\p{L}][\p{L}\p{N}'’ -]*$/u;
  let comp: { text: string } | null = null;
  function completion(): { text: string } | null {
    const t = ta.value,
      draft = app.draft;
    if (!draft || !draft.res.length || document.activeElement !== ta || ta.selectionStart !== t.length || ta.selectionEnd !== t.length)
      return null;
    const tail = t.slice(draft.res[draft.res.length - 1]!.s);
    if (!NAME_ONLY.test(tail)) return null;
    const s = suggest(app.book, app.mode, tail, 1)[0];
    if (!s || s.insert.length <= tail.length || !s.insert.toLowerCase().startsWith(tail.toLowerCase())) return null;
    return { text: s.insert.slice(tail.length) };
  }
  const known = (kind: string, key: string) => !!app.book?.cards.has(`${kind}:${key}`);

  export function renderMirror() {
    if (!ta) return;
    const t = ta.value;
    app.drafts[app.mode] = t;
    app.draft = t.trim() ? readDraft(t, app.mode) : null;
    comp = completion();
    const draft = app.draft;
    // The mirror is drawn by hand: its text must match the textarea's glyph for glyph, every keystroke
    // eslint-disable-next-line svelte/no-dom-manipulating
    mirror.innerHTML =
      markup(t, draft ? draft.res : [], {
        readouts: true,
        completion: comp ? comp.text : '',
        hide: comp && draft ? draft.res.length - 1 : -1,
        known
      }) + '\u200b';
    overflow = placeReadouts(mirror);
    const h = Math.max(42, Math.min(mirror.offsetHeight, 128));
    field.style.height = `${h}px`;
    if (h !== fieldH) {
      fieldH = h;
      onresize();
    }
    mirror.style.transform = `translateY(${-ta.scrollTop}px)`;
    hasText = t.length > 0;
  }

  function onInput() {
    renderMirror();
    caret++;
    const cq = caretQuery();
    if (cq && cq.q) openSuggest(cq);
    else closePop();
  }
  // Moving the caret changes which line the stepper and suggestions are about
  function onCaret() {
    renderMirror();
    caret++;
    const cq = caretQuery();
    if (cq && cq.q) openSuggest(cq);
    else if (pop.kind === 'suggest') closePop();
  }

  // The book, the mode, the units or the day LOG writes to changed: read the text again
  $effect(() => {
    void app.book;
    void app.units.load;
    void app.units.dist;
    void app.logDate;
    untrack(renderMirror);
  });

  /* ---------- Suggestions and check-ins ---------- */
  const SEP = /\n|;|,(?!\d)|(?<!\d),/g;
  const ANY_ICON: Record<string, IconName> = {
    water: 'drop',
    weight: 'weight',
    waist: 'weight',
    neck: 'weight',
    hips: 'weight',
    sleep: 'moon',
    mood: 'heartS',
    energy: 'bolt'
  };
  const CHECKS: [string, string, IconName, keyof typeof MTINT][] = [
    ['sleep', 'Sleep', 'moon', 'sleep'],
    ['mood', 'Mood', 'heartS', 'heart'],
    ['energy', 'Energy', 'bolt', 'warn']
  ];
  let pop = $state<{ open: boolean; kind: 'suggest' | 'checkin'; items: Suggestion[]; idx: number; start: number; q: string }>({
    open: false,
    kind: 'suggest',
    items: [],
    idx: 0,
    start: 0,
    q: ''
  });
  let popShown = $state(false),
    popIn = $state(false),
    popOut = $state(false),
    stagger = $state(false);
  let popT: ReturnType<typeof setTimeout> | undefined, staggerT: ReturnType<typeof setTimeout> | undefined;

  // The caret's line while it's still just a name, with nothing after the caret
  function caretQuery(): { q: string; start: number } | null {
    if (ta.selectionStart !== ta.selectionEnd) return null;
    const pos = ta.selectionStart,
      before = ta.value.slice(0, pos);
    let start = 0;
    for (const m of before.matchAll(SEP)) start = (m.index ?? 0) + m[0].length;
    const q = before.slice(start).replace(/^\s+/, '');
    if ((ta.value.slice(pos).split(SEP)[0] ?? '').trim() || !NAME_ONLY.test(q)) return null;
    return { q, start: pos - q.length };
  }
  function showPop(fresh: boolean) {
    clearTimeout(popT);
    popShown = true;
    popOut = false;
    if (fresh) {
      popIn = false;
      requestAnimationFrame(() => (popIn = true));
      stagger = true;
      clearTimeout(staggerT);
      staggerT = setTimeout(() => (stagger = false), 500);
    }
  }
  function openSuggest(cq: { q: string; start: number }) {
    const items = suggest(app.book, app.mode, cq.q, 6);
    if (!items.length) {
      closePop();
      return;
    }
    const wasOpen = pop.open && pop.kind === 'suggest';
    if (pop.open && !wasOpen) closePop(true);
    pop = { open: true, kind: 'suggest', items, idx: wasOpen ? Math.min(pop.idx, items.length - 1) : 0, start: cq.start, q: cq.q };
    showPop(!wasOpen);
  }
  /** From the @ button: a fresh line, and what was logged in this mode lately */
  function insertAt() {
    ta.focus();
    const t = ta.value;
    if (t.trim() && !/[\n,;]\s*$/.test(t)) ta.setRangeText('\n', t.length, t.length, 'end');
    ta.setSelectionRange(ta.value.length, ta.value.length);
    renderMirror();
    const items = suggest(app.book, app.mode, '', 6);
    if (!items.length) {
      app.hint(composer, `Nothing logged in ${info.label} yet`);
      return;
    }
    pop = { open: true, kind: 'suggest', items, idx: 0, start: ta.value.length, q: '' };
    showPop(true);
  }
  function closePop(instant = false) {
    if (!pop.open) return;
    pop.open = false;
    popIn = false;
    stagger = false;
    clearTimeout(popT);
    if (instant || REDUCE) {
      popShown = false;
      popOut = false;
      return;
    }
    popOut = true;
    popT = setTimeout(() => {
      popShown = false;
      popOut = false;
    }, 170);
  }
  function movePop(d: number) {
    pop.idx = (pop.idx + d + pop.items.length) % pop.items.length;
    popEl?.querySelectorAll('.opt')[pop.idx]?.scrollIntoView({ block: 'nearest' });
  }
  // Taking a suggestion writes its whole line: the name and what was done last time
  function choose(i: number) {
    const s = pop.items[i];
    if (!s) return;
    ta.setRangeText(s.insert, pop.start, ta.selectionStart, 'end');
    closePop();
    onInput();
    ta.focus();
  }
  // Scores for the day a check-in would be logged to
  const checkDay = $derived(app.book?.days.get(isoOf(app.logDate)));
  function openCheckin() {
    if (pop.open && pop.kind === 'checkin') {
      closePop();
      return;
    }
    closePop(true);
    pop = { open: true, kind: 'checkin', items: [], idx: -1, start: 0, q: '' };
    showPop(true);
  }

  function onKeydown(e: KeyboardEvent) {
    if (pop.open && pop.kind === 'suggest') {
      if (e.key === 'ArrowDown') return void (e.preventDefault(), movePop(1));
      if (e.key === 'ArrowUp') return void (e.preventDefault(), movePop(-1));
      if (e.key === 'Enter' || e.key === 'Tab') return void (e.preventDefault(), choose(pop.idx));
      if (e.key === 'Escape') return void (e.preventDefault(), closePop());
    }
    if (e.key === 'Tab' && !e.shiftKey && comp) {
      e.preventDefault();
      ta.setRangeText(comp.text, ta.value.length, ta.value.length, 'end');
      onInput();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onLog();
    }
  }
  function onKeyup(e: KeyboardEvent) {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !pop.open))
      onCaret();
  }

  /* ---------- Stepper: a lift's sets, an interval's rounds, a food's count, in the caret's line ---------- */
  const COUNTED = new Set(['piece', 'slice', 'scoop', 'serving', 'cup', 'tbsp', 'tsp']);
  function stepTarget(): { s: number; e: number; v: number } | null {
    const draft = app.draft;
    if (!draft || !ta) return null;
    const pos = ta.selectionEnd;
    const r = draft.res.find(x => pos >= x.s && pos <= x.s + x.line.text.length);
    if (!r) return null;
    const l = r.line;
    for (const tk of l.tokens) {
      const txt = l.text.slice(tk.s, tk.e),
        lead = /^\d+(?![.,]\d)/.exec(txt);
      const at = (m: string, off: number) => ({ s: r.s + tk.s + off, e: r.s + tk.s + off + m.length, v: +m });
      if (app.mode === 'strength' && tk.role === 'sets' && tk.sets != null) {
        if (lead && +lead[0] === tk.sets && tk.sets <= 15 && !/^\d+\s*(?:kgs?|lbs?)/i.test(txt)) return at(lead[0], 0);
        const tail = /(\d+)\s*$/.exec(txt);
        if (tail && +tail[1]! === tk.sets && /x.*x/i.test(txt)) return at(tail[1]!, tail.index);
      }
      if (app.mode === 'cardio' && tk.role === 'interval' && lead) return at(lead[0], 0);
      if (
        app.mode === 'food' &&
        lead &&
        (tk.role === 'count' || (tk.role === 'amount' && (/^\d+\s*x/i.test(txt) || COUNTED.has(tk.amount!.unit))))
      )
        return at(lead[0], 0);
    }
    return null;
  }
  const target = $derived.by(() => {
    void caret;
    void app.draft;
    return stepTarget();
  });
  function step(d: number) {
    const t = stepTarget();
    if (!t) return;
    ta.setRangeText(String(Math.max(1, Math.min(99, t.v + d))), t.s, t.e, 'preserve');
    app.dir = d;
    onInput();
  }

  /* ---------- Units: what a bare load or distance is read in ---------- */
  function toggleUnit() {
    const u = { ...app.units };
    if (app.mode === 'cardio') u.dist = u.dist === 'km' ? 'mi' : 'km';
    else u.load = u.load === 'kg' ? 'lb' : 'kg';
    app.dir = (app.mode === 'cardio' ? u.dist === 'mi' : u.load === 'lb') ? 1 : -1;
    app.profile.units = u;
    void app.repo.saveProfile($state.snapshot(app.profile));
    replay(unitIc, 'flip');
  }

  /* ---------- Typewriter placeholder ---------- */
  const tw = {
    list: [] as string[],
    i: 0,
    n: 0,
    phase: 'hold' as 'hold' | 'erase' | 'type',
    t: 0 as unknown as ReturnType<typeof setTimeout>
  };
  function twStart() {
    clearTimeout(tw.t);
    tw.list = info.placeholders;
    tw.i = 0;
    tw.n = tw.list[0]!.length;
    tw.phase = 'hold';
    ghostText = tw.list[0]!;
    if (!REDUCE && document.activeElement !== ta) tw.t = setTimeout(twTick, 3200);
  }
  function twTick() {
    if (tw.phase === 'hold') tw.phase = 'erase';
    if (tw.phase === 'erase') {
      if (tw.n > 0) {
        tw.n = Math.max(0, tw.n - 2);
        ghostText = tw.list[tw.i]!.slice(0, tw.n);
        tw.t = setTimeout(twTick, 14);
        return;
      }
      tw.i = (tw.i + 1) % tw.list.length;
      tw.phase = 'type';
      tw.t = setTimeout(twTick, 300);
      return;
    }
    const s = tw.list[tw.i]!;
    if (tw.n < s.length) {
      tw.n++;
      ghostText = s.slice(0, tw.n);
      tw.t = setTimeout(twTick, 26 + Math.random() * 42 + (/[ ,.·]/.test(s[tw.n - 1]!) ? 70 : 0));
      return;
    }
    tw.phase = 'hold';
    tw.t = setTimeout(twTick, tw.i === 0 ? 4200 : 2400);
  }
  function onFocus() {
    clearTimeout(tw.t);
    focused = true;
    if (ghostText !== tw.list[0]) {
      ghostText = tw.list[0]!;
      tw.i = 0;
      tw.n = tw.list[0]!.length;
      tw.phase = 'hold';
      replay(ghost, 'swap');
    }
    renderMirror();
  }
  function onBlur() {
    focused = false;
    if (pop.kind === 'suggest') closePop();
    clearTimeout(tw.t);
    if (!REDUCE) tw.t = setTimeout(twTick, 2600);
    renderMirror();
  }

  /* ---------- Mode changes and logging, driven from the action row ---------- */
  /** Switches the text to another mode's draft */
  export function modeChanged() {
    closePop();
    ta.value = app.drafts[app.mode];
    renderMirror();
    caret++;
    twStart();
    replay(ghost, 'swap');
  }
  /** Nothing to log: the composer shakes and the placeholder nudges */
  export function nudge() {
    replay(composer, 'shake');
    replay(ghost, 'nudge');
    ta.focus();
  }
  export function text(): string {
    return ta.value.trim();
  }
  /** Clears the field after a log, the text lifting away */
  export function clearAfterLog() {
    closePop();
    clearing = true;
    ta.blur();
    setTimeout(
      () => {
        ta.value = '';
        app.drafts[app.mode] = '';
        clearing = false;
        onInput();
      },
      REDUCE ? 0 : 280
    );
  }
  function onLog() {
    onlog();
  }

  onMount(() => {
    ta.value = app.drafts[app.mode];
    twStart();
    renderMirror();
    document.fonts?.ready.then(renderMirror);
    const outside = (e: PointerEvent) => {
      if (pop.open && pop.kind === 'checkin' && !popEl?.contains(e.target as Node) && !checkBtn.contains(e.target as Node)) closePop();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pop.open && pop.kind === 'checkin') {
        e.preventDefault();
        closePop();
        checkBtn.focus();
      }
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(tw.t);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', esc);
    };
  });
</script>

<div class="composer enter" bind:this={composer} style="--d:200">
  {#if popShown}
    <div class="mpop" class:in={popIn} class:out={popOut} class:stagger bind:this={popEl}>
      <div class="pop-head">
        <span>{pop.kind === 'checkin' ? 'Check-in' : pop.q ? info.noun : `Recent ${info.noun.toLowerCase()}`}</span>
        <span>{pop.kind === 'checkin' ? 'Tap a score' : '↑↓ to move'}</span>
      </div>
      <ul id="popList" role="listbox" aria-label="Suggestions">
        {#if pop.kind === 'suggest'}
          {#each pop.items as s, i (s.name + s.kind)}
            {@const q = pop.q.toLowerCase()}
            <li
              class="opt"
              role="option"
              id="opt-{i}"
              aria-selected={i === pop.idx}
              style="--k:{i}"
              onpointerdown={e => {
                e.preventDefault();
                choose(i);
              }}
              onpointermove={() => i !== pop.idx && movePop(i - pop.idx)}
            >
              <span class="opt-thumb" style={thumbStyle(itemTint(s.name))}>
                {#if s.kind === 'any'}<Icon name={ANY_ICON[s.name] ?? 'plus'} />{:else}{initials(s.name)}{/if}
              </span>
              <span class="opt-text">
                <span class="opt-name">
                  {#if q && s.name.toLowerCase().startsWith(q)}<b>{s.name.slice(0, q.length)}</b>{s.name.slice(
                      q.length
                    )}{:else}{s.name}{/if}
                </span>
                <span class="opt-meta">{s.meta + (s.last ? ` · ${ago(s.last, app.today)}` : '')}</span>
              </span>
              <span class="opt-key" aria-hidden="true">↵</span>
            </li>
          {/each}
        {:else}
          {#each CHECKS as [key, name, icon, tint], i (key)}
            {@const cur = checkDay?.check[key] ?? null}
            <li class="opt ck" style="--k:{i}">
              <span class="opt-thumb" style={thumbStyle(MTINT[tint])}><Icon name={icon} /></span>
              <span class="opt-text">
                <span class="opt-name">{name}</span>
                <span class="opt-meta">{cur ? `${cur}/5 ${dayWord(app.logDate)}` : `Not yet ${dayWord(app.logDate)}`}</span>
              </span>
              <span class="ck-scores" role="group" aria-label="{name} out of 5">
                {#each [1, 2, 3, 4, 5] as n (n)}
                  <button
                    type="button"
                    aria-pressed={cur === n}
                    aria-label="{name} {n} out of 5"
                    onclick={() => {
                      closePop();
                      void quickLog(`${key} ${n}/5`);
                    }}>{n}</button
                  >
                {/each}
              </span>
            </li>
          {/each}
        {/if}
      </ul>
    </div>
  {/if}

  <div class="field" class:has-text={hasText} class:focused class:clearing bind:this={field}>
    <label for="entry" class="vh">What you did, as you'd say it</label>
    <div class="ghost" bind:this={ghost} aria-hidden="true"><span>{ghostText}</span><span class="gcaret"></span></div>
    <div class="mirror" bind:this={mirror} aria-hidden="true"></div>
    <textarea
      id="entry"
      rows="1"
      spellcheck="false"
      autocomplete="off"
      aria-autocomplete="list"
      aria-controls="popList"
      aria-activedescendant={pop.open && pop.kind === 'suggest' ? `opt-${pop.idx}` : undefined}
      bind:this={ta}
      oninput={onInput}
      onclick={onCaret}
      onfocus={onFocus}
      onblur={onBlur}
      onkeydown={onKeydown}
      onkeyup={onKeyup}
      onscroll={() => (mirror.style.transform = `translateY(${-ta.scrollTop}px)`)}></textarea>
  </div>
  {#if overflow.length}
    <p class="ro-more" aria-hidden="true">
      {#each overflow as o, i (i)}<span class:needs={o.needs}
          >{#if o.name}<i>{o.name}</i>{/if}{o.text}</span
        >{/each}
    </p>
  {/if}

  <div class="scroller tools" use:scrollRow>
    <button type="button" class="tool sq press enter" style="--d:300" aria-label="Pick from what you've logged before" onclick={insertAt}
      ><span class="ic"><Icon name="at" /></span></button
    >
    <button
      type="button"
      class="tool water press enter"
      style="--d:315"
      aria-label="Log 250 ml of water"
      onclick={e => {
        replay(e.currentTarget.querySelector('.ic'), 'swap');
        void quickLog('water 250ml');
      }}><span class="ic"><Icon name="drop" /></span><span>250 ml</span></button
    >
    <button
      type="button"
      class="tool ck press enter"
      style="--d:322"
      aria-haspopup="listbox"
      aria-expanded={pop.open && pop.kind === 'checkin'}
      aria-label="Check in: sleep, mood, energy"
      bind:this={checkBtn}
      onclick={openCheckin}><span class="ic"><Icon name="heartS" /></span><span>Check-in</span></button
    >
    <button
      type="button"
      class="tool press enter"
      style="--d:390"
      hidden={isFood}
      aria-label="A number on its own is in {unitNow}. Tap to switch"
      onclick={toggleUnit}
    >
      <span class="ic unit-ic" bind:this={unitIc}><Icon name={app.mode === 'cardio' ? 'distance' : 'weight'} /></span>
      <span class="roll" use:roll={{ text: unitNow, dir: app.dir }}></span>
    </button>
    <div class="tool stepper enter" style="--d:480">
      <button
        type="button"
        class="step press"
        disabled={!target || target.v <= 1}
        aria-label="Fewer {info.stepUnit}"
        onclick={() => step(-1)}><span class="ic"><Icon name="minus" /></span></button
      >
      <span class="step-val">
        <span class="roll" use:roll={{ text: target ? target.v : '–', dir: app.dir }}></span>
        <span
          class="roll step-unit"
          use:roll={{ text: target && target.v === 1 ? info.stepUnit.replace(/s$/, '') : info.stepUnit, dir: app.dir }}
        ></span>
      </span>
      <button
        type="button"
        class="step press"
        disabled={!target || target.v >= 99}
        aria-label="More {info.stepUnit}"
        onclick={() => step(1)}><span class="ic"><Icon name="plus" /></span></button
      >
    </div>
  </div>
</div>
