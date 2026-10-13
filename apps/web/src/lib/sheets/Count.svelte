<!--
  A number that counts up from nothing as it arrives, then eases to each new value. When what it's counted in
  changes (`unit`), the new reading rolls in.
-->
<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { nf } from '../logic/format.ts';
  import { REDUCE } from '../ui/motion.ts';

  let {
    value,
    format = nf,
    unit = '',
    delay = 0
  }: { value: number; format?: (n: number) => string; unit?: string; delay?: number } = $props();

  const shown = new Tween(0, { easing: cubicOut });
  let arrived = false;
  $effect(() => {
    const to = value;
    void shown.set(to, REDUCE ? { duration: 0 } : arrived ? { duration: 500 } : { duration: 1100, delay });
    arrived = true;
  });

  function rollIn(_: Element) {
    return {
      duration: REDUCE ? 0 : 520,
      easing: cubicOut,
      css: (t: number, u: number) => `display:inline-block;transform:translateY(${u * 70}%);opacity:${t};filter:blur(${u * 3}px)`
    };
  }
</script>

{#key unit}<span class="pf-count" in:rollIn>{format(shown.current)}</span>{/key}
