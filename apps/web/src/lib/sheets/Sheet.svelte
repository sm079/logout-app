<!-- A sheet: one screen over the app at a time, with a header, a scrolling body and two actions. The OK button can
     say under its name what it will do (`meta`). -->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { REDUCE, replay, roll } from '../ui/motion.ts';

  let {
    thumb,
    title,
    sub,
    cancel,
    ok,
    meta = '',
    cls = '',
    oncancel,
    onok,
    leaving = false,
    children
  }: {
    thumb: Snippet;
    title: string;
    sub: string;
    cancel: string;
    ok: string;
    meta?: string;
    /** Extra classes on the sheet, for a layout of its own */
    cls?: string;
    oncancel: () => void;
    onok: () => void;
    leaving?: boolean;
    children: Snippet;
  } = $props();

  let titleEl: HTMLHeadingElement, okBtn: HTMLButtonElement;
  /** Shakes the OK button when what's filled in can't be taken */
  export function refuse() {
    replay(okBtn, 'shake');
  }
  onMount(() => titleEl.focus({ preventScroll: true }));
</script>

<div class="setup {cls}" class:out={leaving && !REDUCE} role="dialog" aria-modal="true" aria-labelledby="suTitle">
  <div class="su-scroll">
    <header class="su-head" style="--d:30">
      {@render thumb()}
      <div>
        <h2 class="su-title" id="suTitle" tabindex="-1" bind:this={titleEl}>{title}</h2>
        <p class="su-sub">{sub}</p>
      </div>
    </header>
    {@render children()}
  </div>
  <div class="su-actions">
    <button type="button" class="su-skip press" onclick={oncancel}>{cancel}</button>
    <button
      type="button"
      class="log"
      aria-label={ok.charAt(0) + ok.slice(1).toLowerCase() + (meta ? `: ${meta}` : '')}
      bind:this={okBtn}
      onclick={onok}
    >
      <span class="log-face">
        <span class="log-title"><span class="roll" use:roll={{ text: ok }}></span></span>
        <span class="log-meta" class:has-sum={!!meta}><span class="roll" use:roll={{ text: meta || ' ' }}></span></span>
      </span>
    </button>
  </div>
</div>
