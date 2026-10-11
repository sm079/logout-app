<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '#lib/styles/tokens.css';
  import '#lib/styles/base.css';
  import '#lib/styles/dock.css';
  import '#lib/styles/site.css';
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="s-page">
  <header class="s-head">
    <a class="s-brand" href={resolve('/(site)')}>
      <img src="/icon.svg" alt="" width="28" height="28" />
      <span>Logout</span>
    </a>
    <nav class="s-nav" aria-label="Site">
      <a href={resolve('/demo')} data-sveltekit-reload>Demo</a>
      <a class="s-cta small" href={resolve('/app')} data-sveltekit-reload>Open the app</a>
    </nav>
  </header>

  {@render children()}

  <footer class="s-foot">
    <span>Logout · a fitness log you type into</span>
    <nav aria-label="Footer">
      <a href={resolve('/(site)/privacy')}>Privacy</a>
      <a href={resolve('/demo')} data-sveltekit-reload>Demo</a>
      <a href={resolve('/app')} data-sveltekit-reload>Open the app</a>
    </nav>
  </footer>
</div>
