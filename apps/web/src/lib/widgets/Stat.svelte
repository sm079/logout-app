<!-- A widget's number: value, unit, and how it compares (an arrow toned by whether up is good) -->
<script lang="ts">
  import { roll } from '../ui/motion.ts';

  let {
    num,
    unit,
    meta,
    d = 0,
    up = null,
    dir = 1,
    instant = false,
    inline = true
  }: {
    num: string;
    unit: string;
    meta: string;
    d?: number;
    up?: boolean | null;
    dir?: number;
    instant?: boolean;
    inline?: boolean;
  } = $props();

  const arrow = $derived.by(() => {
    const way = Math.abs(d) < 1e-9 ? '' : d > 0 ? 'up' : 'down';
    const tone = !way || up == null ? '' : (way === 'up') === up ? ' good' : ' bad';
    return 'arrow' + (way ? ` ${way}${tone}` : '');
  });
</script>

{#snippet body()}
  <div class="wvalue">
    <span class="wnum roll" use:roll={{ text: num, dir, instant }}></span>
    <span class="wunit roll" use:roll={{ text: unit, dir, instant }}></span>
  </div>
  <span class="wmeta"><i class={arrow}></i><span class="roll" use:roll={{ text: meta, dir, instant }}></span></span>
{/snippet}

{#if inline}
  <div class="wstat">{@render body()}</div>
{:else}
  {@render body()}
{/if}
