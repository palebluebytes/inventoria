<script lang="ts">
  import type { NutritionBreakdown } from "../../food/nutrition";
  import {
    buildNutrientPills,
    buildNutrientBreakdown,
  } from "../../food/nutrient-display";
  import {
    settingsStore,
    nutritionDisplayDecimals,
  } from "../../stores/settings.store";
  import NutrientBreakdown from "./NutrientBreakdown.svelte";

  // How a set of derived nutrition figures is shown, wherever they come from —
  // a food scaled to an amount, a recipe divided by its yield. Two parts, one
  // rule: a 2-column grid of thin-framed rows reading label → value on one line
  // ("Energy   634 kcal"), and the rest of the panel behind the collapsed full-
  // nutrition disclosure.
  //
  // The split between the two is the whole point, so it lives here rather than
  // in each caller: the grid shows Calories plus every TRACKED nutrient
  // (`visible_nutrients`) the figures have a real amount of — hideEmpty drops
  // both absent nutrients (no data) and declared zeros — and the disclosure
  // carries what is present but NOT already in the grid, so nothing is ever
  // shown twice and nothing a food actually carries is lost.
  let {
    breakdown,
    testid = "nutrient-breakdown",
  }: {
    /** The figures to show, already scaled/derived by the caller. */
    breakdown: NutritionBreakdown;
    /** Test id for the disclosure, so a surface keeps its own selector. */
    testid?: string;
  } = $props();

  let pills = $derived(
    buildNutrientPills(
      breakdown,
      $settingsStore.visible_nutrients,
      $nutritionDisplayDecimals,
      true
    )
  );
  let pillKeys = $derived(new Set(pills.map((p) => p.key)));
  let fullRows = $derived(
    buildNutrientBreakdown(breakdown, $nutritionDisplayDecimals, true, pillKeys)
  );
</script>

<div class="nutrients">
  {#each pills as pill (pill.key)}
    <div class="n nutrient-{pill.key}">
      <span title={pill.label}>{pill.label}</span><strong>{pill.value}</strong>
    </div>
  {/each}
</div>
<div class="full-panel">
  <NutrientBreakdown rows={fullRows} {testid} />
</div>

<style>
  /* Two-column grid: each cell a thin-framed row, label left, value right. */
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
  /* A value is one token — "437 kcal" breaking after the number left a two-line
     cell in a grid of one-line ones, and the whole row grew with it. So the
     value never wraps and the label gives way instead: it shrinks, and at the
     extreme ellipsises (its full text stays in the `title`). A clipped
     "Saturat…" still reads; a wrapped value breaks the layout. This is the same
     rule the full-nutrition rows already keep. */
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
  .full-panel {
    margin-top: var(--space-s);
  }
</style>
