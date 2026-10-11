<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '#lib/styles/tokens.css';
  import '#lib/styles/base.css';
  import '#lib/styles/screen.css';
  import '#lib/styles/calendar.css';
  import '#lib/styles/widgets.css';
  import '#lib/styles/dock.css';
  import '#lib/styles/logs.css';
  import '#lib/styles/sheets.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <title>Logout</title>
  <meta name="theme-color" content="#0f1012" />
</svelte:head>

{@render children()}
