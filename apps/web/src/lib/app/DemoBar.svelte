<!-- In the demo: what this is, and the way to a log of your own -->
<script lang="ts">
  import { resolve } from '$app/paths';
  import Icon from '../ui/Icon.svelte';

  let hidden = $state(false);
</script>

{#if !hidden}
  <div class="update demo-bar" role="note">
    <span class="update-text"><b>You're in the demo</b><span>Seven years of made-up logs. What you type stays in this browser.</span></span>
    <a class="lact lsave" href={resolve('/app')} data-sveltekit-reload>Start yours</a>
    <button type="button" class="lact" aria-label="Hide" onclick={() => (hidden = true)}><Icon name="x" /></button>
  </div>
{/if}
