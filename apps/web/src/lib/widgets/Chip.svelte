<!-- A widget's chip: a tinted thumb, a small qualifier and the metric's name. Selectable chips open the metric picker. -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { replay, roll } from '../ui/motion.ts';
  import type { Tint } from '../logic/palette.ts';

  let {
    qual,
    name,
    tint,
    icon,
    dir = 1,
    selectable = false,
    wide = false,
    open = false,
    label = '',
    onclick,
    el = $bindable()
  }: {
    qual: string;
    name: string;
    tint: Tint;
    icon: IconName;
    dir?: number;
    selectable?: boolean;
    wide?: boolean;
    open?: boolean;
    label?: string;
    onclick?: () => void;
    el?: HTMLElement;
  } = $props();

  let thumb: HTMLSpanElement, ico: HTMLSpanElement;
  let shown: IconName | null = null,
    shownTint = '';
  // A new metric or state swaps the icon and pulses the thumb
  $effect(() => {
    const key = tint.join();
    if (shown && (icon !== shown || key !== shownTint)) {
      if (icon !== shown) replay(ico, 'swap');
      replay(thumb, 'pulse');
    }
    shown = icon;
    shownTint = key;
  });
</script>

{#snippet face()}
  <span class="thumb" bind:this={thumb} style="--tc:{tint[0]};--ti:{tint[1]}">
    <span class="ico ic" bind:this={ico}><Icon name={icon} /></span>
  </span>
  <span class="ctx-text">
    <span class="ctx-label roll" use:roll={{ text: qual, dir }}></span>
    <span class="wchip-name">
      <span class="roll" use:roll={{ text: name, dir }}></span>
      {#if selectable}<span class="ic chev"><Icon name="chevDown" /></span>{/if}
    </span>
  </span>
{/snippet}

{#if selectable}
  <button
    type="button"
    class="wchip press"
    class:wide
    class:open
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={label}
    bind:this={el}
    {onclick}
  >
    {@render face()}
  </button>
{:else}
  <div class="wchip" class:wide bind:this={el}>
    {@render face()}
  </div>
{/if}
