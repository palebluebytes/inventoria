<script lang="ts">
  import { mintEntity } from "../../facets/entity-id";
  import {
    submitToOpenFoodFacts,
    parseCategoryList,
    offReferenceImagesFromTwin,
    offPackUnitFromTwin,
    offPackQuantityFromTwin,
    packSizeUnit,
    contributionWithholdsNutriments,
    ProductNotFoundError,
    OffUnreachableError,
    type OffPayload,
    type OffSubmitResult,
  } from "../../food/open-food-facts";
  import { lookupBarcodeWithRetry } from "../../food/off-retry";
  import {
    searchUsdaFoods,
    mapPayloadToFoodResult,
    isPoorFoodTwin,
    NoReferenceFoodError,
    NO_FOOD_FOUND,
    type FoodResult,
  } from "../../food/food-search";
  import type { EntityPayload } from "../../ingestion/ingest";
  import { getLocalFoodTwin } from "../../stores/calorie.store";
  import { offContributeDefault } from "../../stores/device-settings";
  import { calorieDisplayDecimals } from "../../stores/device-settings";
  import { secretsStore } from "../../stores/secrets";
  import {
    amountDefaults,
    basisUnit,
    parseBasisQuantity,
    portionLabelIsBareWeight,
    reportsNoEnergy,
    roundFoodDisplay,
    FOOD_PORTIONS_ATTR,
    NUTRITION_INFO_ATTR,
    type Portion,
    type NutritionInfo,
  } from "../../food/nutrition";
  import {
    CORE,
    DETAIL,
    MICROS,
    ALL_FIELDS,
    buildLabelPanel,
    invertServingSize,
    resolveServingSize,
    splitPortionRows,
    toDisplay,
    type FieldDef,
    type Basis,
    type PortionRow,
  } from "../../food/label-form";
  import {
    buildLabelCapture,
    type ManualEntryKind,
  } from "../../food/provenance";
  import {
    SCAN_FORMATS,
    decodeBarcode,
    decodeBarcodeFromImage,
  } from "../../food/barcode-scan";
  import {
    emptyAutofillResult,
    type AIAutofillResult,
  } from "../../food/ai-autofill";
  import { completeStagedPanel } from "../../food/usda-corpus";
  import {
    beginSearchSession,
    recordSearchSession,
    searchFoundFood,
    searchFoundNothing,
    typedIntoSession,
    type SearchSession,
  } from "../../logs/search-log";
  import { readImageAsDataUrl } from "../../food/image-file";
  import type {
    FoodChoice,
    ChooseOutcome,
    StagerSeed,
    StagerExtraTab,
    StagerIds,
    PrimaryLabelContext,
  } from "../../food/food-staging";

  import { onDestroy } from "svelte";
  import { Tabs, Combobox } from "bits-ui";
  import Alert from "../../ui/Alert.svelte";
  import Button from "../../ui/Button.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import Input from "../../ui/Input.svelte";
  import Segmented from "../../ui/Segmented.svelte";
  import LabelPhotoReader from "./LabelPhotoReader.svelte";
  import CategoryPicker from "./CategoryPicker.svelte";
  import FoodCard from "./FoodCard.svelte";
  import ManualEntryFlow from "./ManualEntryFlow.svelte";
  import CommitButton from "./CommitButton.svelte";
  import NovaExplainerSheet from "./NovaExplainerSheet.svelte";
  import SourceExplainerSheet from "./SourceExplainerSheet.svelte";
  import { curatedStandInFor } from "../../food/curated-foods";
  import DietaryExplainerSheet from "./DietaryExplainerSheet.svelte";
  import type { NovaVerdict } from "../../food/nova-verdict";
  import type { DietaryVerdict } from "../../food/off-signals";
  import type { FoodSourceKind } from "../../food/food-source";
  import { readScannedCode } from "../../p2p/scanned-code";
  import type { SendCode } from "../../p2p/send-code";
  import MealLinkField from "./MealLinkField.svelte";

  // The shared food-staging surface behind both the direct-log sheet and the
  // add-ingredient sheet (issue #16). It owns the Search / Scan / Custom method
  // switch, each sub-flow, the staged-food card with its live macro preview
  // (reusing the AmountField control, ADR-0023), and the bottom method dock
  // (input · method tabs · primary action). It never logs or persists anything:
  // it hands the resolved food back through `onChoose` and lets the host decide
  // what to do (log a Consumption Event, or add a recipe ingredient), so staging
  // behaves identically on both surfaces and the logic lives in one place.
  let {
    /**
     * Commits the chosen food. The host maps it to its own action and reports an
     * outcome; a refused commit keeps the sheet open showing the reason (issue
     * #14), an accepted one lets the host close/unmount the sheet its own way.
     */
    onChoose,
    /** Builds the primary button's label from the live staging context. */
    primaryLabel,
    /** Extra disable for the primary action (e.g. the DB not being ready yet). */
    primaryDisabled = false,
    /** Allows attaching a photo to a custom entry (the direct-log flow only). */
    allowPhoto = false,
    /**
     * Makes the Custom tab an intent CHOOSER (quick estimate / from a menu / from
     * a photo, ADR-0035) instead of the full-panel label form. The direct-log
     * flow opts in; the add-ingredient flow leaves it off and keeps the label
     * form. The label form is still reached in BOTH flows via the barcode doors
     * (a set `captureReason` wins over this). */
    manualIntents = false,
    /** The meal this sheet logs into ("lunch"/"dinner") — the quick-estimate name
     *  default when the user leaves the name blank (ADR-0035 §3). */
    mealName = "",
    /** Hides the method switcher — the direct-log sheet's edit mode locks onto
     *  one food's amount. Distinct from `methodDock`: this also suppresses the
     *  fresh-entry intent chooser, because an edit is not a fresh entry. */
    lockMethods = false,
    /**
     * Whether this host shows a method dock at all (ADR-0059 §2). The dock is a
     * host's choice, not a fixture: the log flow drops it, because the meal
     * header already chose the way in and a sheet reached from there does one
     * thing. `AddIngredientSheet` keeps it — it is reached from the recipe
     * builder, which has no header to hang controls on.
     */
    methodDock = true,
    /** One-time pre-population for edit mode (see {@link StagerSeed}). */
    seed = null,
    /** Host-injected method tabs beyond Search / Scan / Custom (e.g. the log
     *  sheet's Recipe browser), rendered via the `tabContent` snippet. */
    extraTabs = [],
    /** Recently used foods, newest first, shown in the Search tab while the
     *  query box is empty so a repeat food is one tap away. Host-supplied (it
     *  knows what "recent" means for its surface); empty hides the section. */
    recent = [],
    /** What to say when `recent` is empty and the user has not typed — supplied
     *  by the host for the same reason `recent` is, since only the host knows
     *  whether an empty list means anything on its surface. Empty string (the
     *  default) keeps the silence, which is right for a host that has no Recent
     *  concept at all. */
    recentEmptyHint = "",
    /** DOM ids for each host's e2e selectors. */
    ids,
    /** The staged food, exposed so the host header's back button can clear it
     *  ("Change food" / "Back"). */
    staged = $bindable(null),
    /**
     * Unified back capability for the stager's own internal sub-states — a staged
     * food, the barcode-door capture form, or a manual mini-form. The host wires
     * its shared header back button to these (`onBack={canGoBack ? goBack : …}`),
     * so every internal step gets the same centred-title-plus-back header instead
     * of each sub-state rolling its own affordance. `canGoBack` is false at the
     * top of a flow, letting the host fall back to its own default (close/none). */
    canGoBack = $bindable(false),
    goBack = $bindable(() => {}),
    /** Which method tab to open on (default "search"). Lets a host reopen the
     *  sheet on a specific tab — e.g. returning to the Recipe browser via a
     *  sub-sheet's back button. */
    initialMethod = undefined,
    tabContent,
    /** Docked action for an extra tab, pinned in the bottom dock where the
     *  primary button sits on the built-in tabs — e.g. the Recipe browser's
     *  "＋ New recipe". Rendered only while an extra tab is active. */
    tabDock,
    /** Back handler for an extra tab in a focused sub-state — e.g. the Recipe
     *  browser having drilled into a recipe's editor. When set, the shared header
     *  back button drives it and the method switcher hides (the sub-state owns the
     *  screen, like a staged food). Null at the tab's top level. */
    tabBack = undefined,
    /**
     * Hands a scanned **Send code** up to the host (ADR-0074 §4): the Scan way
     * in reads a meal code as well as a barcode, and a meal is the host's to
     * open, not the stager's — nothing here stages, logs or holds one.
     *
     * Absent on a host where a meal is not a thing that can be received. The
     * ADR names the Scan **way in**, which is the meal header's control, so the
     * log sheet passes this and the add-ingredient sheet does not: a recipe is
     * being built there, and a meal is not an ingredient. Without it a meal
     * code is reported as a code this scanner has no use for, which is true.
     */
    onMealCode = undefined,
  }: {
    onChoose: (choice: FoodChoice) => ChooseOutcome | Promise<ChooseOutcome>;
    primaryLabel: (ctx: PrimaryLabelContext) => string;
    primaryDisabled?: boolean;
    allowPhoto?: boolean;
    manualIntents?: boolean;
    mealName?: string;
    lockMethods?: boolean;
    methodDock?: boolean;
    seed?: StagerSeed | null;
    extraTabs?: StagerExtraTab[];
    recent?: FoodResult[];
    recentEmptyHint?: string;
    ids: StagerIds;
    staged?: FoodResult | null;
    canGoBack?: boolean;
    goBack?: () => void;
    initialMethod?: string;
    tabContent?: import("svelte").Snippet<[string]>;
    tabDock?: import("svelte").Snippet<[string]>;
    tabBack?: () => void;
    onMealCode?: (code: SendCode) => void;
  } = $props();

  type BaseMethod = "search" | "scan" | "custom";
  const BASE_TABS: [BaseMethod, string, string][] = [
    ["search", "🔍", "Search"],
    ["scan", "📷", "Scan"],
    ["custom", "✏️", "Custom"],
  ];
  let methodTabs = $derived<[string, string, string][]>([
    ...BASE_TABS,
    ...extraTabs.map(
      (t) => [t.id, t.icon, t.label] as [string, string, string]
    ),
  ]);
  const isExtra = (m: string) => extraTabs.some((t) => t.id === m);

  // Opens on the host's chosen tab (a sub-sheet's back button reopens straight on
  // the Recipe browser); "search" otherwise. Read once at mount.
  // svelte-ignore state_referenced_locally
  let method = $state<string>(initialMethod ?? "search");
  let query = $state("");
  let barcode = $state("");

  // "unreachable" is a scan-only fourth state, not a flavour of "error" (#204):
  // Open Food Facts being busy is the one failure here that clears by itself, so
  // it earns copy that says so and a control that tries again, where "error"
  // states a fault the user can only read.
  let status = $state<"idle" | "loading" | "error" | "unreachable">("idle");
  let error = $state("");
  let results = $state<FoodResult[]>([]);
  // The query the last search came back empty for, or null while it did not. An
  // empty result is an outcome, not a fault, so it never takes the error state
  // the failures above it keep. It is held as the query it answers, not as a
  // flag: an empty state left over from a query the field no longer holds is
  // stale, and typing back below the search threshold fires nothing that would
  // clear it.
  let emptySearch = $state<{ query: string } | null>(null);

  // `amount` is the authoritative figure owned by the AmountField control
  // (ADR-0023); it stays a clean number, in the staged panel's OWN unit — grams
  // for a weighed food, millilitres for a drink published per 100 ml, and
  // nothing converts between the two (ADR-0060 §1/§2).
  let amount = $state(100);

  // Where the control opens for a freshly staged food, which follows that unit:
  // 100 g for anything weighed, a 250 ml glass for a drink. Read off the
  // payload rather than off `stagedInfo`, so it never depends on the order a
  // derived happens to settle in relative to the assignment beside it.
  function openingAmount(payload: EntityPayload): number {
    const info = payload.attributes[NUTRITION_INFO_ATTR] as
      | NutritionInfo
      | undefined;
    return amountDefaults(basisUnit(info?.serving_size)).amount;
  }

  // The staged food's full nutrition panel (per its serving basis). Handed to
  // FoodAmountPanel, which scales it to the typed amount for the pill preview and
  // the full breakdown — the shared body the search/scan staging and the
  // dashboard's edit-amount sheet both render (ticket #30 / #29).
  let stagedInfo = $derived(
    staged?.payload.attributes[NUTRITION_INFO_ATTR] as NutritionInfo | undefined
  );

  // The commit button's headline scales by the staged panel's OWN basis, the
  // same divisor FoodAmountPanel's preview directly above it uses (#148). A
  // hardcoded /100 here disagreed with that preview on every panel not measured
  // per 100 — a label-corrected `gtin:` twin restaged from a re-scan, say.
  let factor = $derived(amount / parseBasisQuantity(stagedInfo?.serving_size));

  // The staged food's household portions (ADR-0030), surfaced as picker presets.
  // A searched food carries them on its bundled row (ADR-0047 §6); empty (and
  // the picker renders as today) for a portion-less food.
  let stagedPortions = $derived<Portion[]>(
    (staged?.payload.attributes[FOOD_PORTIONS_ATTR] as Portion[] | undefined) ??
      []
  );
  // The food whose panel is still being read out of the Nutrient store, by
  // entity. Held as the entity rather than as a flag so it self-clears: staging
  // another food or backing out of the staged card ends the wait by definition,
  // and no `staged = null` site has to remember to reset it.
  let completingEntity = $state<string | null>(null);
  let completingPanel = $derived(
    completingEntity !== null && staged?.entity === completingEntity
  );

  // Stage a chosen food, deepening a SEARCHED USDA food's four-macro row into
  // its full panel from the bundled Nutrient store (ADR-0047 §2). No key, no
  // network and no second request: portions already ride on the row, and the
  // panel is the only thing staging still has to read — from a precached file.
  //
  // Only a searched food is deepened. A Recent food is a ledger twin carrying
  // the panel it was captured with, which the user may since have corrected from
  // a label (§7) — re-reading USDA over the top of that would silently throw the
  // correction away on the next log.
  //
  // The food is staged first and the panel lands when the store resolves, so the
  // card, its name and its portions appear on the tap. What the wait does gate
  // is the Log button (`canPrimary`): a log freezes its own macros (ADR-0022),
  // so logging inside that window would put four fields into history for ever,
  // which is the failure ADR-0047 retired the API to avoid.
  async function stageFood(item: FoodResult, searched: boolean) {
    // Staging a food ends the search session (ADR-0053 §2). A food picked off
    // the Recent list closes nothing — no session was ever open.
    endSearchSession();
    staged = item;
    amount = openingAmount(item.payload);
    if (!searched) return;
    completingEntity = item.entity;
    try {
      const completed = await completeStagedPanel(item.payload);
      // Only apply if this food is still the staged one — a fast user may have
      // gone back or staged another before the store resolved.
      if (staged?.entity === item.entity)
        staged = mapPayloadToFoodResult(completed);
    } catch {
      // Degrade to the row's four macros: a broken artifact costs the panel's
      // depth, never the user's ability to log the food.
    } finally {
      if (completingEntity === item.entity) completingEntity = null;
    }
  }

  // ── Custom entry: the full-panel "Read-along" form (ADR-0034 §2–§4, #57) ────
  // The Custom tab IS the #52 full-panel form now, not the four-macro grid. It
  // transcribes a label top-to-bottom — name + brand, macros, the
  // fats/fibre/sugar/salt detail, the twelve micros, portions — but leads with
  // Macros behind a sticky Save so the fast path stays "type name + calories →
  // Save". Values are typed in the label's unit (kcal/g/mg/µg) and stored as
  // grams via `buildLabelPanel`; an untouched or skipped row is omitted, never 0.
  let customName = $state("");
  let customBrand = $state("");
  // OFF's language-neutral "what this is" (`food/category`) as a LIST of discrete
  // canonical categories (ADR-0034 §8, #84): picked from OFF's taxonomy type-ahead
  // (CategoryPicker) instead of one comma-jammed box. Seeded by splitting a
  // twin/OFF payload's own comma-separated category, joined back on save/contribute
  // (`add_categories`), so a found-but-poor enrichment forwards what it already has.
  let customCategories = $state<string[]>([]);
  // Canonical OFF ingredients (`food/ingredients_text`) as free text — true
  // read-along (ADR-0043 §5): seeded from OFF's / the twin's own parsed
  // ingredients, corrected here, written back to `food/ingredients_text` and sent
  // to OFF as a bare `ingredients_text` (REPLACE). NB this is OFF's canonical
  // ingredients text, NOT `food/ingredients` (the ADR-0035 menu-descriptor).
  let customIngredients = $state("");
  let customBasis = $state<Basis>("per_100g");
  // The two bases a label is read against, offered unconditionally (ADR-0060 §7,
  // as amended). Both are MEASURED, which is what keeps the captured food
  // editable by amount afterwards: a per-100 panel names its own divisor, where
  // a bare "1 serving" names none — and a receipt naming none re-opened this
  // whole form when the user only wanted to say how much they ate.
  //
  // Nothing a scan reaches needs a third. Open Food Facts publishes a per-100
  // figure for every product — it computes `*_100g` even where
  // `nutrition_data_per` says `serving` — and the serving it does publish
  // arrives as a `food/portions` chip rather than as a basis (ADR-0060 §6). The
  // g-versus-ml question is answered by `product_quantity_unit`, not by
  // `nutrition_data_per`, whose enum holds no `100ml` at all (ADR-0052 §1).
  const basisOptions: { value: Basis; label: string }[] = [
    { value: "per_100g", label: "g" },
    { value: "per_100ml", label: "ml" },
  ];
  // How much is in the pack — 50, 330, 500 — as a bare magnitude. Its UNIT is
  // never typed beside it: OFF publishes the pair already split
  // (`product_quantity` / `product_quantity_unit`), so the number is the only
  // part a person supplies and the unit comes from the record, or from the
  // toggle below when the record has none.
  //
  // It exists for two jobs: it is real data OFF is missing — the reported bottle
  // is 50 ml and nothing in its record knows — and it is what stops a per-100-ml
  // contribution silently losing its numbers, since OFF has no `100ml` basis
  // value and resolves its own `100` against the pack (ADR-0060 §8).
  let customPackQuantity = $state("");
  // Per-field typed strings keyed by NutritionInfo field; "" ⇒ absent (not 0).
  let customValues = $state<Record<string, string>>({});
  let customPortions = $state<PortionRow[]>([]);
  // Portions the form has no row for, held aside so a re-save carries them
  // through untouched instead of dropping them. A millilitre portion is the one
  // that occurs (ADR-0060 §6): the portion rows type a gram weight, and a volume
  // serving is still not something this form can express.
  let carriedPortions = $state<Portion[]>([]);
  // Rows ticked "∅ not on label" — read-along ergonomics; the built panel omits
  // empty rows regardless, this only dims + locks them and drives bulk-skip.
  let skipped = $state<Set<string>>(new Set());
  // Keys the AI-confirm path prefilled and the user has not yet reviewed (§4).
  // v1 guided-manual starts empty (nothing to review); the amber accent + chip
  // are built now so the deferred model swap needs no form change.
  let prefilled = $state<Set<string>>(new Set());
  // The ordered label photos (base64), first = display (ADR-0034 §5, #58). One
  // food accepts N photos — a panel on one face, a barcode on another — appended
  // via "+ Add photo" and read across in the swipeable reader; the singular
  // `food/photo_base64` every existing surface reads is mirrored from `[0]` at
  // save time (in saveLabelFood, #56), so the array is purely additive.
  let labelPhotos = $state<string[]>([]);
  let fileInput = $state<HTMLInputElement | null>(null);
  // Open the full-screen reader on this index; null = closed.
  let readerIndex = $state<number | null>(null);

  // ── The label-capture doors (ADR-0034 §1) ──────────────────────────────────
  // The Custom form is reached five ways: a 404 (missing), a poor-quality OFF
  // twin (found-but-poor), an undecodable barcode (unreadable), the plain manual
  // tab (always-on, on a host that did not opt into the ADR-0035 chooser), and
  // that chooser's own panel tile (`panelDoor`, ADR-0087). The first three set a
  // reason banner and carry the barcode/partial payload in; the other two are a
  // fresh empty form. `barcode`
  // (already declared above) is the single key source: whatever code reached the
  // form keys the save (`gtin:` enrich vs `food:custom_` mint, §6), so the doors
  // just keep or clear it.
  // Which door routed into the Custom form — a shared alias so the union is
  // stated once, not restated at every call site (§3.1). "edit" is the fourth,
  // non-scan door: the staged card's origin badge (§7) re-opens the form on an
  // already-saved twin so the user can correct it again.
  type CaptureReason = "missing" | "poor" | "unreadable" | "edit";
  let captureReason = $state<CaptureReason | null>(null);
  // The twin being edited via the origin badge, so its save enriches THAT entity
  // in place rather than minting a duplicate (§7). Null on the fresh-capture doors.
  let editEntityId = $state<string | null>(null);
  // OFF's completeness for the found-but-poor twin, carried into the form (§1).
  let captureCompleteness = $state<number | undefined>(undefined);
  // Found-but-poor nudge on the staged card: soft, dismissible, never blocks
  // logging the poor twin as-is (§1 / user stories 1–2). Holds the OFF payload so
  // "Improve" can prefill the form from it.
  let nudge = $state(false);
  let poorPayload = $state<OffPayload | null>(null);
  // OFF's own product photos for the found-but-poor twin (remote URLs), shown as
  // a read-only reference strip so the user can read the label off them while
  // filling the form (ADR-0034 §8 read-feature). NOT the user's captured photos —
  // never merged into `labelPhotos`, never saved (they live in raw_provenance).
  let offRefPhotos = $state<string[]>([]);
  // The unit OFF holds this pack in, read off the same provenance as the photos
  // above. Not shown anywhere: it exists so a contribution can tell whether OFF
  // would read our per-100 figures in the unit we measured them in (ADR-0060
  // §8). Undefined for a barcode OFF has no record of, which reads as grams.
  let offPackUnit = $state<string | undefined>(undefined);
  // What the pack — and therefore the panel — is measured in. It is ONE control
  // and it is always the user's: Open Food Facts seeds it (through
  // `invertServingSize`, which reads the basis the mapper stamped from
  // `product_quantity_unit`) and never overrules. An earlier build hid the
  // control whenever OFF had an opinion, which left a record like the reported
  // oil — sized in nothing, panelled in grams — with no way to be corrected by
  // the one person holding the bottle.
  // The basis the panel is actually built and contributed against. **The pack
  // decides it whenever the pack says anything**: a 330 ml bottle's per-100
  // figures are per 100 ml and there is nothing to ask, which is Open Food
  // Facts' own model — it has no per-panel unit at all, and resolves its `100`
  // against `product_quantity_unit`. Asking the same question twice was the
  // muddle: the two controls could disagree, and the disagreement was what
  // silently withheld a contribution's numbers.
  //
  // `customBasis` is only consulted where the pack CANNOT answer — a product
  // nobody has sized, which is exactly the reported bottle's situation and the
  // one case the toggle still appears for.
  // The one unit in play, read three ways so they cannot disagree: it sits
  // beside the pack's magnitude, it is the panel's basis, and it is the unit the
  // contributed `quantity` is spelled in.
  let effectiveUnit = $derived<"g" | "ml">(
    customBasis === "per_100ml" ? "ml" : "g"
  );
  // The pack size as OFF's own writable `quantity` field wants it: magnitude and
  // unit rejoined. Absent when no magnitude was given, so an untouched field
  // never overwrites a size OFF already holds.
  let packSizeForOff = $derived(
    customPackQuantity.trim()
      ? `${customPackQuantity.trim()} ${effectiveUnit}`
      : ""
  );

  // Whether a contribution would keep its numbers to itself, asked of the same
  // reader that decides it (ADR-0060 §8). Unreachable while a pack size names a
  // unit — the basis is that unit — so it speaks only for an unsized pack.
  let contributionLosesNumbers = $derived(
    contributionWithholdsNutriments(
      resolveServingSize(customBasis),
      packSizeForOff,
      offPackUnit
    )
  );
  // Open the read-only OFF reference reader on this index; null = closed.
  let refReaderIndex = $state<number | null>(null);
  // The OFF payload carried into the form by the found-but-poor door, so the host
  // ingests it beside the correction — its `provenance/raw` survives and the
  // enriched `gtin:` twin is genuinely dual-origin (ADR-0034 §6/§7). Null for the
  // missing/unreadable/manual doors, which have no OFF record to preserve.
  let captureOffPayload = $state<EntityPayload | null>(null);
  // What leaving the capture form returns to: the card it was opened from, and
  // the method that card belonged to. Null when the form WAS the entry point (a
  // missing/unreadable barcode door, or a dashboard edit that opens straight
  // onto it) — then back falls through to the scan view as before.
  let captureReturn = $state<{ food: FoodResult; method: string } | null>(null);
  // Which food the form's current draft belongs to (`reason:entity`). Re-opening
  // the same door for the same food keeps what the user typed rather than
  // re-prefilling over it — backing out to check the card is not "discard".
  let captureDraftKey = $state<string | null>(null);
  // The panel door (ADR-0087): the intent chooser's fourth tile opens the SAME
  // label form, so on a host running the chooser this is what says which of the
  // two Custom surfaces is showing. It is a flag rather than a fifth
  // `CaptureReason` because every reason states why a SCAN landed here and
  // renders a banner saying so; this door was chosen, has nothing to explain,
  // and leaves alone the method tabs a scan door hides.
  //
  // True only while the Custom tab is showing that form: `switchMethod` clears it
  // on any method change, and each barcode/edit door clears it as it seizes the
  // form. So it needs no guards of its own to drive the back button.
  let panelDoor = $state(false);
  // Unreadable door: the scanner elevates a "photograph the label" escape after a
  // persistent failure. A tunable threshold (~10 s), not a hard requirement (#48).
  const UNREADABLE_ELEVATE_MS = 10_000;
  let scanStalled = $state(false);
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  // Explainer handoff seams (#92, ADR-0043 §2). The card owns the tappable
  // marks and derives every verdict from the staged twin itself; each seam just
  // parks what its mark handed up, and the sheet mounts off that state.
  let novaExplain = $state<NovaVerdict | null>(null);
  function explainNova(v: NovaVerdict) {
    novaExplain = v;
  }

  // Source explainer seam: tapping the source tag parks its origin here.
  let sourceExplain = $state<FoodSourceKind | null>(null);
  // Dietary explainer seam: tapping a dietary tag parks the verdict here (all the
  // present claims share one explainer, so any tag opens the same sheet).
  let dietaryExplain = $state<DietaryVerdict | null>(null);

  // Reason-specific copy shown at the top of the Custom form per door (§1).
  const CAPTURE_COPY: Record<CaptureReason, string> = {
    missing:
      "This barcode isn’t in Open Food Facts yet — add it here and it’s yours on the next scan.",
    poor: "Open Food Facts only had partial data for this — fill in what’s missing from the label.",
    unreadable:
      "Couldn’t read the barcode. Enter the label details here; add the digits below if you can read them.",
    edit: "Editing this entry — adjust anything from the label and save to update it.",
  };

  // What a scan says when Open Food Facts did not answer (#204). It has to name
  // the service and say the barcode is not the problem, because the sentence it
  // replaces — CAPTURE_COPY.missing — said the opposite and sent the user off to
  // type in a pack OFF already holds.
  const OFF_UNREACHABLE_COPY =
    "Couldn’t reach Open Food Facts — the service is busy or down, not missing this barcode. Try again in a moment.";

  // Route one of the doors into the Custom form: set the reason banner, keep the
  // barcode (already in `barcode` state), and prefill from a partial OFF payload
  // when the door carries one (found-but-poor). Missing/unreadable start empty.
  function openCaptureForm(
    reason: CaptureReason,
    payload?: OffPayload,
    completeness?: number
  ) {
    // Captured BEFORE the switch below, so back can restore both.
    captureReturn = staged ? { food: staged, method } : null;
    const draftKey = `${reason}:${payload?.entity ?? barcode.trim()}`;
    const returningToDraft = captureDraftKey === draftKey;
    captureDraftKey = draftKey;
    method = "custom";
    staged = null;
    status = "idle";
    error = "";
    nudge = false;
    captureReason = reason;
    captureCompleteness = completeness;
    // A scan door owns the form it opens: whatever the chooser's panel tile left
    // behind, this is now a barcode capture with a banner and no tabs.
    panelDoor = false;
    // A scan door is a fresh capture, never an in-place edit of an existing twin.
    editEntityId = null;
    // Only the found-but-poor door preserves an OFF record beside the correction.
    captureOffPayload = reason === "poor" ? (payload ?? null) : null;
    // Re-entering the same capture keeps the draft; a different food (or a
    // different door onto it) starts from the source's own values again.
    if (!returningToDraft) {
      if (payload) prefillFromPayload(payload);
      else resetCustomForm();
    }
    // Desktop upload path: the photo that was dropped/chosen to reach this door
    // rides in as the label photo, so a desktop capture arrives with its photo
    // attached exactly as a phone capture would (both reset labelPhotos above).
    if (uploadedPhoto) labelPhotos = [uploadedPhoto];
  }

  // The chooser's fourth tile (ADR-0087 §2): the same label form, opened by
  // choice rather than by a scan. No reason banner and therefore no barcode
  // field, so the save mints `food:custom_` and never keys `gtin:` (§4) — the
  // pack in your hand has a barcode and the Scan tab is one tap away.
  //
  // Keyed like the scan doors are, on a `manual:` key naming no food, so backing
  // out to the chooser and returning keeps twenty typed numbers. What ends the
  // draft is leaving the sheet: the log sheet is mounted behind an `{#if}` and
  // takes this whole component with it, so the next visit starts blank. A tap on
  // the Custom tab clears the key too, for a host that shows the tabs.
  function openPanelForm() {
    const draftKey = "manual:";
    const returningToDraft = captureDraftKey === draftKey;
    captureDraftKey = draftKey;
    status = "idle";
    error = "";
    // Nothing carried in: no OFF record, no twin to enrich, no code to key on.
    captureOffPayload = null;
    captureReturn = null;
    editEntityId = null;
    barcode = "";
    if (!returningToDraft) resetCustomForm();
    panelDoor = true;
  }

  // Blank every custom-form field back to a fresh empty read-along form.
  function resetCustomForm() {
    applyAutofill(emptyAutofillResult());
    customCategories = [];
    customIngredients = "";
    customPackQuantity = "";
    customPortions = [];
    carriedPortions = [];
    skipped = new Set();
    labelPhotos = [];
    offRefPhotos = [];
    offPackUnit = undefined;
  }

  // Seed the Custom form from a partial OFF payload (found-but-poor door): name
  // (dropping the "Unknown" placeholder), brand, whatever nutriments OFF carried
  // (typed back into the label's units), and its portions — all editable, none
  // marked "unverified" (that amber accent is the deferred AI-confirm path, §4).
  function prefillFromPayload(payload: OffPayload) {
    const attrs = payload.attributes;
    const name = (attrs["food/name"] as string | undefined) ?? "";
    customName = name === "Unknown" ? "" : name;
    customBrand = (attrs["food/brand"] as string | undefined) ?? "";
    // OFF already read the taxonomy into food/category (a comma list) — split it
    // into discrete chips so enriching a poor twin (and any OFF contribution)
    // forwards the identity it already has (#84).
    customCategories = parseCategoryList(
      attrs["food/category"] as string | undefined
    );
    // True read-along (ADR-0043 §5): show OFF's own parsed ingredients so the user
    // corrects them in place; the corrected value flows back to OFF on contribute.
    customIngredients =
      (attrs["food/ingredients_text"] as string | undefined) ?? "";
    const info = attrs[NUTRITION_INFO_ATTR] as NutritionInfo | undefined;
    // An OFF panel is per 100 of the pack's own base unit — grams, or millilitres
    // for a drink (#148). The form matches whichever the mapper stamped.
    customBasis = invertServingSize(info?.serving_size);
    const values: Record<string, string> = {};
    for (const f of ALL_FIELDS) {
      const grams = info?.[f.key];
      values[f.key] = typeof grams === "number" ? toDisplay(grams, f.unit) : "";
    }
    customValues = values;
    prefilled = new Set();
    skipped = new Set();
    seedPortionRows(attrs[FOOD_PORTIONS_ATTR] as Portion[] | undefined);
    // The user starts with no captured photos of their own here.
    labelPhotos = [];
    // OFF's own photos ride alongside as a read-only reference to read the label
    // off — never merged into the user's capture set, never saved.
    offRefPhotos = payload.referenceImages ?? [];
    offPackUnit = offPackUnitFromTwin(payload.attributes);
    customPackQuantity = String(
      offPackQuantityFromTwin(payload.attributes) ?? ""
    );
  }

  // Re-open the label form on a twin (the staged card's origin badge §7, and the
  // dashboard's "edit this logged food"): prefill every field from the twin's own
  // saved data — its name, brand, categories, ingredients, panel (in its stored
  // basis), portions, and the user's OWN captured photos — and pin `editEntityId`
  // to the twin so the re-save enriches THAT entity in place rather than minting a
  // duplicate. A `gtin:` twin also re-derives its barcode so the key-follows-the-
  // barcode contract (§6) and the OFF-contribution offer keep working.
  //
  // The twin is the ONLY honest seed for an edit: a logged event freezes just the
  // four headline macros, so seeding from one would silently drop the brand, the
  // rest of the panel, the portions, the photos and the entity itself.
  function openEditForm(entity: string, attrs: Record<string, any>) {
    captureReturn = staged ? { food: staged, method } : null;
    captureDraftKey = `edit:${entity}`;
    method = "custom";
    status = "idle";
    error = "";
    nudge = false;
    captureReason = "edit";
    captureCompleteness = undefined;
    panelDoor = false;
    // The twin already IS the record — nothing to preserve beside it (unlike poor).
    captureOffPayload = null;
    editEntityId = entity;
    const gtin = /^gtin:(.+)$/.exec(entity);
    barcode = gtin ? gtin[1] : "";
    // "Unknown" is the OFF mapper's placeholder for a product with no
    // `product_name`, not something the user typed — open the field empty rather
    // than making them delete it, exactly as the found-but-poor door does.
    const twinName = (attrs["food/name"] as string | undefined) ?? "";
    customName = twinName === "Unknown" ? "" : twinName;
    customBrand = (attrs["food/brand"] as string | undefined) ?? "";
    customCategories = parseCategoryList(
      attrs["food/category"] as string | undefined
    );
    // Read-along: re-open the twin's own saved ingredients for further correction.
    customIngredients =
      (attrs["food/ingredients_text"] as string | undefined) ?? "";
    const info = attrs[NUTRITION_INFO_ATTR] as NutritionInfo | undefined;
    // Invert the stored `serving_size` back onto the #52 basis toggle, through the
    // same mapping that resolved it on save.
    customBasis = invertServingSize(info?.serving_size);
    const values: Record<string, string> = {};
    for (const f of ALL_FIELDS) {
      const grams = info?.[f.key];
      values[f.key] = typeof grams === "number" ? toDisplay(grams, f.unit) : "";
    }
    customValues = values;
    // Editing your own saved values — nothing is "unverified" (no amber accent).
    prefilled = new Set();
    skipped = new Set();
    seedPortionRows(attrs[FOOD_PORTIONS_ATTR] as Portion[] | undefined);
    // The twin's own captured photos re-open in the user's capture set (editable),
    // not as OFF reference shots — this is the user editing their own capture.
    const photos = attrs["food/label_photos"] as string[] | undefined;
    labelPhotos = photos ?? [];
    // OFF's own label shots ride alongside, read-only, recovered from the twin's
    // stored provenance. Without this an OFF product had NO photo on this screen
    // the moment its twin was in the ledger — the live `referenceImages` are a
    // read-through that a saved twin (or a second scan of the same barcode)
    // never carries, so the one surface for reading the label off went blank.
    offRefPhotos = offReferenceImagesFromTwin(attrs);
    offPackUnit = offPackUnitFromTwin(attrs);
    customPackQuantity = String(offPackQuantityFromTwin(attrs) ?? "");
    staged = null;
  }

  /** The staged card's pencil: edit the twin currently on the card. */
  function editStaged() {
    if (!staged) return;
    openEditForm(staged.entity, staged.payload.attributes);
  }

  // Initialise the form from an AIAutofillResult — the seam that serves BOTH
  // extraction modes (§4): v1 feeds it the empty guided-manual result (all rows
  // blank, nothing prefilled); the deferred AI-confirm path feeds a populated one
  // and the touched keys light up amber until reviewed. Never calls the stub.
  function applyAutofill(result: AIAutofillResult) {
    customName = result.name ?? "";
    customBrand = result.brand ?? "";
    customBasis = result.basis;
    const values: Record<string, string> = {};
    const pre = new Set<string>();
    for (const f of ALL_FIELDS) {
      const grams = result.nutrition[f.key];
      if (typeof grams === "number") {
        values[f.key] = toDisplay(grams, f.unit);
        pre.add(f.key);
      } else {
        values[f.key] = "";
      }
    }
    customValues = values;
    prefilled = pre;
  }
  applyAutofill(emptyAutofillResult());

  // The read-along sections, in transcription order. CORE rows carry the host's
  // e2e ids so the existing custom-entry selectors keep working.
  let idFor = $derived<Record<string, string | undefined>>({
    calories: ids.customCal,
    protein_content: ids.customProt,
    fat_content: ids.customFat,
    carbohydrate_content: ids.customCarb,
  });
  const customSections: {
    head: string;
    hint: string | null;
    fields: FieldDef[];
  }[] = [
    { head: "Macros", hint: "the must-haves", fields: CORE },
    { head: "Fats, fibre, sugar & salt", hint: null, fields: DETAIL },
    {
      head: "Vitamins & minerals",
      hint: "rarely all on one label",
      fields: MICROS,
    },
  ];
  const customFilled = (key: string) => (customValues[key] ?? "").trim() !== "";
  // AI-confirm: how many prefilled rows are still unverified (0 in guided-manual).
  let toReview = $derived(prefilled.size);
  let runningKcal = $derived((customValues["calories"] ?? "").trim());
  // The panel the form would save/contribute right now (grams, absent ≠ 0). One
  // pure derivation shared by the Save path and the OFF-contribution path, so the
  // two never assemble it from the same four fields independently.
  let builtPanel = $derived(
    buildLabelPanel({
      values: customValues,
      basis: customBasis,
      skipped,
    })
  );

  // Editing a prefilled row IS verifying it — clear the amber "unverified" accent.
  function markReviewed(key: string) {
    if (prefilled.has(key)) {
      prefilled.delete(key);
      prefilled = new Set(prefilled);
    }
  }
  function toggleSkip(key: string) {
    if (skipped.has(key)) skipped.delete(key);
    else {
      skipped.add(key);
      customValues[key] = "";
      markReviewed(key);
    }
    skipped = new Set(skipped);
  }
  // One tap clears a whole section: mark every still-empty row "not on label".
  function skipSection(fields: FieldDef[]) {
    for (const f of fields)
      if (!customFilled(f.key)) {
        skipped.add(f.key);
        markReviewed(f.key);
      }
    skipped = new Set(skipped);
  }

  // ── OFF contribution (ADR-0034 §8) ─────────────────────────────────────────
  // Give a corrected barcoded twin back to Open Food Facts. Offered ONLY when the
  // form is keyed to a barcode (a `gtin:` twin — `barcode` holds the code that
  // reached the form) AND the user has an OFF login (#60). A barcode-less
  // `food:custom_` capture has nothing to upsert under, so it never offers.
  let hasOffLogin = $derived(
    !!$secretsStore.off_user_id.trim() && !!$secretsStore.off_password
  );
  let contributeOffered = $derived(
    method === "custom" && !!barcode.trim() && hasOffLogin
  );
  // Model-C consent: the per-capture checkbox is ALWAYS shown before a submit and
  // must be ticked every time. **This tick is the consent** — the settings switch
  // it is seeded from is a default and nothing more, which is why that one is a
  // device setting rather than a datom (ADR-0086 §2).
  // Seed once each time the offer (re)appears, so flipping the default later
  // doesn't silently re-check a box the user cleared.
  let contributeChecked = $state(false);
  let contributeSeeded = false;
  $effect(() => {
    if (contributeOffered && !contributeSeeded) {
      contributeChecked = $offContributeDefault;
      contributeSeeded = true;
    } else if (!contributeOffered) {
      contributeSeeded = false;
    }
  });
  // Online-only with manual retry: the button persists so a failed/deferred send
  // can be retried, and the outcome is surfaced inline (never a close-race).
  let contributeStatus = $state<"idle" | "sending">("idle");
  let contributeResult = $state<OffSubmitResult | null>(null);

  async function contributeToOff() {
    if (!contributeChecked || !barcode.trim() || contributeStatus === "sending")
      return;
    contributeStatus = "sending";
    contributeResult = null;
    // Contribute the SAME panel the form would save — structured data only, no
    // photo (§8). The seam reads the OFF login from localStorage itself (#60).
    try {
      contributeResult = await submitToOpenFoodFacts(barcode.trim(), {
        name: customName.trim(),
        brand: customBrand.trim() || undefined,
        category: customCategories.join(", ") || undefined,
        // Bare `ingredients_text`, REPLACE + suppress-when-empty (ADR-0043 §5);
        // buildOffWriteBody drops it when blank, so an untouched field can't wipe OFF.
        ingredientsText: customIngredients.trim() || undefined,
        // The pack's own unit, so a per-100 panel measured in the other one
        // keeps its numbers to itself rather than mislabelling OFF (ADR-0060 §8).
        packQuantityUnit: offPackUnit,
        // The pack size settles what our per-100 counts, so the nutriments go
        // with it instead of staying home (ADR-0060 §8, as amended).
        packSize: packSizeForOff || undefined,
        nutrition: builtPanel.nutrition,
      });
    } finally {
      contributeStatus = "idle";
    }
  }

  // One-time seed for edit mode. The food case can resolve asynchronously (after
  // the host fetches the twin), so this applies whenever `seed` first arrives.
  let seeded = false;
  $effect(() => {
    if (!seed || seeded) return;
    seeded = true;
    if (seed.kind === "food") {
      staged = seed.food;
      amount = seed.amount;
    } else if (seed.kind === "edit_twin") {
      // Same screen the staged card's pencil opens, seeded from the same twin.
      openEditForm(seed.entity, seed.attributes);
    } else if (seed.kind === "manual") {
      // A manual-entry edit: just switch to the Custom method so ManualEntryFlow
      // renders (`showManualFlow`); it prefills its own mini-form from this seed.
      method = "custom";
    } else {
      method = "custom";
      customName = seed.name;
      if (seed.brand) customBrand = seed.brand;
      if (seed.category) customCategories = parseCategoryList(seed.category);
      if (seed.ingredientsText) customIngredients = seed.ingredientsText;
      // Edit mode carries the singular frozen photo; seed it as the array's first.
      labelPhotos = seed.photo_base64 ? [seed.photo_base64] : [];
      // Re-open the four macro rows from the edited per-serving entry (strings,
      // already in kcal/g — the CORE units — so they seed straight in). The
      // full-panel doors (#59) prefill the rest of the panel; edit mode carries
      // only the four macros a logged custom entry froze.
      customValues = {
        ...customValues,
        calories: seed.calories,
        protein_content: seed.protein,
        fat_content: seed.fat,
        carbohydrate_content: seed.carbs,
      };
    }
  });

  // Clearing the staged food from the host header (back / "Change food") returns
  // to the current method's flow; drop any stale error the staged view showed.
  let wasStaged = false;
  $effect(() => {
    const nowStaged = !!staged;
    if (wasStaged && !nowStaged) {
      status = "idle";
      error = "";
    }
    wasStaged = nowStaged;
  });

  // The query whose results are currently held, so returning to the list from a
  // staged food (via "Change food") shows the cached results instead of firing
  // the search again. Plain let — not an $effect dependency.
  let lastQuery = "";
  let debounceTimer: ReturnType<typeof setTimeout>;
  // How long typing has to settle before the search runs. This is a coalescer
  // for a mid-word burst, NOT a network guard: the 400 ms it replaces was sized
  // for the FDC API's 717–980 ms round trip and its request quota, and searching
  // the bundled corpus (ADR-0047) costs 13 ms from keystroke to painted results
  // at desktop speed, 28 ms at 4x CPU throttle. Firing on every keystroke was
  // measured smooth — nine consecutive searches held a 2–7 ms median frame — so
  // the value sits under a fast typist's inter-key interval and lets the results
  // track the word instead of waiting for it.
  const SEARCH_DEBOUNCE_MS = 120;

  // ── The search log's session (ADR-0053 §2, #149) ───────────────────────────
  // One entry per search session, never one per debounced search: the search effect
  // below fires roughly eleven times across `raw aubergine`, ten of them
  // keystroke states. The session opens when the field first goes non-empty and
  // closes when the user clears it, stages a food, or leaves the sheet — and it
  // only leaves an entry behind if it ever reached an empty result. A plain
  // `let`, because nothing renders it and an `$state` would make the effect that
  // updates it depend on itself.
  let searchSession: SearchSession | null = null;

  function endSearchSession() {
    if (!searchSession) return;
    // Never awaited: a log that could not be written must cost the user nothing
    // (ADR-0054 §3).
    void recordSearchSession(searchSession);
    searchSession = null;
  }

  onDestroy(endSearchSession);

  $effect(() => {
    const trimmed = query.trim();
    if (method !== "search" || staged) return;
    clearTimeout(debounceTimer);
    if (trimmed.length === 0) {
      results = [];
      status = "idle";
      error = "";
      emptySearch = null;
      lastQuery = "";
      // Clearing the field is one of the three ways a session ends, and the
      // session closes on the state it had BEFORE the clear — otherwise every
      // cleared session would look abandoned mid-word (ADR-0053 §2).
      endSearchSession();
    } else {
      searchSession = typedIntoSession(
        searchSession ?? beginSearchSession(),
        trimmed
      );
      if (
        trimmed.length >= 3 &&
        // Skip if these results already match the query (e.g. we just came back
        // from staging a food); a failed query is not cached, so it can retry.
        !(trimmed === lastQuery && status !== "error")
      ) {
        // No pre-emptive "loading" here. It existed to acknowledge the 400 ms
        // wait above, and at 120 ms it only strobes the in-field spinner —
        // measured at ten mount/unmount transitions across one typed word.
        // `handleSearch` still sets it, so the one search that can genuinely be
        // slow (the first, with the corpus still being fetched and read) still
        // says so.
        debounceTimer = setTimeout(() => handleSearch(), SEARCH_DEBOUNCE_MS);
      }
    }
    return () => clearTimeout(debounceTimer);
  });

  // ── Search combobox (issue #65) ────────────────────────────────────────────
  // The search field and its results are one bits-ui Combobox: the field is a
  // role=combobox in the dock, the results a role=listbox rendered INLINE in the
  // stage above via Combobox.ContentStatic — bits' documented opt-out from the
  // floating popover, so the results keep filling the sheet body instead of
  // becoming an overlay. That single primitive supplies the roles,
  // aria-activedescendant, ArrowDown-into-results traversal and Enter-to-select
  // the hand-rolled input + button list never had. Headless behaviour, brutalist
  // skin via a scoped `child` snippet — the same split as the Tabs switcher (#64).
  //
  // The listbox lists the recent foods while the query is empty and the async
  // USDA/OFF matches otherwise; `comboItems` is whichever list is on screen, used
  // both to render the options and to resolve a selected option id back to its
  // FoodResult. It is kept force-open in search mode so the recent list shows
  // without a prior interaction (a popover would stay hidden until focus/typing);
  // Escape-to-dismiss therefore doesn't apply — there is no overlay to close, the
  // listbox is a permanent inline region.
  let comboItems = $derived<FoodResult[]>(
    query.trim().length === 0 ? recent : results
  );
  // `entity` is the option value. Selection is controlled and reset to "" after
  // each pick, so choosing the same food again after unstaging ("Change food")
  // re-fires onValueChange (bits skips a no-op value change).
  let comboValue = $state("");
  function selectFromCombobox(v: string) {
    if (!v) return;
    const item = comboItems.find((f) => f.entity === v);
    comboValue = "";
    // Which list the option came off decides whether its panel is deepened, and
    // the query is what chose that list: the results are bundled rows, the
    // recent list is ledger twins.
    if (item) stageFood(item, query.trim().length > 0);
  }

  // ── Camera barcode scanning ────────────────────────────────────────────────
  let videoEl = $state<HTMLVideoElement | null>(null);
  let scanning = false;
  let stream: MediaStream | null = null;
  let detector: any = null;
  let scanError = $state("");
  let rafId: number | null = null;

  // Warm-up: hold off the per-frame detection loop for a moment after the camera
  // opens, so the preview can focus/expose without the detect() calls competing
  // with it and stuttering the feed the instant the sheet appears. Only the phone
  // reaches here (desktop has no live camera; it uses the upload dropzone).
  const CAMERA_WARMUP_MS = 2_000;
  let warmupTimer: ReturnType<typeof setTimeout> | null = null;

  // zxing second-opinion for the LIVE camera: the native `BarcodeDetector` is
  // fast and battery-cheap but gives up on hard real-world frames (angled, glare,
  // low-contrast packs). So after a short no-decode stretch, quietly hand the
  // current video frame to zxing-wasm on an interval — whichever decoder reads
  // the code first wins. This runs ONLY alongside the native scanner (desktop has
  // no camera; it uses the upload dropzone), and only after the stall, so the
  // common fast-native case pays nothing.
  const ZXING_FALLBACK_AFTER_MS = 4_000;
  const ZXING_FALLBACK_EVERY_MS = 1_200;
  let fallbackDelay: ReturnType<typeof setTimeout> | null = null;
  let fallbackTimer: ReturnType<typeof setInterval> | null = null;
  let fallbackBusy = false;

  // The live-camera scanner needs the native `BarcodeDetector`, which desktop
  // Chrome/Firefox don't ship — so where it's absent (desktop), the Scan tab
  // becomes a photo-UPLOAD dropzone instead, decoding the barcode from a still
  // image via the zxing-wasm ponyfill (ADR-0034 §5 capture, desktop path). A
  // plain const: native support doesn't change during a session.
  const liveScanSupported =
    typeof window !== "undefined" && "BarcodeDetector" in window;
  // Show the live camera only where it's both supported AND working: if the
  // camera is denied/absent on an otherwise-capable device, `startCamera` sets
  // `scanError` and we fall back to the upload dropzone rather than dead-ending.
  let showLiveScanner = $derived(liveScanSupported && !scanError);

  // Upload path (desktop) state. `uploadedPhoto` is the read-in image (base64):
  // it both feeds the decoder AND is carried into the capture form as the label
  // photo when a door opens, so a desktop capture arrives with its photo attached.
  let uploadInput = $state<HTMLInputElement | null>(null);
  let dragOver = $state(false);
  let decoding = $state(false);
  let uploadError = $state("");
  let uploadedPhoto = $state<string | null>(null);
  // Set when a dropped/chosen photo carried no readable barcode, so the tab can
  // offer the same "enter the label details" escape the camera's stall does.
  let uploadNoCode = $state(false);

  $effect(() => {
    // Only drive the camera where the live scanner is actually shown; on desktop
    // the dropzone is used instead, so never prompt for camera access there.
    if (method === "scan" && !staged && liveScanSupported) startCamera();
    else stopCamera();
    return () => stopCamera();
  });

  async function startCamera() {
    if (scanning || !videoEl) return;
    try {
      if (!("BarcodeDetector" in window)) {
        scanError =
          "Barcode scanning is not supported by this browser. Enter the number manually.";
        return;
      }
      detector = new (window as any).BarcodeDetector({
        // The ponyfill's list, so the camera and a dropped photo decode alike.
        formats: [...SCAN_FORMATS],
      });
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      videoEl.srcObject = stream;
      videoEl.play();
      scanning = true;
      scanError = "";
      scanRejected = "";
      scanStalled = false;
      // Let the camera settle before detection begins (see CAMERA_WARMUP_MS). The
      // stall + zxing-fallback clocks start with the scan loop, not the camera, so
      // their "N seconds of no decode" windows count actual scanning time.
      if (warmupTimer) clearTimeout(warmupTimer);
      warmupTimer = setTimeout(() => {
        warmupTimer = null;
        // Bail if the camera was stopped during the warm-up.
        if (!scanning) return;
        // Unreadable door (§1): after a persistent no-decode stretch, elevate the
        // "photograph the label" escape from the quiet inline link to a prominent
        // affordance. Cleared the moment a code decodes or the camera stops.
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(
          () => (scanStalled = true),
          UNREADABLE_ELEVATE_MS
        );
        // Sooner than the escape button: after a brief native-only stall, start
        // the quiet zxing second opinion. Cleared the instant any decoder wins or
        // the camera stops.
        if (fallbackDelay) clearTimeout(fallbackDelay);
        fallbackDelay = setTimeout(startZxingFallback, ZXING_FALLBACK_AFTER_MS);
        rafId = requestAnimationFrame(scanFrame);
      }, CAMERA_WARMUP_MS);
    } catch {
      scanError = "Camera access denied or unavailable.";
      scanning = false;
    }
  }

  // Poll the live frame with zxing on an interval, in parallel with the native
  // rAF loop. A single frame may be blurry, so it retries until one reads.
  function startZxingFallback() {
    if (fallbackTimer || !scanning) return;
    fallbackTimer = setInterval(runZxingFallbackFrame, ZXING_FALLBACK_EVERY_MS);
  }

  async function runZxingFallbackFrame() {
    // Skip if a decode is already in flight (each can take tens of ms) or the
    // video isn't ready; the next tick retries.
    if (!scanning || !videoEl || fallbackBusy || videoEl.readyState < 2) return;
    fallbackBusy = true;
    try {
      const code = await decodeBarcode(videoEl);
      // Re-check `scanning` after the await: the native loop may have won during
      // the decode, in which case it already stopped the camera and looked up.
      if (code && scanning) await tookScannedCode(code);
    } finally {
      fallbackBusy = false;
    }
  }

  // What the scanner just read, which is no longer always a barcode
  // (ADR-0074 §4). A message here is NOT `scanError`: that one means the camera
  // itself is unusable and swaps the whole tab for the upload dropzone, and a
  // QR that turned out to be a menu is not a broken camera. This says so over a
  // live preview and lets the loop carry on, so pointing at the right thing is
  // the whole of the recovery.
  let scanRejected = $state("");

  /**
   * Routes one decode: a barcode to the lookup it has always had, a **Send
   * code** up to the host, and anything else to a line over the preview.
   *
   * The camera stops only on the two that lead somewhere. A rejected code keeps
   * scanning, because the same frame is still in view and the person's next act
   * is to move the phone.
   */
  async function tookScannedCode(raw: string) {
    const read = readScannedCode(raw);

    if (read.kind === "barcode") {
      scanRejected = "";
      barcode = read.digits;
      stopCamera();
      await handleBarcodeLookup();
      return;
    }

    if (read.kind === "meal" && onMealCode) {
      scanRejected = "";
      stopCamera();
      onMealCode(read.code);
      return;
    }

    scanRejected = rejectionLine(read.kind);
  }

  /**
   * A Send code that arrived by paste rather than through the lens
   * (ADR-0082 §13).
   *
   * It stops the camera for the reason a decoded meal code does: the surface it
   * opens replaces this one, and a live preview left running behind it holds
   * the device's camera for a screen nobody is looking at.
   */
  function takePastedMealCode(code: SendCode) {
    scanRejected = "";
    stopCamera();
    onMealCode?.(code);
  }

  /** Why a decode went nowhere, in one line — ADR-0074 §6's shape. */
  function rejectionLine(kind: "meal" | "broken" | "neither"): string {
    if (kind === "meal")
      return "That is a meal somebody is handing over. Scan it from a meal instead.";
    if (kind === "broken")
      return "That meal code is damaged. Ask them to show you a new one.";
    return "That is a code, but it is neither a barcode nor a meal.";
  }

  function stopCamera() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (warmupTimer) {
      clearTimeout(warmupTimer);
      warmupTimer = null;
    }
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (fallbackDelay) {
      clearTimeout(fallbackDelay);
      fallbackDelay = null;
    }
    if (fallbackTimer) {
      clearInterval(fallbackTimer);
      fallbackTimer = null;
    }
    fallbackBusy = false;
    scanStalled = false;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    scanning = false;
  }

  async function scanFrame() {
    if (!scanning || !videoEl || !detector) return;
    if (videoEl.readyState >= 2) {
      try {
        const codes = await detector.detect(videoEl);
        if (codes.length > 0) {
          await tookScannedCode(codes[0].rawValue);
          // A code the stager could not use leaves the loop running, so the
          // preview stays live while the person moves the phone.
          if (!scanning) return;
        }
      } catch {
        // ignore per-frame detection errors
      }
    }
    rafId = requestAnimationFrame(scanFrame);
  }

  // ── Desktop photo-upload scanning ──────────────────────────────────────────
  // A dropped or chosen photo is read to base64 (so it can ride into the capture
  // form as the label photo) and decoded for a barcode. A decoded code drives the
  // exact same `handleBarcodeLookup` the camera does, so all four doors behave
  // identically; a photo with no readable code offers the "enter the label
  // details" escape (the unreadable door), photo still attached.
  async function handleUploadFiles(files: FileList | File[]) {
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    uploadError = "";
    uploadNoCode = false;
    decoding = true;
    try {
      uploadedPhoto = await readImageAsDataUrl(file);
    } catch {
      decoding = false;
      uploadError = "Couldn’t read that image file.";
      return;
    }
    try {
      const code = await decodeBarcodeFromImage(file);
      if (code) {
        const read = readScannedCode(code);
        decoding = false;
        if (read.kind === "barcode") {
          barcode = read.digits;
          await handleBarcodeLookup();
          return;
        }
        // A screenshot of somebody's Send code reads here exactly as the camera
        // reads their screen (ADR-0074 §4), which is the same door.
        if (read.kind === "meal" && onMealCode) {
          onMealCode(read.code);
          return;
        }
        // Not the unreadable door: the photo carried a code and it was read.
        // Offering "enter the label details" for a menu QR would be an escape
        // from a problem the person does not have.
        uploadError = rejectionLine(read.kind);
        return;
      }
      // No barcode in the photo — let the user type it or go straight to the form.
      uploadNoCode = true;
      uploadError =
        "Couldn’t read a barcode in that photo. Type the number below, or enter the label details.";
    } catch {
      uploadError =
        "The barcode reader couldn’t load. Type the number below instead.";
    } finally {
      decoding = false;
    }
  }

  function handleUploadChange(e: Event) {
    const input = e.target as HTMLInputElement;
    // Snapshot to a real array BEFORE clearing: `input.files` is a LIVE FileList,
    // so reading it after `input.value = ""` would see an empty list.
    const files = Array.from(input.files ?? []);
    // Clear so re-choosing the same file fires change again.
    input.value = "";
    if (files.length) void handleUploadFiles(files);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const files = e.dataTransfer?.files;
    if (files?.length) void handleUploadFiles(files);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleSearch() {
    clearTimeout(debounceTimer);
    if (!query.trim()) return;
    status = "loading";
    error = "";
    emptySearch = null;
    results = [];
    staged = null;
    try {
      const search = await searchUsdaFoods(query);
      results = search.results;
      lastQuery = query.trim();
      status = "idle";
      if (searchSession)
        searchSession = searchFoundFood(
          searchSession,
          query,
          search.rescued_by_vocabulary
        );
    } catch (e: any) {
      // An empty result is an answer, not a fault (ADR-0047 §10). Cache the
      // query as if it had succeeded: the corpus did answer, and a settled
      // outcome must not re-fire the search. A failure to reach the corpus at
      // all is NOT this, and still reads as one.
      if (e instanceof NoReferenceFoodError) {
        emptySearch = { query: query.trim() };
        lastQuery = query.trim();
        status = "idle";
        // The ONE thing the search log records, and only this: a plain `Error`
        // is a broken artifact or a broken service worker, and folding one into
        // "no food found" would count an offline fetch as a vocabulary miss
        // (ADR-0053 §3).
        if (searchSession)
          searchSession = searchFoundNothing(searchSession, query);
        return;
      }
      status = "error";
      error = e.message ?? String(e);
    }
  }

  async function handleBarcodeLookup() {
    if (!barcode.trim()) return;
    const code = barcode.trim();
    status = "loading";
    error = "";
    nudge = false;
    try {
      const local = await getLocalFoodTwin(mintEntity("gtin:", code));
      // A local twin never nudges — a prior capture already superseded the poor
      // OFF data (latest-wins) — so it stages and returns. Only a freshly
      // looked-up OFF twin (typed `OffPayload`, so `completeness` is in reach)
      // runs the found-but-poor predicate below (§1).
      if (local) {
        staged = mapPayloadToFoodResult(local);
        amount = openingAmount(local);
        status = "idle";
        return;
      }
      // Retried once on the way (#206), so an Open Food Facts hiccup never
      // reaches the sheet at all: the camera is already stopped and `status` is
      // already "loading", so the second ask happens inside the wait the user is
      // already in rather than after an error they then have to dismiss. Only a
      // failure that survives it lands in the `unreachable` branch below.
      const off = await lookupBarcodeWithRetry(code);
      staged = mapPayloadToFoodResult(off);
      amount = openingAmount(off);
      status = "idle";
      const info = off.attributes[NUTRITION_INFO_ATTR] as
        | NutritionInfo
        | undefined;
      if (
        isPoorFoodTwin({
          name: (off.attributes["food/name"] as string) ?? "",
          nutrition: info,
          completeness: off.completeness,
        })
      ) {
        poorPayload = off;
        captureCompleteness = off.completeness;
        nudge = true;
      }
    } catch (e: any) {
      // Missing door (§1): a 404 opens the Custom form keyed to this barcode with
      // reason copy, instead of the old dead-end "not found" message.
      if (e instanceof ProductNotFoundError) {
        openCaptureForm("missing");
      } else if (e instanceof OffUnreachableError) {
        // NOT the missing door (#204). A capture made here saves under this same
        // `gtin:` key and the local twin then short-circuits every later lookup,
        // so an outage would permanently redirect the barcode away from OFF.
        status = "unreachable";
      } else {
        status = "error";
        error = e.message ?? String(e);
      }
    }
  }

  // Hand a committed choice to the host. On refusal keep the sheet open with the
  // reason; on success the host closes/unmounts us, so we touch no more state.
  async function commit(choice: FoodChoice) {
    status = "loading";
    error = "";
    const outcome = await onChoose(choice);
    if (!outcome.ok) {
      status = "error";
      error = outcome.message ?? "Could not use this food.";
    }
  }

  // Each pick APPENDS to the ordered array (a label can span several photos, §5)
  // rather than replacing a single value. `capture=environment` yields one shot
  // at a time; a gallery multi-select yields several, so read them all in order.
  // The input value is cleared after so re-picking the same file still fires.
  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    // `allSettled`, not `all`: one unreadable shot must not discard the ones that
    // read fine — the ticket's Further Notes say surface a drop, never silently
    // lose the good photos. Append every success in order; flag if any failed.
    Promise.allSettled(files.map(readImageAsDataUrl)).then((outcomes) => {
      const read = outcomes
        .filter((o) => o.status === "fulfilled")
        .map((o) => (o as PromiseFulfilledResult<string>).value);
      if (read.length) labelPhotos = [...labelPhotos, ...read];
      if (read.length < files.length) {
        status = "error";
        error =
          read.length === 0
            ? "Failed to read image file."
            : `Added ${read.length} of ${files.length} photos; the rest could not be read.`;
      }
    });
  }

  // Drop a staged photo before save (§5); collapse the reader if the set empties.
  function removePhoto(i: number) {
    labelPhotos = labelPhotos.filter((_, idx) => idx !== i);
    if (labelPhotos.length === 0) readerIndex = null;
  }

  function switchMethod(m: string) {
    staged = null;
    method = m;
    // Any method switch leaves the panel door: it is one of the Custom tab's two
    // surfaces (ADR-0087), so it cannot outlive the tab. Cleared here rather than
    // in the `m === "custom"` block below, so this is the only place a tab change
    // has to remember it and `panelDoor` alone can drive the back button.
    panelDoor = false;
    error = "";
    emptySearch = null;
    status = "idle";
    nudge = false;
    // Drop any upload state a prior Scan visit left, so a fresh scan/upload or a
    // manual custom entry never inherits a stale decoded photo.
    dragOver = false;
    decoding = false;
    uploadError = "";
    uploadNoCode = false;
    uploadedPhoto = null;
    // A manual tab tap is the always-on door: a fresh, unkeyed form. Drop any
    // reason banner and the barcode a prior scan left, so this mints a new
    // `food:custom_` twin rather than silently enriching the last code (§1/§6).
    if (m === "custom") {
      captureReason = null;
      captureCompleteness = undefined;
      captureOffPayload = null;
      captureReturn = null;
      captureDraftKey = null;
      offRefPhotos = [];
      offPackUnit = undefined;
      refReaderIndex = null;
      barcode = "";
    }
  }

  // A staged food whose panel reports no energy is not loggable, and the card
  // above says so (ADR-0048 §6). Held rather than warned about: logging it would
  // freeze a zero into history for ever, which is the failure #126 reported.
  let stagedNoEnergy = $derived(!!staged && reportsNoEnergy(stagedInfo));

  let canPrimary = $derived(
    (!!staged && amount > 0 && !completingPanel && !stagedNoEnergy) ||
      (method === "custom" && !!customName.trim() && runningKcal !== "") ||
      (method === "scan" && !staged && !!barcode.trim())
  );

  // Seed the form's two portion slots from a twin's saved `food/portions`. The
  // split itself is `splitPortionRows` in the form's own domain module; this
  // only lands its two halves in component state.
  function seedPortionRows(portions: Portion[] | undefined) {
    const split = splitPortionRows(portions);
    customPortions = split.rows;
    carriedPortions = split.carried;
  }

  // Build the household portions the user typed into `Portion` shape, dropping
  // wholly-blank rows, then the ones this form has no row for (`seedPortionRows`)
  // exactly as they were read. A hand-typed portion carries its own label as the
  // unit, and is always a weight: nothing here can type a volume.
  function buildCustomPortions(): Portion[] {
    const typed = customPortions
      .filter((p) => p.label.trim() !== "" || p.grams.trim() !== "")
      .map((p) => ({
        label: p.label.trim(),
        amount: 1,
        unit: p.label.trim() || "serving",
        grams: Number(p.grams.trim()) || 0,
      }));
    return [...typed, ...carriedPortions];
  }

  function primaryAction() {
    if (staged) {
      // The amount travels in the staged panel's own unit; every host reads that
      // unit back off the panel rather than off the carrier (ADR-0060 §1).
      return commit({ kind: "food", food: staged, amount });
    }
    if (method === "custom") {
      if (!customName.trim() || runningKcal === "") return;
      // The full panel (grams stored, absent ≠ 0) plus the user-origin provenance
      // envelope; the host commits it through saveLabelFood (#56). Reuses the
      // shared `builtPanel` derivation the contribution path also reads.
      const { nutrition, filledKeys } = builtPanel;
      const portions = buildCustomPortions();
      const photos = allowPhoto ? labelPhotos : [];
      // Audit hint (§7): the coarse categories the user actually supplied.
      const fields = [
        ...(customName.trim() ? ["name"] : []),
        ...(customBrand.trim() ? ["brand"] : []),
        ...(customCategories.length ? ["category"] : []),
        ...(filledKeys.length ? ["nutriments"] : []),
        ...(portions.length ? ["portions"] : []),
      ];
      const labelCapture = buildLabelCapture({
        method: "manual",
        basis: nutrition.serving_size,
        fields,
      });
      return commit({
        kind: "custom",
        name: customName.trim(),
        // The four macros ride along as plain numbers so the log headline and the
        // macro-only add-ingredient host read them without unpacking the panel.
        calories: nutrition.calories ?? 0,
        protein: nutrition.protein_content ?? 0,
        fat: nutrition.fat_content ?? 0,
        carbs: nutrition.carbohydrate_content ?? 0,
        // Mirror the first photo into the singular field the legacy hosts read;
        // the full ordered set rides `labelPhotos` (saveLabelFood mirrors [0], §5).
        photo_base64: photos[0] ?? null,
        brand: customBrand.trim() || undefined,
        category: customCategories.join(", ") || undefined,
        // Canonical OFF ingredients (ADR-0043 §5) → `food/ingredients_text`;
        // saveLabelFood suppresses it when blank. NOT `food/ingredients`.
        ingredientsText: customIngredients.trim() || undefined,
        nutrition,
        portions: portions.length ? portions : undefined,
        labelPhotos: photos.length ? photos : undefined,
        labelCapture,
        // The key follows the barcode (§6): a code carried in by a door (or typed
        // in the unreadable banner) enriches `gtin:<code>` in place; an empty one
        // mints a fresh `food:custom_` twin. The host maps this to the save key.
        barcode: barcode.trim() || undefined,
        // An origin-badge edit (§7) pins the twin's own id so the host enriches
        // it in place; the barcode alone would mint a duplicate for a custom twin.
        editEntityId: editEntityId ?? undefined,
        // The found-but-poor door's OFF record, so the host preserves its
        // provenance beside the correction (§6/§7 dual-origin). Absent otherwise.
        offPayload: captureOffPayload ?? undefined,
      });
    }
    if (method === "scan") return handleBarcodeLookup();
  }

  // The method switcher hides for a host that has no dock at all (ADR-0059 §2),
  // and otherwise while staged or method-locked, and also while the
  // read-along form was opened by a scan door (`captureReason` set): that flow is
  // a focused "fill in the label" task, so Search/Scan/Custom/Recipe would only
  // invite the user to abandon it. A manual Custom tap clears captureReason, so
  // the tabs stay put there. It also hides while an extra tab is in a focused
  // sub-state (`tabBack` set) — e.g. a recipe's editor — for the same reason.
  let showTabs = $derived(
    methodDock &&
      !staged &&
      !lockMethods &&
      captureReason === null &&
      !(isExtra(method) && !!tabBack)
  );
  // A manual-entry edit seed (ADR-0035 edit path) routes back to ManualEntryFlow
  // even in edit mode, so its own mini-form re-opens (not the label form).
  let manualSeed = $derived(seed?.kind === "manual" ? seed : null);
  // The Custom tab shows ManualEntryFlow (the chooser + mini-forms, or a seeded
  // mini-form) rather than the label form when: no barcode door routed here (a
  // set `captureReason` always wins → the label form, ADR-0035 §2), the chooser's
  // own panel tile has not opened that same form (ADR-0087 §2), AND either the
  // host opted into fresh manual intents (and isn't in a locked edit) OR an edit
  // seeded a manual entry. ManualEntryFlow owns its Save, so the shared dock's
  // primary + kcal summary drop for it.
  let showManualFlow = $derived(
    method === "custom" &&
      !staged &&
      captureReason === null &&
      !panelDoor &&
      (manualSeed != null || (manualIntents && !lockMethods))
  );
  // The custom form carries its own name field in its identity-card header, so
  // the shared dock input is dropped for it (Search/Scan still use it).
  let showInput = $derived(!staged && !isExtra(method) && method !== "custom");
  let showPrimary = $derived(!isExtra(method) && !showManualFlow);

  // The manual flow (ManualEntryFlow) owns its save logic but hands its commit
  // button to the shared dock, so a manual entry's CTA is pinned at the bottom
  // like every other flow. These mirror its mini-form state: which intent is open
  // (null on the chooser — nothing to commit), its save handler, and readiness.
  let manualActiveIntent = $state<ManualEntryKind | null>(null);
  let manualRequestSave = $state<(() => void) | undefined>(undefined);
  let manualSaveReady = $state(false);
  let manualRequestBack = $state<(() => void) | undefined>(undefined);

  // The manual mini-form offers a back only when it isn't a seeded edit (an edit
  // opens straight onto one entry's form — there is no chooser to return to).
  let manualCanBack = $derived(
    showManualFlow && manualActiveIntent != null && manualSeed == null
  );

  // Compose the stager's internal back navigation so the host's one header back
  // button serves every sub-state. Order mirrors how a user drilled in: a staged
  // food unstages (unless method-locked in edit), a barcode-door capture form
  // returns to the scan view it came from, a manual mini-form returns to the
  // intent chooser, and a host extra-tab sub-state (e.g. a recipe editor) returns
  // via its `tabBack`.
  let stagerCanGoBack = $derived(
    (!!staged && !lockMethods) ||
      // A capture form offers back when there is somewhere to go: the card it
      // was opened from, or (for a barcode door) the scan view behind it.
      (captureReason !== null && (captureReturn !== null || !lockMethods)) ||
      // The panel door goes back to the chooser it was picked from. Same
      // destination as a mini-form's, but it cannot ride `manualCanBack`, which
      // reads state inside a ManualEntryFlow that is unmounted while this form
      // is open.
      panelDoor ||
      manualCanBack ||
      (isExtra(method) && !!tabBack)
  );
  function stagerGoBack() {
    if (staged && !lockMethods) {
      staged = null;
      return;
    }
    if (captureReason !== null) {
      // Leave the capture form for whatever it was opened from. A door reached
      // from a card (Improve on a found-but-poor scan, the pencil on a staged
      // twin) returns to THAT card — the scan already found this food, so
      // dropping the user back at an empty scanner loses the thing they were
      // working on. Only a door that WAS the entry point falls back to the scan
      // view. The draft survives either way (`captureDraftKey`), so stepping
      // back to check the card and returning keeps what was typed.
      const back = captureReturn;
      const wasPoor = captureReason === "poor";
      captureReason = null;
      captureCompleteness = undefined;
      captureOffPayload = null;
      captureReturn = null;
      if (back) {
        staged = back.food;
        method = back.method;
        // The food is still the poor one it was — restore the nudge that offered
        // the improvement, so the door stays open.
        nudge = wasPoor;
        return;
      }
      method = "scan";
      return;
    }
    if (panelDoor) {
      // Back to the chooser, keeping `captureDraftKey` so re-entering the tile
      // restores what was typed rather than blanking twenty fields.
      panelDoor = false;
      return;
    }
    if (manualCanBack) {
      manualRequestBack?.();
      return;
    }
    if (isExtra(method)) tabBack?.();
  }
  // Publish the capability to the host (bindable props).
  $effect(() => {
    canGoBack = stagerCanGoBack;
  });
  goBack = stagerGoBack;
