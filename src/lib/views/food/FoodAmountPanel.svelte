<script lang="ts">
  import type { Snippet } from "svelte";
  import {
    scaleNutrition,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import { parseServingGrams } from "../../food/recipe-nutrition";
  import {
    buildNutrientPills,
    buildNutrientBreakdown,
    ABSENT_NUTRIENT,
  } from "../../food/nutrient-display";
  import {
    settingsStore,
    nutritionDisplayDecimals,
  } from "../../stores/settings.store";
  import QuantityGrams from "./QuantityGrams.svelte";
  import NutrientBreakdown from "./NutrientBreakdown.svelte";

  // The shared amount-and-preview body of a food: the basis caption ("Per 100 g"
  // or "Per serving (30 g)"), the gram QuantityGrams control (with any household
  // portions as chips), a live macro-pill preview, and the collapsed full-panel
  // breakdown — all scaled to the amount in view. Extracted from the FoodStager
  // staged card so the same screen serves the search/scan staging flow AND the
  // dashboard's edit-amount sheet (IngredientAmountSheet), keeping the two DRY.
  //
  // Scaling reads the panel's OWN basis via `parseServingGrams(serving_size)` —
  // 100 for a per-100 g source (USDA/OFF), the serving weight for a per-serving
  // label food — so a `30 g`-serving food scales by grams/30, not grams/100. A
  // panel-less food (a manual ingredient with no source panel) renders just the
  // amount control, exactly as before.
  let {
    panel = undefined,
    portions = [],
    hydrating = false,
    grams = $bindable(100),
    badge = undefined,
  }: {
    /** The food's `nutrition/info` panel, per its serving basis. Omit for a
     *  panel-less food — then only the amount control renders. */
    panel?: NutritionInfo;
    /** Household portions surfaced as picker chips (ADR-0030). */
    portions?: Portion[];
    /** True while a searched food's portions are still being fetched (§5). */
    hydrating?: boolean;
    grams: number;
    /** Trailing content for the amount row — passed straight to QuantityGrams,
     *  which renders it (see its `badge` prop for the ADR-0041/0043 rationale). */
    badge?: Snippet;
  } = $props();

  // The amount total: the full panel scaled from its own basis to the typed grams.
  let factor = $derived(
    panel ? grams / parseServingGrams(panel.serving_size) : 0
  );
  let breakdown = $derived(scaleNutrition(panel, factor));
  // The preview grid shows Calories plus every tracked nutrient (`visible_nutrients`)
  // the food actually carries a value for — including a real 0 (hideEmpty=false
  // keeps reported zeros), but NOT one the food has no data for. An absent tracked
  // nutrient (value "–") is dropped, so the grid never shows a "–" for something
  // the food simply doesn't measure. Anything NOT tracked drops to full nutrition.
  let pills = $derived(
    buildNutrientPills(
      breakdown,
      $settingsStore.visible_nutrients,
      $nutritionDisplayDecimals,
      false
    ).filter((p) => p.value !== ABSENT_NUTRIENT)
  );
  // The disclosure carries what the food actually has that ISN'T already in the
  // grid: hide missing/zero rows, and exclude whatever the grid shows (Calories +
  // the tracked pills), so a non-tracked nutrient the food carries surfaces here
  // and nothing is ever shown twice.
  let pillKeys = $derived(new Set(pills.map((p) => p.key)));
  let fullRows = $derived(
    buildNutrientBreakdown(breakdown, $nutritionDisplayDecimals, true, pillKeys)
  );
</script>

<QuantityGrams bind:grams {portions} {hydrating} {badge} />

{#if panel}
  <!-- Macro preview (#97 prototype): a 2-column grid of thin-framed rows, each
       reading label → value on one line (e.g. "Energy   634 kcal"). Values come
       from buildNutrientPills (Calories always leads, then the visible nutrients
       the food actually carries — same hideEmpty behaviour); only the layout
       differs from the old pill row. -->
  <div class="preview">
    <div class="nutrients">
      {#each pills as pill (pill.key)}
        <div class="n">
          <span>{pill.label}</span><strong>{pill.value}</strong>
        </div>
      {/each}
    </div>
  </div>
  <div class="full-panel">
    <NutrientBreakdown rows={fullRows} testid="food-nutrient-breakdown" />
  </div>
{/if}

<style>
  .preview {
    margin-top: var(--space-m);
  }
  /* Two-column macro grid: each cell a thin-framed row, label left, value right. */
  .nutrients {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3xs);
  }
  .n {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2xs);
    border: var(--edge-thin);
    padding: var(--space-3xs) var(--space-2xs);
    font-size: var(--step-n1);
  }
  .n strong {
    font-weight: 700;
  }
  .full-panel {
    margin-top: var(--space-s);
  }
</style>
