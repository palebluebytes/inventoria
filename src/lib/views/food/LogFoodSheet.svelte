<script lang="ts">
  import { dbClient } from "../../db/db.client";
  import {
    mapPayloadToFoodResult,
    isCatalogueFood,
    type FoodResult,
  } from "../../food/food-search";
  import { ingestEntity } from "../../ingestion/ingest";
  import {
    logFoodConsumption,
    getLocalFoodTwin,
    saveCustomFood,
    saveLabelFood,
    saveManualFood,
    retractConsumptionEvent,
    recipeTwinsStore,
    consumptionStore,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import { parseLoggedQuantity } from "../../food/recipe-ingredient";
  import {
    roundFoodDisplay,
    scaleNutrition,
    type NutritionInfo,
  } from "../../food/nutrition";
  import { nutritionDisplayDecimals } from "../../stores/settings.store";
  import { parseDatomValue } from "../../db/datom-fold";
  import type {
    FoodChoice,
    ChooseOutcome,
    StagerSeed,
    PrimaryLabelContext,
  } from "../../food/food-staging";

  import BottomSheet from "../../ui/BottomSheet.svelte";
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

  // Recently logged foods for one-tap re-logging, shown in the stager's Search
  // tab while its query box is empty. Distinct twins, newest first. Gram-basis
  // logs qualify; whole-serving logs qualify only as a reusable `menu` manual
  // entry (ADR-0035 §6) — the catalogue rule lives in `isCatalogueFood`, applied
  // once the twin is fetched. The candidate list is gathered wider than the final
  // dozen, since the filter can drop serving foods (quick/plate one-offs, label
  // captures) that re-open via the edit path, not Recent.
  const RECENT_LIMIT = 12;
  const RECENT_CANDIDATES = 40;
  let recentCandidates = $derived.by(() => {
    const seen = new Set<string>();
    const out: { target: string; unit: string }[] = [];
    for (const e of [...$consumptionStore].sort((a, b) => b.time - a.time)) {
      if (!e.target || seen.has(e.target)) continue;
      seen.add(e.target);
      out.push({
        target: e.target,
        unit: parseLoggedQuantity(e.quantity).unit,
      });
      if (out.length >= RECENT_CANDIDATES) break;
    }
    return out;
  });

  // Resolve those candidates to the FoodResult shape the stager stages, reusing
  // the gram edit-path mapping, and keep only catalogue foods (the twin's
  // `food/manual_entry.kind` decides serving foods). Twins are cached across store
  // ticks so a new log doesn't refetch the whole list.
  let recent = $state<FoodResult[]>([]);
  const twinCache = new Map<string, FoodResult>();
  $effect(() => {
    const candidates = recentCandidates;
    let cancelled = false;
    void (async () => {
      const out: FoodResult[] = [];
      for (const c of candidates) {
        if (out.length >= RECENT_LIMIT) break;
        let fr = twinCache.get(c.target);
        if (!fr) {
          const twin = await getLocalFoodTwin(c.target);
          if (!twin) continue;
          fr = mapPayloadToFoodResult(twin);
          twinCache.set(c.target, fr);
        }
        if (!isCatalogueFood(fr.payload.attributes, c.unit)) continue;
        out.push(fr);
      }
      if (!cancelled) recent = out;
    })();
    return () => {
      cancelled = true;
    };
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
        // Freeze the food's FULL panel scaled to the amount, not just the four
        // macros (ADR-0030 / #28). The headline stays exactly the macros the
        // dashboard already reads (scaleNutrition rounds identically); the extra
        // nutrients ride along in event/metrics for the day breakdown.
        const panel = f.payload.attributes["nutrition/info"] as
          | NutritionInfo
          | undefined;
        const breakdown = scaleNutrition(panel, factor);
        const newId = await logFoodConsumption(
          f.entity,
          `${choice.grams}g`,
          meal_type,
          breakdown.calories,
          breakdown.protein,
          breakdown.fat,
          breakdown.carbs,
          selectedDate,
          undefined,
          breakdown
        );
        if (edit) await retractConsumptionEvent(edit.id, newId);
      } else {
        // Three custom writer paths, chosen by what the choice carries:
        //   • a `manualEntry` envelope → saveManualFood (ADR-0035): a calories-only
        //     `food:custom_` twin; the event freezes calories and OMITS macros.
        //   • a full `nutrition` panel + `labelCapture` → saveLabelFood (ADR-0034
        //     §6): the key follows the barcode (a `gtin:` seed enriches in place).
        //   • otherwise the legacy four-macro fast path → saveCustomFood.
        let twinId: string;
        if (choice.manualEntry) {
          twinId = await saveManualFood({
            name: choice.name,
            calories: choice.calories,
            brand: choice.brand,
            ingredients: choice.ingredients,
            photo: choice.photo_base64 ?? undefined,
            manualEntry: choice.manualEntry,
          });
        } else if (choice.nutrition && choice.labelCapture) {
          // Found-but-poor door (ADR-0034 §6/§7): ingest the OFF record FIRST so
          // its `twin/raw_provenance` lands in the ledger, then let saveLabelFood
          // append the correction over the same `gtin:` entity. Append-only +
          // latest-wins means the corrected name/panel supersede the poor OFF
          // values on the next read while OFF's provenance survives beside the new
          // `food/label_capture` — a genuinely dual-origin, "edited from label"
          // twin. The other doors carry no offPayload, so this is skipped.
          if (choice.offPayload) {
            await dbClient.append(ingestEntity(choice.offPayload));
          }
          twinId = await saveLabelFood({
            name: choice.name,
            brand: choice.brand,
            nutrition: choice.nutrition as NutritionInfo,
            portions: choice.portions,
            labelPhotos:
              choice.labelPhotos ??
              (choice.photo_base64 ? [choice.photo_base64] : []),
            labelCapture: choice.labelCapture,
            entityId: choice.barcode ? `gtin:${choice.barcode}` : undefined,
          });
        } else {
          twinId = await saveCustomFood(
            choice.name,
            choice.calories,
            choice.protein,
            choice.fat,
            choice.carbs,
            choice.photo_base64 || undefined
          );
        }
        // A manual-entry intent freezes calories ONLY — its macros are omitted so
        // the daily macro meters never move for it (absent ≠ 0, ADR-0035 §7). The
        // label / legacy paths freeze the four macros as before.
        const macrosOnly = !choice.manualEntry;
        const newId = await logFoodConsumption(
          twinId,
          "1 serving",
          meal_type,
          choice.calories,
          macrosOnly ? choice.protein : undefined,
          macrosOnly ? choice.fat : undefined,
          macrosOnly ? choice.carbs : undefined,
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
        : `Log ${roundFoodDisplay(ctx.staged.calories * ctx.factor, $nutritionDisplayDecimals)} kcal`;
    if (ctx.method === "custom") {
      if (ctx.toReview > 0) return "Review & save";
      return edit ? "Save changes" : "Save & Log";
    }
    if (ctx.method === "scan") return "Look up";
    return "Log";
  }
</script>

<BottomSheet
  isOpen
  title={edit ? `Edit ${meal_type}` : meal_type}
  flushBody
  {onClose}
  onBack={staged && !edit ? () => (staged = null) : undefined}
  backLabel="Change food"
>
  <FoodStager
    bind:staged
    {seed}
    allowPhoto
    manualIntents
    mealName={meal_type}
    lockMethods={!!edit}
    recent={edit ? [] : recent}
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
            No saved recipes yet. Create one above, or build one by selecting
            logged foods on the dashboard.
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
</BottomSheet>

<style>
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
