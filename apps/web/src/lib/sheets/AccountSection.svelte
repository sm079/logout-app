<!--
  Sync: sign in with a code sent to your email to keep your log on every device. Signed in, it says how sync is
  going; signing out removes the log from this device (it stays in the account). `bare` leaves out its own group and
  label, for a card that has them.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../state/app.svelte.ts';
  import { account, deleteAccount, runSync, sendCode, signOut, useAnotherEmail, verifyCode } from '../sync/account.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { roll } from '../ui/motion.ts';

  let {
    intro = 'Sign in with your email to keep your log on every device. Without it, it stays on this one.',
    bare = false
  }: { intro?: string; bare?: boolean } = $props();

  let email = $state(account.email);
  let code = $state('');
  let now = $state(Date.now());
  let armed = $state<'out' | 'unsynced' | null>(null);
  let armT: ReturnType<typeof setTimeout> | undefined;

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const status = $derived.by(() => {
    if (account.status === 'syncing') return 'Syncing…';
    if (account.status === 'offline') return 'Offline · changes sync when you’re back online';
    if (account.status === 'error') return 'Couldn’t sync just now · it tries again soon';
    if (!account.lastSync) return 'Not synced yet';
    const s = Math.round((now - account.lastSync) / 1000);
    return s < 60 ? 'Synced just now' : s < 3600 ? `Synced ${Math.round(s / 60)} min ago` : `Synced ${Math.round(s / 3600)} h ago`;
  });

  async function out() {
    if (armed === 'out' || armed === 'unsynced') {
      clearTimeout(armT);
      if ((await signOut(armed === 'unsynced')) === 'unsynced') armed = 'unsynced';
      return;
    }
    armed = 'out';
    clearTimeout(armT);
    armT = setTimeout(() => (armed = null), 4000);
  }

  let doomed = $state(false);
  let doomT: ReturnType<typeof setTimeout> | undefined;
  /** Two taps within four seconds */
  function del() {
    if (doomed) {
      clearTimeout(doomT);
      void deleteAccount();
      return;
    }
    doomed = true;
    doomT = setTimeout(() => (doomed = false), 4000);
  }
  async function toggleShare() {
    app.device = { ...app.device, shareUnread: !app.device.shareUnread };
    await app.repo.saveDevice($state.snapshot(app.device));
  }

  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 20000);
    return () => clearInterval(t);
  });
</script>

{#if account.configured && !app.demo}
  {#if bare}
    {@render rows()}
  {:else}
    <div class="su-group" style="--d:250">
      <span class="su-label">Sync</span>
      {@render rows()}
    </div>
  {/if}
{/if}

{#snippet ico(icon: IconName, cls = '')}
  <span class="thumb su-ico {cls}"><Icon name={icon} /></span>
{/snippet}

{#snippet rows()}
  <div class="su-rows">
    {#if account.user}
      <div class="su-row top">
        {@render ico('mail')}
        <span class="su-name"
          >{account.user.email}<span class="su-hint su-status {account.status}" class:bad={account.status === 'error'} aria-live="polite"
            ><i class="su-dot" aria-hidden="true"></i>{status}</span
          ></span
        >
        <button
          type="button"
          class="lact"
          class:spinning={account.status === 'syncing'}
          disabled={account.status === 'syncing'}
          onclick={() => runSync()}><Icon name="refresh" /><span>Sync</span></button
        >
      </div>
      <div class="su-row">
        {@render ico('logOut')}
        <span class="su-name"
          >Sign out<span class="su-hint" class:bad={armed === 'unsynced'}
            >{armed === 'unsynced'
              ? 'Some changes haven’t synced yet. Signing out now loses them.'
              : 'Removes your log from this device. It stays in your account.'}</span
          ></span
        >
        <button
          type="button"
          class="lact ldel"
          class:armed={!!armed}
          aria-label={armed ? 'Tap again to sign out' : 'Sign out'}
          onclick={out}
        >
          <Icon name="logOut" /><span class="roll" use:roll={{ text: armed ? 'Confirm' : 'Sign out', dir: armed ? 1 : -1 }}></span>
        </button>
      </div>
      <div class="su-row">
        {@render ico('bolt')}
        <span class="su-name" id="suShare"
          >Help improve reading<span class="su-hint"
            >Sends lines LogOut couldn’t read, with item names and notes taken out, so it can learn to read them.</span
          ></span
        >
        <button
          type="button"
          class="su-switch press"
          role="switch"
          aria-checked={app.device.shareUnread}
          aria-labelledby="suShare"
          onclick={toggleShare}
        ></button>
      </div>
      <div class="su-row">
        {@render ico('trash', 'bad')}
        <span class="su-name"
          >Delete account<span class="su-hint">Deletes your account and everything synced to it, and the log on this device.</span></span
        >
        <button
          type="button"
          class="lact ldel"
          class:armed={doomed}
          aria-label={doomed ? 'Tap again to delete your account' : 'Delete account'}
          onclick={del}
        >
          <Icon name="trash" /><span class="roll" use:roll={{ text: doomed ? 'Confirm' : 'Delete', dir: doomed ? 1 : -1 }}></span>
        </button>
      </div>
    {:else if account.step === 'email' || account.step === 'sending'}
      <p class="su-hint su-intro">{intro}</p>
      <form
        class="su-row"
        onsubmit={e => {
          e.preventDefault();
          if (EMAIL.test(email.trim())) void sendCode(email);
        }}
      >
        <input
          class="su-text"
          type="email"
          autocomplete="email"
          inputmode="email"
          placeholder="you@example.com"
          aria-label="Email"
          bind:value={email}
        />
        <button type="submit" class="lact lsave" disabled={!EMAIL.test(email.trim()) || account.step === 'sending'}>
          <Icon name="mail" /><span>{account.step === 'sending' ? 'Sending…' : 'Send code'}</span>
        </button>
      </form>
    {:else}
      <p class="su-hint su-intro">Enter the code we emailed to {account.email}.</p>
      <form
        class="su-row"
        onsubmit={e => {
          e.preventDefault();
          if (code.replace(/\s/g, '').length >= 6) void verifyCode(code);
        }}
      >
        <input
          class="su-text su-code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="10"
          placeholder="123456"
          aria-label="Code from the email"
          bind:value={code}
        />
        <button type="submit" class="lact lsave" disabled={code.replace(/\s/g, '').length < 6 || account.step === 'verifying'}>
          <Icon name="check" /><span>{account.step === 'verifying' ? 'Checking…' : 'Sign in'}</span>
        </button>
      </form>
      <div class="su-row">
        <button type="button" class="lact" onclick={useAnotherEmail}>Use another email</button>
        <button type="button" class="lact" onclick={() => sendCode(account.email)}>Send a new code</button>
      </div>
    {/if}
    {#if account.error}<p class="su-hint su-note bad" role="alert">{account.error}</p>{/if}
  </div>
{/snippet}
