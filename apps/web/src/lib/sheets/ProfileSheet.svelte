<!--
  The profile: the log so far, then the settings, your account and your data. The button says what SAVE will take
  (DONE while nothing has changed); Cancel keeps what was there.
-->
<script lang="ts">
  import { app } from '../state/app.svelte.ts';
  import { monthDay } from '../logic/dates.ts';
  import { MTINT } from '../logic/palette.ts';
  import { account } from '../sync/account.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import AccountSection from './AccountSection.svelte';
  import DataSection from './DataSection.svelte';
  import ProfileForm from './ProfileForm.svelte';
  import ProfileHero from './ProfileHero.svelte';
  import Sheet from './Sheet.svelte';
  import { changes, type ProfileValues } from './profile.ts';

  let { leaving, onclose }: { leaving: boolean; onclose: () => void } = $props();

  const was: ProfileValues = {
    sex: app.profile.sex,
    heightCm: app.profile.heightCm,
    units: { ...app.profile.units },
    goals: { ...app.profile.goals }
  };
  let v = $state<ProfileValues>(structuredClone(was));
  const changed = $derived(changes(was, v));
  const meta = $derived(changed.length > 2 ? `${changed.length} changes` : changed.join(' · '));

  const email = $derived(account.user?.email ?? null);
  const sub = $derived(`${email ?? (app.demo ? 'The demo' : 'On this device')} · since ${monthDay(app.joined, app.today)}`);
  const syncing = $derived(!!email && account.status === 'syncing');

  async function take() {
    if (changed.length) {
      app.profile = { ...app.profile, ...$state.snapshot(v) };
      await app.repo.saveProfile($state.snapshot(app.profile));
    }
    onclose();
  }

  // With a mouse, a light follows the pointer across a card, in the card's colour
  function light(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const card = (e.target as Element).closest<HTMLElement>('.pf-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${Math.round(e.clientX - r.left)}px`);
    card.style.setProperty('--my', `${Math.round(e.clientY - r.top)}px`);
  }
</script>

{#snippet thumb()}
  <span
    class="thumb pf-avatar"
    class:syncing
    style="--tc:{email ? MTINT.training[0] : '#2f3034'};--ti:{email ? MTINT.training[1] : '#eeeef0'}"
    >{#if email}<b>{email[0]!.toUpperCase()}</b>{:else}<Icon name="user" />{/if}</span
  >
{/snippet}

<Sheet
  {thumb}
  title="Profile"
  {sub}
  cancel="Cancel"
  ok={changed.length ? 'SAVE' : 'DONE'}
  {meta}
  cls="pf"
  {leaving}
  oncancel={onclose}
  onok={take}
>
  <div class="pf-main">
    <ProfileHero units={v.units} />
    {#if account.configured && !app.demo}
      <section class="pf-card pf-account" style="--d:320;--mc:{MTINT.hydration[1]}" aria-labelledby="pfAccount">
        <header class="pf-head">
          <span class="thumb tn-thumb" style="--tc:{MTINT.hydration[0]};--ti:{MTINT.hydration[1]}"><Icon name="cloud" /></span>
          <span class="tn-card-name">
            <b id="pfAccount">Account</b>
            <small>{email ? 'Your log, on every device you sign in on' : 'Sync is off'}</small>
          </span>
        </header>
        <AccountSection bare />
      </section>
    {/if}
  </div>
  <div class="pf-side">
    <ProfileForm bind:v {was} />
    <DataSection />
  </div>
</Sheet>

<svelte:document onpointermove={light} />
