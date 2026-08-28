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
    changeLoggedFoodAmount,
    retractConsumptionEvent,
    seedRowsFromTemplate,
    recipeTwinsStore,
    consumptionStore,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import {
    parseLoggedQuantity,
    quantityLabel,
    toReferenceIngredient,
    panelFromIngredients,
  } from "../../food/recipe-ingredient";
  import {
    recentCandidatesForMeal,
    emptyMealDefaultHint,
  } from "../../food/recent-foods";
  import type { MealType } from "../../food/meal-type";
  import { wayInTitle, type WayIn } from "../../food/ways-in";
  import {
    basisUnit,
    isMeasuredUnit,
    parseBasisQuantity,
    scaleNutrition,
    roundFoodDisplay,
    type NutritionInfo,
    type NutritionBreakdown,
  } from "../../food/nutrition";
  import {
    deriveRecipeNutrition,
    sanitizeYield,
  } from "../../food/recipe-nutrition";
  import { calorieDisplayDecimals } from "../../stores/settings.store";
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
  import RecipeList from "./RecipeList.svelte";

  // A single sheet for logging food into one meal. Opens directly on "+ Add"
  // (no chooser); the shared FoodStager (issue #16) owns the Search / Scan /
  // Custom staging flow, and this sheet adds the log-specific shell: a chosen
  // food is logged as a Consumption Event (or an edited one retracted and
  // replaced), and the Recipe browser instantiates / defines / edits saved
  // Recipe Twins.
  //
  // Both the meal AND the way in are fixed by the header control that opened it
  // (ADR-0059): this sheet carries no method dock, and its title is the same
  // words that control's accessible name used, so a single-purpose sheet says
  // what it is for. `wayIn` is the way in; edit mode has none, and titles
  // itself by the correction it is making instead.
  let {
    dbReady,
    meal_type,
    selectedDate,
    onClose,
    edit = null,
    editLabel = false,
    initialMethod = undefined,
    wayIn = undefined,
  }: {
    dbReady: boolean;
    meal_type: MealType;
    selectedDate: Date;
    onClose: () => void;
    /**
     * Method to open on, for a host that has one but no `wayIn` (the
     * Recipe browser reopening itself). A header-opened sheet passes only
     * `wayIn` — four of the five ways in ARE stager methods and share their
     * id, so the method is derived rather than passed twice.
     */
    initialMethod?: string;
    /**
     * Which header control opened this sheet (ADR-0059 §1). It fixes the method
     * and titles the sheet. The title drops the meal the control named: the
     * meal is settled by the tap that opened this, so repeating it spends the
     * header's one line on what the user just did. Absent in edit mode, which
     * is not a way into a meal but a correction of something already in one —
     * it titles itself by the correction instead.
     */
    wayIn?: WayIn;
    /**
     * When set, the sheet edits an existing logged event instead of adding a new
     * one: it opens pre-staged on that event's food (at the amount it was logged
     * at, in its panel's own unit) or pre-filled on the custom form
     * (per-serving entry). Saving logs the new event and
     * retracts `edit` (append-only), so history stays immutable (ADR-0008).
     */
    edit?: ConsumptionEvent | null;
    /**
     * Open that edit straight on the label form rather than on the food's card.
     * Set by "Edit" in the source explainer, where the user has already said
     * which screen they want — landing them on the card first would make them
     * ask for the same thing twice.
     */
    editLabel?: boolean;
  } = $props();

  // Four of the five ways into a meal are stager methods under the same id, so
  // the way in fixes the method; `past` never reaches this sheet (it has its own).
  let openOn = $derived(initialMethod ?? wayIn);

  // The meal's default content (ADR-0057), shown in the stager's Search tab
  // while its query box is empty: the foods logged at THIS meal, newest first.
  // Scoped because this sheet is titled with its meal and a default is judged on
  // being right rather than complete — every other food is one keystroke away in
  // the search box beside it.
  //
  // Twelve is a cap, not a target: a meal with three foods behind it correctly
  // offers three. The walk itself is uncapped and lives in `recent-foods.ts`;
  // the catalogue rule (`isCatalogueFood`, ADR-0035 §6) still applies here,
  // where the twin it needs is in hand.
  const RECENT_LIMIT = 12;
  let recentCandidates = $derived(
    recentCandidatesForMeal($consumptionStore, meal_type)
  );

  // Resolve those candidates to the FoodResult shape the stager stages, reusing
  // the gram edit-path mapping, and keep only catalogue foods (the twin's
  // `food/manual_entry.kind` decides serving foods). Twins are cached across store
  // ticks so a new log doesn't refetch the whole list.
  let recent = $state<FoodResult[]>([]);
  // Whether the resolution above has finished for the current candidates. The
  // empty-meal line waits on it: resolving twins is async, so an unguarded
  // `recent.length === 0` reads as "this meal is empty" for the moment before
  // the first twin lands, and the line would flash on a meal that has plenty.
  let recentResolved = $state(false);
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
      if (!cancelled) {
        recent = out;
        recentResolved = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  // Edit mode hides Recent entirely (it locks onto one food's amount), so it
  // gets no line either — an empty list there is the point, not a shortfall.
  let showsMealDefault = $derived(!edit);

  // Which emptiness this is, since the two make different claims. Candidates are
  // what was LOGGED here; `recent` is what survived the catalogue rule and the
  // twin lookup. A meal logged only as quick-estimate one-offs has plenty of
  // history and nothing to offer, and must not be told "nothing logged yet".
  let recentEmptyHint = $derived(
    showsMealDefault && recentResolved && recent.length === 0
      ? emptyMealDefaultHint(
          meal_type,
          recentCandidates.length > 0 ? "nothing-reusable" : "none"
        )
      : ""
  );

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
  // Recent), while any other custom/label entry re-opens the label form seeded
  // from THE TWIN, exactly as the staged card's pencil does. Every case resolves
  // the twin asynchronously, so the seed lands once that fetch completes.
  let seed = $state<StagerSeed | null>(null);
  let editLoaded = false;

  // The last-resort seed for a per-serving entry whose twin can no longer be
  // read: the event's own frozen four macros, all that survives without it.
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
    if (editLabel && e.target) {
      // Straight to the label form on this food's own twin, whatever unit it was
      // logged in — the amount is preserved on save (see handleChoose).
      void getLocalFoodTwin(e.target).then((twin) => {
        const attrs = twin?.attributes as Record<string, unknown> | undefined;
        seed = attrs
          ? { kind: "edit_twin", entity: e.target!, attributes: attrs }
          : customSeedFromEvent(e);
      });
      return;
    }
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
        } else if (attrs) {
          // Seed the label form from the twin itself: its brand, categories,
          // ingredients, full panel, basis, portions and photos all survive the
          // edit, and pinning its entity means the re-save enriches this twin
          // rather than minting a stripped-down duplicate beside it.
          seed = { kind: "edit_twin", entity: e.target!, attributes: attrs };
        } else {
          // No twin left to read (a legacy or deleted target) — fall back to the
          // event's own frozen macros, which is all there is.
          seed = customSeedFromEvent(e);
        }
      });
    } else if (e.target) {
      void getLocalFoodTwin(e.target).then((twin) => {
        if (!twin) return;
        seed = {
          kind: "food",
          food: mapPayloadToFoodResult(twin),
          amount,
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
        await dbClient.append(ingestEntity(f.payload));
        // Freeze the food's FULL panel scaled to the amount, not just the four
        // macros (ADR-0030 / #28). The headline stays exactly the macros the
        // dashboard already reads (scaleNutrition rounds identically); the extra
        // nutrients ride along in event/metrics for the day breakdown.
        const panel = f.payload.attributes["nutrition/info"] as
          | NutritionInfo
          | undefined;
        // Scale by the panel's OWN basis, like every other scaler (#148). This
        // divided by a hardcoded 100 while the amount screen the user just read
        // divided by the basis, so the two disagreed on any panel not measured
        // per 100 — and this is the one that freezes into `event/metrics`, which
        // history never recomputes.
        const factor = choice.amount / parseBasisQuantity(panel?.serving_size);
        const breakdown = scaleNutrition(panel, factor);
        const newId = await logFoodConsumption(
          f.entity,
          // One spelling for every logged quantity (ADR-0060 §4) — this and
          // changeLoggedFoodAmount agreed with `quantityLabel` only by
          // coincidence, and a second spelling is how the two drift.
          //
          // The unit is the panel's own (§1): the same `serving_size` the
          // divisor above is read from, so a drink the user entered on a
          // millilitre screen is recorded as "330ml" rather than as a weight it
          // was never measured in. Forward-only, and a receipt already in the
          // ledger keeps the string it was written with (§9).
          quantityLabel(choice.amount, basisUnit(panel?.serving_size)),
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
        // Correcting a food's panel must not silently change how much of it was
        // eaten. An entry logged against a panel basis is therefore re-logged at
        // the SAME amount with its macros re-derived from the corrected twin —
        // the amount editor's own path — instead of collapsing to the
        // "1 serving" the custom form otherwise writes. (`target` follows the
        // save: an enrich returns the same twin, a mint a new one.)
        const logged = edit ? parseLoggedQuantity(edit.quantity) : null;
        if (edit && logged != null && isMeasuredUnit(logged.unit)) {
          await changeLoggedFoodAmount(
            { ...edit, target: twinId },
            logged.amount
          );
        } else {
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
  title={edit ? `Edit ${meal_type}` : wayIn ? wayInTitle(wayIn) : meal_type}
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
    initialMethod={openOn}
    allowPhoto
    manualIntents
    mealName={meal_type}
    lockMethods={!!edit}
    methodDock={false}
    recent={showsMealDefault ? recent : []}
    {recentEmptyHint}
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
        {:else}
          <!-- Picking here INSTANTIATES: this browser is inside a meal, so the
               recipe it opens is one being logged. The food screen's library
               hands the same list a different verb. -->
          <RecipeList
            onPick={pickRecipe}
            emptyHint="No saved recipes yet. Create one with the button below, or build one by selecting logged foods on the dashboard."
          />
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
