<!--
  The app: one screen. Phones get it edge to edge; from 600px a centred column; from 900px two panes, the calendar
  and widgets on the left and the log above the composer on the right.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Calendar from '../calendar/Calendar.svelte';
  import Dock from '../dock/Dock.svelte';
  import Sheets from '../sheets/Sheets.svelte';
  import { app } from '../state/app.svelte.ts';
  import MetricPicker from '../widgets/MetricPicker.svelte';
  import Widgets from '../widgets/Widgets.svelte';
  import Tooltip from './Tooltip.svelte';
  import UpdateBar from './UpdateBar.svelte';

  let screen = $state<HTMLElement>(),
    calEl = $state<HTMLElement>();
  let failed = $state('');

  onMount(() => {
    const wide = matchMedia('(min-width: 900px)');
    const sync = () => (app.wide = wide.matches);
    sync();
    wide.addEventListener('change', sync);
    app
      .boot()
      .then(() => {
        if (app.firstRun) app.sheet = { kind: 'setup' };
      })
      .catch((err: unknown) => {
        console.error(err);
        failed = err instanceof Error && /indexeddb|database|storage/i.test(err.message + err.name) ? 'storage' : 'boot';
      });
    return () => wide.removeEventListener('change', sync);
  });
</script>

{#if app.ready}
  <main class="screen" class:merged={app.logsOpen && !app.wide} bind:this={screen}>
    <div class="behind" inert={!!app.sheet}>
      <Calendar bind:el={calEl} onProfile={() => (app.sheet = { kind: 'profile' })} />
      <section class="canvas" aria-label="Summary for the selected period">
        <Widgets />
      </section>
      <div class="glow" aria-hidden="true"></div>
      <Dock {calEl} />
    </div>
    {#if screen}
      <Tooltip {screen} />
      <MetricPicker {screen} />
    {/if}
    <Sheets />
    <UpdateBar />
    <p class="vh" aria-live="polite">{app.announce}</p>
  </main>
{:else if failed}
  <main class="screen boot-msg">
    <div>
      <h1>Logout can't start here</h1>
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
