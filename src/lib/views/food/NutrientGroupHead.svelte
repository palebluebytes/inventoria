<script lang="ts">
  // The section heading above a {@link NutrientCardGrid} — shared by the full-day
  // RDA modal (#42) and the Settings target editor (#41) so the two surfaces head
  // their groups identically (Energy & macros / Vitamins & minerals / …). A
  // tinted band with a strong bottom rule, spanning its container edge-to-edge.
  let { label }: { label: string } = $props();
</script>

<div class="nutrient-group-head">{label}</div>

<style>
  .nutrient-group-head {
    font-size: var(--step-n2);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    padding: var(--space-2xs) var(--space-s);
    background: var(--track, #f4f4f5);
    border-bottom: 1px solid var(--border, #000);
  }
</style>
