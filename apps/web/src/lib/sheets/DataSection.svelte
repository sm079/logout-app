<!--
  Your data: everything as one file, a file brought back (merged in, or in place of what's here), or every entry
  cleared. Replacing and clearing each take a second tap within three seconds; both reload the app.
-->
<script lang="ts">
  import { clearEntries, downloadExport, exportData, importMerge, importReplace, readExport, type Imported } from '../data/backup.ts';
  import { nf } from '../logic/format.ts';
  import { app } from '../state/app.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import { roll } from '../ui/motion.ts';
  import { track } from '../observe/analytics.ts';

  let file: HTMLInputElement;
  let pending = $state.raw<Imported | null>(null);
  let hint = $state("Adds an exported file's entries, or puts them in place of what's here.");
  let bad = $state(false);
  let armed = $state<'replace' | 'clear' | null>(null);
  let armT: ReturnType<typeof setTimeout> | undefined;

  // Arms a button for three seconds: the second tap within them does it
  function arm(which: 'replace' | 'clear', run: () => Promise<void>) {
    if (armed === which) {
      clearTimeout(armT);
      void run().then(() => location.reload());
      return;
    }
    armed = which;
    clearTimeout(armT);
    armT = setTimeout(() => (armed = null), 3000);
  }
  async function onFile() {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    pending = readExport(await f.text());
    bad = !pending;
    hint = pending
      ? `${f.name}: ${nf(pending.entries.length)} entries. Merge keeps yours and adds these; Replace puts them in place of your ${nf(app.book?.own ?? 0)}.`
      : `${f.name} isn't a LogOut export.`;
  }
  async function merge() {
    if (!pending) return;
    track('data imported', { merged: true, entries: pending.entries.length });
    await importMerge(pending);
    location.reload();
  }
</script>

<div class="su-group" style="--d:280">
  <span class="su-label">Your data</span>
  <div class="su-rows">
    <div class="su-row">
      <span class="su-name">Export<span class="su-hint">Your entries, profile and widgets as one JSON file.</span></span>
      <button
        type="button"
        class="lact"
        onclick={async () => {
          downloadExport(await exportData());
          track('data exported');
        }}><Icon name="download" /><span>Export</span></button
      >
    </div>
    <div class="su-row" class:top={!!pending}>
      <span class="su-name">Import<span class="su-hint" class:bad>{hint}</span></span>
      {#if pending}
        <span class="su-pair">
          <button type="button" class="lact" onclick={merge}><Icon name="upload" /><span>Merge</span></button>
          <button
            type="button"
            class="lact ldel"
            class:armed={armed === 'replace'}
            aria-label={armed === 'replace' ? 'Tap again to replace your entries' : 'Replace your entries with the file'}
            onclick={() =>
              pending &&
              arm('replace', () => {
                track('data imported', { merged: false, entries: pending!.entries.length });
                return importReplace(pending!);
              })}
          >
            <span class="roll" use:roll={{ text: armed === 'replace' ? 'Confirm' : 'Replace', dir: armed === 'replace' ? 1 : -1 }}></span>
          </button>
        </span>
      {:else}
        <button type="button" class="lact" onclick={() => file.click()}><Icon name="upload" /><span>Import</span></button>
      {/if}
      <input type="file" accept="application/json,.json" hidden bind:this={file} onchange={onFile} />
    </div>
    <div class="su-row">
      <span class="su-name"
        >Clear entries<span class="su-hint">Deletes everything you've logged here, and names you've given items. Your profile stays.</span
        ></span
      >
      <button
        type="button"
        class="lact ldel"
        class:armed={armed === 'clear'}
        onclick={() =>
          arm('clear', () => {
            track('entries cleared');
            return clearEntries();
          })}
      >
        <Icon name="trash" /><span
          class="roll"
          use:roll={{ text: armed === 'clear' ? 'Confirm' : 'Clear', dir: armed === 'clear' ? 1 : -1 }}
        ></span>
      </button>
    </div>
  </div>
</div>
