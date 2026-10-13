<!--
  Signing in with a code sent by email, as one of the setup's cards: the address, then the code in six boxes, then a
  tick. The code is checked as soon as its last digit is in, so there's nothing more to press. `beforeVerify` runs
  just before it's checked.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { cubicIn } from 'svelte/easing';
  import { MTINT, thumbStyle } from '../logic/palette.ts';
  import { account, CODE_LENGTH, CODE_WAIT, sendCode, useAnotherEmail, verifyCode } from '../sync/account.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import { REDUCE, replay, roll } from '../ui/motion.ts';

  let {
    beforeVerify,
    autofocus = false
  }: {
    beforeVerify?: () => Promise<void>;
    /** Puts the cursor in the field from the start */
    autofocus?: boolean;
  } = $props();

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const STAGES = ['email', 'code', 'done'] as const;

  let email = $state(account.email);
  let code = $state('');
  let now = $state(Date.now());
  let resending = $state(false);
  let focused = $state(false);
  let emailEl = $state<HTMLInputElement>(),
    codeEl = $state<HTMLInputElement>(),
    boxes = $state<HTMLElement>();

  const stage = $derived(account.user ? 'done' : resending || account.step === 'code' || account.step === 'verifying' ? 'code' : 'email');
  const valid = $derived(EMAIL.test(email.trim()));
  const sending = $derived(account.step === 'sending');
  const checking = $derived(account.step === 'verifying');
  const wait = $derived(Math.max(0, Math.ceil((account.sentAt + CODE_WAIT * 1000 - now) / 1000)));
  const head = $derived(
    stage === 'email'
      ? { name: 'Email', caption: `We’ll send you a ${CODE_LENGTH}-digit code` }
      : stage === 'code'
        ? { name: 'Enter the code', caption: `Sent to ${account.email}` }
        : { name: 'Signed in', caption: account.user?.email ?? account.email }
  );

  // Forward through the stages, the next pane comes in from the right; changing the email goes back
  let dir = $state(1),
    last: (typeof STAGES)[number] = untrack(() => stage);
  $effect.pre(() => {
    const s = stage;
    untrack(() => {
      dir = STAGES.indexOf(s) >= STAGES.indexOf(last) ? 1 : -1;
      last = s;
    });
  });

  // The cursor follows the stage: the code's boxes once it's sent, the email when it's changed
  let settled = false;
  $effect(() => {
    const s = stage;
    if (!settled) {
      settled = true;
      if (!autofocus) return;
    }
    void tick().then(() => (s === 'code' ? codeEl : s === 'email' ? emailEl : null)?.focus({ preventScroll: true }));
  });
  $effect(() => {
    if (stage !== 'code') return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  onMount(() => () => {
    if (account.step === 'sending' || account.step === 'verifying') return;
    account.error = '';
  });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    if (!valid || sending) return;
    code = '';
    await sendCode(email);
  }
  async function resend() {
    resending = true;
    code = '';
    await sendCode(account.email);
    // Refused (too soon, say), the code's boxes stay, with the reason under them
    if (account.step === 'email') account.step = 'code';
    resending = false;
    codeEl?.focus({ preventScroll: true });
  }
  function changeEmail() {
    code = '';
    useAnotherEmail();
  }

  // Digits only, whether typed, pasted with a space in it or filled in from the email by the keyboard
  function typed(field: HTMLInputElement) {
    code = field.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    field.value = code;
    if (account.error) account.error = '';
    if (code.length === CODE_LENGTH) void check();
  }
  async function check() {
    if (checking) return;
    await beforeVerify?.();
    await verifyCode(code);
    if (account.user || !account.error) return;
    code = '';
    if (!REDUCE) replay(boxes, 'shake');
    await tick();
    codeEl?.focus({ preventScroll: true });
  }

  // A pane leaves quickly the other way, as the setup's screens do; the next arrives on a spring (CSS)
  function leave(_: Element) {
    const d = dir;
    return {
      duration: REDUCE ? 0 : 180,
      easing: cubicIn,
      css: (t: number, u: number) => `opacity:${t};transform:translateX(${-u * 18 * d}px);filter:blur(${u * 4}px)`
    };
  }
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<div class="tn-card ac" class:done={stage === 'done'}>
  <div class="tn-card-head">
    <span class="thumb tn-thumb" style={thumbStyle(MTINT[stage === 'done' ? 'good' : 'sleep'])}>
      {#key stage === 'done'}<span class="ic tn-ico"><Icon name={stage === 'done' ? 'check' : 'mail'} /></span>{/key}
    </span>
    <span class="tn-card-name">
      <b><span class="roll" use:roll={{ text: head.name, dir }}></span></b>
      <small class="ac-caption"><span class="roll" use:roll={{ text: head.caption, dir }}></span></small>
    </span>
    {#if stage === 'code'}
      <button type="button" class="ob-link ac-change press" onclick={changeEmail}>Change</button>
    {/if}
  </div>

  <div class="ac-body">
    {#key stage === 'email'}
      <div class="ac-pane" style="--dir:{dir}" out:leave>
        {#if stage === 'email'}
          <form class="ac-row" onsubmit={send}>
            <input
              class="ac-field"
              type="email"
              autocomplete="email"
              inputmode="email"
              autocapitalize="off"
              spellcheck="false"
              enterkeyhint="send"
              placeholder="you@example.com"
              aria-label="Email"
              bind:value={email}
              bind:this={emailEl}
            />
            <button type="submit" class="ac-go press" class:ready={valid} disabled={!valid || sending}>
              {#if sending}<span class="ac-spin" aria-hidden="true"></span>{/if}
              <span>{sending ? 'Sending' : 'Send code'}</span>
            </button>
          </form>
          {@render note()}
        {:else}
          <label class="ac-code" class:checking class:bad={!!account.error} class:ok={stage === 'done'} bind:this={boxes}>
            <input
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]*"
              aria-label="Code from the email"
              disabled={checking || stage === 'done'}
              value={code}
              bind:this={codeEl}
              oninput={e => typed(e.currentTarget)}
              onfocus={() => (focused = true)}
              onblur={() => (focused = false)}
            />
            {#each { length: CODE_LENGTH } as _, i (i)}
              <span
                class="ac-box"
                class:full={i < code.length}
                class:at={focused && !checking && i === Math.min(code.length, CODE_LENGTH - 1)}
                style="--i:{i}"
                >{#if code[i]}<b>{code[i]}</b>{/if}</span
              >
            {/each}
          </label>
          {@render note()}
        {/if}
      </div>
    {/key}
  </div>
</div>

<!-- One line under the field: what's happening, or what went wrong -->
{#snippet note()}
  {#if account.error}
    <p class="ac-note ac-err" role="alert">{account.error}</p>
  {:else if stage === 'email'}
    <p class="ac-note">No password. The code signs you in.</p>
  {:else if stage === 'done'}
    <p class="ac-note" aria-live="polite">Your log syncs to this account from now on.</p>
  {:else if checking}
    <p class="ac-note" aria-live="polite">Checking…</p>
  {:else if sending}
    <p class="ac-note" aria-live="polite">Sending a new code…</p>
  {:else if wait}
    <p class="ac-note">No email? Check spam, or wait <span class="ac-wait">{clock(wait)}</span> for a new code.</p>
  {:else}
    <p class="ac-note">No email? Check spam, or <button type="button" class="ac-again" onclick={resend}>send a new code</button>.</p>
  {/if}
{/snippet}
