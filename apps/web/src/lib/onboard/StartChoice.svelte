<!--
  What the log starts with: nothing, or the sample history. Each choice draws a few weeks of calendar: today alone,
  or weeks of training that light up in turn when it's picked.
-->
<script lang="ts">
  let { sample = $bindable() }: { sample: boolean } = $props();

  // Five weeks of made-up training, heaviest mid-week
  const WEEKS = 5;
  const HEAT = Array.from({ length: WEEKS * 7 }, (_, i) => [3, 0, 2, 4, 1, 0, 2][(i + Math.floor(i / 7) * 2) % 7]!);
  const TODAY = HEAT.length - 3;
</script>

<div class="ob-starts" role="radiogroup" aria-label="Start with">
  {#each [false, true] as s (s)}
    <button type="button" class="ob-start press" role="radio" aria-checked={sample === s} onclick={() => (sample = s)}>
      <span class="ob-grid" class:heat={s} aria-hidden="true">
        {#each HEAT as h, i (i)}<i class:today={i === TODAY} class:later={i > TODAY} style="--i:{i}" data-h={s && i <= TODAY ? h : 0}
          ></i>{/each}
      </span>
      <span class="ob-start-text">
        <b>{s ? 'Sample history' : 'An empty log'}</b>
        <small>{s ? 'Years of made-up logs to explore. Off any time.' : 'Just what you log, from today.'}</small>
      </span>
      <span class="ob-tick" aria-hidden="true"></span>
    </button>
  {/each}
</div>
