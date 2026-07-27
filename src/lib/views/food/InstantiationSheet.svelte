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
  import {
    deriveRecipeNutrition,
    sanitizeYield,
  } from "../../food/recipe-nutrition";
  import { round2 } from "../../food/nutrition";
  import Modal from "../../ui/Modal.svelte";
  import Alert from "../../ui/Alert.svelte";
  import IngredientListEditor from "./IngredientListEditor.svelte";

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
    template = null,
    edit = null,
  }: {
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
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
  // Per-serving headline for the primary-button label — the SAME derivation the
  // editor's panel and the log-time snapshot use.
  let perServing = $derived(
    deriveRecipeNutrition(
      ingredients.map(toReferenceIngredient),
      yieldNum,
      (ref) => panelFromIngredients(ingredients, ref)
    )
  );

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

<Modal {onClose} title={edit ? `Correct ${title}` : `Log ${title}`}>
  {#snippet children({ props, close })}
    <div {...props} class="sheet">
      <header class="head">
        <span class="hbtn" aria-hidden="true"></span>
        <h2>{edit ? "Correct" : "Log recipe"}</h2>
        <button class="hbtn x" onclick={close} aria-label="Close">✕</button>
      </header>

      <div class="body">
        <p class="rname" data-testid="instantiation-name">{title}</p>
        {#if ready}
          <IngredientListEditor bind:ingredients bind:recipeYield />
        {:else}
          <p class="loading">Loading recipe…</p>
        {/if}

        {#if status === "error"}
          <div class="err"><Alert variant="error">{error}</Alert></div>
        {/if}
      </div>

      <div class="foot">
        <button
          class="save"
          id="save-instantiation-btn"
          disabled={!ready || ingredients.length === 0 || status === "loading"}
          onclick={handleSave}
        >
          {#if status === "loading"}
            Saving…
          {:else if edit}
            Save changes
          {:else}
            Log {round2(perServing.calories)} kcal
          {/if}
        </button>
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 1600;
    display: flex;
    flex-direction: column;
    background: #fff;
    animation: up 0.24s cubic-bezier(0.16, 1, 0.3, 1);
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
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    font-weight: 700;
  }
  .hbtn.x {
    cursor: pointer;
    font-size: var(--step-0);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-s);
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
  .foot {
    border-top: 2px solid #000;
    padding: var(--space-s);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
    background: #fafafa;
  }
  .save {
    width: 100%;
    background: #ccff00;
    color: #000;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-1);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 60px;
  }
  .save:disabled {
    background: #e4e4e7;
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
  }
</style>
