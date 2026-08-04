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
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Alert from "../../ui/Alert.svelte";
  import IngredientListEditor from "./IngredientListEditor.svelte";
  import CommitButton from "./CommitButton.svelte";

  // The one editor surface behind the Instantiate verb and the correction of a
  // past instantiation (ADR-0022). Seeded either from a **template** (a Recipe
  // Twin — Instantiate: seed its default ingredients + yield, then diverge for
  // this occasion only) or from a past **instantiation event** (Correct: re-seed
  // from the snapshot's rows but resolve each ref to its *current* twin, so the
  // correction re-derives from live ingredient data). Either way the user tweaks
  // amounts / adds / removes / adjusts yield with live macros, then:
  //   • Instantiate → logs a Recipe Instantiation and retracts nothing (additive).
  //   • Correct → appends a superseding instantiation and retracts the old with
  //     `event/replaced_by` (retract-and-replace, ADR-0008).
  let {
    meal_type,
    selectedDate,
    onClose,
    onBack = undefined,
    template = null,
    edit = null,
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
    /** Return to the Recipe browser this sheet was opened from. Set only when it
     *  was reached that way (an Instantiate); a Correction opened from a logged
     *  card has nowhere to go back to, so it's omitted. */
    onBack?: () => void;
    /** A Recipe Twin (getLocalFoodTwin shape) to instantiate. */
    template?: { entity: string; attributes: Record<string, any> } | null;
    /** A past Recipe Instantiation event to correct. */
    edit?: ConsumptionEvent | null;
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

  async function handleSave() {
    if (ingredients.length === 0 || !based_on) return;
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
      onClose();
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    }
  }
</script>

<BottomSheet
  isOpen
  title={edit ? "Correct" : "Log recipe"}
  {onClose}
  {onBack}
  backLabel="Back"
  animate={false}
>
  <p class="rname" data-testid="instantiation-name">{title}</p>
  {#if ready}
    <IngredientListEditor bind:ingredients bind:recipeYield />
  {:else}
    <p class="loading">Loading recipe…</p>
  {/if}

  {#if status === "error"}
    <div class="err"><Alert variant="error">{error}</Alert></div>
  {/if}

  {#snippet footer()}
    <CommitButton
      id="save-instantiation-btn"
      disabled={!ready || ingredients.length === 0 || status === "loading"}
      onclick={handleSave}
    >
      Log
    </CommitButton>
  {/snippet}
</BottomSheet>

<style>
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
