<!--
  The composer on the landing page: the real engine reads what a visitor types, in their browser, and nothing is
  stored. Lines are coloured as they're read and each one's result sits at its end.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { preview, type Mode } from '@logout/engine';
  import { sumParts } from '../logic/format.ts';
  import { markup } from '../logic/markup.ts';
  import { placeReadouts, type Overflow } from '../ui/readouts.ts';

  const EXAMPLES: Record<Mode, string[]> = {
    strength: ['bench press 3x8 60kg @8', 'squat 100x5, 110x3, 120x1', 'pull-ups 4x8 +10kg'],
    cardio: ['easy run 8km 46:30 145bpm', 'track intervals 6x800m', 'steps 9,400'],
    food: ['chicken breast 200g 330kcal 62p 0c 7f', 'oats 80g /100g 380kcal 13p 67c 7f', '2 eggs per piece 72kcal 6p 0c 5f, water 500ml']
  };
  const LABEL: Record<Mode, string> = { strength: 'Strength', cardio: 'Cardio', food: 'Food' };

  let mode = $state<Mode>('strength');
  let text = $state(EXAMPLES.strength[0]!);
  let ta: HTMLTextAreaElement, mirror: HTMLDivElement, field: HTMLDivElement;
  let overflow = $state.raw<Overflow[]>([]);
  const read = $derived(text.trim() ? preview(null, text, mode) : null);
  const total = $derived(
    read
      ? sumParts(read.sum, { load: 'kg', dist: 'km' })
          .slice(0, 3)
          .map(p => p[1])
          .join(' · ')
      : ''
  );

  function draw() {
    if (!mirror) return;
    // The mirror is drawn by hand: its text must match the textarea's glyph for glyph
    // eslint-disable-next-line svelte/no-dom-manipulating
    mirror.innerHTML = markup(text, read ? read.res : [], { readouts: true }) + '\u200b';
    overflow = placeReadouts(mirror);
    field.style.height = `${Math.max(46, mirror.offsetHeight)}px`;
  }
  $effect(() => {
    void read;
    draw();
  });
  function pick(m: Mode) {
    mode = m;
    text = EXAMPLES[m][0]!;
  }
  function example(line: string) {
    const t = text.trim();
    text = t ? `${t}\n${line}` : line;
    ta.focus();
  }
  onMount(() => {
    document.fonts?.ready.then(draw);
    addEventListener('resize', draw);
    return () => removeEventListener('resize', draw);
  });
</script>

<div class="s-try">
  <div class="s-modes" role="tablist" aria-label="What you're logging">
    {#each Object.keys(LABEL) as Mode[] as m (m)}
      <button type="button" role="tab" aria-selected={mode === m} onclick={() => pick(m)}>{LABEL[m]}</button>
    {/each}
  </div>
  <div class="composer s-composer">
    <div class="field" class:has-text={!!text} bind:this={field}>
      <label for="try" class="vh">Type a line to see how Logout reads it</label>
      <div class="mirror" bind:this={mirror} aria-hidden="true"></div>
      <textarea id="try" rows="1" spellcheck="false" autocomplete="off" maxlength="600" bind:this={ta} bind:value={text}></textarea>
    </div>
    {#if overflow.length}
      <p class="ro-more" aria-hidden="true">
        {#each overflow as o, i (i)}<span class:needs={o.needs}
            >{#if o.name}<i>{o.name}</i>{/if}{o.text}</span
          >{/each}
      </p>
    {/if}
  </div>
  <div class="s-try-foot">
    <div class="s-examples">
      {#each EXAMPLES[mode].slice(1) as line (line)}
        <button type="button" onclick={() => example(line)}>+ {line}</button>
      {/each}
    </div>
    <p class="s-total" aria-live="polite">{total || 'Type a line'}</p>
  </div>
</div>
