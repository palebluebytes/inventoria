<script lang="ts">
  import { dbClient } from "../../db/db.client";
  import {
    mapPayloadToFoodResult,
    type FoodResult,
  } from "../../food/food-search";
  import { ingestEntity } from "../../ingestion/ingest";
  import {
    logFoodConsumption,
    getLocalFoodTwin,
    saveCustomFood,
    retractConsumptionEvent,
    recipeTwinsStore,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import { parseLoggedQuantity } from "../../food/recipe-ingredient";
  import { parseDatomValue } from "../../db/datom-fold";
  import type {
    FoodChoice,
    ChooseOutcome,
    StagerSeed,
    PrimaryLabelContext,
  } from "../../food/food-staging";

  import Modal from "../../ui/Modal.svelte";
  import FoodStager from "./FoodStager.svelte";

  // A single sheet for logging food into one meal. Opens directly on "+ Add"
  // (no chooser); the shared FoodStager (issue #16) owns the Search / Scan /
  // Custom staging flow, and this sheet adds the log-specific shell: the meal is
  // fixed by the "+ Add {meal}" button that opened it, a chosen food is logged
  // as a Consumption Event (or an edited one retracted and replaced), and the
  // Recipe browser tab instantiates / defines / edits saved Recipe Twins.
  let {
    dbReady,
    meal_type,
    selectedDate,
    onClose,
    edit = null,
    onPickRecipe,
    onDefineRecipe,
    onEditRecipe,
  }: {
    dbReady: boolean;
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
    /**
     * When set, the sheet edits an existing logged event instead of adding a new
     * one: it opens pre-staged on that event's food (gram amount) or pre-filled
     * on the custom form (per-serving entry). Saving logs the new event and
     * retracts `edit` (append-only), so history stays immutable (ADR-0008).
     */
    edit?: ConsumptionEvent | null;
    /**
     * Picks a saved Recipe Twin to instantiate into this meal (the Instantiate
     * verb, ADR-0022). Called with the twin's entity id; the parent closes this
     * sheet and opens the instantiation editor. When omitted, the Recipe method
     * is hidden.
     */
    onPickRecipe?: (recipeEntity: string) => void;
    /**
     * Opens the recipe builder to Define a brand-new Recipe Twin from scratch,
     * logging nothing (ADR-0022 #13). The parent closes this sheet and opens the
     * builder in define mode.
     */
    onDefineRecipe?: () => void;
    /**
     * Opens the recipe builder to Edit an existing Recipe Twin's template — its
     * edit re-seeds only future instantiations (#13). Called with the twin's id.
     */
    onEditRecipe?: (recipeEntity: string) => void;
  } = $props();

  // Saved Recipe Twins for the Instantiate browser, deduped by entity (newest
  // first from the store's HLC-desc order).
  let recipes = $derived.by(() => {
    const seen = new Set<string>();
    const out: { entity: string; name: string }[] = [];
    for (const row of $recipeTwinsStore) {
      if (seen.has(row.entity)) continue;
      seen.add(row.entity);
      const name = String(parseDatomValue("recipe/name", row.value));
      out.push({ entity: row.entity, name });
    }
    return out;
  });

  // The staged food, bound from the stager so the header's back button can clear
  // it ("Change food"); hidden in edit mode, which locks onto one food's amount.
  let staged = $state<FoodResult | null>(null);

  // Editing: seed the stager once from the event being edited. A gram-logged
  // food re-stages from its twin (so the amount editor scales the same way it
  // did originally); a per-serving custom entry re-opens the custom form
  // pre-filled from the event's frozen macros. The gram case resolves the twin
  // asynchronously, so the seed lands once that fetch completes.
  let seed = $state<StagerSeed | null>(null);
  let editLoaded = false;
  $effect(() => {
    if (!edit || editLoaded) return;
    editLoaded = true;
    const e = edit;
    const { amount, unit } = parseLoggedQuantity(e.quantity);
    if (unit === "serving") {
      seed = {
        kind: "custom",
        name: e.foodName ?? "",
        calories: e.calories != null ? String(e.calories) : "",
        protein: e.protein != null ? String(e.protein) : "",
        fat: e.fat != null ? String(e.fat) : "",
        carbs: e.carbs != null ? String(e.carbs) : "",
        photo_base64: e.photoBase64 ?? null,
      };
    } else if (e.target) {
      void getLocalFoodTwin(e.target).then((twin) => {
        if (!twin) return;
        seed = {
          kind: "food",
          food: mapPayloadToFoodResult(twin),
          grams: amount,
        };
      });
    }
  });

  // Commit a chosen food into this meal: ingest the twin and append a
  // proportional Consumption Event, or save-and-log a custom entry. Editing
  // retracts the original in the same step (append-only, ADR-0008). Success
  // closes the sheet; a failure keeps it open with the reason.
  async function handleChoose(choice: FoodChoice): Promise<ChooseOutcome> {
    try {
      if (choice.kind === "food") {
        const f = choice.food;
        const factor = choice.grams / 100;
        await dbClient.append(ingestEntity(f.payload));
        const newId = await logFoodConsumption(
          f.entity,
          `${choice.grams}g`,
          meal_type,
          Math.round(f.calories * factor),
          Math.round(f.protein * factor * 10) / 10,
          Math.round(f.fat * factor * 10) / 10,
          Math.round(f.carbs * factor * 10) / 10,
          selectedDate
        );
        if (edit) await retractConsumptionEvent(edit.id, newId);
      } else {
        const twinId = await saveCustomFood(
          choice.name,
          choice.calories,
          choice.protein,
          choice.fat,
          choice.carbs,
          choice.photo_base64 || undefined
        );
        const newId = await logFoodConsumption(
          twinId,
          "1 serving",
          meal_type,
          choice.calories,
          choice.protein,
          choice.fat,
          choice.carbs,
          selectedDate
        );
        if (edit) await retractConsumptionEvent(edit.id, newId);
      }
      onClose();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e.message ?? String(e) };
    }
  }

  function primaryLabel(ctx: PrimaryLabelContext): string {
    if (ctx.staged)
      return edit
        ? "Save changes"
        : `Log ${Math.round(ctx.staged.calories * ctx.factor)} kcal`;
    if (ctx.method === "custom") return edit ? "Save changes" : "Save & Log";
    if (ctx.method === "scan") return "Look up";
    return "Log";
  }
