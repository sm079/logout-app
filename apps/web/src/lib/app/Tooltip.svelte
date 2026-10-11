<!-- A short hint above an element, shown once and gone in a moment -->
<script lang="ts">
  import { app } from '../state/app.svelte.ts';
  import { replay } from '../ui/motion.ts';

  let { screen }: { screen: HTMLElement | undefined } = $props();
  let el: HTMLDivElement;
  let text = $state('');
  let t: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const m = app.hintMsg;
    if (!m || !screen) return;
    text = m.text;
    requestAnimationFrame(() => {
      const sr = screen.getBoundingClientRect(),
        r = m.el.getBoundingClientRect(),
        w = el.offsetWidth;
      const x = Math.max(w / 2 + 12, Math.min(screen.offsetWidth - w / 2 - 12, r.left + r.width / 2 - sr.left));
      el.style.left = `${x}px`;
      el.style.top = `${r.top - sr.top - 8}px`;
      replay(el, 'show');
      clearTimeout(t);
      t = setTimeout(() => el.classList.remove('show'), 1700);
    });
  });
</script>

<div class="tip" bind:this={el} aria-hidden="true">{text}</div>
