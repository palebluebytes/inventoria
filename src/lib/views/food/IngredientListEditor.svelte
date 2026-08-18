<script lang="ts">
  import {
    toReferenceIngredient,
    panelFromIngredients,
    nameFromIngredients,
    addOrMergeIngredient,
    type RecipeIngredient,
    type IngredientAddOutcome,
  } from "../../food/recipe-ingredient";
  import {
    deriveRecipeNutrition,
    deriveIngredientMacros,
    sanitizeYield,
  } from "../../food/recipe-nutrition";
  import { roundFoodDisplay, type Portion } from "../../food/nutrition";
  import { buildNutrientPills } from "../../food/nutrient-display";
  import { nutritionDisplayDecimals } from "../../stores/settings.store";
  import AddIngredientSheet from "./AddIngredientSheet.svelte";
  import IngredientAmountSheet from "./IngredientAmountSheet.svelte";
  import FoodItemRow from "./FoodItemRow.svelte";
  import MacroPills from "./MacroPills.svelte";

  // The shared ingredient-list surface behind both the recipe builder
  // (Consolidate/Define) and the instantiation editor (Instantiate/Correct):
  // an editable list of {name · inline amount · unit · live kcal · remove}, an
  // add-ingredient action, a servings (yield) control, and a live per-serving
  // panel. Every
  // number is DERIVED from each ingredient's real `nutrition/info` panel via the
  // one food-domain formula (ADR-0021), so a displayed row can never rot against
  // its `amount`. The inline amount editor is #9, reused here rather than
  // reinvented.
  let {
    ingredients = $bindable(),
    recipeYield = $bindable(),
  }: {
    ingredients: RecipeIngredient[];
    /** schema.org recipeYield; held loosely so the field can be cleared while
     *  typing, sanitised to a positive number for the live derivation. */
    recipeYield: number | string;
  } = $props();

  let showAdd = $state(false);
  // The row whose amount is being edited in the picker sheet, by list index.
  let editingIndex = $state<number | null>(null);

  let yieldNum = $derived(sanitizeYield(recipeYield));

  // Pure {ref, amount, unit} references — the shape the derivation reads.
  let referenceIngredients = $derived(ingredients.map(toReferenceIngredient));
  // Each ingredient's real nutrition panel / display name, read in memory from
  // its inlined twin payload — never mutating the food twin.
  const resolvePanel = (ref: string) => panelFromIngredients(ingredients, ref);
  const resolveName = (ref: string) => nameFromIngredients(ingredients, ref);

  // Live per-serving macros via the SAME derivation the Consumption projection
  // and log-time snapshot use: Σ(panel × amount ÷ serving_size) ÷ yield.
  let perServing = $derived(
    deriveRecipeNutrition(referenceIngredients, yieldNum, resolvePanel)
  );
  // A row's derived display: the clean {ref, amount, unit} (its `amount` coerced
  // once at this boundary, since the inline editor's numeric input is briefly
  // empty while retyping) and its live macro contribution via the shared helper.
  function rowView(ing: RecipeIngredient) {
    const ref = toReferenceIngredient(ing);
    return {
      amount: ref.amount,
      macros: deriveIngredientMacros(ref, resolvePanel),
    };
  }

  function removeIngredient(entity: string) {
    ingredients = ingredients.filter((i) => i.entity !== entity);
  }
  // Fold the chosen food into the list. Re-adding a food already referenced
  // merges into its row (one row per twin — the list is entity-keyed), so the
  // add can never mint a duplicate key and abort the render (issue #14). A
  // same-twin re-add at an incompatible unit is blocked and reported back to the
  // sheet, which keeps itself open and shows the reason.
  function addIngredient(ing: RecipeIngredient): IngredientAddOutcome {
    const result = addOrMergeIngredient(ingredients, ing);
    if (!result.ok) {
      return {
        ok: false,
        message: `${result.name} is already in this recipe at a different unit — edit its amount instead.`,
      };
    }
    ingredients = result.ingredients;
    showAdd = false;
    return { ok: true };
  }
</script>

<div class="ing-head">
  <span class="fl">Ingredients ({ingredients.length})</span>
  <span class="tot recipe-total"
    >{roundFoodDisplay(perServing.calories, $nutritionDisplayDecimals)} kcal · {roundFoodDisplay(
      perServing.protein,
      $nutritionDisplayDecimals
    )}g P / serving</span
  >
