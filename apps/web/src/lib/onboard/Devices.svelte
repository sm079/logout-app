<!--
  What signing in does: the log on this phone, and the same log on another device. Signed out, the other one stays
  an outline; while a code is on its way a pulse runs between them; signed in, the lines arrive on the other side
  and it ticks.
-->
<script lang="ts">
  let { state }: { state: 'off' | 'waiting' | 'on' } = $props();

  // The same few lines on both, in the colours the app gives each kind of line
  const LINES = [
    { w: 28, tint: 'var(--dv-a)' },
    { w: 20, tint: 'var(--dv-b)' },
    { w: 25, tint: 'var(--dv-c)' },
    { w: 16, tint: 'var(--dv-d)' }
  ];
  const ARC = 'M110 46 C 136 14, 164 14, 190 42';
</script>

<div class="dv {state}" aria-hidden="true">
  <svg viewBox="0 0 320 96">
    <rect class="dv-body" x="62" y="8" width="44" height="80" rx="10" />
    <rect class="dv-notch" x="77" y="12" width="14" height="3" rx="1.5" />
    {#each LINES as l, i (i)}
      <rect class="dv-line here" x="70" y={24 + i * 12} width={l.w} height="5" rx="2.5" style="--t:{l.tint};--i:{i}" />
    {/each}

    <path class="dv-arc" d={ARC} pathLength="100" />
    <path class="dv-pulse" d={ARC} pathLength="100" />

    <rect class="dv-body" x="198" y="12" width="92" height="60" rx="7" />
    <path class="dv-base" d="M186 76h116l-5 7.5a4 4 0 0 1-3.3 1.5H194.3a4 4 0 0 1-3.3-1.5Z" />
    {#each LINES as l, i (i)}
      <rect class="dv-line there" x="208" y={22 + i * 11} width={l.w * 2} height="5" rx="2.5" style="--t:{l.tint};--i:{i}" />
    {/each}
    <g class="dv-tick">
      <circle cx="290" cy="13" r="9" />
      <path d="m285.8 13.2 2.8 2.8 5.6-5.8" />
    </g>
  </svg>
</div>
