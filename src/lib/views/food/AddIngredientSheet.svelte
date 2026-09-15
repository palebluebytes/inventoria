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
  import { roundFoodDisplay, type MeasuredUnit } from "../../food/nutrition";
  import { rememberedIngredientUnit } from "../../food/recent-foods";
  import {
    recipeIngredientLists,
    recipeIngredientsStore,
  } from "../../stores/recipe.store";
  import { calorieDisplayDecimals } from "../../stores/device-settings";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import FoodStager from "./FoodStager.svelte";

  // Add an ingredient to a recipe using the shared FoodStager (issue #16) — the
  // same Search / Scan / Custom staging flow the direct-log sheet uses. Emits the
  // chosen food as a RecipeIngredient; never logs. `onAdd` reports back whether
  // the food was taken: a same-twin re-add at an incompatible unit is blocked
  // (issue #14), and the sheet stays open showing the reason instead of dropping
  // the tap silently.
  //
  // Raised over the recipe/instantiation dialog: the fixed sheet, its own
  // backdrop, and the over-dialog pointer-events fix all come from the shared
  // BottomSheet primitive now (ADR-0027/0028) — this sheet only composes the
  // header back affordance and the FoodStager body.
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

  // The stager's unified back capability (a staged food or a barcode-door capture
  // form). When it has nothing to unwind, the header back becomes "Cancel" and
  // closes the sheet.
  let canGoBack = $state(false);
  let goBack = $state<() => void>(() => {});

  // An ingredient list is a thing measured INTO something, so a food that can be
  // weighed opens on grams here where the log sheet opens it on its panel's own
  // unit (ADR-0105 §7, as amended).
  //
  // Its memory is the recipes themselves, not the consumption log: what a food
  // was last measured into a dish in is the fact this screen is seeded by, and
  // what it was last DRUNK in says nothing about it. A can of Coke logged in
  // millilitres for months is still a thing measured into something the first
  // time it reaches an ingredient list, which is the case a per-food memory
  // would get wrong.
  //
  // Only the unit is remembered, and not the amount: how much of a food a recipe
  // uses is a property of that recipe, where which unit you measure it in is a
  // property of how you cook.
  let ingredientLists = $derived(
    recipeIngredientLists($recipeIngredientsStore)
  );
  const lastUnitFor = (entity: string): MeasuredUnit | null =>
    rememberedIngredientUnit(ingredientLists, entity);

  // Map the chosen food to a RecipeIngredient and hand it to the recipe builder.
  // `onAdd`'s outcome is already the stager's outcome shape: `ok` closes the
  // sheet (the parent unmounts us), otherwise the reason keeps it open.
  function handleChoose(choice: FoodChoice): ChooseOutcome {
    if (choice.kind === "food") {
      return onAdd(ingredientFromFood(choice.food, choice.amount, choice.unit));
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
      return `Add ${roundFoodDisplay(ctx.staged.calories * ctx.factor, $calorieDisplayDecimals)} kcal`;
    if (ctx.method === "custom")
      return ctx.toReview > 0 ? "Review & add" : "Add";
    if (ctx.method === "scan") return "Look up";
    return "Add";
  }
</script>

<BottomSheet
  isOpen
  title="Add ingredient"
  class="add-ingredient-sheet"
  flushBody
  elevated
  {onClose}
  onBack={canGoBack ? goBack : onClose}
  backLabel={canGoBack ? "Back" : "Cancel"}
>
  <FoodStager
    bind:staged
    bind:canGoBack
    bind:goBack
    amountContext="recipe"
    {lastUnitFor}
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
</BottomSheet>
