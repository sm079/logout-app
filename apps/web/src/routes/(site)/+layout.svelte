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
        <img src="/mark.svg" alt="" width="26" height="20" />
        <span>LogOut</span>
      </a>
      <nav class="s-nav" aria-label="Site">
        <a class="s-nav-link" href="{resolve('/(site)')}#how">How it works</a>
        <a class="s-nav-link" href="{resolve('/(site)')}#faq">FAQ</a>
        <a class="s-cta small" href={resolve('/app')} data-sveltekit-reload>Open the app</a>
      </nav>
    </div>
  </header>

  {@render children()}

  <footer class="s-foot">
    <div class="s-foot-top">
      <div class="s-foot-brand">
        <a class="s-brand" href={resolve('/(site)')}>
          <img src="/mark.svg" alt="" width="26" height="20" />
          <span>LogOut</span>
        </a>
        <p>A food and training log you type into.</p>
      </div>
      <nav class="s-foot-cols" aria-label="Footer">
        <div>
          <h2>Product</h2>
          <ul>
            <li><a href="{resolve('/(site)')}#how">How it works</a></li>
            <li><a href="{resolve('/(site)')}#install">Install</a></li>
            <li><a href={resolve('/demo')} data-sveltekit-reload>Demo</a></li>
            <li><a href={resolve('/app')} data-sveltekit-reload>Open the app</a></li>
          </ul>
        </div>
        <div>
          <h2>Help</h2>
          <ul>
            <li><a href="{resolve('/(site)')}#faq">FAQ</a></li>
            <li><a href="mailto:contact@logout.fit">Contact</a></li>
          </ul>
        </div>
        <div>
          <h2>Legal</h2>
          <ul>
            <li><a href={resolve('/(site)/privacy')}>Privacy</a></li>
            <li><a href={resolve('/(site)/terms')}>Terms</a></li>
          </ul>
        </div>
      </nav>
    </div>
    <div class="s-foot-base">
      <span>© 2026 LogOut</span>
      <a href="mailto:contact@logout.fit">contact@logout.fit</a>
    </div>
    <div class="s-mark" aria-hidden="true">LogOut</div>
  </footer>
</div>
