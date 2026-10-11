<!--
  The first-run setup (skippable) and the profile share a form. The profile adds your data. OK takes the form; the
  setup's Skip keeps the defaults, the profile's Cancel keeps what was there.
-->
<script lang="ts">
  import { app } from '../state/app.svelte.ts';
  import { nf } from '../logic/format.ts';
  import Icon from '../ui/Icon.svelte';
  import { account } from '../sync/account.svelte.ts';
  import AccountSection from './AccountSection.svelte';
  import DataSection from './DataSection.svelte';
  import ProfileForm from './ProfileForm.svelte';
  import { track } from '../observe/analytics.ts';
  import Sheet from './Sheet.svelte';
  import type { ProfileValues } from './profile.ts';

  let { setup, leaving, onclose }: { setup: boolean; leaving: boolean; onclose: () => void } = $props();

  let form: ProfileForm, sheet: Sheet;
  const initial: ProfileValues = {
    sex: app.profile.sex,
    heightCm: app.profile.heightCm,
    units: { ...app.profile.units },
    goals: { ...app.profile.goals },
    sample: app.device.sample
  };
  const own = $derived(app.book?.own ?? 0);

  async function take() {
    const v = form.read();
    if (!v) {
      sheet.refuse();
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    app.profile = { ...app.profile, sex: v.sex, heightCm: v.heightCm, goals: v.goals, units: v.units };
    await app.repo.saveProfile($state.snapshot(app.profile));
    const device = { ...app.device, setupDone: true };
    if (v.sample !== app.device.sample) await app.repo.setSample(v.sample, device);
    else await app.repo.saveDevice(device);
    app.device = { ...device, sample: v.sample };
    if (setup)
      track('setup finished', {
        sample: v.sample,
        sex: !!v.sex,
        height: !!v.heightCm,
        lb: v.units.load === 'lb',
        mi: v.units.dist === 'mi'
      });
    app.firstRun = false;
    onclose();
  }
  // Signing in from the setup brings the account's profile and log, so there's nothing left to set up
  $effect(() => {
    if (setup && account.user) void skip();
  });

  async function skip() {
    if (setup) {
      // Signed in, the account's profile arrives by sync; saving defaults here would overwrite it
      if (!account.user) await app.repo.saveProfile($state.snapshot(app.profile));
      app.device = { ...app.device, setupDone: true };
      await app.repo.saveDevice($state.snapshot(app.device));
      app.firstRun = false;
      track('setup skipped');
    }
    onclose();
  }
</script>

{#snippet thumb()}
  {#if setup}
    <span class="thumb" style="--tc:#363d12;--ti:#e3fb5c"><Icon name="activity" /></span>
  {:else}
    <span class="thumb" style="--tc:#2f3034;--ti:#eeeef0"><Icon name="user" /></span>
  {/if}
{/snippet}

<Sheet
  bind:this={sheet}
  {thumb}
  title={setup ? 'Set up Logout' : 'Profile'}
  sub={setup
    ? 'For your goals and body fat. You can change any of it later from your profile.'
    : `${nf(own)} ${own === 1 ? 'entry' : 'entries'} of your own${app.device.sample ? ' · sample history on' : ''}`}
  cancel={setup ? 'Skip' : 'Cancel'}
  ok={setup ? 'START' : 'SAVE'}
  {leaving}
  oncancel={skip}
  onok={take}
>
  {#if setup}<AccountSection intro="Already use Logout? Sign in to bring your log to this device." />{/if}
  <ProfileForm bind:this={form} {initial} />
  {#if !setup}
    <AccountSection />
    <DataSection />
  {/if}
</Sheet>
