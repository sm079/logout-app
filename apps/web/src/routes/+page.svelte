<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<svelte:head>
  <title>Logout</title>
</svelte:head>

<main>
  <h1>Logout</h1>
  <p>A fitness log you type into.</p>
  <a href={resolve('/app')} data-sveltekit-reload>Open the app</a>
</main>