</script>

<!-- The Search / Scan / Custom / Recipe switcher is a real tablist (#64):
     bits-ui Tabs supplies role=tablist/tab/tabpanel, aria-selected, roving
     tabindex + arrow-key selection, and the trigger↔panel association. The
     brutalist skin stays custom (`:global(.method)` below), the same
     headless-behaviour-plus-owned-look split as Segmented/Meter (ADR-0036/0037).
     Root and the panel keep their own scoped divs via the `child` snippet so the
     stager's layout CSS is untouched; only the trigger row goes through bits'
     default rendering. `value` is controlled by `method` and every change is
     funnelled through `switchMethod` (which resets staged/upload state), so
     arrow-key activation runs the exact same switch a click does. -->
<Tabs.Root value={method} onValueChange={switchMethod} orientation="horizontal">
  {#snippet child({ props })}
    <div class="stager" {...props}>
      <!-- One Combobox spans the search field (in the dock) and its results (in
       the stage), which the food sheet's layout keeps far apart — bits ties them
       together through context, and its Root renders no DOM of its own (a
       FloatingLayer + no hidden input while unnamed), so wrapping here is
       layout-neutral and inert for the non-search methods. Kept open only while
       searching so the inline listbox shows the recent/results list up front. -->
      <Combobox.Root
        type="single"
        open={method === "search" && !staged}
        value={comboValue}
        onValueChange={selectFromCombobox}
      >
        <!-- Staging / results area -->
        <Tabs.Content value={method}>
          {#snippet child({ props: stageProps })}
            <div class="stage" {...stageProps}>
              {#if staged}
                <div class="staged">
                  <!-- The staged food IS the food card the edit-amount sheet
                  shows (FoodCard): tags over the name, meta row, amount panel,
                  allergen block. Staging adds only the found-but-poor nudge,
                  slotted between the meta row and the amount. -->
                  <FoodCard
                    payload={staged.payload}
                    name={staged.name}
                    panel={stagedInfo}
                    portions={stagedPortions}
                    bind:amount
                    onEdit={editStaged}
                    onExplainSource={(kind) => (sourceExplain = kind)}
                    onExplainNova={explainNova}
                    onExplainDietary={(v) => (dietaryExplain = v)}
                  >
                    {#snippet beforeAmount()}
                      {#if completingPanel}
                        <!-- The Log button is held while the staged food's panel
                        is read out of the Nutrient store, so say why: on a cold
                        first stage that read is a fetch and a parse, and a dead
                        button with no explanation is worse than the wait. -->
                        <p
                          class="hint"
                          role="status"
                          data-testid="completing-panel"
                        >
                          Reading the full nutrition panel…
                        </p>
                      {/if}
                      {#if nudge}
                        <!-- Found-but-poor nudge (§1): soft, dismissible, never
                        blocks logging the poor twin as-is — the Log button below
                        stays live. -->
                        <div
                          class="nudge"
                          data-testid="poor-nudge"
                          role="status"
                        >
                          <span class="nudge-text"
                            >This entry looks incomplete. Improve it from the
                            label?</span
                          >
                          <button
                            type="button"
                            class="nudge-go"
                            data-testid="poor-nudge-improve"
                            onclick={() =>
                              openCaptureForm(
                                "poor",
                                poorPayload ?? undefined,
                                captureCompleteness
                              )}>Improve</button
                          >
                        </div>
                      {/if}
                    {/snippet}
                  </FoodCard>
                </div>
              {:else if isExtra(method)}
                {@render tabContent?.(method)}
              {:else if method === "search"}
                <!-- The listbox half of the combobox: the recent foods while idle,
                   the async matches once searching. The heading and the "no
                   matches" hint sit OUTSIDE the role=listbox so only options are
                   its children. ContentStatic renders it inline (not a popover);
                   each option is a role=option skinned via its `child` snippet. -->
                {#if comboItems.length > 0}
                  <h3 class="results-head">
                    {query.trim().length === 0 ? "Recent" : "Results"}
                  </h3>
                {/if}
                <Combobox.ContentStatic forceMount>
                  {#snippet child({ props })}
                    <div class="results-list" {...props}>
                      {#each comboItems as item (item.entity)}
                        <Combobox.Item value={item.entity} label={item.name}>
                          {#snippet child({ props: optProps, highlighted })}
                            <!-- The known third caller of `ui/Row`, deliberately
                            left alone (#319): bits-ui's `child` snippet spreads
                            `role="option"` props and a `highlighted` state onto
                            this root, so adopting it would force a third element
                            mode on the primitive, over a row that answers to
                            bits-ui's a11y contract rather than ours. -->
                            <div
                              class="result-item"
                              class:hl={highlighted}
                              {...optProps}
                            >
                              <div class="result-details">
                                <span class="result-name">
                                  {item.name}
                                  {#if curatedStandInFor(item.entity)}
                                    <!-- A curated stand-in is a specific product
                                    answering for a base food no reference table
                                    carries (ADR-0046 §5). Marked here so it is
                                    visible BEFORE selection; the full disclosure
                                    is in the source explainer on the staged card,
                                    since a role=option cannot hold a button. -->
                                    <span class="stand-in-tag">stand-in</span>
                                  {/if}
                                </span>
                                <span class="result-macros">
                                  <!-- The row says what its figure is PER: a
                                  Recent row can hold a drink OFF publishes per
                                  100 ml or a label-corrected serving, not only
                                  the per-100 g reference foods search returns
                                  (#148). -->
                                  Per {item.basis}: {roundFoodDisplay(
                                    item.calories,
                                    $calorieDisplayDecimals
                                  )} kcal | P: {roundFoodDisplay(item.protein)}g
                                  | F: {roundFoodDisplay(item.fat)}g | C: {roundFoodDisplay(
                                    item.carbs
                                  )}g
                                </span>
                              </div>
                              <span class="select-arrow" aria-hidden="true"
                                >→</span
                              >
                            </div>
                          {/snippet}
                        </Combobox.Item>
                      {/each}
                    </div>
                  {/snippet}
                </Combobox.ContentStatic>
                {#if recentEmptyHint && query.trim().length === 0}
                  <!-- This meal's default came back empty (ADR-0057 §5). Kept
                     distinct from the no-matches hint below, which answers a
                     query: this one answers the absence of one. -->
                  <p
                    class="hint"
                    role="status"
                    data-testid="empty-meal-default"
                  >
                    {recentEmptyHint}
                  </p>
                {/if}
                {#if emptySearch && emptySearch.query === query.trim()}
                  <!-- One message, and no route out of it (ADR-0047 §10). The
                     index holds only the reference foods that survived the
                     ADR-0042 filters, so nothing here can tell a food we hold
                     and decline to show from one no table carries — and without
                     that, pointing at the barcode path would be a guess. #123
                     carries the better answer. The copy is food-search.ts's. -->
                  <p class="hint" role="status" data-testid="empty-search">
                    {NO_FOOD_FOUND}
                  </p>
                {/if}
              {:else if method === "scan"}
                {#if scanError}<Alert variant="warning">{scanError}</Alert>{/if}
                {#if showLiveScanner}
                  <!-- Live camera scanner (native BarcodeDetector present + camera OK). -->
                  <div class="viewport">
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video bind:this={videoEl} class="scanner-video" playsinline
                    ></video>
                    <div class="reticle"></div>
                  </div>
                  <!-- A code that read but went nowhere. Under the preview
                       rather than instead of it: the camera is fine, and the
                       next act is to point it somewhere else. -->
                  {#if scanRejected}
                    <Alert variant="warning">{scanRejected}</Alert>
                  {/if}
                  <p class="hint">
                    Point the camera at a barcode, or type the number below. No
                    result? <button
                      class="link"
                      onclick={() => switchMethod("custom")}
                      >Add a custom entry</button
                    >.
                  </p>
                  {#if scanStalled}
                    <!-- Unreadable door (§1): after a persistent no-decode stretch, elevate
               a prominent "photograph the label" escape so a barcode that won't
               scan still leads somewhere. Routes barcode-less to the Custom form;
               the user can still add legible digits in the form's reason banner. -->
                    <Button
                      variant="primary"
                      class="escape"
                      data-testid="unreadable-escape"
                      onclick={() => openCaptureForm("unreadable")}
                    >
                      📷 Can’t scan it? Photograph the label instead
                    </Button>
                  {/if}
                {:else}
                  <!-- No live camera (desktop has no native BarcodeDetector, or the camera
             was denied/absent): upload a photo of the barcode (click or drag) and
             decode it via zxing-wasm. A decoded code drives the same lookup the
             camera does; the photo is kept as the label photo (ADR-0034 §5). -->
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden-file-input"
                    bind:this={uploadInput}
                    onchange={handleUploadChange}
                  />
                  <div
                    class="dropzone"
                    class:drag={dragOver}
                    class:busy={decoding}
                    role="button"
                    tabindex="0"
                    data-testid="scan-dropzone"
                    aria-label="Upload a photo of the barcode"
                    ondrop={handleDrop}
                    ondragover={handleDragOver}
                    ondragleave={() => (dragOver = false)}
                    onclick={() => uploadInput?.click()}
                    onkeydown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      (e.preventDefault(), uploadInput?.click())}
                  >
                    {#if uploadedPhoto}
                      <img
                        src={uploadedPhoto}
                        alt=""
                        class="dropzone-preview"
                      />
                    {/if}
                    <div class="dropzone-body">
                      {#if decoding}
                        <span class="dropzone-spinner" aria-hidden="true"
                        ></span>
                        <span class="dropzone-title">Reading the barcode…</span>
                      {:else}
                        <span class="dropzone-icon" aria-hidden="true">📷</span>
                        <span class="dropzone-title"
                          >Drop a photo of the barcode, or click to choose</span
                        >
                        <span class="dropzone-sub"
                          >or type the number below — it looks the product up
                          the same way a scan does</span
                        >
                      {/if}
                    </div>
                  </div>
                  {#if uploadError}
                    <p class="hint" data-testid="upload-error">{uploadError}</p>
                  {/if}
                  {#if uploadNoCode}
                    <!-- Same escape the camera stall offers: go to the form (unreadable
               door) with the photo attached; add the digits there if legible. -->
                    <Button
                      variant="primary"
                      class="escape"
                      data-testid="unreadable-escape"
                      onclick={() => openCaptureForm("unreadable")}
                    >
                      ✏️ Enter the label details instead
                    </Button>
                  {/if}
                {/if}
                {#if onMealCode}
                  <!-- The third way a Send code reaches this door (ADR-0082
                       §13): a link somebody pasted, beside the camera and the
                       photo. Under both branches rather than inside either,
                       because it is the same field whether this platform has a
                       live scanner or a dropzone — and it is present on every
                       platform, not iOS alone. Gated on the host wanting meal
                       codes at all, so an ingredient picker does not offer a
                       field that goes nowhere. -->
                  <MealLinkField onMealCode={takePastedMealCode} />
                {/if}
              {:else if showManualFlow}
                <!-- Custom = the ADR-0035 intent chooser + its three mini-forms (quick
           estimate / from a menu / from a photo), or a seeded mini-form in edit
           mode. The chooser's fourth tile leaves for the label form below rather
           than rendering one here (ADR-0087 §2), as a set captureReason does. -->
                <ManualEntryFlow
                  {allowPhoto}
                  {mealName}
                  seed={manualSeed}
                  busy={status === "loading"}
                  disabled={primaryDisabled}
                  nameId={ids.customName}
                  calId={ids.customCal}
                  onCommit={commit}
                  onOpenPanel={openPanelForm}
                  bind:activeIntent={manualActiveIntent}
                  bind:requestSave={manualRequestSave}
                  bind:saveReady={manualSaveReady}
                  bind:requestBack={manualRequestBack}
                />
              {:else}
                <!-- Custom = the #52 "Read-along" full-panel form (ADR-0034 §2–§4), reached
           via the barcode doors (missing / poor / unreadable), the chooser's own
           panel tile (ADR-0087), or the always-on manual tab when the host did
           not opt into ADR-0035 intents. Name +
           brand in a sticky identity card, then every panel row grouped Macros ·
           fats/fibre/sugar/salt · vitamins & minerals · portions, transcribed
           top-to-bottom. Macros lead so the fast path stays name + calories →
           Save. -->
                <div class="cf">
                  {#if captureReason}
                    <!-- Reason banner (§1): each door explains why it landed here. The
               unreadable door also offers an optional barcode field so a legible
               code still keys `gtin:` (else the save mints a `food:custom_`). -->
                    <div class="cf-reason" data-testid="capture-reason">
                      <p>{CAPTURE_COPY[captureReason]}</p>
                      {#if captureReason === "unreadable"}
                        <label class="cf-reason-code">
                          <span>Barcode digits (optional)</span>
                          <input
                            type="text"
                            inputmode="numeric"
                            placeholder="e.g. 8901222932167"
                            aria-label="Barcode digits"
                            bind:value={barcode}
                          />
                        </label>
                      {/if}
                    </div>
                  {/if}
                  {#if offRefPhotos.length > 0}
                    <!-- OFF's own photos (§8 read-feature): a read-only strip to read the
               label off while filling the gaps. Tapping opens the reader in
               read-only mode. These are never the user's captured photos. -->
                    <div class="cf-off-ref" data-testid="off-reference-photos">
                      <span class="cf-off-ref-lbl"
                        >Open Food Facts photos — read the label to fill the
                        gaps</span
                      >
                      <div class="cf-off-ref-strip">
                        {#each offRefPhotos as src, i (src)}
                          <button
                            type="button"
                            class="cf-off-ref-thumb"
                            onclick={() => (refReaderIndex = i)}
                            aria-label={`View Open Food Facts photo ${i + 1} of ${offRefPhotos.length}`}
                          >
                            <!-- OFF images carry CORS (ACAO:*) but no CORP header, so
                       under our COEP:require-corp page they must be fetched in
                       CORS mode — else the browser blocks them
                       (NotSameOriginAfterDefaultedToSameOriginByCoep). -->
                            <img
                              {src}
                              alt=""
                              loading="lazy"
                              crossorigin="anonymous"
                            />
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  <div class="cf-idrow">
                    {#if allowPhoto}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        class="hidden-file-input"
                        data-testid="label-photo-input"
                        bind:this={fileInput}
                        onchange={handleFileChange}
                      />
                      {#if labelPhotos.length > 0}
                        <!-- First photo = display; tapping opens the swipeable reader. A
                   "+N" badge (N = extras) surfaces the rest of the set (§5). -->
                        <button
                          class="cf-thumb"
                          onclick={() => (readerIndex = 0)}
                          aria-label={labelPhotos.length > 1
                            ? `View ${labelPhotos.length} label photos`
                            : "View the label photo"}
                        >
                          <img
                            src={labelPhotos[0]}
                            alt="Label"
                            class="photo-preview"
                          />
                          {#if labelPhotos.length > 1}
                            <span
                              class="cf-thumb-badge"
                              data-testid="photo-count-badge"
                              >+{labelPhotos.length - 1}</span
                            >
                          {/if}
                        </button>
                      {:else if offRefPhotos.length > 0}
                        <!-- No photo of your own yet, but OFF has one: show its
                   front shot so the slot carries the product's face instead of
                   an empty camera box. It stays OFF's image — read-only, never
                   merged into `labelPhotos`, never saved onto the twin — so
                   tapping still opens the picker to add your own, and the strip
                   above opens OFF's shots full-size. -->
                        <button
                          class="cf-thumb cf-thumb-off"
                          data-testid="off-default-photo"
                          onclick={() => fileInput?.click()}
                          aria-label="Add your own label photo (showing the Open Food Facts photo)"
                        >
                          <img
                            src={offRefPhotos[0]}
                            alt=""
                            class="photo-preview"
                            loading="lazy"
                            crossorigin="anonymous"
                          />
                          <span class="cf-thumb-badge">OFF</span>
                        </button>
                      {:else}
                        <button
                          class="cf-thumb cf-thumb-empty"
                          onclick={() => fileInput?.click()}
                          aria-label="Add a label photo"
                        >
                          <span aria-hidden="true">📷</span>
                          <span class="cf-thumb-hint">Photo</span>
                        </button>
                      {/if}
                    {/if}
                    <div class="cf-id">
                      <input
                        id={ids.customName}
                        class="cf-title"
                        placeholder="Product name"
                        aria-label="Product name"
                        bind:value={customName}
                      />
                      <input
                        class="cf-subline"
                        placeholder="Brand — optional"
                        aria-label="Brand"
                        bind:value={customBrand}
                      />
                    </div>
                  </div>

                  <div class="cf-basis">
                    <label class="cf-pack">
                      <span>Pack size</span>
                      <input
                        id="cf-pack-size"
                        type="text"
                        inputmode="decimal"
                        placeholder="50"
                        aria-label="Pack size in {effectiveUnit}"
                        data-testid="cf-pack-size"
                        bind:value={customPackQuantity}
                      />
                      <!-- The unit sits WITH the magnitude, because it is one
                      fact about the pack rather than a second question about the
                      panel. Its visible label is hidden: "Pack size" to the left
                      already names the pair, and the group keeps it as its
                      accessible name. -->
                      <span class="cf-pack-unit">
                        <Segmented
                          label="Pack size unit"
                          options={basisOptions}
                          bind:value={customBasis}
                          testid="cf-basis"
                        />
                      </span>
                    </label>
                    <!-- What the figures below therefore mean. Stated rather
                    than asked a second time. -->
                    <p class="cf-basis-derived" data-testid="cf-basis-derived">
                      Values per {resolveServingSize(customBasis)}.
                    </p>
                    {#if contributionLosesNumbers}
                      <!-- Not a validation error: the panel is saved either way,
                      and this is only about what a contribution can say. OFF has
                      no per-100-ml basis to post — it resolves its own `100`
                      against the pack — so without a millilitre pack size the
                      numbers would be withheld rather than mislabelled. -->
                      <p class="cf-pack-hint" data-testid="cf-pack-hint">
                        Give the pack size in ml (like “50 ml”) and these values
                        can go back to Open Food Facts too.
                      </p>
                    {/if}
                  </div>

                  {#each customSections as sec (sec.head)}
                    <section class="cf-group">
                      <div class="cf-grouphead">
                        <div class="cf-gh-text">
                          <h3>{sec.head}</h3>
                          {#if sec.hint}<span class="cf-gh-hint"
                              >{sec.hint}</span
                            >{/if}
                        </div>
                        <button
                          type="button"
                          class="cf-skip-all"
                          onclick={() => skipSection(sec.fields)}
                          >none on label</button
                        >
                      </div>
                      <div class="cf-list">
                        {#each sec.fields as f (f.key)}
                          <div
                            class="cf-row"
                            class:skip={skipped.has(f.key)}
                            class:unverified={prefilled.has(f.key)}
                          >
                            <label
                              class="cf-lbl"
                              for={idFor[f.key] ?? `cf-${f.key}`}
                              >{f.label}</label
                            >
                            <div class="cf-ctl">
                              <input
                                id={idFor[f.key] ?? `cf-${f.key}`}
                                type="text"
                                inputmode="decimal"
                                placeholder={skipped.has(f.key)
                                  ? "not on label"
                                  : "0"}
                                disabled={skipped.has(f.key)}
                                bind:value={customValues[f.key]}
                                oninput={() => markReviewed(f.key)}
                              />
                              <span class="cf-unit">{f.unit}</span>
                            </div>
                            <button
                              type="button"
                              class="cf-skip"
                              aria-pressed={skipped.has(f.key)}
                              onclick={() => toggleSkip(f.key)}
                              aria-label={`${f.label} — not on label`}>∅</button
                            >
                          </div>
                        {/each}
                      </div>
                    </section>
                  {/each}

                  <section class="cf-group">
                    <div class="cf-grouphead">
                      <div class="cf-gh-text">
                        <h3>Household portions</h3>
                        <span class="cf-gh-hint">optional</span>
                      </div>
                    </div>
                    <div class="cf-list">
                      {#each customPortions as p, i (i)}
                        {@const weird = portionLabelIsBareWeight(p.label)}
                        <div class="cf-prow">
                          <input
                            class:cf-in-warn={weird}
                            placeholder="e.g. 1 slice"
                            aria-label="Portion label"
                            aria-invalid={weird}
                            bind:value={p.label}
                          />
                          <input
                            type="text"
                            inputmode="decimal"
                            placeholder="grams"
                            aria-label="Portion grams"
                            bind:value={p.grams}
                          />
                          <button
                            type="button"
                            class="cf-skip"
                            onclick={() => customPortions.splice(i, 1)}
                            aria-label="Remove portion">✕</button
                          >
                        </div>
                        {#if weird}
                          <!-- The label is just a weight, so it only restates the grams
                     column — nudge a real household unit (mirrors the chip
                     collapse in formatPortionPreset). Non-blocking. -->
                          <p
                            class="cf-prow-warn"
                            data-testid="portion-weight-warning"
                          >
                            That's a weight, not a portion name — try a
                            household unit like “1 slice” or “1 biscuit”.
                          </p>
                        {/if}
                      {/each}
                      <button
                        type="button"
                        class="cf-add"
                        onclick={() =>
                          (customPortions = [
                            ...customPortions,
                            { label: "", grams: "" },
                          ])}>＋ add a portion</button
                      >
                    </div>
                  </section>

                  <!-- Categories (§8, #84): OFF's language-neutral "what this is",
                       one discrete canonical category per chip, picked from OFF's
                       taxonomy type-ahead. Below portions, same section chrome. -->
                  <section class="cf-group">
                    <div class="cf-grouphead">
                      <div class="cf-gh-text">
                        <h3>Categories</h3>
                        <span class="cf-gh-hint">optional</span>
                      </div>
                    </div>
                    <CategoryPicker bind:value={customCategories} />
                  </section>

                  <!-- Ingredients (ADR-0043 §5): OFF's canonical `food/ingredients_text`,
                       true read-along — seeded from OFF's own parsed ingredients so the
                       user corrects them in place, then written back to the twin and
                       (for a barcoded product) contributed to OFF as a bare
                       `ingredients_text`. NOT `food/ingredients` (the ADR-0035 menu
                       descriptor). Label-language capture (`lc`) is deferred. -->
                  <section class="cf-group">
                    <div class="cf-grouphead">
                      <div class="cf-gh-text">
                        <h3>Ingredients</h3>
                        <span class="cf-gh-hint">optional</span>
                      </div>
                    </div>
                    <textarea
                      class="cf-ingredients"
                      data-testid="cf-ingredients"
                      rows="3"
                      placeholder="e.g. Sugar, palm oil, hazelnuts (13%), skimmed milk powder"
                      bind:value={customIngredients}
                    ></textarea>
                  </section>

                  {#if contributeOffered}
                    <!-- OFF contribution (§8): offered only for a barcoded (`gtin:`) twin
               with an OFF login. Model-C consent — the checkbox is always shown
               and must be ticked; the Settings master toggle only seeds it.
               Decoupled from Save so nothing is ever sent by accident, and the
               button persists for online-only manual retry. -->
                    <section class="cf-contrib" data-testid="off-contribute">
                      <div class="cf-contrib-head">
                        <h3>Contribute to Open Food Facts</h3>
                        <span class="cf-gh-hint"
                          >optional · barcoded products</span
                        >
                      </div>
                      <Checkbox
                        class="cf-contrib-consent"
                        data-testid="off-contribute-consent"
                        bind:checked={contributeChecked}
                        label="Share this product's structured data with Open Food Facts under your OFF login. No photos are sent."
                      />
                      <Button
                        variant="primary"
                        class="cf-contrib-btn"
                        data-testid="off-contribute-submit"
                        disabled={!contributeChecked ||
                          contributeStatus === "sending"}
                        onclick={contributeToOff}
                      >
                        {contributeStatus === "sending"
                          ? "Contributing…"
                          : "Contribute to OFF"}
                      </Button>
                      {#if contributeResult}
                        <p
                          class="cf-contrib-msg"
                          class:ok={contributeResult.ok}
                          role="status"
                          data-testid="off-contribute-result"
                        >
                          {contributeResult.message}
                        </p>
                      {/if}
                    </section>
                  {/if}
                </div>
              {/if}

              {#if status === "unreachable"}
                <!-- The third answer a scan can get (#204). Not the missing door,
                   which would invite a hand-typed pack, and not the error banner,
                   which offers nothing to do — the service was busy, so the copy
                   says so and the only control is another attempt. -->
                <div class="mt" data-testid="off-unreachable">
                  <Alert variant="warning">
                    <p>{OFF_UNREACHABLE_COPY}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      class="off-retry"
                      data-testid="off-retry"
                      onclick={handleBarcodeLookup}>Try again</Button
                    >
                  </Alert>
                </div>
              {:else if status === "error"}
                <div class="mt"><Alert variant="error">{error}</Alert></div>
              {/if}
            </div>
          {/snippet}
        </Tabs.Content>

        <!-- Dock: input · methods · primary action. When a food is staged its name
       already headlines the staging area above, so the input row is dropped (no
       duplicate echo) and the method switcher too — the sheet stays focused on
       that food's amount. -->
        <div class="dock">
          {#if showInput}
            <div class="dock-input">
              {#if method === "scan"}
                <Input
                  id={ids.barcode}
                  placeholder="Enter barcode…"
                  inputmode="numeric"
                  bind:value={barcode}
                  onkeydown={(e) => e.key === "Enter" && handleBarcodeLookup()}
                />
              {:else}
                <div class="in-wrap">
                  <!-- The combobox field. bits sets role=combobox, aria-expanded,
                     aria-activedescendant and the ArrowDown/Up/Enter handlers; we
                     render the <input> ourselves via `child` so it keeps the
                     brutalist `.cb-input` skin. `value` is driven by our `query`
                     (not bits' internal input value) so a selection never leaves
                     a stale food name in the field, and our oninput runs bits'
                     first (to move the highlight) before updating `query`, which
                     the debounced search reads. Enter is bits' — it selects the
                     highlighted option. -->
                  <Combobox.Input>
                    {#snippet child({ props })}
                      <!-- bits types the child props loosely (Record<string,
                         unknown>), so its own input handler is read out here with
                         one named cast, then chained before ours: bits moves the
                         highlight to the first candidate, then we update `query`. -->
                      {@const bitsOnInput = props.oninput as
                        | ((e: Event) => void)
                        | undefined}
                      <!-- A phone capitalises the first word and offers
                         corrections; food names are not prose, and USDA matches
                         them literally, so both are turned off here rather than
                         patched up downstream. -->
                      <input
                        {...props}
                        id={ids.search}
                        class="cb-input"
                        placeholder="Search foods…"
                        autocapitalize="none"
                        autocorrect="off"
                        autocomplete="off"
                        spellcheck="false"
                        value={query}
                        oninput={(e) => {
                          bitsOnInput?.(e);
                          query = e.currentTarget.value;
                        }}
                      />
                    {/snippet}
                  </Combobox.Input>
                  {#if status === "loading"}
                    <span class="in-spinner" aria-label="Searching USDA"></span>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          {#if showTabs}
            <!-- The tablist. bits sets role=tab, aria-selected, aria-controls and the
           roving tabindex on each trigger; activation is funnelled to
           switchMethod via the Root's onValueChange, so the host-injected extra
           tabs (Recipe) behave identically to the built-ins. -->
            <Tabs.List class="methods">
              {#each methodTabs as [m, ico, label]}
                <Tabs.Trigger class="method" value={m}>
                  <span class="mi">{ico}</span><span class="ml">{label}</span>
                </Tabs.Trigger>
              {/each}
            </Tabs.List>
          {/if}

          {#if method === "custom" && !staged && !showManualFlow}
            <div class="cf-sum">
              <span><strong>{runningKcal || "—"}</strong> kcal</span>
              {#if toReview > 0}
                <span class="cf-review-chip">{toReview} to review</span>
              {/if}
            </div>
          {/if}

          {#if showPrimary}
            <CommitButton
              id={ids.primary}
              disabled={!canPrimary || primaryDisabled || status === "loading"}
              onclick={primaryAction}
            >
              {primaryLabel({
                method,
                staged,
                factor,
                toReview: method === "custom" && !staged ? toReview : 0,
              })}
            </CommitButton>
          {:else if showManualFlow}
            <!-- The manual flow's pinned commit (its save logic lives in
           ManualEntryFlow; only the button is hoisted here). Shown across the
           whole flow — disabled on the intent chooser (nothing to commit yet) so
           the dock keeps a constant height and picking an intent never shifts the
           layout, matching how Search/Scan already show their button up front. -->
            <CommitButton
              id={ids.primary}
              testid="manual-save"
              disabled={!manualSaveReady ||
                primaryDisabled ||
                status === "loading"}
              onclick={() => manualRequestSave?.()}
            >
              {primaryLabel({ method, staged, factor, toReview: 0 })}
            </CommitButton>
          {:else if isExtra(method)}
            <!-- An extra tab's own docked action (e.g. the Recipe browser's
           "＋ New recipe"), pinned where the primary button sits, so the Recipe
           tab has a bottom action like every other tab. -->
            {@render tabDock?.(method)}
          {/if}
        </div>
      </Combobox.Root>
    </div>
  {/snippet}
</Tabs.Root>

{#if readerIndex !== null && labelPhotos.length > 0}
  <LabelPhotoReader
    photos={labelPhotos}
    startIndex={readerIndex}
    onRemove={removePhoto}
    onAdd={() => fileInput?.click()}
    onClose={() => (readerIndex = null)}
  />
{/if}

{#if refReaderIndex !== null && offRefPhotos.length > 0}
  <!-- Read-only: no onRemove/onAdd, so the reader hides its action bar. -->
  <LabelPhotoReader
    photos={offRefPhotos}
    startIndex={refReaderIndex}
    onClose={() => (refReaderIndex = null)}
  />
{/if}

{#if novaExplain}
  <!-- NOVA explainer (#92, ADR-0041 §6): the tapped verdict's tap-through sheet,
       mounted off `novaExplain` and closed back to null. #91 owns the tappable
       badge; this owns the sheet body. -->
  <NovaExplainerSheet
    verdict={novaExplain}
    onClose={() => (novaExplain = null)}
  />
{/if}

{#if sourceExplain}
  <!-- Source explainer (ADR-0043 §2, #103): per-origin trust copy for the tapped
       source tag, mounted off `sourceExplain` and closed back to null. -->
  <SourceExplainerSheet
    kind={sourceExplain}
    standIn={curatedStandInFor(staged?.entity)}
    onEdit={staged ? editStaged : undefined}
    onClose={() => (sourceExplain = null)}
  />
{/if}

{#if dietaryExplain}
  <!-- Dietary explainer (ADR-0043 §2, #103): the placeholder glyphs, their short
       forms, and the "on-pack claim, not our verdict" caveat. -->
  <DietaryExplainerSheet
    verdict={dietaryExplain}
    onClose={() => (dietaryExplain = null)}
  />
{/if}

<style>
  .stager {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .stage {
    flex: 1;
    overflow-y: auto;
    /* This screen must never scroll sideways: content wraps/shrinks to fit, so
       clip any residual horizontal overflow rather than growing a scrollbar.
       Nested strips that scroll on purpose (.cf-off-ref-strip) keep their own. */
    overflow-x: hidden;
    padding: var(--space-s);
  }
  .hint {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    margin-top: var(--space-s);
  }
  .link {
    background: none;
    border: none;
    text-decoration: underline;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    color: var(--ink);
  }
  .mt {
    margin-top: var(--space-s);
  }
  /* The retry beside the unreachable message (#204). Only its spacing under the
     sentence lives here; the frame is the shared Button's. `:global` for the
     same reason `.escape` needs it — the class rides a child component. */
  .mt :global(.off-retry) {
    margin-top: var(--space-xs);
  }

  .staged {
    display: flex;
    flex-direction: column;
  }
  /* Found-but-poor nudge (§1) — soft amber, dismissible; never blocks the Log
     button beneath it. */
  .nudge {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
    margin-top: var(--space-2xs);
    padding: var(--space-xs) var(--space-s);
    background: rgba(255, 204, 0, 0.12);
    border: 1px solid var(--amber-bg);
    border-radius: var(--radius);
  }
  .nudge-text {
    font-size: 0.82rem;
    line-height: 1.4;
    color: var(--text-primary);
  }
  .nudge-go {
    align-self: stretch;
    background: var(--ink);
    color: var(--paper);
    border: 0;
    border-radius: var(--radius);
    padding: 0.5rem 0.7rem;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    min-height: 40px;
  }
  .viewport {
    position: relative;
    height: 240px;
    background: var(--ink);
    margin-top: var(--space-s);
    overflow: hidden;
  }
  .scanner-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .reticle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 70%;
    height: 70px;
    border: 3px solid var(--red-bg);
    box-shadow: 0 0 0 4000px rgba(0, 0, 0, 0.45);
  }

  /* Desktop photo-upload dropzone — the Scan tab where no native BarcodeDetector
     exists. Big click/drag target, dashed until a photo lands, tinted on drag. */
  .dropzone {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    margin-top: var(--space-s);
    padding: var(--space-m);
    border: 2px dashed var(--ink);
    border-radius: var(--radius);
    background: var(--surface-2, var(--bg-input));
    cursor: pointer;
    overflow: hidden;
    text-align: center;
  }
  .dropzone.drag {
    border-style: solid;
    border-color: var(--ink);
    background: rgba(204, 255, 0, 0.15);
  }
  .dropzone:focus-visible {
    outline: var(--edge);
    outline-offset: 2px;
  }
  .dropzone.busy {
    cursor: progress;
  }
  /* The chosen photo fills the zone as a dimmed backdrop; the status sits over it. */
  .dropzone-preview {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.35;
  }
  .dropzone-body {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2xs);
    max-width: 22rem;
  }
  .dropzone-icon {
    font-size: 1.8rem;
  }
  .dropzone-title {
    font-weight: 700;
    font-size: var(--step-n1);
    color: var(--text-primary);
  }
  .dropzone-sub {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .dropzone-spinner {
    width: 1.6rem;
    height: 1.6rem;
    border: var(--edge-thick);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* Unreadable-door escape (§1), elevated after ~10 s of no decode. The frame,
     fill and press live in the shared Button (primary) now; only its full-width
     layout in the flow stays here. Reached through `:global` under the scoped
     stage because the class rides a child <Button> (the bits `.methods`
     precedent). */
  .stage :global(.escape) {
    width: 100%;
    margin-top: var(--space-s);
    min-height: 52px;
  }

  .hidden-file-input {
    display: none;
  }

  /* Door reason banner (§1) at the top of the Custom form. */
  .cf-reason {
    margin-bottom: var(--space-s);
    padding: var(--space-xs);
    background: rgba(255, 204, 0, 0.1);
    border: 1px solid var(--amber-bg);
    border-radius: var(--radius);
  }
  .cf-reason p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-primary);
  }
  .cf-reason-code {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    margin-top: var(--space-xs);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .cf-reason-code input {
    font: inherit;
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.6rem;
    color: var(--text-primary);
    text-transform: none;
    letter-spacing: normal;
    font-weight: 400;
    min-height: 44px;
  }

  /* OFF reference-photo strip (§8) — a read-only aid, visually distinct from the
     user's own capture thumb so it never reads as "your photo". */
  .cf-off-ref {
    margin-bottom: var(--space-s);
  }
  .cf-off-ref-lbl {
    display: block;
    margin-bottom: var(--space-3xs);
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-secondary);
  }
  .cf-off-ref-strip {
    display: flex;
    gap: var(--space-2xs);
    overflow-x: auto;
    padding-bottom: var(--space-3xs);
  }
  .cf-off-ref-thumb {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    padding: 0;
    border: 1px dashed var(--ink);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--paper);
    cursor: pointer;
  }
  .cf-off-ref-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Custom = the #52 "Read-along" full-panel form (ADR-0034 §3) ─────────── */
  /* One responsive column capped to the prototype's width, centred on wide
     screens so every row and the sticky Save share the same edges. */
  .cf {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 34rem;
    margin-inline: auto;
  }
  /* Sticky identity card: photo left, name + brand stacked to its right. */
  .cf-idrow {
    position: sticky;
    top: calc(-1 * var(--space-s));
    z-index: 2;
    display: flex;
    align-items: stretch;
    gap: var(--space-s);
    padding: var(--space-2xs) 0;
    margin-bottom: var(--space-s);
    /* Opaque so scrolled rows don't show through when this row sticks — matched
       to the sheet surface (white) rather than --bg-base, which read as a grey
       block against it. */
    background: var(--bg-surface, var(--paper));
    border-bottom: 1px solid var(--border);
  }
  .cf-id {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .cf-title {
    font-size: 1.05rem;
    font-weight: 700;
    min-height: 44px;
  }
  /* The stacked secondary identity inputs under the name (brand, category). */
  .cf-subline {
    font-size: 0.9rem;
    min-height: 38px;
  }
  /* Fixed-width thumb; height stretches to the two stacked inputs (idrow is
     align-items: stretch), so the photo is as tall as name + brand together. */
  .cf-thumb {
    position: relative;
    flex: 0 0 auto;
    width: 60px;
    padding: 0;
    border: 1.5px solid var(--ink);
    background: none;
    cursor: pointer;
    border-radius: var(--radius);
    overflow: hidden;
  }
  /* "+N" extras badge on the display photo — N is the count beyond the first. */
  .cf-thumb-badge {
    position: absolute;
    right: 3px;
    bottom: 3px;
    min-width: 20px;
    padding: 0 5px;
    border-radius: var(--radius);
    background: var(--ink);
    color: var(--paper);
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 18px;
    text-align: center;
  }
  /* OFF's front shot standing in for a photo you haven't taken: the dashed edge
     keeps saying "this slot is still yours to fill" while the image gives the
     product a face. */
  .cf-thumb-off {
    border-style: dashed;
  }
  .cf-thumb-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border-style: dashed;
    font-size: 1.2rem;
    color: var(--text-secondary);
  }
  .cf-thumb-hint {
    font-size: 0.6rem;
    text-transform: uppercase;
    font-weight: 700;
  }
  .cf .photo-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  /* The basis picker (now a shared Segmented) stacked above its optional
     serving-grams field. */
  .cf-basis {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
    margin-bottom: var(--space-m);
  }
  .cf-pack {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  /* Reads as one of the transcription rows below it, because that is what it is:
     a value off the packet. It matched the muted hint text instead, which sized
     it out of the form it belongs to. */
  .cf-pack > span {
    font-size: 0.92rem;
    font-weight: 700;
  }
  .cf-pack input {
    width: 5rem;
    text-align: right;
    min-height: 40px;
  }
  /* The unit picker rides beside the magnitude rather than filling the row, and
     drops its own heading — the field's "Pack size" already names the pair. */
  .cf-pack-unit {
    display: inline-block;
    width: 8.5rem;
  }
  .cf-pack-unit :global(.segmented-label) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .cf-basis-derived,
  .cf-pack-hint {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .cf-group {
    margin-bottom: var(--space-m);
  }
  .cf-grouphead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-xs);
    margin-bottom: var(--space-3xs);
    padding-bottom: var(--space-3xs);
    border-bottom: var(--edge);
  }
  .cf-gh-text {
    display: flex;
    align-items: baseline;
    gap: var(--space-2xs);
    min-width: 0;
  }
  .cf-grouphead h3 {
    margin: 0;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .cf-gh-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .cf-skip-all {
    flex: 0 0 auto;
    background: none;
    border: 0;
    color: var(--text-secondary);
    font: inherit;
    font-size: 0.72rem;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    padding: 0.2rem;
  }

  .cf-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: var(--space-xs);
    min-height: 48px;
    padding: 0.25rem 0.4rem;
    border-bottom: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .cf-lbl {
    font-size: 0.92rem;
    min-width: 0;
  }
  .cf-ctl {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .cf-ctl input {
    width: 5rem;
    text-align: right;
    min-height: 40px;
  }
  .cf-unit {
    width: 2.4rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .cf-skip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    font: inherit;
    color: var(--text-secondary);
  }
  .cf-skip[aria-pressed="true"] {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .cf-row.skip {
    opacity: 0.5;
  }
  /* Restrained AI-confirm "unverified" accent — a left rule + faint wash, not a
     loud fill; clears the instant the row is edited (markReviewed), §4. */
  .cf-row.unverified {
    box-shadow: inset 3px 0 0 var(--amber-bg);
    background: rgba(255, 204, 0, 0.09);
  }
  .cf-prow {
    display: grid;
    grid-template-columns: 1fr 6rem 40px;
    gap: var(--space-xs);
    align-items: center;
    padding: 0.25rem 0.4rem;
  }
  /* The read-along ingredients transcription (ADR-0043 §5) — a plain multi-line
     field, full width, same frame chrome as the rest of the form. */
  .cf-ingredients {
    width: 100%;
    padding: 0.5rem;
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font: inherit;
    resize: vertical;
    min-height: 3.5rem;
  }
  .cf-add {
    margin-top: var(--space-2xs);
    width: 100%;
    background: var(--paper);
    border: 1px dashed var(--ink);
    border-radius: var(--radius);
    padding: 0.6rem;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    min-height: 44px;
  }
  /* A portion label that's just a weight (e.g. "30 g") gets an amber border and
     a hint line — soft, never blocks saving. Matches the found-but-poor nudge. */
  .cf input.cf-in-warn {
    border-color: var(--amber-bg);
    background: rgba(255, 204, 0, 0.1);
  }
  .cf-prow-warn {
    margin: 0 0 var(--space-2xs);
    padding: 0 0.4rem;
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--text-secondary);
  }
  /* Every text field in the read-along form shares one look. `min-width: 0`
     overrides an <input>'s intrinsic ~20ch min so it shrinks with its grid/flex
     track instead of forcing the whole form wider than the viewport (which would
     give this screen a horizontal scroll). */
  .cf input {
    min-width: 0;
    font: inherit;
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.6rem;
    color: var(--text-primary);
  }
  .cf input:focus-visible {
    outline: 2px solid var(--accent, var(--ink));
    outline-offset: -1px;
  }

  /* OFF contribution panel (§8) — visually set apart from the read-along rows
     with a boxed, tinted card so it reads as an optional extra action, not part
     of the food's data entry. */
  .cf-contrib {
    margin-bottom: var(--space-m);
    padding: var(--space-s);
    border: 1.5px solid var(--ink);
    border-radius: var(--radius);
    background: var(--surface-2, var(--bg-input));
  }
  .cf-contrib-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2xs);
    margin-bottom: var(--space-2xs);
  }
  .cf-contrib-head h3 {
    margin: 0;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  /* The row is the shared Checkbox (ADR-0068) — this consent box is the site
     that never got the house skin, and now has it. Only its departure stays
     here: a sentence-case label that wraps, with the box aligned to its first
     line, reached via :global as the class rides the primitive's label. */
  .cf-contrib :global(.cf-contrib-consent) {
    align-items: flex-start;
    font-size: 0.82rem;
    font-weight: normal;
    text-transform: none;
    line-height: 1.35;
    color: var(--text-primary);
  }
  /* The frame, fill, disabled and press states are the shared Button (primary)
     now; only its full-width layout in the contribution card stays here (reached
     via `:global` under the scoped section, as the class rides a child Button). */
  .cf-contrib :global(.cf-contrib-btn) {
    width: 100%;
    margin-top: var(--space-xs);
    min-height: 48px;
  }
  /* Outcome line: red by default (auth/data-quality/network), green on success —
     surfaced inline so a failed send is legible beside the persistent retry. */
  .cf-contrib-msg {
    margin: var(--space-2xs) 0 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--red-text);
  }
  .cf-contrib-msg.ok {
    color: var(--green-text);
  }

  /* Running kcal + "N to review" chip, in the dock above the sticky Save. */
  .cf-sum {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: 0.82rem;
    color: var(--text-secondary);
  }
  .cf-sum strong {
    font-size: 1rem;
    color: var(--text-primary);
  }
  .cf-review-chip {
    font-size: 0.68rem;
    font-weight: 700;
    background: var(--amber-bg);
    color: var(--ink);
    padding: 0.1rem 0.45rem;
    border-radius: var(--radius);
  }

  .dock {
    border-top: var(--edge);
    background: var(--bg-base);
    padding: var(--space-2xs) var(--space-s) var(--space-s);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .dock-input {
    width: 100%;
  }
  .in-wrap {
    position: relative;
  }
  /* The combobox field — we render the <input> ourselves (bits' `child` snippet),
     so this scoped class applies. Mirrors ui/Input's brutalist skin. */
  .cb-input {
    width: 100%;
    box-sizing: border-box;
    background: transparent;
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-2xs) var(--space-s);
    color: var(--text-primary);
    font-size: var(--step-n1);
    font-family: inherit;
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .cb-input::placeholder {
    color: var(--text-muted);
  }
  .cb-input:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.02);
  }
  .cb-input:focus {
    border-color: var(--ink);
    box-shadow: 0 0 0 1px var(--ink);
    background: var(--paper);
  }
  .cb-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* The listbox half of the combobox (ported from the retired FoodResultsList).
     ContentStatic's root and each option are our own elements via `child`, so
     these stay scoped. The keyboard highlight (bits' data-highlighted, mirrored
     to .hl) inverts to black-on-white, matching Segmented's selected cell. */
  .results-head {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }
  .results-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .result-item {
    width: 100%;
    background: var(--food-surface-bg, var(--paper));
    border: var(--food-surface-border, var(--edge-thin));
    border-radius: var(--food-item-radius, var(--radius));
    padding: var(--space-xs) var(--space-s);
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: background 0.2s;
  }
  .result-item:hover {
    background: var(--food-surface-hover, var(--bg-input));
  }
  .result-item.hl {
    background: var(--ink);
    color: var(--paper);
  }
  .result-details {
    display: flex;
    flex-direction: column;
  }
  .result-name {
    font-size: var(--step-n1);
    font-weight: 600;
  }
  /* A curated stand-in, marked in the row so the substitution is visible before
     the food is chosen (ADR-0046 §5). Non-interactive by necessity — the row is
     a role=option — so it reads as a tag, not a control. */
  .stand-in-tag {
    margin-left: var(--space-2xs);
    padding: 0 4px;
    border: var(--edge-thin);
    font-size: var(--step-n3);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
    color: var(--ink);
    background: var(--highlight-bg);
  }
  .result-macros {
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin-top: 2px;
  }
  .result-item.hl .result-macros {
    color: var(--paper);
  }
  .select-arrow {
    color: var(--text-muted);
    font-size: var(--step-0);
  }
  .result-item.hl .select-arrow {
    color: var(--paper);
  }
  .in-spinner {
    position: absolute;
    top: 50%;
    right: var(--space-s);
    transform: translateY(-50%);
    width: 1.15rem;
    height: 1.15rem;
    border: var(--edge);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    pointer-events: none;
  }
  @keyframes spin {
    to {
      transform: translateY(-50%) rotate(360deg);
    }
  }

  /* bits-ui renders the tablist and its triggers, so their scope class is not
     applied — reach them with :global, but keep the selectors bounded to this
     component's dock so the generic `.method`/`.methods` names never leak (the
     Segmented precedent bounds its cell as `:global(.seg-row .seg)`). The active
     tab is bits' data-state="active", not the old `.on` class. */
  .dock :global(.methods) {
    display: flex;
    gap: var(--space-2xs);
  }
  .dock :global(.methods .method) {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: var(--paper);
    border: var(--edge);
    padding: var(--space-2xs) 0;
    cursor: pointer;
    min-height: 52px;
  }
  .dock :global(.methods .method[data-state="active"]) {
    background: var(--ink);
    color: var(--paper);
  }
  .dock :global(.methods .method:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .mi {
    font-size: var(--step-0);
  }
  .ml {
    font-size: var(--step-n3);
    font-weight: 700;
    text-transform: uppercase;
  }
</style>
