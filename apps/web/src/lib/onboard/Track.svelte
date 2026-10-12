<!--
  What a bare 5 means: five kilometres, or five miles, along a track marked in either. The marks stretch apart
  for miles, and the run to 5 stretches with them.
-->
<script lang="ts">
  import type { Units } from '@logout/engine';
  import { roll } from '../ui/motion.ts';

  let { unit }: { unit: Units['dist'] } = $props();
</script>

<div class="tr" class:mi={unit === 'mi'} aria-hidden="true">
  <span class="tr-line"></span>
  <span class="tr-fill"></span>
  {#each { length: 10 } as _, i (i)}
    <span class="tr-mark" class:far={unit === 'mi' && i > 5} style="--i:{i}"><b>{i}</b></span>
  {/each}
  <span class="tr-dot"
    ><span class="tr-tag"><span class="roll" use:roll={{ text: `5 ${unit}`, dir: unit === 'mi' ? 1 : -1 }}></span></span></span
  >
</div>
