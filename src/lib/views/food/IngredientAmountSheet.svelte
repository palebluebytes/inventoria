<script lang="ts">
  import {
    scaleNutrition,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import { parseServingGrams } from "../../food/recipe-nutrition";
  import { buildNutrientBreakdown } from "../../food/nutrient-display";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import NutrientBreakdown from "./NutrientBreakdown.svelte";
  import QuantityGrams from "./QuantityGrams.svelte";

  // Edits a single food line's gram amount in a small sheet raised over the
  // recipe/instantiation dialog or the dashboard. The same picker serves both:
  // it edits a working copy and reports the chosen amount once on Done, so the
  // caller commits it its own way — a recipe mutates the ingredient in memory,
  // the dashboard retract-and-replaces the logged event (append-only, ADR-0008)
  // — without this sheet knowing which. Grams only; whole-serving amounts are
  // locked upstream (future work), so this is never opened for them.
  //
  // The over-dialog chrome (fixed sheet, own backdrop, pointer-events fix) is
  // the shared BottomSheet primitive's now (ADR-0027/0028); this sheet just
  // composes the amount body and a docked Done action.
  let {
    name,
    amount,
    portions = [],
    panel,
    onCommit,
    onClose,
  }: {
    name: string;
    amount: number;
    /** The ingredient twin's household portions (ADR-0030), shown as picker
     *  presets. Empty for a portion-less food — the picker renders as today. */
    portions?: Portion[];
    /** The ingredient twin's `nutrition/info` panel, per its serving basis. When
     *  present the sheet shows a full nutrient breakdown scaled to the working
     *  amount (ticket #30); omit it to render the plain amount picker. */
    panel?: NutritionInfo;
    onCommit: (amount: number) => void;
    onClose: () => void;
  } = $props();

  // A working copy — nothing is committed until Done, so closing via the scrim
  // or ✕ leaves the row untouched. Seeded once from `amount`: the sheet is
  // mounted fresh each time a row is opened, so it never needs to track later
  // prop changes.
  // svelte-ignore state_referenced_locally
  let value = $state(amount);

  function done() {
    onCommit(value);
    onClose();
  }

  // The full panel scaled to the working amount — this sheet is opened only for
  // gram-unit rows (IngredientListEditor's guard), so `value` grams scale the
  // panel against its gram serving basis, the same factor deriveRecipeNutrition
  // uses for a `g` ingredient. Absent when the ingredient carries no panel.
  let fullRows = $derived(
    panel
      ? buildNutrientBreakdown(
          scaleNutrition(panel, value / parseServingGrams(panel.serving_size))
        )
      : []
  );
</script>

<BottomSheet isOpen title={name} class="amount-sheet" elevated {onClose}>
  <QuantityGrams bind:grams={value} {portions} />

  {#if panel}
    <div class="full-panel">
      <NutrientBreakdown rows={fullRows} testid="food-nutrient-breakdown" />
    </div>
  {/if}

  {#snippet footer()}
    <button class="done" id="amount-done-btn" onclick={done}>Done</button>
  {/snippet}
</BottomSheet>

<style>
  .full-panel {
    margin-top: var(--space-s);
  }
  .done {
    width: 100%;
    background: #ccff00;
    color: #000;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-1);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 56px;
  }
  .done:active {
    transform: scale(0.98);
  }
</style>
