<script lang="ts">
  import { untrack } from "svelte";
  import { createQueryStore } from "../stores/datoms.store";
  import { HLC_ORDER_DESC } from "../db/hlc";
  import {
    consumptionStore,
    consumptionForDay,
    getLocalFoodTwin,
    retractConsumptionEvent,
    changeLoggedFoodAmount,
    scaleLoggedFoods,
    type ScaleChange,
    moveLoggedFoodsToMeal,
    copyPastMeal,
    type ConsumptionEvent,
  } from "../stores/calorie.store";
  import {
    scaleAmount,
    parseScaleFactor,
    DEFAULT_SCALE_FACTOR,
    type ScaleOp,
    type ScalePreview,
  } from "../food/scale-amount";
  import { asMealType, type MealType } from "../food/meal-type";
  import {
    WAYS_IN,
    wayInTitle,
    wayInLegend,
    type WayIn,
  } from "../food/ways-in";
  import {
    PAGES,
    iconIdOf,
    pageLabel,
    pageLegend,
    watchPageWidth,
    type Page,
  } from "../food/pages";
  import {
    pastMealsFor,
    partitionCopyable,
    copyTally,
    dayKeyOf,
    type PastMeal,
    type CopyNote,
  } from "../food/past-meals";
  import {
    addOrMergeIngredient,
    customIngredient,
    panelFromIngredients,
    parseLoggedQuantity,
    type RecipeIngredient,
  } from "../food/recipe-ingredient";
  import {
    basisUnit,
    dedupePortions,
    isMeasuredUnit,
    isPer100Basis,
    parseBasisQuantity,
    portionMeasure,
    servingSizeGrams,
    servingSizePortion,
    roundFood,
    type AmountUnit,
    type NutritionInfo,
    type Portion,
  } from "../food/nutrition";
  import { deriveIngredientMacros } from "../food/recipe-nutrition";
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
  import SelectionBar from "./food/SelectionBar.svelte";
  import ScaleTier from "./food/ScaleTier.svelte";
  import MoveMealSheet from "./food/MoveMealSheet.svelte";
  import LoggedFoodsPanel from "./food/LoggedFoodsPanel.svelte";
  import {
    resolveNutrientTargets,
    defaultNutrientTargets,
  } from "../food/nutrition-targets";
  import {
    calorieDisplayDecimals,
    foodTargets,
    foodCalculatedTargets,
  } from "../stores/device-settings";

  import Card from "../ui/Card.svelte";
  import { enterBackStop, leaveBackStop } from "../ui/back-stack";
  import Badge from "../ui/Badge.svelte";
  import ReceivedMealPanel from "./food/ReceivedMealPanel.svelte";
  import type { SendCode } from "../p2p/send-code";
  import type { ReceiveOpening } from "../p2p/receive-link";

  let {
    dbReady,
    receiveLink = null,
    onReceiveClose,
    hasPages = false,
  }: {
    dbReady: boolean;
    /**
     * What a receive link turned out to be, read once at boot (ADR-0074 §8).
     * `Rations.svelte` owns that read because the URL is the shell's rather
     * than this screen's; the surface it opens is here, because a meal is food.
     *
     * **Only Rations ever hands one down** (ADR-0084 §5): a meal is Rations'
     * hand-off, so the link mints at `/food/` and the root reads none. The
     * default is what the root mounts this with, and the Scan way in below is
     * the only source it has.
     */
    receiveLink?: ReceiveOpening | null;
    /** Clears that link, so leaving the surface cannot re-open it. */
    onReceiveClose: () => void;
    /**
     * Whether the shell that mounted this screen grows **pages** above the
     * shell breakpoint (ADR-0091 §5). Rations' does; the root's does not, and
     * gets the shell rule and nothing else.
     *
     * **The shell says so, because the pages are the shell's.** This is the same
     * fact `DailyDashboard` reads as `:global(.rations)` for the rail, and it is
     * threaded rather than sniffed for the reason that comment names from the
     * other side: a stylesheet can ask which shell it is inside and JavaScript
     * cannot. The root renders this whole screen in its Food tab, behind a
     * navigation sidebar and one tab away from its own Settings screen — a page
     * there would be a second door to a surface that already has one.
     */
    hasPages?: boolean;
  } = $props();

  // ── Receiving a meal ─────────────────────────────────────────────────────
  //
  // Receiving has no door of its own (ADR-0074 §4): no inbox, no standing
  // control, no count badge. A meal reaches you two ways and only two — a link
  // you opened, and the Scan way in turning out to be pointed at a meal — and
  // both land you on the meal itself, deciding, with nothing in front of it.
  //
  // The code a scan found, held only until the surface it opens is left.
  let scannedCode = $state<SendCode | null>(null);
  let receiving = $derived<ReceiveOpening | null>(
    receiveLink ?? (scannedCode ? { kind: "code", code: scannedCode } : null)
  );

  /**
   * Leaving the receiving surface, which is the whole of declining
   * (ADR-0073 §10). Both sources are cleared, because a code that outlived its
   * surface would re-open it, and the payload it opened is already gone.
   */
  function leaveReceiving() {
    scannedCode = null;
    onReceiveClose();
  }

  /** A meal code the Scan way in read. The sheet it was scanned from closes. */
  function takeMealCode(code: SendCode) {
    closeSheet();
    scannedCode = code;
  }

  // ── Settings and Recipes: one state, two shapes ───────────────────────────
  //
  // Which of Rations' pages is open, or null for the day (ADR-0091 §5). The
  // header's gear opens the Facet's one named, full-height settings surface
  // (ADR-0080 §7) and its pot opens the recipe library; **what those two
  // surfaces are** is the only thing the width decides. Above the shell
  // breakpoint they are pages shown instead of the day, below it they are the
  // sheets they have always been, and it is the same surface either way —
  // `BottomSheet`'s `inline` renders the same header and body into the page's
  // flow rather than growing a second copy (#341).
  //
  // **One variable, not two booleans**, and that is what makes the shape legal.
  // As sheets they could never both be open — a sheet covers the screen and
  // neither has a door to the other — but as pages the header is standing
  // navigation, so Recipes is one click away from Settings. Two booleans would
  // let both be true and draw both pages down the column; a single opening
  // makes "a page replaces a page" free rather than something an effect has to
  // keep tidying up.
  let page = $state<Page | null>(null);

  // Whether a page may be shown at all: this shell has them and the window is
  // wide enough for one. It starts false and the watcher corrects it, so a
  // server render and a browser with no `matchMedia` both draw the day — the
  // safe default in one direction only, since the day widening into a page is
  // the ordinary path and a page rendered where the title is not a control is a
  // screen with no way off it.
  //
  // This is the one thing a width decides in this tree that a media query
  // cannot: which component is mounted. Everything else about the width is the
  // stylesheet's.
  let canShowPage = $state(false);
  $effect(() =>
    watchPageWidth(hasPages, (available) => {
      canShowPage = available;
      // **A narrowing window walks the reader back to the day.** Written on the
      // width report itself rather than as an effect keyed on `canShowPage`,
      // so it can only fire when the width changes and can never reach in and
      // close a sheet somebody just opened. In a shell with no pages it is
      // never called at all, which is `watchPageWidth`'s half of the same rule.
      //
      // What cannot survive the narrowing is the page: the title stops being a
      // control below the breakpoint, so the reader would be on a screen whose
      // only way off is no longer rendered.
      //
      // Letting the page become its own sheet instead was the other candidate
      // and loses twice: it materialises a surface over the day that nobody
      // asked for, and a sheet is a Back stop, so a resize would push a history
      // entry (ADR-0089 §7).
      //
      // The other direction is deliberately not symmetrical. A sheet open when
      // the window widens becomes the page, because widening only *adds* the
      // way back, and the surface is the same surface — which is the whole
      // point of #341.
      if (!available) page = null;
    })
  );

  // Whether what is on screen is a page rather than the day.
  let onPage = $derived(canShowPage && page !== null);

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
  // so it CANNOT be shown beside another one — `status_note`'s rule, that a note
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
  // The Selection: the Consumption Events a long-press picked out (ADR-0088
  // §1). Not meal-scoped — it may span the day's meals — but day-scoped.
  let selected_ids = $state<Set<string>>(new Set());
  // The meal picker the `move` verb opens (§8).
  let move_open = $state(false);
  // The Selection's own nutrition panel, which the count opens and in which the
  // Way out sits — the third scale of that control (§9).
  let selection_panel_open = $state(false);
  // Whether the panel above turned into a Send code before it was closed. A
  // hand-off is the one verb with no completion of its own — nothing comes back
  // from a send — so this is what says the action happened.
  let selection_handed = $state(false);
  let recipeOpen = $state(false);
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
  // Read only to decide which cards the Selection's panel draws, exactly as the
  // dashboard reads them for a meal's.
  let resolvedTargets = $derived(
    resolveNutrientTargets(
      $foodTargets,
      defaultNutrientTargets($foodCalculatedTargets)
    )
  );

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
  // A retracted food leaves the Selection with it (ADR-0088 §4): the count may
  // never name a food that is no longer on screen. Done here rather than by
  // pruning against `dayItems`, which would race the projection and drop the
  // ids a scale has just minted.
  function removeItem(id: string) {
    if (selected_ids.has(id)) {
      const next = new Set(selected_ids);
      next.delete(id);
      setSelection(next);
    }
    void retractConsumptionEvent(id);
  }

  function closeSheet() {
    copy_note = null;
    sheet_meal_type = null;
    way_in = null;
    editEvent = null;
    edit_label = false;
  }

  // Every change of selection goes through here, so the bar's one status line
  // can never outlive the selection it described (ADR-0088 §2).
  function setSelection(next: Set<string>) {
    selected_ids = next;
    status_note = "";
    if (next.size === 0) closeScale();
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

  // ── A Selection is a mode (ADR-0088 §3) ───────────────────────────────────
  //
  // The bar covers the tab bar, so the ordinary way off this screen is gone
  // while a Selection is live. Back therefore has to mean "leave the
  // Selection", and back only leaves Food once nothing is selected.
  //
  // The history entry that buys that is `ui/back-stack.ts`'s, not this file's
  // (#330). It used to be pushed here, under a comment reading "ours is the top
  // entry — nothing else in this app pushes one", and ADR-0089 §7 made that
  // false: every open sheet pushes one now, including the ones this bar's own
  // verbs open. Two owners of the top entry cannot both be right — one Back
  // would have closed the sheet *and* cleared the Selection — so a Selection is
  // a stop on the one stack, and the ordering is the order things opened in.
  //
  // Deliberately a plain `let`: this is bookkeeping ABOUT the effect, and
  // making it reactive would re-run the effect that writes it.
  let selection_stop = 0;

  $effect(() => {
    const active = selected_ids.size > 0;
    untrack(() => {
      if (active && selection_stop === 0) {
        selection_stop = enterBackStop("mode", clearSelection);
      } else if (!active && selection_stop !== 0) {
        leaveBackStop(selection_stop);
        selection_stop = 0;
      }
    });
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Escape" || selected_ids.size === 0) return;
    // A surface stacked over the bar owns Escape first.
    if (recipeOpen || move_open || selection_panel_open) return;
    clearSelection();
  }

  // A Selection belongs to one day (ADR-0088 §4). Only `selectedDate` is
  // tracked here: pruning against `dayItems` instead would race the projection,
  // which has not yet caught up with the ids a scale just minted.
  let selected_day_key = "";
  $effect(() => {
    const key = dayKeyOf(selectedDate);
    untrack(() => {
      if (selected_day_key === key) return;
      selected_day_key = key;
      if (selected_ids.size > 0) clearSelection();
    });
  });

  // ── Scale (ADR-0088 §5 to §7) ─────────────────────────────────────────────
  //
  // The tier is a fixed-height expansion of the bar rather than a sheet,
  // because the rows behind it ARE the preview and a sheet would dim them.
  let scale_open = $state(false);
  let scale_factor = $state(DEFAULT_SCALE_FACTOR);
  let scale_op = $state<"" | ScaleOp>("");
  // Guarded against a second tap landing mid-flight: each food is a
  // read-then-append round trip.
  let scaling = $state(false);
  // The bar's one status line, shared by every verb and silent on success.
  let status_note = $state("");

  /** One selected food resolved to what a scale would actually act on. */
  interface Scalable {
    amount: number;
    unit: AmountUnit;
    panel: NutritionInfo;
    ref: string;
  }
  let scalables = $state<Map<string, Scalable>>(new Map());

  /**
   * Resolves the whole Selection BEFORE the tier draws anything (§7). What
   * cannot be scaled — a Recipe Instantiation, whose frozen per-ingredient
   * snapshot is corrected on its own editor (ADR-0022), and a weightless
   * "1 serving" entry, which has no weight to double — is then said in place on
   * the row rather than apologised for once the run is over.
   */
  async function resolveScalables(): Promise<Map<string, Scalable>> {
    const next = new Map<string, Scalable>();
    for (const item of selectedItems) {
      if (item.instantiation || !item.target) continue;
      const resolved = await resolveAmountEdit(item);
      if (!resolved?.panel) continue;
      next.set(item.id, {
        amount: resolved.amount,
        unit: basisUnit(resolved.panel.serving_size),
        panel: resolved.panel,
        ref: item.target,
      });
    }
    return next;
  }

  async function toggleScale() {
    if (scale_open) return closeScale();
    scale_open = true;
    status_note = "";
    scalables = await resolveScalables();
  }

  function closeScale() {
    scale_open = false;
    scale_op = "";
    scalables = new Map();
  }

  /**
   * What each food WOULD read at, derived through the SAME function the write
   * uses, so the preview cannot disagree with what lands. A ratio against the
   * already-rounded logged figure would round twice and drift by a hair, which
   * on a real ledger write is not a rounding difference but a lie.
   */
  let scalePreview = $derived.by(() => {
    if (!scale_open || scale_op === "") return undefined;
    const factor = parseScaleFactor(scale_factor);
    if (factor === null) return undefined;
    const preview = new Map<string, ScalePreview>();
    for (const [id, food] of scalables) {
      const amount = scaleAmount(food.amount, factor, scale_op);
      const macros = deriveIngredientMacros(
        { ref: food.ref, amount, unit: food.unit },
        () => food.panel
      );
      preview.set(id, {
        amount,
        unit: food.unit,
        calories: roundFood(macros.calories),
      });
    }
    return preview;
  });

  /** Said as soon as the tier opens, not once an operator is chosen. */
  let scaleNotes = $derived.by(() => {
    if (!scale_open) return undefined;
    const notes = new Map<string, string>();
    for (const item of selectedItems) {
      if (!scalables.has(item.id)) notes.set(item.id, "no weight to scale");
    }
    return notes;
  });

  /**
   * Applies the factor, append-only: each food is re-logged at its scaled
   * amount and the original retracted, so the day's nutrition re-derives from
   * the twins rather than being edited in place — the same path the amount
   * picker's Done takes, across the Selection.
   *
   * The whole run is **one append**. Nothing here needs the worker until the
   * write: `scalables` already holds every panel, resolved before the tier
   * drew, so the arithmetic is the same the live preview is doing. What lands
   * is therefore one projection, one frame — every row takes its new figure and
   * lets go of its mark together, instead of washing out one at a time behind a
   * round trip each.
   */
  async function applyScale(factor: number, op: ScaleOp) {
    if (scaling) return;
    scaling = true;
    const items = selectedItems;
    const resolved = scalables;
    const changes: ScaleChange[] = [];
    let skipped = 0;
    for (const item of items) {
      const food = resolved.get(item.id);
      // Already said in place on the row, since the tier opened: a Recipe
      // Instantiation or a weightless entry has no weight to scale.
      if (!food) {
        skipped++;
        continue;
      }
      changes.push({
        event: item,
        amount: scaleAmount(food.amount, factor, op),
        unit: food.unit,
        panel: food.panel,
        ref: food.ref,
      });
    }

    let scaled = 0;
    let failed = 0;
    try {
      scaled = await scaleLoggedFoods(changes);
    } catch (e) {
      // One append, so it is all of them or none — there is no half-applied run
      // to report, and nothing was written.
      console.error("scaling the selection failed", e);
      failed = changes.length;
    } finally {
      scaling = false;
    }
    closeScale();
    // **A finished verb ends the mode; what it did not finish stays picked.**
    // Cleared rather than re-pointed at the new ids: the events chosen were
    // retracted, so carrying their successors forward would leave a Selection
    // of things nobody chose. What is left behind is what the run never wrote —
    // which is also what keeps the bar on screen to carry the note below, since
    // an empty Selection unmounts it.
    setSelection(
      new Set(
        (failed > 0
          ? // One append, so a throw wrote nothing at all: every id is still
            // live and the whole run can be tried again.
            items
          : items.filter((it) => !resolved.has(it.id))
        ).map((it) => it.id)
      )
    );
    // Silent on success (§2): a change you can watch does not need narrating.
    if (skipped + failed > 0) {
      const parts = [`${scaled} scaled`];
      if (skipped > 0) parts.push(`${skipped} with no weight to scale`);
      if (failed > 0) parts.push(`${failed} failed`);
      status_note = parts.join(" · ");
    }
  }

  /**
   * Moves the Selection to another meal of the same day (ADR-0088 §8). One new
   * `event/meal_type` datom per food and nothing else, so every id survives —
   * but the Selection still ends, because the move is done.
   */
  async function moveSelected(meal_type: MealType) {
    const items = selectedItems;
    move_open = false;
    const { failed } = await moveLoggedFoodsToMeal(items, meal_type);
    // A finished verb ends the mode, whatever it did to the foods. A failure is
    // not a finish: a move mints no ids, so every food is still exactly where
    // the Selection left it and the whole thing can be tried again — and the
    // Selection has to survive for the note to have a bar to sit on.
    if (failed > 0) {
      status_note = `${failed} could not move`;
      return;
    }
    // Silent on success: the foods visibly relocate, which needs no narrating.
    status_note = "";
    clearSelection();
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
    const resolved = await Promise.all(
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
            event_ids: [it.id],
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
          event_ids: [it.id],
        };
      })
    );

    // **Folded, not listed.** A Selection may hold the same food twice — two
    // logs of the same oats — and the ingredient list is entity-keyed end to
    // end (ADR-0024), so seeding a row per event throws a duplicate key and
    // takes the whole builder down with it. The seed goes through the same
    // helper the Add sheet uses, so the day's way in obeys the rule the
    // catalogue's way in already did: one row per twin, amounts summed, and
    // both source events carried so both are retracted on save.
    const seed: RecipeIngredient[] = [];
    for (const ing of resolved) {
      const addition = addOrMergeIngredient(seed, ing);
      if (addition.ok) {
        seed.splice(0, seed.length, ...addition.ingredients);
        continue;
      }
      // Refused only for a unit mismatch: the same twin logged under two bases,
      // which a corrected panel can leave behind (ADR-0060). There is no sheet
      // to hold open and report to here, so the row becomes a custom ingredient
      // — a fresh twin, its own id, no collision — which is exactly what a food
      // with no resolvable panel already does above. Its macros are the logged
      // ones, so nothing is lost but the link to the shared twin.
      const macros = deriveIngredientMacros(
        { ref: ing.entity, amount: ing.amount, unit: ing.unit },
        (ref) => panelFromIngredients([ing], ref)
      );
      seed.push({
        ...customIngredient(
          ing.name,
          Math.round(macros.calories),
          macros.protein ?? 0,
          macros.fat ?? 0,
          macros.carbs ?? 0
        ),
        event_ids: ing.event_ids,
      });
    }

    recipe_meal_type = asMealType(items[0]?.meal_type, "dinner");
    openRecipe("consolidate", null, seed);
    clearSelection();
  }
