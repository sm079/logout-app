<!--
  One logged entry: a thumb of what it is, the text in token colours, its numbers and its time. Edit turns the text
  into a field read as it's typed; Enter saves, Escape backs out, and Delete takes a second tap.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { preview, type Kind } from '@logout/engine';
  import type { ViewEntry } from '../engine/core.ts';
  import { app } from '../state/app.svelte.ts';
  import { hhmm } from '../logic/dates.ts';
  import { kindOf } from '../logic/format.ts';
  import { markup } from '../logic/markup.ts';
  import { MTINT, thumbStyle, type MTintName } from '../logic/palette.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { REDUCE, replay, roll, rollNum } from '../ui/motion.ts';
  import { placeReadouts, type Overflow } from '../ui/readouts.ts';
  import { track } from '../observe/analytics.ts';
  import { metaParts } from './meta.ts';

  let {
    e,
    editing,
    onstart,
    onfinish,
    onremove,
    onitem
  }: {
    e: ViewEntry;
    editing: boolean;
    onstart: () => void;
    onfinish: () => void;
    /** Removes the entry; the row collapses first */
    onremove: (li: HTMLElement) => void;
    onitem: (i: number, el: HTMLElement) => void;
  } = $props();

  const KIND: Record<Kind, { tint: MTintName; icon: IconName; noun: string }> = {
    food: { tint: 'nutrition', icon: 'utensils', noun: 'meal' },
    strength: { tint: 'training', icon: 'dumbbell', noun: 'session' },
    cardio: { tint: 'activity', icon: 'foot', noun: 'session' },
    steps: { tint: 'activity', icon: 'foot', noun: 'step count' },
    water: { tint: 'hydration', icon: 'drop', noun: 'drink' },
    checkin: { tint: 'sleep', icon: 'heartS', noun: 'check-in' },
    measure: { tint: 'body', icon: 'weight', noun: 'measurement' }
  };

  let li: HTMLLIElement,
    ta = $state<HTMLTextAreaElement>(),
    lm = $state<HTMLDivElement>();
  const kind = $derived(kindOf(e));
  const k = $derived(KIND[kind]);
  const known = (kd: string, key: string) => !!app.book?.cards.has(`${kd}:${key}`);
  const html = $derived(markup(e.text, e.res, { items: true, known }));

  /* ---------- Editing ---------- */
  let draftSum = $state.raw<ViewEntry['sum'] | null>(null);
  let overflow = $state.raw<Overflow[]>([]);
  let acts = $state(false),
    actsOpen = $state(false),
    armed = $state(false);
  let previewAt: number | null = null;
  let pt: ReturnType<typeof setTimeout> | undefined,
    dt: ReturnType<typeof setTimeout> | undefined,
    ft: ReturnType<typeof setTimeout> | undefined;
  const parts = $derived(metaParts(draftSum ?? e.sum, app.units));

  // The edit is read with the units it was logged in, placed where the entry is, as it will save
  function read() {
    if (!ta || !lm) return null;
    const p = preview(app.book, ta.value, e.mode, e.units, { date: e.date, time: e.time, id: e.id });
    // The mirror is drawn by hand: its text must match the textarea's glyph for glyph
    // eslint-disable-next-line svelte/no-dom-manipulating
    lm.innerHTML = markup(ta.value, p.res, { readouts: true, known }) + '\u200b';
    overflow = placeReadouts(lm);
    previewAt = p.at;
    return p;
  }
  function fit() {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
  $effect(() => {
    const on = editing;
    untrack(() => (on ? start() : stop()));
  });
  async function start() {
    clearTimeout(ft);
    acts = true;
    armed = false;
    await tick();
    if (!ta) return;
    ta.value = e.text;
    fit();
    read();
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
    void li.offsetHeight;
    actsOpen = true;
  }
  function stop() {
    clearTimeout(pt);
    clearTimeout(dt);
    draftSum = null;
    overflow = [];
    armed = false;
    if (!acts) return;
    actsOpen = false;
    ft = setTimeout(() => (acts = false), REDUCE ? 0 : 400);
  }
  function onInput() {
    fit();
    const p = read();
    clearTimeout(pt);
    pt = setTimeout(() => {
      if (editing && p) draftSum = p.sum;
    }, 180);
  }
  async function save() {
    const text = ta?.value.trim() ?? '';
    if (!text) {
      replay(li, 'shake');
      ta?.focus();
      return;
    }
    const changed = text !== e.text;
    // A time typed in the text moves the entry there
    const time = previewAt != null && previewAt !== e.time ? previewAt : undefined;
    const hadFocus = li.contains(document.activeElement);
    onfinish();
    if (hadFocus) tick().then(() => li.querySelector<HTMLElement>('.ledit')?.focus({ preventScroll: true }));
    if (!changed && time === undefined) return;
    await app.repo.edit(e.id, text, time);
    track('entry edited', { moved: time !== undefined, sample: e.sample });
    await app.engine.settled();
    replay(li, 'saved');
    app.emit({ t: 'changed', date: e.date });
    app.announce = `Updated ${text}`;
  }
  function cancel() {
    const hadFocus = li.contains(document.activeElement);
    onfinish();
    if (hadFocus) tick().then(() => li.querySelector<HTMLElement>('.ledit')?.focus({ preventScroll: true }));
  }
  /** The first tap arms Delete; a second within three seconds removes the entry */
  function del() {
    if (armed) {
      clearTimeout(dt);
      onremove(li);
      return;
    }
    armed = true;
    clearTimeout(dt);
    dt = setTimeout(() => (armed = false), 3000);
  }
  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void save();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      cancel();
    }
  }

  /* ---------- An item's name opens it ---------- */
  function onTextClick(ev: MouseEvent) {
    const n = (ev.target as Element).closest<HTMLElement>('[data-item]');
    if (n && !editing) onitem(+n.dataset.item!, n);
  }
  function onTextKey(ev: KeyboardEvent) {
    if ((ev.key === 'Enter' || ev.key === ' ') && (ev.target as Element).matches('[data-item]')) {
      ev.preventDefault();
      (ev.target as HTMLElement).click();
    }
  }
