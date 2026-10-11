<!-- Says a new version is ready, and reloads into it when asked -->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { applyUpdate, pwa } from './pwa.svelte.ts';
</script>

{#if pwa.waiting}
  <div class="update" role="status">
    <span class="update-text"><b>A new version is ready</b><span>Reload to use it. Your log stays as it is.</span></span>
    <button type="button" class="lact lsave" onclick={applyUpdate}><Icon name="check" />Reload</button>
  </div>
{/if}
