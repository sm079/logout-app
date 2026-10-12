<!--
  The first-run setup, over the whole screen. It ends by lifting away while the app puts itself together
  underneath. Opened with `?onboard` on a device that's already set up, it's a preview and saves nothing.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../state/app.svelte.ts';
  import { account } from '../sync/account.svelte.ts';
  import { REDUCE } from '../ui/motion.ts';
  import { finishSetup, skipSetup, startValues, type SetupValues } from './setup.svelte.ts';
  import SignIn from './SignIn.svelte';
  import Tune from './Tune.svelte';

  let {
    preview,
    onleave,
    onend
  }: {
    preview: boolean;
    /** The setup has started to leave: time to put the app behind it */
    onleave: () => void;
    /** It has gone */
    onend: () => void;
  } = $props();

  const values = startValues();
  let ending = false;
  let leaving = $state(false);
  let signingIn = $state(false);
  const canSignIn = $derived(account.configured && !app.demo && !account.user);

  async function end(v: SetupValues | null) {
    if (ending) return;
    ending = true;
    signingIn = false;
    if (!preview) await (v ? finishSetup(v) : skipSetup());
    leaving = true;
    onleave();
    setTimeout(onend, REDUCE ? 0 : 760);
  }
  // Signing in brings the account's profile and log, so there's nothing left to set up
  $effect(() => {
    if (account.user && !preview) untrack(() => void end(null));
  });
</script>

<div class="ob" class:out={leaving} role="dialog" aria-modal="true" aria-label="Set up LogOut">
  {#if preview}<p class="ob-preview">Preview · nothing is saved</p>{/if}
  <div class="ob-flow">
    <Tune {values} onfinish={v => void end(v)} onskip={() => void end(null)} onsignin={canSignIn ? () => (signingIn = true) : null} />
  </div>
  {#if signingIn}<SignIn onclose={() => (signingIn = false)} />{/if}
</div>
