<!--
  The first-run setup: one of the flows, over the whole screen. It ends by lifting away while the app puts itself
  together underneath. Opened with `?onboard=`, a strip on top switches between the flows; on a device that's
  already set up that's a preview, and it saves nothing.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { ProfileValues } from '../sheets/profile.ts';
  import { app } from '../state/app.svelte.ts';
  import { account } from '../sync/account.svelte.ts';
  import { REDUCE } from '../ui/motion.ts';
  import FirstLine from './FirstLine.svelte';
  import { FLOWS, type FlowId } from './flows.ts';
  import ScriptFlow from './Script.svelte';
  import { finishSetup, skipSetup, startValues } from './setup.svelte.ts';
  import SignIn from './SignIn.svelte';
  import Tune from './Tune.svelte';

  let {
    flow: asked,
    preview,
    switcher,
    onleave,
    onend
  }: {
    flow: FlowId;
    preview: boolean;
    /** Show the strip that switches flows */
    switcher: boolean;
    /** The setup has started to leave: time to put the app behind it */
    onleave: () => void;
    /** It has gone */
    onend: () => void;
  } = $props();

  let flow = $state(untrack(() => asked));
  let ending = false;
  let leaving = $state(false);
  let signingIn = $state(false);
  // Each flow starts from the same values, fresh each time it's switched to
  const values = $derived.by(() => {
    void flow;
    return untrack(startValues);
  });
  const canSignIn = $derived(account.configured && !app.demo && !account.user);

  async function end(v: ProfileValues | null) {
    if (ending) return;
    ending = true;
    signingIn = false;
    if (!preview) await (v ? finishSetup(v, flow) : skipSetup(flow));
    leaving = true;
    onleave();
    setTimeout(onend, REDUCE ? 0 : 760);
  }
  // Signing in brings the account's profile and log, so there's nothing left to set up
  $effect(() => {
    if (account.user && !preview) untrack(() => void end(null));
  });

  const common = $derived({
    values,
    preview,
    onfinish: (v: ProfileValues) => void end(v),
    onskip: () => void end(null),
    onsignin: canSignIn ? () => (signingIn = true) : null
  });
</script>

<div class="ob" class:out={leaving} role="dialog" aria-modal="true" aria-label="Set up LogOut">
  {#if switcher}
    <div class="ob-switch" role="group" aria-label="Setup flow">
      {#each FLOWS as f (f.id)}
        <button type="button" class="press" aria-pressed={flow === f.id} onclick={() => (flow = f.id)}>{f.name}</button>
      {/each}
      {#if preview}<span>Preview · nothing is saved</span>{/if}
    </div>
  {/if}
  <div class="ob-flow">
    {#key flow}
      {#if flow === 'line'}
        <FirstLine {...common} />
      {:else if flow === 'tune'}
        <Tune {...common} />
      {:else}
        <ScriptFlow {...common} />
      {/if}
    {/key}
  </div>
  {#if signingIn}<SignIn onclose={() => (signingIn = false)} />{/if}
</div>
