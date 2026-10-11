<!--
  The log: everything logged in the selected period, read like a conversation. Days have sticky headers and totals;
  the newest entry sits at the bottom, and earlier days load as you scroll up, dimmed as context.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { ViewEntry } from '../engine/core.ts';
  import { app } from '../state/app.svelte.ts';
  import { describe } from '../logic/calendar.ts';
  import { fmt, fromIso, isoOf, yr } from '../logic/dates.ts';
  import { nf } from '../logic/format.ts';
  import Icon from '../ui/Icon.svelte';
  import { REDUCE, replay, roll } from '../ui/motion.ts';
  import LogEntry from './LogEntry.svelte';

  let { open }: { open: boolean } = $props();

  interface Day {
    date: string;
    entries: ViewEntry[];
  }
  let days = $state.raw<Day[]>([]);
  let empty = $state(false);
  let editing = $state<string | null>(null);
  let scroller: HTMLDivElement, list: HTMLDivElement;
  let below = $state(false),
    out = $state(false),
    swap = $state(false),
    reveal = $state(false);
  let dirSign = $state(1);
  /** The selection, as days that have come */
  let range = $state({ a: '', b: '' });
  /** The oldest day loaded */
  let lo = '';
  let noMore = false,
    loading = false,
    pinned = true;
  let pendingEdit: string | null = null;
  const fresh = new Set<string>();
  let gen = 0;

  const group = (entries: ViewEntry[]): Day[] => {
    const out: Day[] = [];
    for (const e of entries) {
      const last = out[out.length - 1];
      if (last && last.date === e.date) last.entries.push(e);
      else out.push({ date: e.date, entries: [e] });
    }
    return out;
  };
  function dayName(date: string): string {
    const d = fromIso(date),
      back = Math.round((+app.today - +d) / 864e5);
    return back === 0
      ? 'Today'
      : back === 1
        ? 'Yesterday'
        : fmt(d, { weekday: 'short', month: 'short', day: 'numeric' }) + yr(d, app.today);
  }
  function daySum(date: string): string {
    const d = app.book?.days.get(date);
    if (!d) return '';
    return [d.food ? `${nf(d.kcal)} kcal` : '', d.sessions ? `${d.sessions} session${d.sessions > 1 ? 's' : ''}` : '']
      .filter(Boolean)
      .join(' · ');
  }
  const syncFade = () => (below = scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 4);

  /* ---------- Loading ---------- */
  // The list ends with the selection and runs back through every earlier day with entries, a week of them at a time
  async function loadOlder() {
    if (noMore || loading || !lo) return;
    loading = true;
    const dates = await app.engine.daysBefore(lo, 7);
    if (!dates.length) {
      noMore = true;
      loading = false;
      return;
    }
    const from = dates[dates.length - 1]!,
      to = dates[0]!;
    const older = await app.engine.entries(from, to);
    lo = from;
    const h0 = scroller.scrollHeight;
    days = [...group(older), ...days];
    await tick();
    scroller.scrollTop += scroller.scrollHeight - h0;
    loading = false;
  }
  async function render() {
    const my = ++gen;
    editing = null;
    const p = app.pick,
      a = p.from < app.start ? app.start : p.from,
      b = p.to > app.today ? app.today : p.to;
    range = { a: isoOf(a), b: isoOf(b) };
    lo = range.a;
    noMore = false;
    const inSel = await app.engine.entries(range.a, range.b);
    if (my !== gen) return;
    days = group(inSel);
    empty = !inSel.length;
    await tick();
    while (!noMore && scroller.scrollHeight <= scroller.clientHeight + 240) {
      await loadOlder();
      if (my !== gen) return;
    }
    scroller.scrollTop = scroller.scrollHeight;
    pinned = true;
    syncFade();
    if (pendingEdit && days.some(d => d.entries.some(e => e.id === pendingEdit))) startEdit(pendingEdit);
    pendingEdit = null;
  }
  /** Reads the loaded days again: one change can move other entries' numbers */
  async function refresh() {
    if (!open || !range.b) return;
    const my = gen;
    const from = lo || range.a;
    const all = await app.engine.entries(from, range.b);
    if (my !== gen) return;
    days = group(all);
    empty = !all.some(e => e.date >= range.a);
  }

  // Another period swaps the list, moving in the direction of travel
  let shownPick = app.pick;
  $effect(() => {
    const p = app.pick,
      isOpen = open;
    untrack(() => {
      if (!isOpen) return;
      if (p === shownPick && days.length + (empty ? 1 : 0) > 0) return;
      const first = !days.length && !empty;
      shownPick = p;
      if (first || REDUCE) {
        void render().then(() => first && revealRows());
        return;
      }
      dirSign = app.dir < 0 ? -1 : 1;
      out = true;
      setTimeout(async () => {
        out = false;
        await render();
        replay(list, 'swap');
      }, 140);
    });
  });
  // Opening: entries rise in from the newest up
  function revealRows() {
    if (REDUCE) return;
    [...list.querySelectorAll<HTMLElement>('.lentry')].reverse().forEach((li, k) => li.style.setProperty('--r', String(Math.min(k, 12))));
    reveal = true;
    setTimeout(() => (reveal = false), 1100);
  }
  $effect(() => {
    if (!open) {
      untrack(() => {
        editing = null;
        days = [];
        empty = false;
        range = { a: '', b: '' };
      });
    }
  });
  // The book changed: the rows' numbers follow
  $effect(() => {
    void app.book;
    untrack(() => void refresh());
  });

  /* ---------- New entries land in the day they were logged to ---------- */
  async function landed(id: string, date: string) {
    if (!open) return;
    if (date < range.a || date > range.b) {
      fresh.add(id);
      app.resetToToday();
      return;
    }
    await refresh();
    await tick();
    const li = list.querySelector<HTMLElement>(`.lentry[data-id="${id}"]`);
    if (!li) return;
    if (!REDUCE) {
      li.classList.add('in');
      setTimeout(() => li.classList.remove('in'), 800);
    }
    const last = li.parentElement?.lastElementChild === li && li.closest('.lday') === list.lastElementChild;
    if (last) {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: REDUCE ? 'auto' : 'smooth' });
      return;
    }
    // Logged to a past day or an earlier time, it lands among other entries: bring it to the middle of the list
    pinned = false;
    const box = scroller.getBoundingClientRect(),
      k = scroller.offsetHeight / box.height || 1;
    const y = scroller.scrollTop + (li.getBoundingClientRect().top - box.top) * k;
    scroller.scrollTo({ top: y - scroller.clientHeight / 2 + 32, behavior: REDUCE ? 'auto' : 'smooth' });
  }

  /* ---------- Editing and deleting ---------- */
  function startEdit(id: string) {
    editing = id;
    const atEnd = pinned;
    // Once unfolded, the whole row, actions included, is in view
    setTimeout(
      () => {
        if (editing !== id) return;
        const li = list.querySelector<HTMLElement>(`.lentry[data-id="${id}"]`);
        if (atEnd) scroller.scrollTop = scroller.scrollHeight;
        else li?.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
      },
      REDUCE ? 0 : 420
    );
  }
  // Opens an entry in its row, selecting its day first when the log shows a period without it
  async function editElsewhere(id: string) {
    const e = await app.engine.entry(id);
    if (!e) return;
    const d = fromIso(e.date);
    const shown = app.pick.from <= d && app.pick.to >= d;
    pendingEdit = id;
    if (!shown) app.selectDay(d, d > app.pick.to ? 1 : -1);
    app.logsOpen = true;
    if (shown && open && days.some(x => x.entries.some(y => y.id === id))) {
      pendingEdit = null;
      startEdit(id);
    }
  }
  function collapse(el: HTMLElement): Promise<void> {
    if (REDUCE) return Promise.resolve();
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.classList.add('gone');
    return new Promise(r => setTimeout(r, 340));
  }
  async function remove(e: ViewEntry, li: HTMLElement) {
    editing = null;
    const day = days.find(d => d.date === e.date);
    const lastOfDay = !day || day.entries.length <= 1;
    // Focus moves to the neighbouring entry, or back to the composer if the list runs out
    const near = (li.nextElementSibling || li.previousElementSibling) as HTMLElement | null;
    near?.querySelector<HTMLElement>('.ledit')?.focus({ preventScroll: true });
    await collapse(lastOfDay ? (li.closest('.lday') as HTMLElement) : li);
    await app.repo.remove(e.id);
    await app.engine.settled();
    app.emit({ t: 'changed', date: e.date });
    app.announce = 'Deleted';
  }
  function openItem(e: ViewEntry, i: number, el: HTMLElement) {
    const l = e.res[i]?.line;
    if (!l || !l.key || (l.kind !== 'food' && l.kind !== 'strength' && l.kind !== 'cardio')) return;
    app.sheet = { kind: 'item', itemKind: l.kind, key: l.key, from: el };
  }

  onMount(() => {
    // Like a chat: while the list sits at its newest end it stays pinned there, so rows that grow push it up
    const ro = new ResizeObserver(() => {
      if (open && pinned) scroller.scrollTop = scroller.scrollHeight;
    });
    ro.observe(list);
    const off = app.on(ev => {
      if (ev.t === 'logged') void landed(ev.id, ev.date);
      else if (ev.t === 'edit') void editElsewhere(ev.id);
      else if (ev.t === 'renamed') void refresh();
    });
    return () => {
      ro.disconnect();
      off();
    };
  });
