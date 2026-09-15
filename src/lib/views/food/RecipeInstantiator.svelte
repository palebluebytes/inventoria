<script lang="ts">
  import { dbClient } from "../../db/db.client";
  import { ingestEntity } from "../../ingestion/ingest";
  import type { ConsumptionEvent } from "../../stores/calorie.store";
  import {
    logRecipeConsumption,
    correctInstantiation,
    seedRowFromRef,
    seedRowsFromTemplate,
  } from "../../stores/recipe.store";
  import {
    toReferenceIngredient,
    sourceFromIngredients,
    nameFromIngredients,
    parseLoggedQuantity,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import { sanitizeYield } from "../../food/recipe-nutrition";
  import {
    RECIPE_BATCH_WEIGHT_ATTR,
    sanitizeWeight,
    weighedOccasion,
    type OccasionSize,
  } from "../../food/batch-weight";
  import { roundFood } from "../../food/nutrition";
  import { scaleAmount } from "../../food/scale-amount";
  import Alert from "../../ui/Alert.svelte";
  import Button from "../../ui/Button.svelte";
  import IngredientListEditor from "./IngredientListEditor.svelte";

  // The editor body behind the Instantiate verb and the correction of a past
  // instantiation (ADR-0022) — the same surface, sheet chrome removed so it can
  // render either inside the log sheet's Recipe tab (via FoodStager) or wrapped in
  // a BottomSheet for the dashboard correction path. Seeded from a **template**
  // (Instantiate: its default ingredients + yield) or a past **instantiation
  // event** (Correct: re-seed the snapshot's rows against each ref's current
  // twin). Either way the user tweaks amounts / adds / removes / adjusts yield,
  // then commit:
  //   • Instantiate → logs a Recipe Instantiation, retracts nothing (additive).
  //   • Correct → appends a superseding instantiation and retracts the old
  //     (retract-and-replace, ADR-0008).
  // Its commit is driven by the host's shared dock: it exposes `requestSave` /
  // `saveReady`, mirroring ManualEntryFlow, and calls `onCommitted` on success.
  let {
    meal_type,
    selectedDate,
    template = null,
    edit = null,
    onCommitted,
    onEdit,
    requestSave = $bindable(),
    saveReady = $bindable(false),
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    /** A Recipe Twin (getLocalFoodTwin shape) to instantiate. */
    template?: { entity: string; attributes: Record<string, any> } | null;
    /** A past Recipe Instantiation event to correct. */
    edit?: ConsumptionEvent | null;
    /** Called once the instantiation is logged (the host closes/returns). */
    onCommitted: () => void;
    /**
     * Opens the recipe's template for editing. Shown as an "Edit" button beside
     * the recipe name when instantiating from a template; omitted on the
     * dashboard Correct path (no template to edit).
     */
    onEdit?: () => void;
    /** The host's dock fires this to commit; readiness gates its button. */
    requestSave?: () => void;
    saveReady?: boolean;
  } = $props();

  let ingredients = $state<RecipeIngredient[]>([]);
  let recipeYield = $state<number | string>(1);
  // How many servings this occasion is, owned by the editor below and read back
  // here only to be said on the log. It is not a divisor by the time it arrives
  // — the rows have already been scaled by it — and it is what sizes an occasion
  // of a recipe nobody weighed, which is the only thing that can (ADR-0106 §7).
  let servings = $state<number | string>(1);
  // What this occasion weighed, and what it was a fraction of (ADR-0106 §1).
  // Both are grams and neither is derived from the rows: a pot does not weigh
  // what went into it, so Σ of the raw amounts is a different quantity and is
  // never offered here (§7). Empty on a recipe nobody weighed, which is what
  // leaves the editor below on the serving count alone.
  let batchWeight = $state<number | string>("");
  let portionWeight = $state<number | string>("");
  // Whether this occasion is sized by the scale, settled once at seed and handed
  // down to the editor rather than worked out again there: what the surface
  // opened asking is a fact about the seeding, and two expressions of it could
  // drift into a surface asking one question and a save answering the other.
  let sizedByWeight = $state(false);
  // What the template says the batch makes, for the serving read-out alone (§6).
  // Undefined on the correction path, where the snapshot froze a yield of 1 over
  // rows that are already the portion and so cannot say it.
  let templateYield = $state<number | undefined>(undefined);
  let title = $state("Recipe");
  // The template this occasion is based on — carried onto the instantiation as
  // `based_on` (= event/target). For a correction it comes from the snapshot.
  let based_on = "";
  let ready = $state(false);
  let status = $state<"idle" | "loading" | "error">("idle");
  let error = $state("");

  let yieldNum = $derived(sanitizeYield(recipeYield));

  // Seed once. Async (resolves each ingredient's current twin), so the editor is
  // held behind `ready`.
  let seeded = false;
  $effect(() => {
    if (seeded) return;
    seeded = true;
    void seed();
  });

  /**
   * Open at ONE serving. A template stores the batch and what that batch makes;
   * this surface asks how many servings the occasion is, defaulting to 1 — so
   * the rows it opens with have to be one serving's worth, not the batch, or the
   * count on screen would describe something other than the amounts beside it.
   * Dividing here (and holding the yield at 1) means the two always agree, the
   * logged figure is simply what the rows say, and raising the count raises the
   * amounts and the logging together.
   *
   * The logged total is unchanged by this: `Σrows ÷ yield` is the same number
   * whether the rows are the batch over its yield or one serving over 1.
   */
  function openAtOneServing(rows: RecipeIngredient[], batchYield: number) {
    recipeYield = 1;
    ingredients =
      batchYield === 1
        ? rows
        : rows.map((ing) => ({
            ...ing,
            amount: scaleAmount(ing.amount, batchYield, "divide"),
          }));
  }

  /**
   * Reopen a past occasion on the two weights it was logged with (ADR-0106 §5).
   * The denominator is the one frozen on the snapshot, never the template's
   * current figure — the template may have been re-weighed since, and a logged
   * occasion is a historical reading. The numerator is the event's own quantity,
   * which is the portion's weight exactly when one was taken (§8).
   *
   * Both or neither: a numerator whose denominator is gone divides against
   * nothing, so such an occasion reopens on the serving count, as does every
   * occasion logged before this record shipped.
   */
  function seedWeightsFromEvent(event: ConsumptionEvent) {
    const batch = sanitizeWeight(event.instantiation?.batch_weight);
    const eaten = parseLoggedQuantity(event.quantity);
    if (batch === undefined || eaten.unit !== "g") return;
    batchWeight = batch;
    portionWeight = eaten.amount;
    sizedByWeight = true;
  }

  async function seed() {
    try {
      if (edit?.instantiation) {
        const inst = edit.instantiation;
        based_on = inst.based_on || edit.target || "";
        title = edit.foodName || "Recipe";
        seedWeightsFromEvent(edit);
        const rows = await Promise.all(
          inst.ingredients.map((r) =>
            seedRowFromRef(r.ref, r.amount, r.unit, {
              name: r.name,
              calories: r.calories,
              protein: r.protein,
              fat: r.fat,
              carbs: r.carbs,
            })
          )
        );
        openAtOneServing(rows, sanitizeYield(inst.yield || 1));
      } else if (template) {
        based_on = template.entity;
        title = template.attributes["recipe/name"] || "Recipe";
        const batchYield = sanitizeYield(
          template.attributes["recipe/yield"] || 1
        );
        // Open on the recipe's remembered batch weight and one serving of it, so
        // the two weights agree with the rows beside them from the first paint:
        // the rows are the batch ÷ yield, and a serving of a weighed batch is
        // its weight ÷ the same yield. Overriding either is this occasion's
        // business and reaches the template never (ADR-0106 §3).
        const batch = sanitizeWeight(
          template.attributes[RECIPE_BATCH_WEIGHT_ATTR]
        );
        if (batch !== undefined) {
          templateYield = batchYield;
          batchWeight = batch;
          // Rounded like every other amount that can be retyped: an unrounded
          // divide opens the field on 128.57142857142858 g.
          portionWeight = roundFood(batch / batchYield);
          sizedByWeight = true;
        }
        openAtOneServing(
          await seedRowsFromTemplate(template.attributes),
          batchYield
        );
      }
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    } finally {
      ready = true;
    }
  }

  /**
   * How big this occasion was, as the editor settled it (ADR-0106 §5, §8). The
   * two weights when the cook had a scale, and the serving count when nobody
   * weighed anything — never both, because they are two answers to the same
   * question and the ledger says one of them.
   *
   * None of it is a divisor. The rows have already been scaled, so the numbers
   * are settled before this runs and these are only what the occasion is
   * *recorded* as.
   */
  function occasionSize(): OccasionSize {
    return (
      weighedOccasion({
        batch_weight: sanitizeWeight(batchWeight),
        portion_weight: sanitizeWeight(portionWeight),
      }) ?? { servings: sanitizeYield(servings) }
    );
  }

  async function save() {
    if (ingredients.length === 0 || !based_on || status === "loading") return;
    // An occasion the surface asked to weigh cannot be logged half-weighed: the
    // rows are already a fraction, and a blank field cannot say which. Refused
    // here rather than by greying out the dock, so the refusal can say what it
    // means — the same choice ADR-0106 §6 makes for a non-positive count.
    if (sizedByWeight && occasionSize().servings !== undefined) {
      status = "error";
      error =
        "Say what the batch weighed and how much of it you ate — this occasion is a fraction of the pot, and a blank cannot say which.";
      return;
    }
    status = "loading";
    error = "";
    try {
      // Ingest each ingredient twin so it exists in the ledger (idempotent for
      // ones that already do; needed for freshly-added custom ingredients).
      for (const ing of ingredients) {
        await dbClient.append(ingestEntity(ing.payload));
      }
      const refs = ingredients.map(toReferenceIngredient);
      const resolve = (ref: string) => sourceFromIngredients(ingredients, ref);
      const resolveName = (ref: string) =>
        nameFromIngredients(ingredients, ref);
      if (edit) {
        // Correct: append a superseding instantiation, retract the old event.
        await correctInstantiation(
          edit.id,
          based_on,
          refs,
          yieldNum,
          resolve,
          resolveName,
          meal_type,
          selectedDate,
          occasionSize()
        );
      } else {
        // Instantiate: purely additive — log and retract nothing.
        await logRecipeConsumption(
          based_on,
          refs,
          yieldNum,
          resolve,
          resolveName,
          meal_type,
          selectedDate,
          occasionSize()
        );
      }
      onCommitted();
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    }
  }

  // Surface the commit to the host's shared dock (ManualEntryFlow pattern).
  requestSave = save;
  $effect(() => {
    saveReady = ready && ingredients.length > 0 && status !== "loading";
  });
</script>

<div class="rhead">
  <p class="rname" data-testid="instantiation-name">{title}</p>
  {#if onEdit}
    <Button
      variant="secondary"
      size="sm"
      onclick={onEdit}
      aria-label="Edit {title}">Edit</Button
    >
  {/if}
</div>
{#if ready}
  <!-- Instantiating asks how many servings THIS occasion is: the recipe's yield
       is already settled on the template, so the count scales the amounts and
       the logged headline follows (ADR-0022 amendment). -->
  <IngredientListEditor
    bind:ingredients
    bind:recipeYield
    bind:batchWeight
    bind:portionWeight
    bind:servings
    {templateYield}
    {sizedByWeight}
    servingsMode="portions"
  />
{:else}
  <p class="loading">Loading recipe…</p>
{/if}

{#if status === "error"}
  <div class="err"><Alert variant="error">{error}</Alert></div>
{/if}

<style>
  .rhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
  }
  .rname {
    font-size: var(--step-1);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .loading {
    color: var(--text-muted);
    padding: var(--space-l) 0;
    text-align: center;
  }
  .err {
    margin-top: var(--space-s);
  }
</style>
