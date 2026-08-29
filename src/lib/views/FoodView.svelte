<script lang="ts">
  import { createQueryStore } from "../stores/datoms.store";
  import { HLC_ORDER_DESC } from "../db/hlc";
  import {
    consumptionStore,
    consumptionForDay,
    getLocalFoodTwin,
    retractConsumptionEvent,
    changeLoggedFoodAmount,
    copyPastMeal,
    type ConsumptionEvent,
  } from "../stores/calorie.store";
  import { scaleAmount, type ScaleOp } from "../food/scale-amount";
  import { asMealType, type MealType } from "../food/meal-type";
  import {
    WAYS_IN,
    wayInTitle,
    wayInLegend,
    type WayIn,
  } from "../food/ways-in";
  import {
    pastMealsFor,
    partitionCopyable,
    copyTally,
    dayKeyOf,
    type PastMeal,
    type CopyNote,
  } from "../food/past-meals";
  import {
    customIngredient,
    parseLoggedQuantity,
    type RecipeIngredient,
  } from "../food/recipe-ingredient";
  import {
    dedupePortions,
    isMeasuredUnit,
    isPer100Basis,
    parseBasisQuantity,
    portionMeasure,
    servingSizeGrams,
    servingSizePortion,
    type NutritionInfo,
    type Portion,
  } from "../food/nutrition";
  import type { NovaVerdict } from "../food/nova-verdict";
  import type { DietaryVerdict } from "../food/off-signals";
  import type { EntityPayload } from "../ingestion/ingest";
  import type { FoodSourceKind } from "../food/food-source";
  import DailyDashboard from "./food/DailyDashboard.svelte";
  import WayInIcon from "./food/WayInIcon.svelte";
  import PastMealSheet from "./food/PastMealSheet.svelte";
  import LogFoodSheet from "./food/LogFoodSheet.svelte";
  import RecipeModal from "./food/RecipeModal.svelte";
  import RecipeLibrarySheet from "./food/RecipeLibrarySheet.svelte";
  import InstantiationSheet from "./food/InstantiationSheet.svelte";
  import IngredientAmountSheet from "./food/IngredientAmountSheet.svelte";
  import NovaExplainerSheet from "./food/NovaExplainerSheet.svelte";
  import SourceExplainerSheet from "./food/SourceExplainerSheet.svelte";
  import DietaryExplainerSheet from "./food/DietaryExplainerSheet.svelte";
  import FoodSettingsSheet from "./food/FoodSettingsSheet.svelte";
  // PROTOTYPE (#201) — the send/receive variants. `?variant=A|B|C` on the food
  // screen, dev only; null in the shipped app, where every block below that
  // reads it renders nothing. The state module is small enough to import
  // statically; the surfaces are not (they pull the QR writer), so the host is
  // dynamically imported. Delete all of it when #201 folds.
  import { proto, readVariant } from "../send-proto/proto-state.svelte";
  import WayOutIcon from "../send-proto/WayOutIcon.svelte";
  import { formatDate } from "../send-proto/proto-date";
  import Button from "../ui/Button.svelte";

  const protoVariant = readVariant();
  import ScaleControl from "./food/ScaleControl.svelte";

  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // The food screen's own settings sheet (top-right gear) — food-specific
  // settings (USDA/OFF credentials, contribution consent, nutrition targets)
  // that moved off the global Settings tab so they live with the food.
  let settingsOpen = $state(false);

  // The standing blurb under the title is orientation for a first visit and
  // dead weight on every one after, and on a phone it costs three lines above
  // the fold. It folds away behind the ⓘ beside the gear, closed by default:
  // the screen is called FOOD and the meals are right there, so the sentence
  // earns its space only when asked for. Component state, like the dashboard's
  // own meter fold — a "not now", not a setting.
  let aboutOpen = $state(false);
  // localhost/PWA is always a secure context, so randomUUID exists.
  const aboutId = `food-about-${crypto.randomUUID()}`;

  let selectedDate = $state(new Date());
  // Whether the strip is parked on the current day. The snap-back control used
  // to be a button on its own row under the strip, appearing only when off
  // today, so every trip away from the current day shoved the whole page down a
  // row and every trip back pulled it up again. It is an icon in the header row
  // instead: that row is right-aligned, so a control that comes and goes grows
  // into the empty space beside the title and moves nothing else.
  let onToday = $derived(dayKeyOf(selectedDate) === dayKeyOf(new Date()));
  // The meal whose log sheet is open (null = closed). Opening is direct — no
  // intermediate chooser.
  let sheet_meal_type = $state<MealType | null>(null);
  // Which header control opened the log sheet (ADR-0059 §1). It fixes the
  // stager's method and titles the sheet; null while editing, which is not a
  // way into a meal.
  let way_in = $state<WayIn | null>(null);
  // The meal whose past-meal picker is open (ADR-0058). Its own sheet, not a
  // stager method: every method there picks a food, this picks a meal.
  let past_meal_type = $state<MealType | null>(null);
  // The line a partial copy left behind (§11). It carries the day it is about,
  // so it CANNOT be shown beside another one — `scale_note`'s rule, that a note
  // never outlives what it described, made structural rather than swept up
  // afterwards. That also settles the race: a copy resolving after the user has
  // paged away attaches its note to the day it actually wrote to, and the view
  // simply does not render it.
  let copy_note = $state<CopyNote | null>(null);
  let visible_copy_note = $derived(
    copy_note && copy_note.day === dayKeyOf(selectedDate) ? copy_note : null
  );
  // Guards a second copy while one is mid-flight, as `scaling` does for the
  // bulk rescale.
  let copying = $state(false);
  // The logged event being edited (null = adding). When set, the log sheet opens
  // in edit mode and saving replaces this event (append-only).
  let editEvent = $state<ConsumptionEvent | null>(null);
  // Whether that edit was asked for from the source explainer's "Edit" — then the
  // sheet opens straight on the label form instead of the food's card, since the
  // user has already said which screen they want.
  let edit_label = $state(false);
  // Consumption-event ids selected (long-press) for building a recipe.
  let selected_ids = $state<Set<string>>(new Set());
  let recipeOpen = $state(false);
  // The recipe library (the header's recipe button): browse every saved recipe,
  // open one to read or amend, or write a new one. Nothing on it logs.
  let recipeLibraryOpen = $state(false);
  let recipe_meal_type = $state<MealType>("dinner");
  let recipe_seed = $state<RecipeIngredient[]>([]);
  // Which verb the recipe builder performs (ADR-0022): consolidate (build from
  // selected foods), define (new template, logged onto the day), or edit (amend
  // a template). `create` is reached only through the recipe library sheet.
  let recipe_mode = $state<"consolidate" | "define" | "edit">("consolidate");
  let recipe_template = $state<{
    entity: string;
    attributes: Record<string, any>;
  } | null>(null);
  // Instantiation editor (Instantiate a template / Correct a past instantiation,
  // ADR-0022). Exactly one of template / edit is set while it is open.
  let instantiateOpen = $state(false);
  let instantiate_meal_type = $state<MealType>("dinner");
  let instantiate_template = $state<{
    entity: string;
    attributes: Record<string, any>;
  } | null>(null);
  let instantiate_edit = $state<ConsumptionEvent | null>(null);
  // A logged food resolved to the amount it is currently at — in its panel's own
  // unit, never converted (ADR-0060 §1) — plus what the amount picker (the shared
  // FoodAmountPanel; the dashboard equivalent of a recipe row tap) needs to show
  // it: the twin's panel + portions, so the sheet shows the same screen the
  // search flow does, with the food's serving surfaced as a chip. `amount` is
  // what the picker opens at; Done retract-and-replaces the event via
  // changeLoggedFoodAmount.
  interface AmountEdit {
    event: ConsumptionEvent;
    name: string;
    amount: number;
    panel?: NutritionInfo;
    portions: Portion[];
    /** The resolved food twin — the card derives every mark on it from this. */
    payload: EntityPayload;
  }
  // The food whose amount is being changed in the picker sheet (null = closed).
  let amountEdit = $state<AmountEdit | null>(null);

  // Explainer handoff seam (#92, ADR-0041 §6): tapping the food-detail badge parks
  // its verdict here for the explainer sheet (ticket C) to mount off. #91 owns
  // only the tappable badge.
  let novaExplain = $state<NovaVerdict | null>(null);
  // The same handoff for the source tag: the tapped food's origin parks here for
  // the per-origin trust explainer (ADR-0043 §2), cleared back to null on close.
  let sourceExplain = $state<FoodSourceKind | null>(null);
  // …and for a dietary mark: all the present claims share one explainer, so any
  // tag opens the same sheet.
  let dietaryExplain = $state<DietaryVerdict | null>(null);

  const entityName = "Food";

  // Raw twins ledger view (unchanged secondary panel).
  const foodTwinsStore = createQueryStore<{
    entity: string;
    attribute: string;
    value: string;
  }>(
    `SELECT entity, attribute, value FROM datoms WHERE attribute = 'food/name' ORDER BY ${HLC_ORDER_DESC} LIMIT 20`
  );

  let dayItems = $derived(consumptionForDay($consumptionStore, selectedDate));
  let selectedItems = $derived(dayItems.filter((i) => selected_ids.has(i.id)));

  /**
   * A header control was tapped (ADR-0059 §1). Four of the five ways in are
   * `FoodStager` methods and share their id with it, so they open the log sheet
   * straight onto that method with no dock; `past` picks a meal rather than a
   * food and gets its own sheet (ADR-0058).
   *
   * Any of them supersedes whatever a previous copy had to say, so the note
   * goes first.
   */
  function enterMeal(meal_type: MealType, kind: WayIn) {
    copy_note = null;
    if (kind === "past") {
      past_meal_type = meal_type;
      return;
    }
    editEvent = null;
    edit_label = false;
    way_in = kind;
    sheet_meal_type = meal_type;
  }

  let past_meals = $derived(
    past_meal_type
      ? pastMealsFor($consumptionStore, past_meal_type, selectedDate)
      : []
  );

  /**
   * Copies a past meal into the meal being viewed (ADR-0058). Wholesale (§1),
   * at the amounts logged (§2), appending (§5), on now's clock (§10). The tap
   * on the row was the commit (§3), so this closes the sheet and says nothing
   * unless something went wrong (§11).
   */
  async function copyMeal(meal: PastMeal) {
    if (copying) return;
    copying = true;
    const target = meal.meal_type;
    past_meal_type = null;
    try {
      const day = selectedDate;
      const { copyable, lost } = partitionCopyable(meal.items);
      const result = await copyPastMeal(copyable, target, day);
      const text = copyTally(result.copied, result.lost + lost.length);
      copy_note = text ? { meal_type: target, text, day: dayKeyOf(day) } : null;
    } finally {
      copying = false;
    }
  }

  // Open the right editor for a tapped card. A Recipe Instantiation (carries a
  // frozen `event/instantiation` snapshot) opens the instantiation editor to be
  // corrected by supersession (ADR-0022); a plain food opens the log sheet.
  async function editItem(item: ConsumptionEvent) {
    // Any further action on the day supersedes what a copy had to say about it.
    copy_note = null;
    if (item.instantiation) {
      instantiate_template = null;
      instantiate_edit = item;
      instantiate_meal_type = asMealType(item.meal_type, "snack");
      instantiateOpen = true;
      return;
    }
    const resolved = await resolveAmountEdit(item);
    if (resolved) {
      amountEdit = resolved;
      return;
    }

    // A weightless "1 serving" custom food (no panel or no basis to scale
    // by) can't be amount-edited, so it still opens the full edit sheet where its
    // macros, name and photo remain editable.
    editEvent = item;
    edit_label = false;
    sheet_meal_type = asMealType(item.meal_type, "snack");
  }

  /**
   * Resolves a logged food to the amount it stands at **in its panel's own
   * unit** (ADR-0060 §1) — grams for a weight basis, millilitres for a drink
   * published per 100 ml — or `null` when it has no basis to scale against at
   * all. Both a measured log and a per-serving food with a KNOWN serving weight
   * resolve: they edit their amount in the shared picker, the same screen the
   * search flow stages into, and both re-log via changeLoggedFoodAmount (which
   * reads the unit and the divisor off that same panel). The food's own serving
   * is surfaced as a chip so a whole-serving food is one tap from its serving
   * while still editable to any amount.
   *
   * The tap-to-edit path and the selection bar's bulk ×/÷ both read the basis
   * through here, so the two can never disagree about which foods are scalable.
   */
  async function resolveAmountEdit(
    item: ConsumptionEvent
  ): Promise<AmountEdit | null> {
    const { amount, unit } = parseLoggedQuantity(item.quantity);
    const twin = item.target ? await getLocalFoodTwin(item.target) : null;
    const panel = twin?.attributes?.["nutrition/info"] as
      | NutritionInfo
      | undefined;
    const twinPortions =
      (twin?.attributes?.["food/portions"] as Portion[] | undefined) ?? [];
    // The serving as a chip: the panel's own weighed serving ("30 g" ⇒ a
    // synthesised "1 serving — 30 g", the manual/edited label case), then the
    // twin's household portions — which for an OFF product is where its serving
    // lives (OFF panels are per-100 g; the serving is a `food/portions` entry).
    // Deduped by amount and unit so a serving listed both ways isn't doubled.
    const portions = dedupePortions([
      ...servingSizePortion(panel),
      ...twinPortions,
    ]);
    // A gram basis to open at and scale against: the panel's weighed serving if
    // it has one, else the food's first real portion weight (the OFF serving). A
    // food with neither has no gram basis and can't be amount-edited. A volume
    // portion is not one of those weights (ADR-0060 §6) — it carries no `grams`
    // to find, which is the safe direction this pair degrades in.
    const servingGrams =
      (panel ? servingSizeGrams(panel.serving_size) : null) ??
      portions.map(portionMeasure).find((m) => m?.unit === "g" && m.amount > 0)
        ?.amount ??
      null;

    // Open at the logged amount (foods measured against a panel basis), or the
    // serving's gram weight × how many servings were logged (per-serving foods
    // with a gram basis). Anything else has no basis and stays null → falls
    // through to the full sheet.
    let openAmount: number | null = null;
    if (isMeasuredUnit(unit)) openAmount = amount;
    // A per-100 panel names its own divisor, so a "1 serving" entry against one
    // stands at one basis unit — 100 g, or 100 ml for a drink. `servingGrams`
    // can never find it: `servingSizeGrams` returns null for "100 g" by
    // construction and for every volume, which is what left a label capture
    // re-opening the whole form instead of its amount. Read ahead of the
    // serving-weight branch: this is what the entry's frozen macros were scaled
    // by, where a household portion is only a guess at what was eaten.
    else if (panel != null && isPer100Basis(panel.serving_size))
      openAmount = parseBasisQuantity(panel.serving_size) * amount;
    else if (panel != null && servingGrams != null)
      openAmount = servingGrams * amount;

    if (openAmount == null) return null;
    return {
      event: item,
      name: item.foodName ?? "Food",
      amount: openAmount,
      panel,
      portions,
      // A twin-less event still carries the id it was logged against, and the
      // origin reads off that id alone (ADR-0043 §2) — so the card degrades to
      // its source tag rather than to nothing.
      payload: twin ?? { entity: item.target ?? "", attributes: {} },
    };
  }

  // "Correct this food from its label", tapped in the source explainer over the
  // amount sheet: leave the amount picker for the full edit sheet on the SAME
  // logged event, which re-stages its twin — where the label form is one tap
  // away. The amount sheet closes first, so the two never stack.
  function editFoodFromAmountSheet() {
    const ae = amountEdit;
    if (!ae) return;
    amountEdit = null;
    editEvent = ae.event;
    edit_label = true;
    sheet_meal_type = asMealType(ae.event.meal_type, "snack");
  }

  function closeInstantiation() {
    instantiateOpen = false;
    instantiate_template = null;
    instantiate_edit = null;
  }

  // Open the recipe builder in one verb. The (mode, template, seed) triple is set
  // together here so the three never drift apart; closeRecipe is its inverse.
  function openRecipe(
    mode: "consolidate" | "define" | "edit",
    template: { entity: string; attributes: Record<string, any> } | null,
    seed: RecipeIngredient[] = []
  ) {
    recipe_mode = mode;
    recipe_template = template;
    recipe_seed = seed;
    recipeOpen = true;
  }

  function closeRecipe() {
    openRecipe("consolidate", null); // reset the triple back to its default…
    recipeOpen = false; // …but stay closed
  }

  // Remove a logged food (append-only retraction; the projection hides it).
  function removeItem(id: string) {
    void retractConsumptionEvent(id);
  }

  function closeSheet() {
    copy_note = null;
    sheet_meal_type = null;
    way_in = null;
    editEvent = null;
    edit_label = false;
  }

  // Every change of selection goes through here, so the scale bar's note can
  // never outlive the selection it described.
  function setSelection(next: Set<string>) {
    selected_ids = next;
    scale_note = "";
  }

  function longPress(id: string) {
    const next = new Set(selected_ids);
    next.add(id);
    setSelection(next);
  }

  function tapItem(id: string) {
    if (selected_ids.size === 0) return;
    const next = new Set(selected_ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }

  function clearSelection() {
    setSelection(new Set());
  }

  // Bulk ×/÷ over the selection. Guarded against a second tap landing mid-flight
  // (each food is a read-then-append round trip), and reported on when some of
  // the selection couldn't move.
  let scaling = $state(false);
  let scale_note = $state("");

  /**
   * Rescales every selected food by the factor, append-only: each one is
   * re-logged at its scaled amount and the original retracted, so the day's
   * nutrition re-derives from the twins rather than being edited in place — the
   * same path the amount picker's Done takes, applied across the selection.
   *
   * Two kinds of logged food carry no amount to scale: a weightless
   * "1 serving" custom entry (a quick calorie estimate has no weight to double)
   * and a Recipe Instantiation, which is corrected on its own editor so its
   * frozen per-ingredient snapshot stays coherent (ADR-0022). Both are left
   * exactly as they were and counted, so the bar can say so rather than
   * appearing to have done nothing.
   */
  async function scaleSelected(factor: number, op: ScaleOp) {
    if (scaling) return;
    scaling = true;
    // Snapshot: each append re-derives the projection under us.
    const items = selectedItems;
    const next = new Set(selected_ids);
    let scaled = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (const item of items) {
        // Per food, so one failed append leaves the rest of the selection
        // scalable instead of aborting the run half-applied.
        try {
          const scalable = item.instantiation
            ? null
            : await resolveAmountEdit(item);
          const newId = scalable
            ? await changeLoggedFoodAmount(
                item,
                scaleAmount(scalable.amount, factor, op)
              )
            : null;
          if (!newId) {
            skipped++;
            continue;
          }
          // The rescaled food is a NEW Consumption Event; keep it selected in
          // the retracted one's place so the selection survives the operation.
          next.delete(item.id);
          next.add(newId);
          scaled++;
        } catch (e) {
          console.error("scaling a logged food failed", e);
          failed++;
        }
      }
    } finally {
      scaling = false;
    }
    setSelection(next);
    const parts = [`${scaled} scaled`];
    if (skipped > 0) parts.push(`${skipped} with no weight to scale`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (skipped + failed > 0) scale_note = parts.join(" · ");
  }

  // Turn selected consumption events into recipe ingredients carrying each
  // event's id, so the recipe builder can retract the ones that remain as
  // ingredients. Each seed references its ORIGINAL food twin with the logged
  // quantity parsed back to {amount, unit}, so the recipe derives from that
  // twin's real nutrition/info panel (ADR-0021) and keeps the link to its
  // reputable source. deriveRecipeNutrition rounds each ingredient the same way
  // it was rounded when logged, so the recipe still totals exactly what these
  // foods contributed — the replace flow stays neutral. If the twin carries no
  // panel, synthesize a per-serving twin equal to the logged macros rather than
  // corrupt the real twin. Then open the seeded builder.
  async function buildRecipe() {
    const items = selectedItems;
    const seed = await Promise.all(
      items.map(async (it) => {
        const target = it.target || it.id;
        const name = it.foodName || "Food";
        const macros = {
          calories: Math.round(Number(it.calories) || 0),
          protein: Number(it.protein) || 0,
          fat: Number(it.fat) || 0,
          carbs: Number(it.carbs) || 0,
        };
        const twin = await getLocalFoodTwin(target);
        const panel = twin?.attributes?.["nutrition/info"];
        if (panel) {
          const { amount, unit } = parseLoggedQuantity(it.quantity);
          return {
            entity: target,
            name,
            amount,
            unit,
            payload: twin,
            event_id: it.id,
          };
        }
        // Fallback: no resolvable panel on the real twin — capture the logged
        // macros as a fresh per-serving twin so derivation stays lossless.
        const ing = customIngredient(
          name,
          macros.calories,
          macros.protein,
          macros.fat,
          macros.carbs
        );
        return {
          ...ing,
          event_id: it.id,
        };
      })
    );
    recipe_meal_type = asMealType(items[0]?.meal_type, "dinner");
    openRecipe("consolidate", null, seed);
    clearSelection();
  }
</script>

<!-- The header marks are defined once and rendered twice: in the buttons
     themselves, and in the legend the ⓘ unfolds. Drawing the legend from the
     same snippet is what keeps the two from drifting apart, which is the whole
     point of a legend. -->
{#snippet todayMark()}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="5" width="18" height="16"></rect>
    <line x1="3" y1="10" x2="21" y2="10"></line>
    <line x1="8" y1="3" x2="8" y2="7"></line>
    <line x1="16" y1="3" x2="16" y2="7"></line>
    <circle cx="12" cy="15.5" r="1.75" fill="currentColor"></circle>
  </svg>
{/snippet}

{#snippet infoMark()}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
{/snippet}

{#snippet settingsMark()}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3"></circle>
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    ></path>
  </svg>
{/snippet}

<header class="page-header">
  <!-- Title and icons are one row of their own, so they share a centre line
       whether or not the blurb below is unfolded. The blurb is a sibling of that
       row rather than a sibling of the title, which is what keeps the icons
       beside the word FOOD instead of drifting to the middle of a paragraph. -->
  <div class="header-bar">
    <h1>{entityName}</h1>
    <div class="header-actions">
      <!-- Leads the row, so the three standing controls keep their places when it
         comes and goes. A calendar with today's dot on it: the mark says where
         the tap lands rather than that it is a return. -->
      {#if !onToday}
        <button
          type="button"
          class="header-icon-btn"
          aria-label="Today"
          onclick={() => (selectedDate = new Date())}
        >
          {@render todayMark()}
        </button>
      {/if}
      <button
        type="button"
        class="header-icon-btn"
        aria-expanded={aboutOpen}
        aria-controls={aboutId}
        aria-label="About the food screen"
        onclick={() => (aboutOpen = !aboutOpen)}
      >
        {@render infoMark()}
      </button>
      <!-- Recipes have only ever been reachable through a meal: pick breakfast,
           open its Recipe tab, then a recipe. That browser logs what you pick,
           because you were logging a meal when you opened it, and it is the only
           way to reach a saved recipe at all. This is the standing place for
           them instead — read one, amend one, or write one down — and nothing on
           it can put food on a day. The mark is the meal header's own recipe
           pot, so the same thing looks the same in both places. -->
      <button
        type="button"
        class="header-icon-btn"
        id="food-recipes-btn"
        aria-label="Recipes"
        onclick={() => (recipeLibraryOpen = true)}
      >
        <WayInIcon kind="recipe" />
      </button>
      <!-- PROTOTYPE (#201). A: the inbox is a standing control, because a meal
           arriving belongs to no one meal. B: one handover control owns both
           directions. C: nothing here at all. -->
      {#if protoVariant === "A"}
        <button
          type="button"
          class="header-icon-btn proto-inbox"
          aria-label="Meals sent to you"
          onclick={() => (proto.uiOpen = "inbox")}
        >
          <WayOutIcon kind="inbox" />
          {#if proto.inbox.length}
            <span class="proto-count">{proto.inbox.length}</span>
          {/if}
        </button>
      {:else if protoVariant === "B"}
        <button
          type="button"
          class="header-icon-btn proto-inbox"
          aria-label="Handover"
          onclick={() => (proto.uiOpen = "handover")}
        >
          <WayOutIcon kind="handover" />
          {#if proto.inbox.length}
            <span class="proto-count">{proto.inbox.length}</span>
          {/if}
        </button>
      {/if}
      <button
        type="button"
        class="header-icon-btn"
        id="food-settings-btn"
        aria-label="Food settings"
        onclick={() => (settingsOpen = true)}
      >
        {@render settingsMark()}
      </button>
    </div>
  </div>
  <div id={aboutId} class="page-about" hidden={!aboutOpen}>
    <p class="page-about-blurb">
      Track your daily nutritional intake, build custom recipes, and log food
      photos locally.
    </p>
    <!-- What the marks beside the title mean. The row for Today is listed even
         while the button is not on screen, and says so itself: a legend that
         changed shape with the header would leave a reader who meets the
         calendar for the first time with nothing to look it up in. Each mark is
         `aria-hidden`; the name beside it is what a screen reader announces. -->
    <p class="legend-head">Beside the title</p>
    <dl class="legend">
      <div class="legend-row">
        <dt>
          <span class="legend-mark">{@render todayMark()}</span>
          Today
        </dt>
        <dd>
          Returns to today, and appears only while you are looking at another
          day.
        </dd>
      </div>
      <div class="legend-row">
        <dt>
          <span class="legend-mark">{@render infoMark()}</span>
          About
        </dt>
        <dd>Unfolds this panel.</dd>
      </div>
      <div class="legend-row">
        <dt>
          <span class="legend-mark"><WayInIcon kind="recipe" /></span>
          Recipes
        </dt>
        <dd>
          Opens the recipe library, to read a recipe, amend one, or write one
          down. Nothing on it puts food on a day.
        </dd>
      </div>
      <div class="legend-row">
        <dt>
          <span class="legend-mark">{@render settingsMark()}</span>
          Food settings
        </dt>
        <dd>
          Nutrition targets and what the day's totals show, and the Open Food
          Facts account used for scanning.
        </dd>
      </div>
    </dl>
    <!-- The ways into a meal, drawn from WAYS_IN rather than listed again here,
         so the legend keeps the header's roster and its left-to-right order by
         construction. A sixth way in would appear here without anyone
         remembering to add it. -->
    <p class="legend-head">In a meal's header</p>
    <dl class="legend">
      {#each WAYS_IN as kind (kind)}
        <div class="legend-row">
          <dt>
            <span class="legend-mark"><WayInIcon {kind} /></span>
            {wayInTitle(kind)}
          </dt>
          <dd>{wayInLegend(kind)}</dd>
        </div>
      {/each}
    </dl>
  </div>
</header>

<!-- PROTOTYPE (#201) — variant A puts a way OUT in the meal header, set apart
     from the five ways in by a rule because it is the only one that takes
     something away rather than adding it. Absent when the meal is empty, on
     ADR-0059 §4's rule: a control that could not work is hidden, not disabled. -->
{#snippet protoMealActions(meal_type: MealType, rows: number, kcal: number)}
  {#if protoVariant === "A" && rows > 0}
    <span class="proto-rule" aria-hidden="true"></span>
    <Button
      variant="secondary"
      size="sm"
      class="way-in"
      aria-label="Hand this {meal_type} over"
      title="Hand this {meal_type} over"
      onclick={() =>
        proto.startSend(meal_type, formatDate(selectedDate), rows, kcal)}
    >
      <WayOutIcon kind="send" />
    </Button>
  {/if}
{/snippet}

<!-- PROTOTYPE (#201) — variant C has no icon anywhere. The affordance is a line
     of text in the flow of the meal, under what is actually in it. -->
{#snippet protoMealFooter(meal_type: MealType, rows: number, kcal: number)}
  {#if protoVariant === "C" && rows > 0}
    <button
      type="button"
      class="proto-line"
      onclick={() =>
        proto.startSend(meal_type, formatDate(selectedDate), rows, kcal)}
    >
      Hand this {meal_type} over →
    </button>
  {/if}
{/snippet}

<!-- Main Dashboard -->
<DailyDashboard
  {dbReady}
  bind:selectedDate
  onEnterMeal={enterMeal}
  copyNote={visible_copy_note}
  selectedIds={selected_ids}
  onLongPressItem={longPress}
  onTapItem={tapItem}
  onEditItem={editItem}
  onRemoveItem={removeItem}
  mealActionsExtra={protoMealActions}
  mealFooterExtra={protoMealFooter}
  mealPanelAction={protoVariant === "D"
    ? (meal_type) => {
        proto.mealPanel = { meal_type, date: selectedDate };
      }
    : undefined}
/>

<!-- PROTOTYPE (#201) — variant C's other half: receiving is not a control in a
     header, it is a line at the foot of the day. -->
{#if protoVariant === "C"}
  <p class="proto-foot">
    <button
      type="button"
      class="proto-line"
      onclick={() => (proto.uiOpen = "receive")}
    >
      Meals sent to you{proto.inbox.length ? ` (${proto.inbox.length})` : ""} →
    </button>
  </p>
{/if}

{#if protoVariant}
  {#await import("../send-proto/SendProto.svelte") then mod}
    {@const SendProto = mod.default}
    <SendProto variant={protoVariant} />
  {/await}
{/if}

<!-- Secondary: Saved Digital Twins Ledger.
     Hidden for now — presenting the saved twins is a later task. Kept behind
     `{#if false}` (not deleted) so the markup stays intact for that work. -->
{#if false}
  <Card class="mt-6">
    <h2>
      {entityName}
      <Badge id="saved-twins-count" variant="default" class="ml-2"
        >{$foodTwinsStore.length}</Badge
      >
    </h2>
    {#if $foodTwinsStore.length === 0}
      <p class="empty">
        No digital twins created yet. Try searching or scanning a food above.
      </p>
    {:else}
      <ul id="saved-twins-list" class="twin-list">
        {#each $foodTwinsStore as row}
          <li class="twin-item">
            <span class="twin-entity">{row.entity}</span>
            <span class="twin-name">{JSON.parse(row.value)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
{/if}

<!-- Log sheet — opens directly from a meal's "+ Add", or in edit mode from a
     tapped food card. -->
{#if sheet_meal_type}
  <LogFoodSheet
    {dbReady}
    meal_type={sheet_meal_type}
    {selectedDate}
    edit={editEvent}
    editLabel={edit_label}
    wayIn={way_in ?? undefined}
    onClose={closeSheet}
  />
{/if}

<!-- The past-meal picker (ADR-0058). Reached from its own header control, so
     it opens beside the log sheet rather than inside it. -->
{#if past_meal_type}
  <PastMealSheet
    meal_type={past_meal_type}
    meals={past_meals}
    onCopy={copyMeal}
    onClose={() => (past_meal_type = null)}
  />
{/if}

<!-- Instantiation editor — Instantiate a saved Recipe Twin, or correct a past
     instantiation, on one editor surface (ADR-0022). -->
{#if instantiateOpen}
  <InstantiationSheet
    meal_type={instantiate_meal_type}
    {selectedDate}
    template={instantiate_template}
    edit={instantiate_edit}
    onClose={closeInstantiation}
  />
{/if}

<!-- Amount picker — change a logged food's amount, append-only. The same sheet a
     recipe ingredient row opens (and the search flow stages into); here Done
     retract-and-replaces the event via changeLoggedFoodAmount, in the panel's
     own unit. -->
{#if amountEdit}
  {@const ae = amountEdit}
  <IngredientAmountSheet
    name={ae.name}
    amount={ae.amount}
    panel={ae.panel}
    portions={ae.portions}
    payload={ae.payload}
    onEdit={editFoodFromAmountSheet}
    onExplainNova={(v) => (novaExplain = v)}
    onExplainSource={(kind) => (sourceExplain = kind)}
    onExplainDietary={(v) => (dietaryExplain = v)}
    onCommit={(amount) => changeLoggedFoodAmount(ae.event, amount)}
    onClose={() => (amountEdit = null)}
  />
{/if}

{#if sourceExplain}
  <!-- Source explainer (ADR-0043 §2): the source tag's tap-through, opened over
       the amount sheet the tag sits in — the same seam the staging screen uses. -->
  <SourceExplainerSheet
    kind={sourceExplain}
    onEdit={amountEdit ? editFoodFromAmountSheet : undefined}
    onClose={() => (sourceExplain = null)}
  />
{/if}

{#if dietaryExplain}
  <!-- Dietary explainer (ADR-0043 §2): the on-pack claims behind the card's
       dietary marks, opened over the amount sheet exactly as on the staging
       screen. -->
  <DietaryExplainerSheet
    verdict={dietaryExplain}
    onClose={() => (dietaryExplain = null)}
  />
{/if}

{#if novaExplain}
  <!-- NOVA explainer (#92, ADR-0041 §6): the badge's tap-through sheet, opened
       over the amount sheet the badge sits in, closed back to null. #91 owns the
       tappable badge; this owns the sheet body. -->
  <NovaExplainerSheet
    verdict={novaExplain}
    onClose={() => (novaExplain = null)}
  />
{/if}

<!-- Selection action bar — only when foods are selected (long-press) -->
{#if selected_ids.size > 0}
  <div class="selbar">
    <span class="selcount">{selected_ids.size} selected</span>
    <!-- Rescale the whole selection: ×2 for a second helping, ÷2 when the
         portion was half what was logged. -->
    <ScaleControl
      target="the selected foods"
      onScale={scaleSelected}
      disabled={scaling}
    />
    {#if scale_note}
      <span class="selnote" role="status">{scale_note}</span>
    {/if}
    <button class="selclear" onclick={clearSelection}>Clear</button>
    <button class="selbuild" id="build-recipe-btn" onclick={buildRecipe}
      >🍲 Build recipe</button
    >
  </div>
{/if}

<!-- Food settings — the top-right gear opens the food-specific settings sheet
     (USDA/OFF credentials, contribution consent, nutrition targets). -->
{#if settingsOpen}
  <FoodSettingsSheet onClose={() => (settingsOpen = false)} />
{/if}

<!-- Recipe library — the header's recipe button. Browses every saved recipe and
     opens one to review or amend; its "New recipe" writes a template only. No
     path through it logs, which is what separates it from the meal browsers. -->
{#if recipeLibraryOpen}
  <RecipeLibrarySheet
    {selectedDate}
    onClose={() => (recipeLibraryOpen = false)}
  />
{/if}

<!-- Recipe builder — Consolidate (seeded from selected foods), Define (empty new
     template), or Edit (an existing template), ADR-0022. -->
{#if recipeOpen}
  <RecipeModal
    meal_type={recipe_meal_type}
    {selectedDate}
    mode={recipe_mode}
    template={recipe_template}
    initialIngredients={recipe_seed}
    onClose={closeRecipe}
  />
{/if}

<style>
  .page-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    /* Tight on a phone, where everything above the meals is overhead. The
       desktop query below restores the roomier rhythm. */
    margin-bottom: var(--space-xs);
    animation: fadeIn 0.4s ease-out;
    border-bottom: var(--edge);
    padding-bottom: var(--space-2xs);
  }
  /* `center` is what puts the title's centre line through the icons: the word
     and the 2.75rem icon squares are different heights, and top-aligning them
     left the icons sitting low against it. */
  .header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
  }
  @media (min-width: 768px) {
    .page-header {
      margin-bottom: var(--space-m);
      padding-bottom: var(--space-s);
    }
  }
  /* The blurb, folded away by default behind the header's ⓘ. `hidden` is what
     the toggle's aria-expanded describes, so it leaves the accessibility tree
     with the box. */
  .page-about[hidden] {
    display: none;
  }
  .page-about-blurb {
    margin: 0;
  }
  /* The legend. A `dl` because that is what it is — a mark and what the mark
     means — with each pair boxed in its own row so the grid can put the mark in
     a column of its own and let the wrapped description hang under its name
     rather than under the icon. */
  .legend {
    margin: var(--space-2xs) 0 0;
    display: grid;
    gap: var(--space-2xs);
    font-size: var(--step-n1);
  }
  /* Names the surface the marks below it belong to. The header's four and a
     meal's five are two different vocabularies that happen to share the recipe
     pot, so running them together as one list would say they are one set. */
  .legend-head {
    margin: var(--space-xs) 0 0;
    padding-top: var(--space-xs);
    border-top: var(--edge-thin);
    font-size: var(--step-n2);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .legend-row {
    display: grid;
    grid-template-columns: 1.5rem 1fr;
    align-items: baseline;
    column-gap: var(--space-2xs);
  }
  .legend dt {
    display: contents;
    font-weight: 600;
    color: var(--text-primary);
  }
  .legend dd {
    grid-column: 2;
    margin: 0;
    color: var(--text-secondary);
  }
  /* The mark sits on the text baseline rather than the line box, so a one-line
     name and a mark of a different height still read as one row. */
  .legend-mark {
    grid-column: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: center;
    color: var(--ink);
  }
  .legend-mark svg,
  .legend-mark :global(.entry-icon) {
    width: 1.15rem;
    height: 1.15rem;
  }
  .header-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
  }
  /* Top-right icons — the ⓘ that unfolds the blurb and the gear that opens the
     food settings sheet. Bare (no box), opposite the title, aligned to the
     header's top. */
  .header-icon-btn {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    transition: transform 0.1s ease-out;
  }
  .header-icon-btn svg {
    width: 1.5rem;
    height: 1.5rem;
  }
  /* The recipe mark rides a child WayInIcon, which sizes itself for the meal
     header's smaller squares, so it is reached here with `:global` and sized to
     match its two neighbours. */
  .header-icon-btn :global(.entry-icon) {
    width: 1.5rem;
    height: 1.5rem;
  }
  .header-icon-btn:hover {
    color: var(--text-secondary);
  }
  .header-icon-btn:active {
    transform: scale(0.92);
  }
  .header-icon-btn:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    /* No trailing margin: the header column's own gap spaces the blurb, and a
       margin here would drop the title off the row's centre line. */
    min-width: 0;
    letter-spacing: -0.05em;
    text-transform: uppercase;
    /* Centring the BOXES is not centring the letters. An all-caps word has no
       descenders, so its glyphs sit roughly 5px above the middle of its own line
       box (measured: glyph centre 72.2, icon centre 76.8), and the title reads
       high against the icons even with align-items: center. Trimming the box to
       the cap-height/baseline block makes the box the letters, so centring it
       centres what the eye actually sees. Chromium and Safari honour this;
       anywhere else it is ignored and the title sits as it did before. */
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }
  h2 {
    font-size: var(--step-0);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
    display: flex;
    align-items: center;
    text-transform: uppercase;
    letter-spacing: -0.02em;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .twin-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    margin-top: var(--space-s);
  }
  .twin-item {
    display: flex;
    align-items: center;
    gap: var(--space-m);
    padding: var(--space-s) 0;
    border-bottom: var(--edge-thin);
    transition: background 0.2s;
  }
  .twin-item:hover {
    background: var(--bg-input);
  }
  .twin-item:last-child {
    border-bottom: none;
  }
  .twin-entity {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .twin-name {
    color: var(--text-primary);
    font-size: var(--step-n1);
    font-weight: 500;
    flex: 1;
    overflow-wrap: break-word;
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl) 0;
  }

  /* Selection action bar */
  .selbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 900;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2xs) var(--space-s);
    padding: var(--space-s);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
    background: var(--ink);
    color: var(--paper);
    animation: slideUp 0.2s ease-out;
  }
  .selcount {
    font-weight: 700;
  }
  /* The scale control pushes the bar past a phone's width, so it wraps rather
     than overflowing; Clear/Build stay together on the trailing line. */
  .selnote {
    font-size: var(--step-n2);
  }
  .selclear {
    margin-left: auto;
    background: none;
    border: 1px solid var(--paper);
    color: var(--paper);
    padding: var(--space-2xs) var(--space-s);
    cursor: pointer;
  }
  .selbuild {
    background: var(--green-bg);
    color: var(--ink);
    border: none;
    padding: var(--space-xs) var(--space-s);
    font-weight: 700;
    cursor: pointer;
    min-height: 48px;
  }

  :global(.mt-6) {
    margin-top: var(--space-m);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  /* ── PROTOTYPE (#201) — delete with the rest when it folds ────────────── */
  .proto-inbox {
    position: relative;
  }
  .proto-count {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    min-width: 1.1rem;
    height: 1.1rem;
    padding: 0 0.2rem;
    display: grid;
    place-items: center;
    background: var(--ink);
    color: var(--paper);
    border: var(--edge-thin);
    font-family: var(--font-mono);
    font-size: var(--step-n4);
    line-height: 1;
  }
  /* The rule that sets the way OUT apart from the five ways in. */
  .proto-rule {
    align-self: stretch;
    width: 2px;
    background: var(--border);
    margin: 0 var(--space-3xs);
  }
  .proto-line {
    background: none;
    border: 0;
    padding: var(--space-3xs) 0;
    font: inherit;
    font-size: var(--step-n2);
    color: var(--text-secondary);
    text-decoration: underline;
    text-underline-offset: 0.2em;
    cursor: pointer;
    text-transform: none;
  }
  .proto-line:hover {
    color: var(--text-primary);
  }
  .proto-foot {
    margin: var(--space-m) 0 var(--space-2xl);
    padding-top: var(--space-2xs);
    border-top: var(--edge-thin);
    text-align: right;
  }
</style>
