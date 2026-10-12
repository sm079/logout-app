<!-- The open sheet, if any. It fades out on close; the app behind can't be reached while one is open. -->
<script lang="ts">
  import { app, type Sheet } from '../state/app.svelte.ts';
  import { REDUCE } from '../ui/motion.ts';
  import ItemSheet from './ItemSheet.svelte';
  import ProfileSheet from './ProfileSheet.svelte';

  // The sheet on screen: the open one, or the one leaving
  let shown = $state.raw<Sheet | null>(null);
  let leaving = $state(false);
  let leaveT: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const s = app.sheet;
    if (s) {
      clearTimeout(leaveT);
      leaving = false;
      shown = s;
    } else if (shown) {
      leaving = true;
      leaveT = setTimeout(
        () => {
          shown = null;
          leaving = false;
        },
        REDUCE ? 0 : 420
      );
    }
  });

  function close(focusBack = true) {
    const s = app.sheet;
    app.sheet = null;
    if (!focusBack || !s) return;
    const to = s.kind === 'item' ? s.from : s.kind === 'profile' ? document.querySelector<HTMLElement>('.avatar') : null;
    if (to?.isConnected) to.focus({ preventScroll: true });
  }
  $effect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !app.sheet) return;
      e.preventDefault();
      close();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  });
</script>

{#if shown}
  {#key shown}
    {#if shown.kind === 'item'}
      <ItemSheet kind={shown.itemKind} itemKey={shown.key} {leaving} onclose={close} />
    {:else}
      <ProfileSheet {leaving} onclose={() => close()} />
    {/if}
  {/key}
{/if}
