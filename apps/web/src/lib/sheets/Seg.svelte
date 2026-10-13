<!-- A choice of a few, with a thumb that slides to the one picked. Picking the picked one again can clear it. -->
<script lang="ts" generics="T extends string">
  let {
    label,
    opts,
    value,
    onpick
  }: {
    label: string;
    opts: readonly (readonly [T, string])[];
    value: T | null;
    onpick: (v: T) => void;
  } = $props();

  const at = $derived(opts.findIndex(([v]) => v === value));
</script>

<div class="pf-seg" class:none={at < 0} role="radiogroup" aria-label={label} style="--n:{opts.length};--i:{Math.max(0, at)}">
  <span class="pf-seg-thumb" aria-hidden="true"></span>
  {#each opts as [v, t] (v)}
    <button type="button" role="radio" aria-checked={v === value} onclick={() => onpick(v)}>{t}</button>
  {/each}
</div>
