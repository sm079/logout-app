<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { registerServiceWorker } from '#lib/app/pwa.svelte.ts';
  import { initAnalytics } from '#lib/observe/analytics.ts';
  import { initErrors, reportUncaught } from '#lib/observe/errors.ts';

  let { children }: { children: Snippet } = $props();
  onMount(() => {
    void initErrors();
    void initAnalytics();
    registerServiceWorker();
    // Errors outside a page load (a click, a worker) are reported too
    addEventListener('error', e => reportUncaught(e.error ?? e.message));
    addEventListener('unhandledrejection', e => reportUncaught(e.reason));
  });
</script>

{@render children()}
