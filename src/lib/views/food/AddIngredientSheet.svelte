<script lang="ts">
  import type { FoodResult } from "../../food/food-search";
  import {
    ingredientFromFood,
    customIngredient,
    type RecipeIngredient,
    type IngredientAddOutcome,
  } from "../../food/recipe-ingredient";
  import type {
    FoodChoice,
    ChooseOutcome,
    PrimaryLabelContext,
  } from "../../food/food-staging";
  import FoodStager from "./FoodStager.svelte";

  // Add an ingredient to a recipe using the shared FoodStager (issue #16) — the
  // same Search / Scan / Custom staging flow the direct-log sheet uses. Emits the
  // chosen food as a RecipeIngredient; never logs. `onAdd` reports back whether
  // the food was taken: a same-twin re-add at an incompatible unit is blocked
  // (issue #14), and the sheet stays open showing the reason instead of dropping
  // the tap silently.
  let {
    onAdd,
    onClose,
  }: {
    onAdd: (ing: RecipeIngredient) => IngredientAddOutcome;
    onClose: () => void;
  } = $props();

  // The staged food, bound from the stager so the header back button can clear
  // it (returning to the search list) rather than closing the whole sheet.
  let staged = $state<FoodResult | null>(null);

  // Map the chosen food to a RecipeIngredient and hand it to the recipe builder.
  // `onAdd`'s outcome is already the stager's outcome shape: `ok` closes the
  // sheet (the parent unmounts us), otherwise the reason keeps it open.
  function handleChoose(choice: FoodChoice): ChooseOutcome {
    if (choice.kind === "food") {
      return onAdd(ingredientFromFood(choice.food, choice.grams));
    }
    return onAdd(
      customIngredient(
        choice.name,
        choice.calories,
        choice.protein,
        choice.fat,
        choice.carbs
      )
    );
  }

  function primaryLabel(ctx: PrimaryLabelContext): string {
    if (ctx.staged)
      return `Add ${Math.round(ctx.staged.calories * ctx.factor)} kcal`;
    if (ctx.method === "custom") return "Add";
    if (ctx.method === "scan") return "Look up";
    return "Add";
  }
</script>

<div class="sheet">
  <header class="head">
    {#if staged}
      <button
        class="hbtn back"
        onclick={() => (staged = null)}
        aria-label="Back">‹</button
      >
    {:else}
      <button class="hbtn back" onclick={onClose} aria-label="Cancel">‹</button>
    {/if}
    <h2>Add ingredient</h2>
    <button class="hbtn x" onclick={onClose} aria-label="Close">✕</button>
  </header>

  <FoodStager
    bind:staged
    ids={{
      search: "ai-search",
      barcode: "ai-barcode",
      primary: "add-ingredient-confirm",
      customName: "ai-name",
      customCal: "ai-cal",
      customProt: "ai-prot",
      customFat: "ai-fat",
      customCarb: "ai-carb",
    }}
    onChoose={handleChoose}
    {primaryLabel}
  />
</div>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 1700;
    display: flex;
    flex-direction: column;
    background: #fff;
    animation: up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    /* This overlay is a sibling of the recipe dialog, not a bits-ui dialog
       itself. While that dialog is open bits-ui sets `pointer-events: none` on
       <body>, which this sheet would otherwise inherit — making its buttons
       visually present but click-through (the back/close taps fell through to
       the recipe content underneath). Re-enable pointer events for the sheet. */
    pointer-events: auto;
  }
  @keyframes up {
    from {
      transform: translateY(6%);
      opacity: 0.6;
    }
  }
  .head {
    display: flex;
    align-items: center;
    padding: var(--space-2xs) var(--space-s);
    border-bottom: 2px solid #000;
  }
  .head h2 {
    flex: 1;
    text-align: center;
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
  }
  .hbtn {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    background: none;
    border: none;
    font-weight: 700;
    cursor: pointer;
  }
  .hbtn.back {
    font-size: var(--step-2);
  }
  .hbtn.x {
    font-size: var(--step-0);
  }
</style>
