<script lang="ts">
  import { dbClient } from "../../db/db.client";
  import { ingestEntity } from "../../ingestion/ingest";
  import {
    logRecipeConsumption,
    correctInstantiation,
    seedRowFromRef,
    seedRowsFromTemplate,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import {
    toReferenceIngredient,
    panelFromIngredients,
    nameFromIngredients,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import { sanitizeYield } from "../../food/recipe-nutrition";
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

  async function seed() {
    try {
      if (edit?.instantiation) {
        const inst = edit.instantiation;
        based_on = inst.based_on || edit.target || "";
        title = edit.foodName || "Recipe";
        recipeYield = inst.yield || 1;
        ingredients = await Promise.all(
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
      } else if (template) {
        based_on = template.entity;
        title = template.attributes["recipe/name"] || "Recipe";
        recipeYield = template.attributes["recipe/yield"] || 1;
        ingredients = await seedRowsFromTemplate(template.attributes);
      }
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    } finally {
      ready = true;
    }
  }

  async function save() {
    if (ingredients.length === 0 || !based_on || status === "loading") return;
    status = "loading";
    error = "";
    try {
      // Ingest each ingredient twin so it exists in the ledger (idempotent for
      // ones that already do; needed for freshly-added custom ingredients).
      for (const ing of ingredients) {
        await dbClient.append(ingestEntity(ing.payload));
      }
      const refs = ingredients.map(toReferenceIngredient);
      const resolve = (ref: string) => panelFromIngredients(ingredients, ref);
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
          selectedDate
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
          selectedDate
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
  <IngredientListEditor bind:ingredients bind:recipeYield />
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
