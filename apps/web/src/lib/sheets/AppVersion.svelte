<!--
  Which LogOut this is, at the foot of the profile. A newer version waits here until it's asked for, so an open log
  is never reloaded under you.
-->
<script lang="ts">
  import { applyUpdate, pwa } from '../app/pwa.svelte.ts';
  import { account } from '../sync/account.svelte.ts';
  import Icon from '../ui/Icon.svelte';

  const version = `v${__APP_VERSION__}${__APP_COMMIT__ ? ` · ${__APP_COMMIT__}` : ''}`;
  // Another device reads lines with a newer engine: this one should catch up, so both read them the same way
  const behind = $derived(account.newerEngine);
  function update() {
    if (pwa.waiting) applyUpdate();
    else location.reload();
  }
</script>

<footer class="pf-about" style="--d:440">
  <span class="pf-about-brand"><img src="/mark.svg" alt="" width="21" height="16" /><b>LogOut</b><small>{version}</small></span>
  {#if pwa.waiting || behind}
    <span class="pf-about-new" role="status">
      <i class="su-dot" aria-hidden="true"></i>
      <span>{behind ? 'Another of your devices has a newer LogOut' : 'A new version is ready'}</span>
      <button type="button" class="lact" onclick={update}><Icon name="refresh" /><span>Update</span></button>
    </span>
  {/if}
</footer>
