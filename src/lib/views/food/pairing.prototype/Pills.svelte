<script lang="ts">
  import type { NutritionBreakdown } from "../../../food/nutrition";
  import { buildNutrientPills } from "../../../food/nutrient-display";
  import {
    visibleNutrients,
    calorieDisplayDecimals,
  } from "../../../stores/device-settings";

  // THROWAWAY (#244) — the tracked-nutrient grid at the top of a food panel,
  // lifted out of `NutrientPreview` so variants A and C can put something else
  // BELOW it. Same builder, same two-column grid, same rules: this half of the
  // panel is identical in every variant, because it shows what the manufacturer
  // printed and a pairing never touches it.
  let { breakdown }: { breakdown: NutritionBreakdown } = $props();

  let pills = $derived(
    buildNutrientPills(
      breakdown,
      $visibleNutrients,
      $calorieDisplayDecimals,
      true
    )
  );
</script>

<div class="nutrients">
  {#each pills as pill (pill.key)}
    <div class="n nutrient-{pill.key}">
      <span title={pill.label}>{pill.label}</span><strong>{pill.value}</strong>
    </div>
  {/each}
</div>

<style>
  .nutrients {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3xs);
  }
  .n {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2xs);
    border: var(--edge-thin);
    padding: var(--space-3xs) var(--space-2xs);
    font-size: var(--step-n1);
  }
  .n span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .n strong {
    flex: 0 0 auto;
    white-space: nowrap;
    font-weight: 700;
  }
</style>