</script>

<li class="lentry" class:editing data-id={e.id} bind:this={li}>
  <span class="thumb" style={thumbStyle(MTINT[k.tint])}><Icon name={k.icon} /></span>
  <div class="lbody">
    {#if editing}
      <div class="lfield">
        <div class="lmirror" bind:this={lm} aria-hidden="true"></div>
        <textarea
          class="lta"
          rows="1"
          maxlength="4000"
          spellcheck="false"
          aria-label="Edit this {k.noun}"
          bind:this={ta}
          oninput={onInput}
          onkeydown={onKey}></textarea>
      </div>
      {#if overflow.length}
        <p class="ro-more" aria-hidden="true">
          {#each overflow as o, i (i)}<span class:needs={o.needs}
              >{#if o.name}<i>{o.name}</i>{/if}{o.text}</span
            >{/each}
        </p>
      {/if}
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <p class="ltext" onclick={onTextClick} onkeydown={onTextKey}>{@html html}</p>
    {/if}
    <p class="lmeta">
      {#each parts as p (p.k)}
        <span class:lneeds={p.needs} class:mk={!!p.mark} style={p.mark ? `--c:var(${p.mark})` : undefined}
          >{p.before ?? ''}<b class="roll" use:rollNum={p.text}></b>{p.after ?? ''}</span
        >
      {:else}
        <span>Nothing read yet</span>
      {/each}
    </p>
    {#if acts}
      <div class="lacts" class:open={actsOpen}>
        <div class="lacts-in">
          <button
            type="button"
            class="lact ldel"
            class:armed
            style="--k:0"
            aria-label={armed ? 'Tap again to delete' : `Delete this ${k.noun}`}
            onclick={del}
          >
            <Icon name="trash" /><span class="roll" use:roll={{ text: armed ? 'Confirm' : 'Delete', dir: armed ? 1 : -1 }}></span>
          </button>
          <span class="lacts-sp"></span>
          <button type="button" class="lact lcancel" style="--k:1" onclick={cancel}>Cancel</button>
          <button type="button" class="lact lsave" style="--k:2" onclick={save}><Icon name="check" />Save</button>
        </div>
      </div>
    {/if}
  </div>
  <div class="lside">
    <button type="button" class="lbtn ledit" aria-label="Edit this {k.noun}" onclick={onstart}><Icon name="pencil" /></button>
    <span class="ltime">{hhmm(e.time)}</span>
  </div>
</li>
