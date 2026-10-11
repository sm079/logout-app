<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { registerServiceWorker } from '#lib/app/pwa.svelte.ts';

  let { children }: { children: Snippet } = $props();
  onMount(registerServiceWorker);
</script>

{@render children()}
