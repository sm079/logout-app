<!--
  The first-run setup, over the whole screen. It ends by handing over to the app: as the app puts itself together
  underneath, the setup clears away and its button, now LOG, travels into the place of the app's own LOG. Opened
  with `?onboard` on a device that's already set up, it's a preview and saves nothing.

  There are two ways to sign in on the way. From the welcome, someone who has an account brings its profile and log
  with them and the setup ends there. On the last screen, the answers are kept as sign-in begins, so a new account
  takes them up with its first sync; the code's boxes light up, and the setup ends a moment later.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { app } from '../state/app.svelte.ts';
  import { account } from '../sync/account.svelte.ts';
  import { REDUCE } from '../ui/motion.ts';
  import { finishSetup, keepAnswers, skipSetup, startValues, type SetupValues } from './setup.svelte.ts';
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
  let root: HTMLDivElement;
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
    setTimeout(onend, REDUCE ? 0 : 1050);
    if (REDUCE) return;
    await tick();
    requestAnimationFrame(handOver);
  }
  // The button keeps its size of text and corners as it goes: it's resized, not scaled
  function handOver() {
    const from = root.querySelector<HTMLElement>('.ob-cta .log'),
      to = document.querySelector<HTMLElement>('.screen .actions .log');
    if (!from || !to) return;
    // The dock is still rising into place; aim for where it stops
    const t = getComputedStyle(to.closest('.dock') ?? to).transform;
    const rise = t && t !== 'none' ? new DOMMatrix(t).m42 : 0;
    const a = from.getBoundingClientRect(),
      b = to.getBoundingClientRect();
    const easing = getComputedStyle(root).getPropertyValue('--spring-soft').trim() || 'ease-out';
    from.animate(
      [
        { width: `${a.width}px`, height: `${a.height}px`, transform: 'none' },
        { width: `${b.width}px`, height: `${b.height}px`, transform: `translate(${b.left - a.left}px, ${b.top - rise - a.top}px)` }
      ],
      { duration: 800, easing, fill: 'forwards' }
    );
  }
  // Signing in from the last screen: the answers it ends with, kept before the code was checked
  let kept: SetupValues | null = null;
  async function keep(v: SetupValues) {
    kept = v;
    if (!preview) await keepAnswers(v);
  }
  // Signing in from the welcome brings the account's profile and log, so there's nothing left to set up; from the
  // last screen, the setup ends once its card has shown it's done
  $effect(() => {
    if (!account.user) return;
    untrack(() => {
      if (kept) setTimeout(() => void end(kept), REDUCE ? 400 : 1300);
      else if (!preview) void end(null);
    });
  });
</script>

<div class="ob" class:out={leaving} role="dialog" aria-modal="true" aria-label="Set up LogOut" bind:this={root}>
  {#if preview}<p class="ob-preview">Preview · nothing is saved</p>{/if}
  <div class="ob-flow">
    <Tune
      {values}
      {leaving}
      onfinish={v => void end(v)}
      onskip={() => void end(null)}
      onsignin={canSignIn ? () => (signingIn = true) : null}
      sync={canSignIn}
      onkeep={keep}
    />
  </div>
  {#if signingIn}<SignIn onclose={() => (signingIn = false)} />{/if}
</div>