</script>

<Modal {onClose} title={edit ? `Edit ${meal_type}` : `Log ${meal_type}`}>
  {#snippet children({ props, close })}
    <div {...props} class="sheet">
      <div class="grab"></div>
      <header class="head">
        {#if staged && !edit}
          <button
            class="hbtn back"
            onclick={() => (staged = null)}
            aria-label="Change food">‹</button
          >
        {:else}
          <span class="hbtn" aria-hidden="true"></span>
        {/if}
        <h2>{edit ? `Edit ${meal_type}` : meal_type}</h2>
        <button class="hbtn x" onclick={close} aria-label="Close">✕</button>
      </header>

      <FoodStager
        bind:staged
        {seed}
        allowPhoto
        lockMethods={!!edit}
        primaryDisabled={!dbReady}
        ids={{
          search: "food-search-input",
          barcode: "barcode-input",
          primary: "log-food-btn",
          customName: "custom-name",
          customCal: "custom-cal",
          customProt: "custom-prot",
          customFat: "custom-fat",
          customCarb: "custom-carb",
        }}
        extraTabs={onPickRecipe
          ? [{ id: "recipe", icon: "🍲", label: "Recipe" }]
          : []}
        onChoose={handleChoose}
        {primaryLabel}
      >
        {#snippet tabContent(tab)}
          {#if tab === "recipe"}
            <button
              type="button"
              class="recipe-new"
              id="define-recipe-btn"
              onclick={() => onDefineRecipe?.()}>＋ New recipe</button
            >
            {#if recipes.length === 0}
              <p class="hint">
                No saved recipes yet. Create one above, or build one by
                selecting logged foods on the dashboard.
              </p>
            {:else}
              <p class="fl">Your recipes</p>
              <ul class="recipe-list">
                {#each recipes as r (r.entity)}
                  <li>
                    <button
                      type="button"
                      class="recipe-pick"
                      onclick={() => onPickRecipe?.(r.entity)}
                    >
                      <span class="recipe-pick-name">{r.name}</span>
                      <span class="recipe-pick-go" aria-hidden="true">›</span>
                    </button>
                    <button
                      type="button"
                      class="recipe-edit"
                      onclick={() => onEditRecipe?.(r.entity)}
                      aria-label="Edit {r.name}">Edit</button
                    >
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        {/snippet}
      </FoodStager>
    </div>
  {/snippet}
</Modal>

<style>
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    height: 92svh;
    background: #fff;
    border-top: 3px solid #000;
    box-shadow: 0 -8px 0 #000;
    animation: up 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes up {
    from {
      transform: translateY(100%);
    }
  }
  .grab {
    width: 44px;
    height: 5px;
    background: #000;
    margin: 0.5rem auto;
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
    letter-spacing: 0.02em;
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
    line-height: 1;
  }
  .hbtn.back,
  .hbtn.x {
    cursor: pointer;
  }
  .hbtn.x {
    font-size: var(--step-0);
  }
  .hbtn.back {
    font-size: var(--step-2);
  }
  .hbtn.back:active {
    transform: scale(0.9);
  }

  /* Recipe browser (the Recipe method tab), rendered into the stager via the
     tabContent snippet — `.hint` / `.fl` are shared with the stager's copy. */
  .hint {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    margin-top: var(--space-s);
  }
  .fl {
    display: block;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    margin: var(--space-m) 0 var(--space-3xs);
  }
  .recipe-new {
    width: 100%;
    margin-bottom: var(--space-s);
    border: 2px dashed #000;
    background: #fff;
    padding: var(--space-s);
    font-family: inherit;
    font-weight: 800;
    text-transform: uppercase;
    font-size: var(--step-n1);
    cursor: pointer;
    min-height: 52px;
  }
  .recipe-new:hover {
    background: #f4f4f5;
  }
  .recipe-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
  }
  .recipe-list li {
    display: flex;
    gap: var(--space-2xs);
  }
  .recipe-pick {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    background: #fff;
    border: 2px solid #000;
    padding: var(--space-s);
    font-family: inherit;
    cursor: pointer;
    text-align: left;
    min-height: 52px;
    min-width: 0;
  }
  .recipe-pick:hover {
    background: #f4f4f5;
  }
  .recipe-pick-name {
    font-weight: 700;
    font-size: var(--step-n1);
  }
  .recipe-pick-go {
    font-size: var(--step-1);
    font-weight: 800;
  }
  .recipe-edit {
    flex-shrink: 0;
    background: #fff;
    border: 2px solid #000;
    padding: 0 var(--space-s);
    font-family: inherit;
    font-weight: 700;
    text-transform: uppercase;
    font-size: var(--step-n2);
    cursor: pointer;
  }
  .recipe-edit:hover {
    background: #000;
    color: #fff;
  }
</style>
