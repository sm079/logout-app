<script lang="ts">
  import '#lib/styles/app.ts';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>LogOut demo</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{@render children()}
