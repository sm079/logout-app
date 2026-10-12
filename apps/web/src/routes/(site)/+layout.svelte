<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '#lib/styles/tokens.css';
  import '#lib/styles/base.css';
  import '#lib/styles/screen.css';
  import '#lib/styles/dock.css';
  import '#lib/styles/logs.css';
  import '#lib/styles/site.css';
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  let y = $state(0);
</script>

<svelte:window bind:scrollY={y} />

<div class="s-page">
  <header class="s-head" class:scrolled={y > 8}>
    <div class="s-bar">
      <a class="s-brand" href={resolve('/(site)')}>
        <img src="/icon.svg" alt="" width="28" height="28" />
        <span>LogOut</span>
      </a>
      <nav class="s-nav" aria-label="Site">
        <a href={resolve('/demo')} data-sveltekit-reload>Demo</a>
        <a class="s-cta small" href={resolve('/app')} data-sveltekit-reload>Open the app</a>
      </nav>
    </div>
  </header>

  {@render children()}

  <footer class="s-foot">
    <div class="s-foot-top">
      <div class="s-foot-brand">
        <a class="s-brand" href={resolve('/(site)')}>
          <img src="/icon.svg" alt="" width="28" height="28" />
          <span>LogOut</span>
        </a>
        <p>A fitness log you type into.</p>
      </div>
      <nav class="s-foot-cols" aria-label="Footer">
        <div>
          <h2>Product</h2>
          <ul>
            <li><a href={resolve('/app')} data-sveltekit-reload>Open the app</a></li>
            <li><a href={resolve('/demo')} data-sveltekit-reload>Demo</a></li>
            <li><a href="{resolve('/(site)')}#reads">What it reads</a></li>
          </ul>
        </div>
        <div>
          <h2>Get the app</h2>
          <ul>
            <li><a href={resolve('/app')} data-sveltekit-reload>iPhone</a></li>
            <li><a href={resolve('/app')} data-sveltekit-reload>Android</a></li>
            <li><a href={resolve('/app')} data-sveltekit-reload>Desktop</a></li>
          </ul>
        </div>
        <div>
          <h2>Legal</h2>
          <ul>
            <li><a href={resolve('/(site)/privacy')}>Privacy</a></li>
          </ul>
        </div>
      </nav>
    </div>
    <div class="s-foot-base">
      <span>© 2026 LogOut</span>
      <span>Runs on your device. Works offline.</span>
    </div>
    <div class="s-mark" aria-hidden="true">LogOut</div>
  </footer>
</div>
