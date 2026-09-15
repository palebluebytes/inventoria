<script lang="ts">
  import { untrack } from "svelte";
  import {
    toReferenceIngredient,
    sourceFromIngredients,
    nameFromIngredients,
    addOrMergeIngredient,
    coerceAmount,
    quantityLabel,
    type RecipeIngredient,
    type IngredientAddOutcome,
  } from "../../food/recipe-ingredient";
  import {
    deriveRecipeNutrition,
    deriveIngredientMacros,
  } from "../../food/recipe-nutrition";
  import {
    enteredUnit,
    isMeasuredUnit,
    NUTRITION_INFO_ATTR,
    type MeasuredUnit,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import { FOOD_DENSITY_ATTR } from "../../food/density";
  import {
    occasionFraction,
    sanitizeWeight,
    servingsOfOccasion,
  } from "../../food/batch-weight";
  import { scaleAmount } from "../../food/scale-amount";
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
    batchWeight = $bindable(""),
    portionWeight = $bindable(""),
    templateYield,
    servings = $bindable(1),
    servingsMode = "makes",
  }: {
    ingredients: RecipeIngredient[];
    /** schema.org recipeYield; held loosely so the field can be cleared while
     *  typing, sanitised to a positive number for the live derivation. */
    recipeYield: number | string;
    /**
     * What the finished batch weighs, in grams. On `makes` it is the default the
     * Recipe Twin remembers; on `portions` it is what THIS pot weighed, opened
     * on that remembered default and freely overridable for the occasion
     * (ADR-0106 §3) — an override that never reaches back to the template, which
     * is ADR-0022 §3's decoupling and not this field's to break.
     *
     * Held loosely like the yield beside it, and empty is the standing answer: a
     * recipe nobody weighed is ordinary, and `sanitizeWeight` reads this back.
     */
    batchWeight?: number | string;
    /**
     * `portions` mode only: how much of that batch was eaten, in grams. Over
     * {@link batchWeight} it is the fraction of the recipe this occasion was,
     * and that fraction is what scales the rows (ADR-0106 §1, §5).
     */
    portionWeight?: number | string;
    /**
     * `portions` mode only: what the Recipe Twin says the batch makes, used to
     * read the serving count out of the weight (ADR-0106 §6) and for nothing
     * else — it is not a divisor here, and the occasion's own `recipeYield` is
     * held at 1 by the surface above.
     *
     * Absent where the count cannot honestly be read out. Correcting a past
     * occasion is that case: its snapshot froze a yield of 1 over rows that are
     * already the portion, so how many servings the original batch made is not
     * in it. The two weights still work there, which is the whole of what §5
     * freezes the batch weight for.
     */
    templateYield?: number;
    /**
     * `portions` mode only: how many servings this occasion is. Bound out so the
     * saving surface can say it on the log (ADR-0106 §8). It is not a divisor by
     * the time it leaves here — the rows have already been scaled by it — only
     * the word for how big the occasion was.
     */
    servings?: number | string;
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

  /**
   * Which question this occasion can be asked, fixed at seed. A recipe whose
   * template carries a batch weight is sized by the scale; one nobody weighed
   * falls back to the serving count and nothing else, and never to the row sum
   * (ADR-0106 §7) — Σ of the raw amounts is a different quantity from a pot's
   * weight, so offering it here would seed the field with a number wrong in a
   * direction nobody can predict.
   *
   * Read once rather than reactively: the rows have already been scaled against
   * whichever question was asked, so swapping the surface when the field is
   * cleared mid-type would move the ground under them.
   */
  const weighing = untrack(
    () =>
      servingsMode === "portions" && sanitizeWeight(batchWeight) !== undefined
  );

  // The basis each change scales from, so the amounts move by the ratio between
  // the new answer and the applied one rather than accumulating from 1. One per
  // question: the count, and the fraction of the batch.
  let appliedServings = 1;
  // Seeded from the weights the host opened with, which is what lets a
  // correction reopen on its frozen rows and still divide against the pot
  // (ADR-0106 §5): those rows are already a fraction of it, and this is which.
  let appliedFraction = untrack(
    () => occasionFraction(portionWeight, batchWeight) ?? 1
  );

  function rescaleRows(factor: number) {
    ingredients = ingredients.map((ing) => ({
      ...ing,
      amount: scaleAmount(coerceAmount(ing.amount), factor, "multiply"),
    }));
  }

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
    rescaleRows(factor);
  }

  /**
   * Rescale every ingredient to the fraction of the batch these two weights
   * name (ADR-0106 §1). Both fields run through here, because both move the
   * fraction: eating 200 g instead of 160 g raises it, and learning the pot was
   * 600 g rather than 480 g lowers it by exactly as much as it should.
   *
   * A no-op until both numbers are usable, which is the same refusal the count
   * makes of an empty field — and the same reason. Nothing is derived from the
   * rows here, so a recipe mixing grams and millilitres is sized exactly like
   * one that does not.
   */
  function changeOccasion(
    nextBatch: number | string,
    nextEaten: number | string
  ) {
    batchWeight = nextBatch;
    portionWeight = nextEaten;
    const fraction = occasionFraction(nextEaten, nextBatch);
    if (fraction === undefined || fraction === appliedFraction) return;
    const factor = fraction / appliedFraction;
    appliedFraction = fraction;
    rescaleRows(factor);
  }

  // How many servings this occasion is, read OUT of the weight rather than typed
  // into (ADR-0106 §6). 250 g of a 400 g serving reads 0.625 of one, which no
  // whole-number field could have displayed.
  // Spelled through `quantityLabel`, the app's one quantity phrase, so a count
  // read out here and the same count written to the ledger by the surface above
  // cannot say the same thing two ways (ADR-0060 §4).
  let servingsReadout = $derived.by(() => {
    if (templateYield === undefined) return undefined;
    const count = servingsOfOccasion(portionWeight, batchWeight, templateYield);
    return count === undefined ? undefined : quantityLabel(count, "serving");
  });

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
  const resolveSource = (ref: string) =>
    sourceFromIngredients(ingredients, ref);
  const resolveName = (ref: string) => nameFromIngredients(ingredients, ref);

  // The figures describe the ingredients ON SCREEN: Σ(panel × amount ÷
  // serving_size) over the rows, via the same derivation the projection and the
  // log-time snapshot use — but never divided. Dividing by the serving count
  // made the header disagree with the list under it (two rows totalling 185 kcal
  // headed "46 kcal") and the arithmetic only reconciled if you noticed a "/
  // serving" suffix. What the yield divides is what gets LOGGED, which is the
  // saving surface's business, not this list's.
  let visibleTotal = $derived(
    deriveRecipeNutrition(referenceIngredients, 1, resolveSource)
  );
  // A row's derived display: the clean {ref, amount, unit} (its `amount` coerced
  // once at this boundary, since the inline editor's numeric input is briefly
  // empty while retyping) and its live macro contribution via the shared helper.
  function rowView(ing: RecipeIngredient) {
    const ref = toReferenceIngredient(ing);
    return {
      amount: ref.amount,
      macros: deriveIngredientMacros(ref, resolveSource),
    };
  }

  // The unit an editable row opens on: the one it was entered in, falling back
  // to the panel's for a whole-serving row that names none.
  function editUnit(ing: RecipeIngredient): MeasuredUnit {
    return enteredUnit(
      ing.unit,
      (ing.payload.attributes[NUTRITION_INFO_ATTR] as NutritionInfo | undefined)
        ?.serving_size
    );
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

<!-- Just the count: the figures for the whole list live at the foot of it, and
     repeating a kcal/protein headline here only invited the eye to check one
     against the other. -->
<div class="ing-head">
  <span class="fl">Ingredients ({ingredients.length})</span>
</div>
<ul class="ings">
  {#each ingredients as ing, i (ing.entity)}
    {@const row = rowView(ing)}
    <li>
      <!-- Only rows measured against a panel basis open the amount/breakdown
           sheet (#30): those are foods from a source, carrying a real
           nutrition/info panel worth expanding. A serving-unit row is always a
           custom ingredient — a quick macro-only entry (a restaurant meal, a
           bare calorie count), so it has no richer panel to break down, and the
           sheet's basis-scaling factor wouldn't apply to a serving amount
           anyway. -->
      <FoodItemRow
        class="recipe-ingredient"
        name={ing.name}
        amount={row.amount}
        unit={ing.unit}
        calories={row.macros.calories}
        onclick={isMeasuredUnit(ing.unit)
          ? () => (editingIndex = i)
          : undefined}
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
{#if servingsMode === "makes"}
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
  <!-- What the pot weighs when this recipe is cooked (ADR-0106 §2, §4). It sits
       beside the count rather than replacing it: the two answer different
       questions and neither derives the other, and `recipe/yield` is still
       schema.org's `recipeYield` and the divisor behind every per-serving
       figure.

       It is NOT derived from the list above, and no default is offered from it.
       A pot does not weigh what went into it — a stew simmers off water, rice
       absorbs it — so Σ of the raw amounts is a different quantity, and seeding
       this field with it would plant a number wrong in a direction nobody can
       predict (ADR-0106 §7). Grams, with no unit beside it, because a scale is
       the only place this number can have come from (§2). -->
  <div class="yield-row">
    <label class="fl" for="recipe-batch-weight">Batch weight (g)</label>
    <input
      id="recipe-batch-weight"
      class="tin yield-in weight-in"
      type="number"
      inputmode="decimal"
      min="0"
      step="any"
      placeholder="—"
      bind:value={batchWeight}
    />
  </div>
{:else if weighing}
  <!-- The occasion's two questions (ADR-0106 §1): what the finished dish
       weighed, and how much of it was eaten. The second over the first is the
       fraction of the recipe this occasion was, and that fraction is what
       scales the rows above.

       Nothing is converted on the way, because nothing is derived: the
       ingredients' own units stop bearing on the question entirely, so a recipe
       mixing 100 g of flour with 330 ml of milk is sized exactly like one that
       does not. The batch weight opens on the template's remembered default and
       may be overridden here for this occasion alone; the override never
       reaches the template (§3). -->
  <div class="yield-row">
    <label class="fl" for="recipe-batch-weight">Batch weight (g)</label>
    <input
      id="recipe-batch-weight"
      class="tin yield-in weight-in"
      type="number"
      inputmode="decimal"
      min="0"
      step="any"
      value={batchWeight}
      oninput={(e) => changeOccasion(e.currentTarget.value, portionWeight)}
    />
  </div>
  <div class="yield-row">
    <label class="fl" for="recipe-portion-weight">You ate (g)</label>
    <input
      id="recipe-portion-weight"
      class="tin yield-in weight-in"
      type="number"
      inputmode="decimal"
      min="0"
      step="any"
      value={portionWeight}
      oninput={(e) => changeOccasion(batchWeight, e.currentTarget.value)}
    />
  </div>
  {#if servingsReadout !== undefined}
    <!-- The count still appears and still means "how many servings this occasion
         is", but it is read out of the weight rather than typed into (§6). -->
    <div class="yield-row">
      <span class="fl">Servings</span>
      <output class="servings-out" data-testid="occasion-servings"
        >{servingsReadout}</output
      >
    </div>
  {/if}
{:else}
  <!-- A recipe nobody weighed offers the count and nothing else (§7). "I didn't
       weigh this" has an honest answer already, and it is this one. -->
  <div class="yield-row">
    <label class="fl" for="recipe-servings">Servings</label>
    <!-- A fraction of a serving is a thing people eat, and while this field
         stepped in whole ones from a floor of 1 it was not sayable: the spinner
         could not reach half a portion, and the keypad `inputmode="numeric"`
         produces has no decimal point to type one with (ADR-0106 §6). A
         non-positive count is still refused, by `changeServings` rather than by
         the widget, which is where the refusal can say what it means. -->
    <input
      id="recipe-servings"
      class="tin yield-in"
      type="number"
      inputmode="decimal"
      min="0"
      step="any"
      value={servings}
      oninput={(e) => changeServings(e.currentTarget.value)}
    />
  </div>
{/if}

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
    unit={editUnit(ingredients[editingIndex])}
    panel={resolveSource(ingredients[editingIndex].entity)?.panel}
    onAssertDensity={(density) => {
      // The row's payload, not the ledger: an ingredient's twin is ingested when
      // the recipe is saved (`RecipeBuilder`), so the assertion travels with the
      // food the same way a staged one does, and a recipe the user abandons
      // writes nothing.
      if (editingIndex === null) return;
      const row = ingredients[editingIndex];
      row.payload = {
        ...row.payload,
        attributes: { ...row.payload.attributes, [FOOD_DENSITY_ATTR]: density },
      };
    }}
    onCommit={(amount, unit) => {
      if (editingIndex === null) return;
      ingredients[editingIndex].amount = amount;
      ingredients[editingIndex].unit = unit;
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
    margin-top: var(--space-m);
  }
  .ing-head .fl {
    margin: 0;
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
    /* Tighter padding than `.tin`, so the frame it borrows no longer reaches
       the floor on its own and has to say so. */
    min-height: var(--tap-min);
    padding: var(--space-2xs);
    text-align: center;
    font-weight: 700;
  }
  /* A weight in grams runs to four digits where a serving count runs to one. */
  .weight-in {
    width: 5rem;
  }
  /* A read-out, not a control: it takes the field's weight and none of its
     frame, so nothing about it invites a tap (ADR-0106 §6). */
  .servings-out {
    font-weight: 700;
    font-size: var(--step-0);
  }
  .recipe-figures {
    margin-top: var(--space-s);
  }
  .recipe-figures .fl {
    margin: 0 0 var(--space-2xs);
  }
</style>
