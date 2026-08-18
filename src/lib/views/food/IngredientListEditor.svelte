<script lang="ts">
  import {
    toReferenceIngredient,
    panelFromIngredients,
    nameFromIngredients,
    addOrMergeIngredient,
    coerceAmount,
    type RecipeIngredient,
    type IngredientAddOutcome,
  } from "../../food/recipe-ingredient";
  import {
    deriveRecipeNutrition,
    deriveIngredientMacros,
  } from "../../food/recipe-nutrition";
  import { roundFoodDisplay, type Portion } from "../../food/nutrition";
  import { scaleAmount } from "../../food/scale-amount";
  import { nutritionDisplayDecimals } from "../../stores/settings.store";
  import AddIngredientSheet from "./AddIngredientSheet.svelte";
  import IngredientAmountSheet from "./IngredientAmountSheet.svelte";
  import FoodItemRow from "./FoodItemRow.svelte";
  import NutrientPreview from "./NutrientPreview.svelte";

  // The shared ingredient-list surface behind both the recipe builder
  // (Consolidate/Define) and the instantiation editor (Instantiate/Correct):
  // an editable list of {name · inline amount · unit · live kcal · remove}, an
  // add-ingredient action, a servings control, and the live figures for what is
  // listed.
  // Every number is DERIVED from each ingredient's real `nutrition/info` panel via the
  // one food-domain formula (ADR-0021), so a displayed row can never rot against
  // its `amount`. The inline amount editor is #9, reused here rather than
  // reinvented.
  let {
    ingredients = $bindable(),
    recipeYield = $bindable(),
    servingsMode = "makes",
  }: {
    ingredients: RecipeIngredient[];
    /** schema.org recipeYield; held loosely so the field can be cleared while
     *  typing, sanitised to a positive number for the live derivation. */
    recipeYield: number | string;
    /**
     * What the servings control means on this surface — the two verbs ask
     * genuinely different questions of the same number:
     *
     *  • `makes` — defining the recipe: "this batch makes N servings". It binds
     *    `recipeYield`, which is recorded on the template and divides the batch
     *    at LOG time; it moves nothing on this surface, neither the amounts nor
     *    the figures, which describe the recipe as listed.
     *  • `portions` — instantiating one: "I am having N servings". The recipe's
     *    yield is already settled, so the number scales the AMOUNTS instead —
     *    two servings of a recipe is twice the ingredients, and the logged
     *    headline (Σrows ÷ yield) follows to exactly two servings' worth.
     */
    servingsMode?: "makes" | "portions";
  } = $props();

  // `portions` mode only: how many servings this occasion is, against which the
  // seeded amounts are one. Held as text so the field can be cleared mid-type.
  let servings = $state<number | string>(1);
  // The last APPLIED count — the basis each change scales from, so the amounts
  // move by the ratio between the two rather than accumulating from 1.
  let appliedServings = 1;

  /**
   * Rescale every ingredient to `next` servings. A no-op for anything that is
   * not yet a usable count (an empty field mid-type, a zero, a negative), which
   * leaves both the amounts and the applied basis where they were.
   */
  function changeServings(next: number | string) {
    servings = next;
    const count = Number(next);
    if (!Number.isFinite(count) || count <= 0 || count === appliedServings)
      return;
    const factor = count / appliedServings;
    appliedServings = count;
    ingredients = ingredients.map((ing) => ({
      ...ing,
      amount: scaleAmount(coerceAmount(ing.amount), factor, "multiply"),
    }));
  }

  // What the figures ARE: the whole recipe as listed while defining it, and the
  // portion being logged while instantiating one (where the rows have already
  // been scaled to the serving count). Either way they are the sum of what is on
  // screen, so neither label promises a division that isn't happening.
  let figuresLabel = $derived(
    servingsMode === "makes" ? "Recipe total" : "This entry"
  );

  let showAdd = $state(false);
  // The row whose amount is being edited in the picker sheet, by list index.
  let editingIndex = $state<number | null>(null);

  // Pure {ref, amount, unit} references — the shape the derivation reads.
  let referenceIngredients = $derived(ingredients.map(toReferenceIngredient));
  // Each ingredient's real nutrition panel / display name, read in memory from
  // its inlined twin payload — never mutating the food twin.
  const resolvePanel = (ref: string) => panelFromIngredients(ingredients, ref);
  const resolveName = (ref: string) => nameFromIngredients(ingredients, ref);

  // The figures describe the ingredients ON SCREEN: Σ(panel × amount ÷
  // serving_size) over the rows, via the same derivation the projection and the
  // log-time snapshot use — but never divided. Dividing by the serving count
  // made the header disagree with the list under it (two rows totalling 185 kcal
  // headed "46 kcal") and the arithmetic only reconciled if you noticed a "/
  // serving" suffix. What the yield divides is what gets LOGGED, which is the
  // saving surface's business, not this list's.
  let visibleTotal = $derived(
    deriveRecipeNutrition(referenceIngredients, 1, resolvePanel)
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
    >{roundFoodDisplay(visibleTotal.calories, $nutritionDisplayDecimals)} kcal · {roundFoodDisplay(
      visibleTotal.protein,
      $nutritionDisplayDecimals
    )}g P</span
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

<!-- Servings — the number the whole surface is read against, asked in the terms
     of whichever verb brought the user here (see `servingsMode`). Defining a
     recipe asks what the batch MAKES (schema.org `recipeYield`, ADR-0021), which
     is recorded on the template and divides it at log time; instantiating one
     asks how many servings this occasion is and scales the amounts to match. Either way it sits beside the list it governs,
     which is why the list no longer offers a ×/÷ on individual amounts: the
     serving count is the thing a cook actually knows, and rescaling every
     ingredient by hand was only ever a way of saying it. -->
<div class="yield-row">
  {#if servingsMode === "makes"}
    <label class="fl" for="recipe-yield">Makes (servings)</label>
    <input
      id="recipe-yield"
      class="tin yield-in"
      type="number"
      inputmode="numeric"
      min="1"
      bind:value={recipeYield}
    />
  {:else}
    <label class="fl" for="recipe-servings">Servings</label>
    <input
      id="recipe-servings"
      class="tin yield-in"
      type="number"
      inputmode="numeric"
      min="1"
      value={servings}
      oninput={(e) => changeServings(e.currentTarget.value)}
    />
  {/if}
</div>

<!-- The derived figures, shown through the SAME preview a food's card uses
     (NutrientPreview): the tracked nutrients as a grid, the rest of the panel
     behind the full-nutrition disclosure. A recipe's numbers are derived rather
     than read off a source panel, but there is no reason to read them
     differently — the old three-macro pill row showed strictly less. -->
<div class="recipe-figures" data-testid="recipe-figures">
  <span class="fl">{figuresLabel}</span>
  <NutrientPreview
    breakdown={visibleTotal}
    testid="recipe-nutrient-breakdown"
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
  /* Sized for what it holds — a serving count is one or two digits, so the field
     is narrow and its padding tighter than the full-width `.tin` it borrows the
     frame from. */
  .yield-in {
    width: 3.5rem;
    padding: var(--space-2xs);
    text-align: center;
    font-weight: 700;
  }
  .recipe-figures {
    margin-top: var(--space-s);
  }
  .recipe-figures .fl {
    margin: 0 0 var(--space-2xs);
  }
</style>
