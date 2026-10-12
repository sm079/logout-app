<!--
  The logo putting itself together: the bar rises, the plate rolls in against it, its rings draw on and the hole
  drops in. `bar` stretches the bar (a height, in the Tune flow). Still, it's simply the logo.
-->
<script lang="ts">
  let { size = 64, still = false, bar = 1, delay = 0 }: { size?: number; still?: boolean; bar?: number; delay?: number } = $props();
</script>

<svg
  class="mk"
  class:still
  viewBox="88 126 336 260"
  width={Math.round((size * 336) / 260)}
  height={size}
  style="--mk-d:{delay}ms;--bar:{bar}"
  aria-hidden="true"
>
  <rect class="mk-bar" x="90" y="136" width="56" height="240" rx="28" />
  <g class="mk-plate">
    <circle class="mk-disc" cx="294" cy="256" r="128" />
    <circle class="mk-ring" cx="294" cy="256" r="100" pathLength="100" stroke-width="10" />
    <circle class="mk-ring inner" cx="294" cy="256" r="44" pathLength="100" stroke-width="12" />
    <circle class="mk-hole" cx="294" cy="256" r="21" />
  </g>
</svg>