</script>

<!-- Escape leaves a Selection (ADR-0088 §3). The bar covers the tab bar, so the
     platform back gesture has to mean the nearest thing there is, and it leaves
     the Selection first and Food only once nothing is selected — through the
     Back stack above, which is the one owner of that gesture, not through a
     handler here. -->
<svelte:window onkeydown={onKeyDown} />

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

<!-- A page's mark, in the header and in the legend. The two pages' marks are
     different kinds of thing — Recipes wears the meal header's own recipe pot,
     so the same thing looks the same in both places, and Settings has a drawn
     gear of its own — so the roster is looped and the mark is chosen here, once,
     rather than the whole control being written out twice. -->
{#snippet pageMark(of: Page)}
  {#if of === "recipes"}
    <WayInIcon kind="recipe" />
  {:else}
    {@render settingsMark()}
  {/if}
{/snippet}

<header class="page-header">
  <!-- Title and icons are one row of their own, so they share a centre line
       whether or not the blurb below is unfolded. The blurb is a sibling of that
       row rather than a sibling of the title, which is what keeps the icons
       beside the word FOOD instead of drifting to the middle of a paragraph. -->
  <div class="header-bar">
    <h1>
      {#if onPage}
        <!-- **The title is the way back, and it is the only way off a page**
             (ADR-0091 §5). The icon that opened this page is a toggle to
             nowhere on its own: it is navigation now, and clicking the page you
             are already on goes nowhere, so the word has to carry the return.

             It stays inside the `h1` and inherits its type rather than becoming
             a control of its own shape, so the word does not move by gaining a
             job. The hit area is the letters — no padding, because padding here
             would either shift the title off the row's centre line or grow a
             target with nothing in it.

             The accessible name adds where it goes and keeps the visible word
             in front of it: "Food, button" on a settings screen is a
             destination nobody can guess, and a name that dropped "Food"
             would no longer be the label anyone can see. -->
        <button
          type="button"
          class="title-back"
          aria-label="{entityName}, back to the day"
          onclick={() => (page = null)}>{entityName}</button
        >
      {:else}
        {entityName}
      {/if}
    </h1>
    <div class="header-actions">
      <!-- Today and About are the **day's** controls, and a page is not the day.
           Today would move a date on a screen nobody can see, and About unfolds
           a blurb describing the day's marks. Neither is a part removed by a
           *width* — the day carries all four at every one of them, which is what
           ADR-0091 §1 protects — they are simply not this screen's. -->
      {#if !onPage}
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
      {/if}
      <!-- The two standing controls, drawn from `PAGES` rather than listed
           again here, so the header keeps the roster and its left-to-right
           order by construction — the same shape a meal header uses for its
           ways in. A third page appears here and in the legend below without
           anyone remembering to add it twice.

           Above the shell breakpoint they are **navigation**: the icon of the
           page you are on is inverted — ink and paper, which is how this frame
           states selection, and the same mark the month calendar's chosen day
           wears. `aria-current="page"` is what says it to a screen reader; it is
           absent rather than false everywhere else, including on a phone, where
           these open sheets and there is no current anything.

           Each stays a plain click that opens the surface it names, so a page
           keeps exactly one control either side of the breakpoint (ADR-0091 §1)
           and the icon never becomes a toggle — the title is the way back. -->
      {#each PAGES as p (p)}
        <button
          type="button"
          class="header-icon-btn"
          id={iconIdOf(p)}
          aria-label={pageLabel(p)}
          aria-current={onPage && page === p ? "page" : undefined}
          onclick={() => (page = p)}
        >
          {@render pageMark(p)}
        </button>
      {/each}
    </div>
  </div>
  <!-- Folded away on a page as well as when nobody asked for it: the blurb and
       the legend under it describe the day's marks, and the ⓘ that unfolds them
       is not on a page to be pressed. The fold state survives the trip, so
       coming back to the day comes back to the panel you left. -->
  <div id={aboutId} class="page-about" hidden={!aboutOpen || onPage}>
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
      <!-- The two pages, from the same roster the header's controls come from,
           so the legend cannot describe a mark that is not there or miss one
           that is. Their names are the controls' own accessible names, which is
           what a legend is for: the word a screen reader says and the word the
           panel writes down are one string. -->
      {#each PAGES as p (p)}
        <div class="legend-row">
          <dt>
            <span class="legend-mark">{@render pageMark(p)}</span>
            {pageLabel(p)}
          </dt>
          <dd>{pageLegend(p)}</dd>
        </div>
      {/each}
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

<!-- Main Dashboard — the day, and what a page is shown *instead of*
     (ADR-0091 §5). Unmounted rather than hidden: a day left in the tree behind
     a page keeps its ledger subscriptions live and its own sheets openable by
     anything that still holds a reference to them. -->
{#if !onPage}
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
    {scalePreview}
    {scaleNotes}
  />
{/if}

<!-- Settings and Recipes, and **one call site each** (ADR-0091 §5).
     `inline` is the whole of the difference: above the shell breakpoint the
     surface renders into the page's flow, right where the day stood, and below
     it `Modal` portals the same header and body out as a dialog — so where this
     sits in the markup decides the page's position and nothing about the
     sheet's.

     Two call sites, one per shape, was the alternative and is what #341 exists
     to avoid one level down: the same two props would be written twice and
     could be changed once. -->
{#if page === "settings"}
  <!-- Rations settings: the OFF login, the contribution default, the nutrition
       targets, Rations' own Local Logs card and its Your data block — the
       Facet's one named, full-height surface (ADR-0080 §7). -->
  <FoodSettingsSheet {dbReady} inline={onPage} onClose={() => (page = null)} />
{:else if page === "recipes"}
  <!-- The recipe library. Browses every saved recipe and opens one to review or
       amend; its "New recipe" writes a template only. No path through it logs,
       which is what separates it from the meal browsers. -->
  <RecipeLibrarySheet
    {selectedDate}
    inline={onPage}
    onClose={() => (page = null)}
  />
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
    onMealCode={takeMealCode}
  />
{/if}

<!-- The receiving surface (ADR-0074 §4, ADR-0073 §10): the meal itself, with
     nothing in front of it, and the hold for the payload behind it. Leaving is
     declining, by any route — including a tab change, which unmounts this whole
     screen under it. -->
{#if receiving}
  <ReceivedMealPanel
    opening={receiving}
    {selectedDate}
    {dbReady}
    onLeave={leaveReceiving}
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

<!-- The Selection bar (ADR-0088). Raised by a long-press; it owns the foot of
     the screen while it is live, which is what makes a Selection a mode. -->
<!-- The Selection's own nutrition panel (ADR-0088 §9): what the count opens,
     and where the Way out sits. The same control as a meal's and the full
     day's, at a third scale — which is the whole cost of handing over a few
     picked foods, since the payload already takes an arbitrary root list. -->
{#if selection_panel_open && selectedItems.length > 0}
  <LoggedFoodsPanel
    title="{selected_ids.size} SELECTED"
    subject={selectedItems.length === 1
      ? "this food"
      : `these ${selectedItems.length} foods`}
    testId="selection-nutrient-breakdown"
    wayOutTestId="selection-way-out"
    date={selectedDate}
    items={selectedItems}
    targets={resolvedTargets}
    calorieDecimals={$calorieDisplayDecimals}
    onHandOff={() => (selection_handed = true)}
    onClose={() => {
      selection_panel_open = false;
      // **Deliberately on close, not on the hand-off itself.** This panel is
      // mounted behind `selectedItems.length > 0`, so clearing while it is open
      // would unmount it — and with it the `SendFace` whose mount IS the send
      // session (ADR-0074 §3). The code would die the instant it was minted.
      if (selection_handed) {
        selection_handed = false;
        clearSelection();
      }
    }}
  />
{/if}

{#if move_open}
  <MoveMealSheet
    count={selected_ids.size}
    onMove={moveSelected}
    onClose={() => (move_open = false)}
  />
{/if}

<!-- The Selection is the **day's** mode (ADR-0088 §1), so its bar goes where
     the day goes. On a page there is nothing for its verbs to act on and no
     backdrop to sit behind — a bar of scale/move/delete floating over a
     settings screen would be offering to act on rows nobody can see.

     The Selection itself is kept rather than cleared: leaving a screen is not
     the way out of a mode (§1 gives it its own), and dropping a hand-picked set
     of rows because somebody opened Recipes would be destroying work as a side
     effect of navigation. Coming back to the day comes back to the Selection. -->
{#if selected_ids.size > 0 && !onPage}
  <SelectionBar
    count={selected_ids.size}
    note={status_note}
    scaleOpen={scale_open}
    onDismiss={clearSelection}
    onHandOff={() => (selection_panel_open = true)}
    onScale={toggleScale}
    onMove={() => (move_open = true)}
    onRecipe={buildRecipe}
  >
    {#snippet tier()}
      {#if scale_open}
        <ScaleTier
          bind:factor={scale_factor}
          bind:op={scale_op}
          busy={scaling}
          onApply={applyScale}
        />
      {/if}
    {/snippet}
  </SelectionBar>
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
  /* The page you are on, inverted — ink and paper, which is how this frame
     states selection (ADR-0091 §5), and the same mark the month calendar puts
     on the selected day. It is keyed on `aria-current` rather than on a class,
     so the thing a screen reader is told and the thing the eye is shown cannot
     come apart: there is one fact and one place it is written.

     Bare buttons everywhere else, so the ink square is the whole of the
     difference between "a door" and "where you are". Hover is switched back off
     on it — a control that greys on hover reads as leaving the state it is
     showing, and this one goes nowhere. */
  .header-icon-btn[aria-current="page"],
  .header-icon-btn[aria-current="page"]:hover {
    background: var(--ink);
    color: var(--paper);
  }
  .header-icon-btn:active {
    transform: scale(0.92);
  }
  .header-icon-btn:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  /* The title, and the title once it is also the way back. Every type
     declaration is written for both, because ADR-0091 §5's rule is that the
     word does not move by becoming a control: a button that picked up the UA's
     font, its box or its metrics would be a different word in the same place. */
  h1,
  .title-back {
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
  /* And what it gives up to be one. `font-family` and `line-height` are the two
     a button does NOT inherit, so they are named; the rest is the UA's button
     box being taken away, down to the trim above making its box the letters
     again. A `display: block` child is what lets that trim be the button's own
     rather than something the `h1` has to apply through it.
     `text-align: inherit` for a control that fills its line: without it a button
     centres its label, and the word would move by exactly the slack. */
  .title-back {
    display: block;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    line-height: inherit;
    text-align: inherit;
    cursor: pointer;
  }
  /* The hover and the focus ring are the header icons', because the title is a
     control in the same row and answering the pointer differently would make it
     read as a different kind of thing. */
  .title-back:hover {
    color: var(--text-secondary);
  }
  .title-back:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
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
</style>
