<script lang="ts">
  import { ICONS, type IconName } from './icons.ts';

  let { name }: { name: IconName } = $props();
</script>

<svg class="i" viewBox="0 0 24 24" aria-hidden="true">{@html ICONS[name]}</svg>
