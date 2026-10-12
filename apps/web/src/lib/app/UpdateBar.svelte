<!-- Says a new version is ready, and reloads into it when asked -->
<script lang="ts">
  import { account } from '../sync/account.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import { applyUpdate, pwa } from './pwa.svelte.ts';

  // Another device reads lines with a newer engine: this one should catch up, so both read them the same way
  const behind = $derived(account.newerEngine);
  function reload() {
    if (pwa.waiting) applyUpdate();
    else location.reload();
  }
</script>

{#if pwa.waiting || behind}
  <div class="update" role="status">
    <span class="update-text">
      {#if behind}
        <b>Update to read your log the same way</b><span>Another of your devices has a newer LogOut.</span>
      {:else}
        <b>A new version is ready</b><span>Reload to use it. Your log stays as it is.</span>
      {/if}
    </span>
    <button type="button" class="lact lsave" onclick={reload}><Icon name="check" />Reload</button>
  </div>
{/if}
