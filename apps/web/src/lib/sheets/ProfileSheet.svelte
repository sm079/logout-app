<!-- The profile: the form, your account and your data. SAVE takes the form; Cancel keeps what was there. -->
<script lang="ts">
  import { app } from '../state/app.svelte.ts';
  import { nf } from '../logic/format.ts';
  import Icon from '../ui/Icon.svelte';
  import AccountSection from './AccountSection.svelte';
  import DataSection from './DataSection.svelte';
  import ProfileForm from './ProfileForm.svelte';
  import Sheet from './Sheet.svelte';
  import type { ProfileValues } from './profile.ts';

  let { leaving, onclose }: { leaving: boolean; onclose: () => void } = $props();

  let form: ProfileForm, sheet: Sheet;
  const initial: ProfileValues = {
    sex: app.profile.sex,
    heightCm: app.profile.heightCm,
    units: { ...app.profile.units },
    goals: { ...app.profile.goals }
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
    onclose();
  }
</script>

{#snippet thumb()}
  <span class="thumb" style="--tc:#2f3034;--ti:#eeeef0"><Icon name="user" /></span>
{/snippet}

<Sheet
  bind:this={sheet}
  {thumb}
  title="Profile"
  sub={`${nf(own)} ${own === 1 ? 'entry' : 'entries'} of your own${app.device.sample ? ' · sample history on' : ''}`}
  cancel="Cancel"
  ok="SAVE"
  {leaving}
  oncancel={onclose}
  onok={take}
>
  <ProfileForm bind:this={form} {initial} />
  <AccountSection />
  <DataSection />
</Sheet>
