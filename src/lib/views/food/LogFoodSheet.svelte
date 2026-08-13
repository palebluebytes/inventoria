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
    seedRowsFromTemplate,
    recipeTwinsStore,
    consumptionStore,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import {
    parseLoggedQuantity,
    toReferenceIngredient,
    panelFromIngredients,
  } from "../../food/recipe-ingredient";
  import {
    scaleNutrition,
    roundFoodDisplay,
    type NutritionInfo,
    type NutritionBreakdown,
  } from "../../food/nutrition";
  import {
    deriveRecipeNutrition,
    sanitizeYield,
  } from "../../food/recipe-nutrition";
  import { nutritionDisplayDecimals } from "../../stores/settings.store";
  import type { ManualEntry } from "../../food/provenance";
  import { parseDatomValue } from "../../db/datom-fold";
  import type {
    FoodChoice,
    ChooseOutcome,
    StagerSeed,
    PrimaryLabelContext,
  } from "../../food/food-staging";

  import BottomSheet from "../../ui/BottomSheet.svelte";
  import FoodStager from "./FoodStager.svelte";
  import CommitButton from "./CommitButton.svelte";
  import RecipeInstantiator from "./RecipeInstantiator.svelte";
  import RecipeBuilder from "./RecipeBuilder.svelte";

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
    initialMethod = undefined,
  }: {
    dbReady: boolean;
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
    /** Tab to open on (e.g. "recipe"). Defaults to Search. */
    initialMethod?: string;
    /**
     * When set, the sheet edits an existing logged event instead of adding a new
     * one: it opens pre-staged on that event's food (gram amount) or pre-filled
     * on the custom form (per-serving entry). Saving logs the new event and
     * retracts `edit` (append-only), so history stays immutable (ADR-0008).
     */
    edit?: ConsumptionEvent | null;
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

  // Each recipe's per-serving panel, resolved lazily so a recipe row can carry
  // the same two-line card as a Recent food (name + a muted macros line). A
  // recipe twin stores only bare ingredient refs (ADR-0021), so the panel is
  // derived — fetch the twin, resolve its ingredients, run the shared
  // `deriveRecipeNutrition` — exactly as the instantiation editor does. Cached by
  // entity (the `.has` guard) so re-opening the tab doesn't refetch; the name
  // shows immediately and its macros line fills in once the derivation lands.
  let recipeNutrition = $state<Map<string, NutritionBreakdown | null>>(
    new Map()
  );
  $effect(() => {
    const list = recipes;
    let cancelled = false;
    void (async () => {
      const next = new Map(recipeNutrition);
      let changed = false;
      for (const r of list) {
        if (next.has(r.entity)) continue;
        let panel: NutritionBreakdown | null = null;
        const twin = await getLocalFoodTwin(r.entity);
        if (twin) {
          const rows = await seedRowsFromTemplate(twin.attributes);
          const refs = rows.map(toReferenceIngredient);
          const resolve = (ref: string) => panelFromIngredients(rows, ref);
          const y = sanitizeYield(
            (twin.attributes["recipe/yield"] as number) ?? 1
          );
          panel = deriveRecipeNutrition(refs, y, resolve);
        }
        if (cancelled) return;
        next.set(r.entity, panel);
        changed = true;
      }
      if (!cancelled && changed) recipeNutrition = next;
    })();
    return () => {
      cancelled = true;
    };
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

  // The Recipe tab's sub-view, all rendered INSIDE this sheet (no separate sheet):
  // the browser list, an instantiation editor for a picked recipe, or the builder
  // for a new / edited template. Picking, "＋ New recipe" and "Edit" just switch
  // this; the header stays the meal name and the shared dock stays put — exactly
  // like Search / Custom. The dashboard-originated Consolidate / Correct flows
  // still open the standalone RecipeModal / InstantiationSheet (no log sheet open).
  type RecipeTwin = { entity: string; attributes: Record<string, any> };
  type RecipeView =
    | { kind: "list" }
    | { kind: "instantiate"; template: RecipeTwin }
    | { kind: "build"; mode: "define" | "edit"; template: RecipeTwin | null };
  let recipeView = $state<RecipeView>({ kind: "list" });
  // The embedded recipe editor hands its commit to the shared dock (the same
  // ManualEntryFlow contract): a save handler, its readiness, and its label.
  let recipeRequestSave = $state<(() => void) | undefined>(undefined);
  let recipeSaveReady = $state(false);
  let recipeSaveLabel = $state("Log");

  async function pickRecipe(entity: string) {
    const twin = await getLocalFoodTwin(entity);
    if (twin) recipeView = { kind: "instantiate", template: twin };
  }
  async function editRecipe(entity: string) {
    const twin = await getLocalFoodTwin(entity);
    if (twin) recipeView = { kind: "build", mode: "edit", template: twin };
  }
  function newRecipe() {
    recipeView = { kind: "build", mode: "define", template: null };
  }
  function backToRecipeList() {
    recipeView = { kind: "list" };
  }

  // The stager's unified back capability (staged food, capture form, or manual
  // mini-form), driving the shared header back button so every internal step of
  // the flow gets the same centred-title-plus-back header.
  let canGoBack = $state(false);
  let goBack = $state<() => void>(() => {});

  // Editing: seed the stager once from the event being edited. A gram-logged
  // food re-stages from its twin (so the amount editor scales the same way it did
  // originally). A whole-serving entry re-opens pre-filled — but which surface
  // depends on the twin: a manual-entry (ADR-0035) re-opens its intent's OWN
  // mini-form (so the re-saved twin stays a manual entry and a menu dish stays in
  // Recent), while any other custom/label entry re-opens the label form from the
  // event's frozen macros. The gram + manual cases resolve the twin asynchronously,
  // so the seed lands once that fetch completes.
  let seed = $state<StagerSeed | null>(null);
  let editLoaded = false;

  // The label-form fallback seed for a per-serving entry with no manual-entry
  // provenance (a legacy custom, or a label capture) — the pre-ADR-0035 path.
  function customSeedFromEvent(e: ConsumptionEvent): StagerSeed {
    return {
      kind: "custom",
      name: e.foodName ?? "",
      calories: e.calories != null ? String(e.calories) : "",
      protein: e.protein != null ? String(e.protein) : "",
      fat: e.fat != null ? String(e.fat) : "",
      carbs: e.carbs != null ? String(e.carbs) : "",
      photo_base64: e.photoBase64 ?? null,
    };
  }

  $effect(() => {
    if (!edit || editLoaded) return;
    editLoaded = true;
    const e = edit;
    const { amount, unit } = parseLoggedQuantity(e.quantity);
    if (unit === "serving") {
      if (!e.target) {
        seed = customSeedFromEvent(e);
        return;
      }
      void getLocalFoodTwin(e.target).then((twin) => {
        const attrs = twin?.attributes as Record<string, unknown> | undefined;
        const manualEntry = attrs?.["food/manual_entry"] as
          | ManualEntry
          | undefined;
        if (attrs && manualEntry) {
          // Re-open the manual entry's OWN mini-form, prefilled from the twin —
          // calories from its panel (authoritative), Place + ingredients + photo
          // from the twin, so the re-save preserves its `kind` (ADR-0035).
          const info = attrs["nutrition/info"] as NutritionInfo | undefined;
          seed = {
            kind: "manual",
            manualKind: manualEntry.kind,
            name: (attrs["food/name"] as string) ?? e.foodName ?? "",
            calories:
              info?.calories != null
                ? String(info.calories)
                : e.calories != null
                  ? String(e.calories)
                  : "",
            place: (attrs["twin/brand"] as string) ?? "",
            ingredients: (attrs["food/ingredients"] as string) ?? "",
            photo_base64:
              (attrs["food/photo_base64"] as string) ?? e.photoBase64 ?? null,
          };
        } else {
          seed = customSeedFromEvent(e);
        }
      });
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
            category: choice.category,
            // Canonical OFF ingredients text (ADR-0043 §5); saveLabelFood
            // suppresses it when blank so no empty datom is appended.
            ingredientsText: choice.ingredientsText,
            nutrition: choice.nutrition as NutritionInfo,
            portions: choice.portions,
            labelPhotos:
              choice.labelPhotos ??
              (choice.photo_base64 ? [choice.photo_base64] : []),
            labelCapture: choice.labelCapture,
            // An edit re-opened from the origin badge (§7) carries the twin's own
            // id so the correction enriches THAT entity in place (custom or gtin);
            // a fresh capture keys off the barcode as before (gtin enrich vs mint).
            entityId:
              choice.editEntityId ??
              (choice.barcode ? `gtin:${choice.barcode}` : undefined),
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

  // One label for every terminal commit in this sheet: "Log" (ADR-0035 §UI — the
  // food-addition flows all end in the same pinned "Log" button). The lone
  // exception is scan *before* a product is staged, where the button performs a
  // barcode lookup, not a log — calling that "Log" would misname the action.
  function primaryLabel(ctx: PrimaryLabelContext): string {
    if (!ctx.staged && ctx.method === "scan") return "Look up";
    return "Log";
  }
</script>

<BottomSheet
  isOpen
  title={edit ? `Edit ${meal_type}` : meal_type}
  flushBody
  {onClose}
  onBack={canGoBack ? goBack : undefined}
  backLabel="Back"
>
  <FoodStager
    bind:staged
    bind:canGoBack
    bind:goBack
    {seed}
    {initialMethod}
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
    extraTabs={[{ id: "recipe", icon: "🍲", label: "Recipe" }]}
    tabBack={recipeView.kind !== "list" ? backToRecipeList : undefined}
    onChoose={handleChoose}
    {primaryLabel}
  >
    {#snippet tabContent(tab)}
      {#if tab === "recipe"}
        {#if recipeView.kind === "instantiate"}
          {@const template = recipeView.template}
          <RecipeInstantiator
            {meal_type}
            {selectedDate}
            {template}
            onEdit={() => editRecipe(template.entity)}
            onCommitted={onClose}
            bind:requestSave={recipeRequestSave}
            bind:saveReady={recipeSaveReady}
          />
        {:else if recipeView.kind === "build"}
          <RecipeBuilder
            {meal_type}
            {selectedDate}
            mode={recipeView.mode}
            template={recipeView.template}
            onCommitted={onClose}
            bind:requestSave={recipeRequestSave}
            bind:saveReady={recipeSaveReady}
            bind:saveLabel={recipeSaveLabel}
          />
        {:else if recipes.length === 0}
          <p class="hint">
            No saved recipes yet. Create one with the button below, or build one
            by selecting logged foods on the dashboard.
          </p>
        {:else}
          <p class="recipes-head">Your recipes</p>
          <ul class="recipe-list">
            {#each recipes as r (r.entity)}
              {@const panel = recipeNutrition.get(r.entity)}
              <li>
                <!-- The recipe row mirrors the stager's Recent/Results card
                     (`.result-item`): flat thin-edge tile, two-line details (name
                     + a muted per-serving macros line) and a trailing arrow.
                     Picking opens the recipe; Edit lives inside the opened recipe,
                     not here. `.recipe-pick` stays the e2e hook. -->
                <button
                  type="button"
                  class="recipe-pick"
                  onclick={() => pickRecipe(r.entity)}
                >
                  <span class="recipe-details">
                    <span class="recipe-pick-name">{r.name}</span>
                    {#if panel}
                      <span class="recipe-pick-macros">
                        Per serving: {roundFoodDisplay(
                          panel.calories,
                          $nutritionDisplayDecimals
                        )} kcal | P: {roundFoodDisplay(
                          panel.protein,
                          $nutritionDisplayDecimals
                        )}g | F: {roundFoodDisplay(
                          panel.fat,
                          $nutritionDisplayDecimals
                        )}g | C: {roundFoodDisplay(
                          panel.carbs,
                          $nutritionDisplayDecimals
                        )}g
                      </span>
                    {/if}
                  </span>
                  <span class="recipe-pick-go" aria-hidden="true">→</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    {/snippet}

    {#snippet tabDock(tab)}
      {#if tab === "recipe"}
        {#if recipeView.kind === "list"}
          <!-- Top of the Recipe tab: the create action, pinned like the Log
               button on every other tab. -->
          <CommitButton id="define-recipe-btn" onclick={newRecipe}
            >＋ New recipe</CommitButton
          >
        {:else}
          <!-- A recipe editor is open in-place: its commit rides the same dock
               button as every other flow, driven by the editor's bindables. -->
          <CommitButton
            id="log-recipe-btn"
            disabled={!recipeSaveReady}
            onclick={() => recipeRequestSave?.()}
          >
            {recipeView.kind === "build" ? recipeSaveLabel : "Log"}
          </CommitButton>
        {/if}
      {/if}
    {/snippet}
  </FoodStager>
</BottomSheet>

<style>
  /* Recipe browser (the Recipe method tab), rendered into the stager via the
     tabContent snippet — `.hint` is shared with the stager's copy. */
  .hint {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    margin-top: var(--space-s);
  }
  /* Matches the stager's "Recent" / "Results" heading (`.results-head`) so the
     recipe browser reads as the same surface as the search results. */
  .recipes-head {
    display: block;
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }
  .recipe-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-2xs);
  }
  /* The row mirrors the stager's Recent/Results card (`.result-item` in
     FoodStager): a flat thin-edge tile — no Card shadow — so the recipe browser
     reads as the same surface as the search results the user just came from. */
  .recipe-pick {
    width: 100%;
    background: var(--food-surface-bg, var(--paper));
    border: var(--food-surface-border, var(--edge-thin));
    border-radius: var(--food-item-radius, var(--radius));
    padding: var(--space-xs) var(--space-s);
    /* `.result-item` is a <div> and inherits the page line-height (1.5); this
       row is a <button>, which UA-resets to `line-height: normal` and shrinks
       the two-line card. `font: inherit` restores the inherited metrics so the
       card is the same height as a Recent food card. */
    font: inherit;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    cursor: pointer;
    transition: background 0.2s;
  }
  .recipe-pick:hover {
    background: var(--food-surface-hover, var(--bg-input));
  }
  .recipe-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .recipe-pick-name {
    font-weight: 600;
    font-size: var(--step-n1);
  }
  .recipe-pick-macros {
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin-top: 2px;
  }
  .recipe-pick-go {
    color: var(--text-muted);
    font-size: var(--step-0);
  }
</style>
