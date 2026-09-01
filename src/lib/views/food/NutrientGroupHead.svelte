<script lang="ts">
  import type { Snippet } from "svelte";

  // The section heading above a {@link NutrientCardGrid} — shared by the full-day
  // RDA modal (#42) and the nutrition target editor (#41) so the two surfaces head
  // their groups identically (Energy & macros / Vitamins & minerals / …). A
  // tinted band with a strong bottom rule, spanning its container edge-to-edge.
  //
  // `info` is an OPTIONAL trailing slot (ADR-0033 §5, #46): the target editor
  // passes a "Why these defaults?" ⓘ button here; the RDA modal passes nothing and
  // stays a clean day-vs-target readout — a single left-aligned label as before.
  let { label, info }: { label: string; info?: Snippet } = $props();
</script>

<div class="nutrient-group-head">
  <span class="nutrient-group-label">{label}</span>
  {#if info}{@render info()}{/if}
</div>

<style>
  .nutrient-group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2xs);
    font-size: var(--step-n2);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    padding: var(--space-2xs) var(--space-s);
    background: var(--track, var(--bg-input));
    border-bottom: 1px solid var(--border, var(--ink));
  }
</style>
