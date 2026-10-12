<!-- Signing in from the setup: a panel over it. Signed in, the account's profile and log come with it. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import AccountSection from '../sheets/AccountSection.svelte';
  import Icon from '../ui/Icon.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let panel: HTMLDivElement;

  onMount(() => {
    panel.querySelector<HTMLElement>('input')?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onclose();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  });
</script>

<div class="ob-signin" role="presentation">
  <button type="button" class="ob-scrim" aria-label="Close" tabindex="-1" onclick={onclose}></button>
  <div class="ob-panel" role="dialog" aria-modal="true" aria-labelledby="obSignTitle" bind:this={panel}>
    <header>
      <h2 id="obSignTitle">Welcome back</h2>
      <button type="button" class="ob-x press" aria-label="Close" onclick={onclose}><Icon name="x" /></button>
    </header>
    <AccountSection intro="Sign in with the email you use for LogOut. Your log and settings come with you." />
  </div>
</div>
