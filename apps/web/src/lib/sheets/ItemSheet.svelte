<!--
  An item, opened from its name in a log row: its values (a food) or what was done last time, its name, and the names
  merged into it. A new name is kept as an alias beside the entries, so no entry's text changes; a name that is
  already another item's merges the two. Values change by editing the line that stated them.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { amountText, keyOf, nf as enf, resolveName, type Card, type Mode } from '@logout/engine';
  import type { ViewEntry } from '../engine/core.ts';
  import { app } from '../state/app.svelte.ts';
  import { ago } from '../logic/dates.ts';
  import { initials, nf } from '../logic/format.ts';
  import { markup } from '../logic/markup.ts';
  import { itemTint, thumbStyle } from '../logic/palette.ts';
  import Icon from '../ui/Icon.svelte';
  import { MACROS } from '../widgets/compute.ts';
  import { track } from '../observe/analytics.ts';
  import Sheet from './Sheet.svelte';

  let { kind, itemKey, leaving, onclose }: { kind: Mode; itemKey: string; leaving: boolean; onclose: (focus?: boolean) => void } = $props();

  const NOUN: Record<Mode, string> = { food: 'Food', strength: 'Lift', cardio: 'Activity' };
  let sheet: Sheet;
  let field: HTMLInputElement;
  const key = $derived(itemKey);
  const card = $derived(app.book?.cards.get(`${kind}:${key}`) ?? null);
  let name = $state(untrack(() => app.book?.cards.get(`${kind}:${itemKey}`)?.name ?? itemKey));

  // The entries the sheet shows lines from: where each kind of amount's values were stated, or the last time
  let shown = $state.raw<Map<string, ViewEntry>>(new Map());
  $effect(() => {
    const c = card;
    if (!c) return;
    const ids = [...new Set([...Object.values(c.from), c.lastEntry].filter((x): x is string => !!x))];
    void Promise.all(ids.map(id => app.engine.entry(id))).then(
      list => (shown = new Map(list.filter((e): e is ViewEntry => !!e).map(e => [e.id, e])))
    );
  });

  // An entry's lines of this item, as typed (an entry can hold other items too)
  const linesOf = (e: ViewEntry) =>
    e.res
      .filter(r => r.line.key === key)
      .map(r => markup(r.line.text, [{ ...r, s: 0 }]))
      .join(', ');

  // Names merged into it: aliases whose renames end at it
  const merged = $derived(
    Object.keys(app.aliases)
      .filter(id => id.startsWith(kind + ':'))
      .map(id => id.slice(kind.length + 1))
      .filter(k => k !== key && resolveName(kind, k, app.aliases).key === key)
  );
  function editDistance(a: string, b: string): number {
    let row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length]!;
  }
  // Other items of the same kind a letter or two away: likely the same thing typed differently
  const near = $derived.by((): Card[] => {
    if (!app.book) return [];
    const most = key.length > 5 ? 2 : 1;
    return [...app.book.cards.values()]
      .filter(c => c.kind === kind && c.key !== key)
      .map(c => ({ c, d: editDistance(c.key, key) }))
      .filter(x => x.d <= most)
      .sort((a, b) => a.d - b.d || b.c.uses - a.c.uses)
      .slice(0, 3)
      .map(x => x.c);
  });

  // What OK will do with the name as it's typed
  const plan = $derived.by((): { note: string; ok: string } => {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) return { note: 'A name is needed.', ok: 'DONE' };
    if (!card || n === card.name) return { note: '', ok: 'DONE' };
    const to = keyOf(n),
      other = to !== key ? app.book?.cards.get(`${kind}:${to}`) : null;
    if (other)
      return {
        note: `Merges into ${other.name} (${other.uses}×). Its newest values count for both; what you typed stays as it was.`,
        ok: 'MERGE'
      };
    return { note: `Every line of it reads as ${n}; what you typed stays as it was.`, ok: 'RENAME' };
  });

  async function renamed() {
    await app.engine.settled();
    app.emit({ t: 'renamed' });
  }
  async function ok() {
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) {
      sheet.refuse();
      field.focus();
      return;
    }
    if (plan.ok !== 'DONE') {
      const to = keyOf(n);
      // The new name stands on its own, even if it was once merged into another
      if (to !== key && app.aliases[`${kind}:${to}`]) app.aliases = await app.repo.setAlias(`${kind}:${to}`, null);
      app.aliases = await app.repo.setAlias(`${kind}:${key}`, n);
      track('item renamed', { kind, merged: plan.ok === 'MERGE' });
      void renamed();
    }
    onclose(true);
  }
  async function unmerge(k: string) {
    app.aliases = await app.repo.setAlias(`${kind}:${k}`, null);
    await renamed();
  }
  function edit(id: string) {
    onclose(false);
    app.emit({ t: 'edit', id });
  }
