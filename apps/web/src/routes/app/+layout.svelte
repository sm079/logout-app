<script lang="ts">
  import '#lib/styles/app.ts';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>Logout</title>
</svelte:head>

{@render children()}
