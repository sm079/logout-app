<!-- One example line, coloured as Logout reads it, with what it comes to -->
<script lang="ts">
  import { readout, type Resolved } from '@logout/engine';
  import { markup } from '../logic/markup.ts';

  let { text, res }: { text: string; res: Resolved[] } = $props();
  const result = $derived(
    res
      .map(readout)
      .filter(r => r && r !== 'check-in')
      .join(' · ')
  );
</script>

<li class="s-line">
  <code>{@html markup(text, res)}</code>
  {#if result}<span>{result}</span>{/if}
</li>