</script>

{#snippet thumb()}
  <span class="thumb" style={thumbStyle(itemTint(card?.name ?? key))}>{initials(card?.name ?? key)}</span>
{/snippet}

{#snippet editBtn(id: string)}
  <button type="button" class="lact" onclick={() => edit(id)}><Icon name="pencil" /><span>Edit</span></button>
{/snippet}

<Sheet
  bind:this={sheet}
  {thumb}
  title={card?.name ?? key}
  sub={card
    ? `${NOUN[kind]} · ${card.uses} ${card.uses === 1 ? 'time' : 'times'} · last ${card.last ? ago(card.last, app.today) : '—'}`
    : NOUN[kind]}
  cancel="Cancel"
  ok={plan.ok}
  {leaving}
  oncancel={() => onclose(true)}
  onok={ok}
>
  {#if card && kind === 'food'}
    {@const dims = Object.keys(card.bases) as (keyof Card['bases'])[]}
    <div class="su-group" style="--d:80">
      <span class="su-label">Values</span>
      <div class="su-rows">
        {#each dims as dim (dim)}
          {@const b = card.bases[dim]!}
          {@const from = shown.get(card.from[dim] ?? '')}
          {@const macros = MACROS.filter(([k]) => b[k] != null)
            .map(([k, n]) => `${n[0]} ${enf(b[k]!, 1)}g`)
            .join(' · ')}
          <div class="su-row top">
            <span class="su-name">
              {b.kcal != null ? `${nf(b.kcal)} kcal` : macros} <small>per {amountText(b)}</small>
              {#if b.kcal != null && macros}<span class="su-hint">{macros}</span>{/if}
              {#if from}<span class="su-line">{@html linesOf(from)}</span><span class="su-hint">Stated {ago(from.date, app.today)}</span
                >{/if}
            </span>
            {#if from}{@render editBtn(from.id)}{/if}
          </div>
        {:else}
          <div class="su-row">
            <span class="su-name"
              >Needs values<span class="su-hint">Log it once with its kcal p c f; every line of it reads from there.</span></span
            >
          </div>
        {/each}
      </div>
    </div>
  {:else if card}
    {@const last = shown.get(card.lastEntry ?? '')}
    {#if last}
      <div class="su-group" style="--d:80">
        <span class="su-label">Last time</span>
        <div class="su-rows">
          <div class="su-row top">
            <span class="su-name"
              ><span class="su-line">{@html linesOf(last)}</span><span class="su-hint">{ago(last.date, app.today)}</span></span
            >
            {@render editBtn(last.id)}
          </div>
        </div>
      </div>
    {/if}
  {/if}
  <div class="su-group" style="--d:130">
    <span class="su-label">Name</span>
    <div class="su-rows">
      <div class="su-row">
        <input
          class="su-text"
          aria-label="Name"
          spellcheck="false"
          autocomplete="off"
          bind:this={field}
          bind:value={name}
          onkeydown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void ok();
            }
          }}
        />
      </div>
      {#if near.length}
        <div class="su-row su-wrap">
          <span class="su-hint">The same thing? Tap to use its name and merge</span>
          <span class="su-pills">
            {#each near as n (n.id)}
              <button
                type="button"
                class="lact"
                onclick={() => {
                  name = n.name;
                  field.focus();
                }}>{n.name}<small>{n.uses}×</small></button
              >
            {/each}
          </span>
        </div>
      {/if}
      {#if merged.length}
        <div class="su-row su-wrap">
          <span class="su-hint">Merged into this · tap to split one off again</span>
          <span class="su-pills">
            {#each merged as k (k)}
              <button type="button" class="lact" onclick={() => unmerge(k)}>{k}<Icon name="x" /></button>
            {/each}
          </span>
        </div>
      {/if}
      {#if plan.note}<p class="su-hint su-note">{plan.note}</p>{/if}
    </div>
  </div>
</Sheet>
