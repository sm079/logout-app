<!--
  The app: one screen. Phones get it edge to edge; from 600px a centred column; from 900px two panes, the log above
  the composer on the left and the calendar and widgets on the right.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Calendar from '../calendar/Calendar.svelte';
  import Dock from '../dock/Dock.svelte';
  import Sheets from '../sheets/Sheets.svelte';
  import { track } from '../observe/analytics.ts';
  import { app } from '../state/app.svelte.ts';
  import { initAccount } from '../sync/account.svelte.ts';
  import Onboarding from '../onboard/Onboarding.svelte';
  import MetricPicker from '../widgets/MetricPicker.svelte';
  import Widgets from '../widgets/Widgets.svelte';
  import DemoBar from './DemoBar.svelte';
  import Tooltip from './Tooltip.svelte';
  import UpdateBar from './UpdateBar.svelte';

  let { demo = false }: { demo?: boolean } = $props();

  let screen = $state<HTMLElement>(),
    calEl = $state<HTMLElement>();
  let failed = $state('');
  // The first-run setup, over the screen; the app behind it is put together as it leaves
  let onboard = $state.raw<{ preview: boolean } | null>(null);
  let behind = $state(true);
  // Nothing shows until it's known whether the setup comes first, so the app isn't put together only to be taken away
  let decided = $state(false);

  onMount(() => {
    const wide = matchMedia('(min-width: 900px)');
    const sync = () => (app.wide = wide.matches);
    sync();
    wide.addEventListener('change', sync);
    app
      .boot({ demo })
      .then(() => {
        // `?onboard` shows it again on a device that's set up, as a preview
        if (app.firstRun || new URLSearchParams(location.search).has('onboard')) {
          onboard = { preview: !app.firstRun };
          behind = false;
        }
        decided = true;
        // The demo is never synced
        if (demo) track('demo opened');
        else void initAccount();
      })
      .catch((err: unknown) => {
        console.error(err);
        failed = err instanceof Error && /indexeddb|database|storage/i.test(err.message + err.name) ? 'storage' : 'boot';
      });
    return () => wide.removeEventListener('change', sync);
  });
</script>

{#if app.ready && decided}
  <main class="screen" class:merged={app.logsOpen && !app.wide} bind:this={screen}>
    {#if behind}
      <div class="behind" inert={!!app.sheet || !!onboard}>
        <Calendar bind:el={calEl} onProfile={() => (app.sheet = { kind: 'profile' })} />
        <section class="canvas" aria-label="Summary for the selected period">
          <Widgets />
        </section>
        <div class="glow" aria-hidden="true"></div>
        <Dock {calEl} />
      </div>
    {/if}
    {#if screen}
      <Tooltip {screen} />
      <MetricPicker {screen} />
    {/if}
    <Sheets />
    {#if onboard}
      <Onboarding {...onboard} onleave={() => (behind = true)} onend={() => (onboard = null)} />
    {/if}
    {#if app.demo && !onboard}<DemoBar />{/if}
    <UpdateBar />
    <p class="vh" aria-live="polite">{app.announce}</p>
  </main>
{:else if failed}
  <main class="screen boot-msg">
    <div>
      <h1>LogOut can't start here</h1>
      {#if failed === 'storage'}
        <p>
          It keeps your log on this device, and this browser isn't letting it store anything. A private window often does that; try a normal
          one.
        </p>
      {:else}
        <p>Something went wrong while opening your log. Reloading usually fixes it.</p>
      {/if}
      <button type="button" class="lact" onclick={() => location.reload()}>Reload</button>
    </div>
  </main>
{:else}
  <main class="screen boot" aria-busy="true" aria-label="Opening your log"></main>
{/if}