</div>
<ul class="ings">
  {#each ingredients as ing, i (ing.entity)}
    {@const row = rowView(ing)}
    <li>
      <!-- Only gram-unit rows open the amount/breakdown sheet (#30): those are
           foods from a source, carrying a real nutrition/info panel worth
           expanding. A serving-unit row is always a custom ingredient — a quick
           macro-only entry (a restaurant meal, a bare calorie count), so it has
           no richer panel to break down, and the sheet's gram-scaling factor
           (value ÷ serving grams) wouldn't apply to a serving amount anyway. -->
      <FoodItemRow
        class="recipe-ingredient"
        name={ing.name}
        amount={row.amount}
        unit={ing.unit}
        calories={row.macros.calories}
        onclick={ing.unit === "g" ? () => (editingIndex = i) : undefined}
        onRemove={() => removeIngredient(ing.entity)}
      />
    </li>
  {/each}
  {#if ingredients.length === 0}
    <li class="empty">No ingredients — add some below.</li>
  {/if}
</ul>
<button class="add" id="add-ingredient-btn" onclick={() => (showAdd = true)}
  >+ Add ingredient</button
>

<!-- Servings — schema.org `recipeYield` (ADR-0021), the number the whole surface
     is read against: the ingredient amounts above are the BATCH as it goes in the
     pot, and everything headline (the kcal beside "Ingredients", the per-serving
     panel below, what one logging records) is that batch divided by this. Asking
     for it here, beside the list it divides, is why the list no longer offers a
     ×/÷ on the amounts: "this makes four" is the thing a cook actually knows,
     and halving every ingredient by hand was only ever a way of saying it. -->
<div class="yield-row">
  <label class="fl" for="recipe-yield">Makes (servings)</label>
  <input
    id="recipe-yield"
    class="tin yield-in"
    type="number"
    inputmode="numeric"
    min="1"
    bind:value={recipeYield}
  />
</div>

<div class="per-serving" data-testid="per-serving">
  <span class="fl">Per serving</span>
  <MacroPills
    pills={buildNutrientPills(
      perServing,
      ["protein", "fat", "carbs"],
      $nutritionDisplayDecimals
    )}
  />
</div>

{#if showAdd}
  <AddIngredientSheet onAdd={addIngredient} onClose={() => (showAdd = false)} />
{/if}

{#if editingIndex !== null}
  <IngredientAmountSheet
    payload={ingredients[editingIndex].payload}
    name={ingredients[editingIndex].name}
    amount={rowView(ingredients[editingIndex]).amount}
    portions={ingredients[editingIndex].payload.attributes["food/portions"] as
      | Portion[]
      | undefined}
    panel={resolvePanel(ingredients[editingIndex].entity)}
    onCommit={(amount) => {
      if (editingIndex !== null) ingredients[editingIndex].amount = amount;
    }}
    onClose={() => (editingIndex = null)}
  />
{/if}

<style>
  .fl {
    display: block;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    margin: var(--space-s) 0 var(--space-3xs);
  }
  .ing-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: var(--space-m);
  }
  .ing-head .fl {
    margin: 0;
  }
  .tot {
    font-weight: 800;
  }
  .ings {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
  }
  .ings li.empty {
    display: flex;
    justify-content: center;
    align-items: center;
    border: 1px dashed var(--ink);
    padding: var(--space-xs) var(--space-s);
    color: var(--text-muted);
    font-size: var(--step-n2);
  }
  .add {
    width: 100%;
    margin-top: var(--space-2xs);
    border: 2px dashed var(--ink);
    background: var(--paper);
    padding: var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }
  .tin {
    width: 100%;
    border: var(--edge);
    padding: var(--space-xs);
    font-size: var(--step-0);
    font-family: inherit;
    background: var(--paper);
  }
  .yield-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    margin-top: var(--space-m);
  }
  .yield-row .fl {
    margin: 0;
  }
  .yield-in {
    width: 6rem;
    text-align: center;
    font-weight: 700;
  }
  .per-serving {
    margin-top: var(--space-s);
  }
  .per-serving .fl {
    margin: 0 0 var(--space-2xs);
  }
</style>
