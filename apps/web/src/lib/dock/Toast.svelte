<!-- Confirms a log when the log isn't in view -->
<script lang="ts">
  import { app } from '../state/app.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import { replay } from '../ui/motion.ts';

  let el: HTMLDivElement;
  let t: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const m = app.toastMsg;
    if (!m) return;
    replay(el, 'show');
    clearTimeout(t);
    t = setTimeout(() => el.classList.remove('show'), 2800);
  });
</script>

<div class="toast" bind:this={el} role="status" aria-live="polite">
  <span class="toast-check"><span class="ic"><Icon name="check" /></span></span>
  <span><b>{app.toastMsg?.title ?? ''}</b><span class="toast-sub">{app.toastMsg?.sub ?? ''}</span></span>
</div>