</script>

<div
  class="logs-scroll"
  class:below
  bind:this={scroller}
  onscroll={() => {
    pinned = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    if (open && scroller.scrollTop < 200) void loadOlder();
    syncFade();
  }}
>
  <div class="logs-list" class:out class:reveal style="--dir:{dirSign}" bind:this={list} class:swap>
    {#each days as d (d.date)}
      <section class="lday" class:earlier={d.date < range.a} data-day={d.date}>
        <h3 class="lday-h"><span>{dayName(d.date)}</span><span class="lday-sum roll" use:roll={{ text: daySum(d.date) }}></span></h3>
        <ul class="lentries">
          {#each d.entries as e (e.id)}
            <LogEntry
              {e}
              editing={editing === e.id}
              onstart={() => (editing === e.id ? (editing = null) : startEdit(e.id))}
              onfinish={() => (editing = null)}
              onremove={li => remove(e, li)}
              onitem={(i, el) => openItem(e, i, el)}
            />
          {/each}
        </ul>
      </section>
    {/each}
    {#if empty}
      {@const now = range.b === isoOf(app.today)}
      <section class="lday" data-empty>
        <h3 class="lday-h">
          <span>{range.a === range.b ? dayName(range.b) : describe(app.pick, app.today, app.joined).title}</span><span class="lday-sum"
          ></span>
        </h3>
        <div class="lentry lnone">
          <span class="thumb" style="--tc:var(--chip);--ti:var(--muted)"><Icon name="logs" /></span>
          <div class="lbody">
            <p class="ltext">{now ? 'Nothing logged yet' : 'Nothing logged'}</p>
            <p class="lmeta">
              {now ? 'Type a meal or a session below' : `Type below to log to ${dayName(range.b).replace('Yesterday', 'yesterday')}`}
            </p>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>
