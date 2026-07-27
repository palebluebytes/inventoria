<script lang="ts">
  import {
    toReferenceIngredient,
    panelFromIngredients,
    nameFromIngredients,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import {
    deriveRecipeNutrition,
    deriveIngredientMacros,
    sanitizeYield,
  } from "../../food/recipe-nutrition";
  import { round2 } from "../../food/nutrition";
  import AddIngredientSheet from "./AddIngredientSheet.svelte";
  import MacroPills from "./MacroPills.svelte";

  // The shared ingredient-list surface behind both the recipe builder
  // (Consolidate/Define) and the instantiation editor (Instantiate/Correct):
  // an editable list of {name · inline amount · unit · live kcal · remove}, an
  // add-ingredient action, a yield control, and a live per-serving panel. Every
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
  function addIngredient(ing: RecipeIngredient) {
    ingredients = [...ingredients, ing];
    showAdd = false;
  }
</script>

<div class="ing-head">
  <span class="fl">Ingredients ({ingredients.length})</span>
  <span class="tot recipe-total"
    >{round2(perServing.calories)} kcal · {round2(perServing.protein)}g P /
    serving</span
  >
</div>
<ul class="ings">
  {#each ingredients as ing (ing.entity)}
    {@const row = rowView(ing)}
    <li class="recipe-ingredient">
      <span class="in">
        <span class="iname">{ing.name}</span>
        <span class="iqty">
          <input
            class="amount-in edit-amount"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            bind:value={ing.amount}
            aria-label="Amount of {ing.name}"
          />
          <span class="unit"
            >{ing.unit === "g"
              ? "g"
              : row.amount === 1
                ? "serving"
                : "servings"}</span
          >
          <span class="ikcal">· {round2(row.macros.calories)} kcal</span>
        </span>
      </span>
      <button
        class="rm remove-ingredient"
        onclick={() => removeIngredient(ing.entity)}
        aria-label="Remove {ing.name}">✕</button
      >
    </li>
  {/each}
  {#if ingredients.length === 0}
    <li class="empty">No ingredients — add some below.</li>
  {/if}
</ul>
<button class="add" id="add-ingredient-btn" onclick={() => (showAdd = true)}
  >+ Add ingredient</button
>

<div class="yield-row">
  <label class="fl" for="recipe-yield">Yield (servings)</label>
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
    calories={perServing.calories}
    protein={perServing.protein}
    fat={perServing.fat}
    carbs={perServing.carbs}
  />
</div>

{#if showAdd}
  <AddIngredientSheet onAdd={addIngredient} onClose={() => (showAdd = false)} />
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
  .ings li {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    border: 1px solid #000;
    padding: var(--space-xs) var(--space-s);
  }
  .ings li.empty {
    justify-content: center;
    color: var(--text-muted);
    font-size: var(--step-n2);
    border-style: dashed;
  }
  .in {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .iname {
    font-weight: 600;
  }
  .iqty {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
    font-size: var(--step-n2);
    color: var(--text-muted);
    margin-top: 2px;
  }
  .amount-in {
    width: 3.75rem;
    border: 1px solid #000;
    padding: 2px var(--space-3xs);
    font-family: inherit;
    font-size: var(--step-n2);
    font-weight: 700;
    text-align: right;
    color: var(--text-primary);
    background: #fff;
  }
  .unit {
    font-weight: 600;
  }
  .rm {
    background: none;
    border: none;
    font-size: var(--step-0);
    font-weight: 700;
    cursor: pointer;
  }
  .add {
    width: 100%;
    margin-top: var(--space-2xs);
    border: 2px dashed #000;
    background: #fff;
    padding: var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }
  .tin {
    width: 100%;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-size: var(--step-0);
    font-family: inherit;
    background: #fff;
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
