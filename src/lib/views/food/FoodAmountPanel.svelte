<script lang="ts">
  import {
    scaleNutrition,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import { parseServingGrams } from "../../food/recipe-nutrition";
  import QuantityGrams from "./QuantityGrams.svelte";
  import NutrientPreview from "./NutrientPreview.svelte";

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
  }: {
    /** The food's `nutrition/info` panel, per its serving basis. Omit for a
     *  panel-less food — then only the amount control renders. */
    panel?: NutritionInfo;
    /** Household portions surfaced as picker chips (ADR-0030). */
    portions?: Portion[];
    /** True while a searched food's portions are still being fetched (§5). */
    hydrating?: boolean;
    grams: number;
  } = $props();

  // The amount total: the full panel scaled from its own basis to the typed grams.
  let factor = $derived(
    panel ? grams / parseServingGrams(panel.serving_size) : 0
  );
  let breakdown = $derived(scaleNutrition(panel, factor));
</script>

<QuantityGrams bind:grams {portions} {hydrating} />

{#if panel}
  <!-- The shared preview (#97 prototype): the tracked figures as a 2-column grid,
       the rest behind the full-nutrition disclosure. The recipe surface shows its
       derived figures through the very same component. -->
  <div class="preview">
    <NutrientPreview {breakdown} testid="food-nutrient-breakdown" />
  </div>
{/if}

<style>
  .preview {
    margin-top: var(--space-m);
  }
</style>
