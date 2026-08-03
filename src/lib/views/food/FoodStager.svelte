<script lang="ts">
  import {
    lookupBarcode,
    submitToOpenFoodFacts,
    ProductNotFoundError,
    type OffPayload,
    type OffSubmitResult,
  } from "../../food/open-food-facts";
  import {
    searchUsdaFoods,
    mapPayloadToFoodResult,
    isPoorFoodTwin,
    type FoodResult,
  } from "../../food/food-search";
  import type { EntityPayload } from "../../ingestion/ingest";
  import { getLocalFoodTwin } from "../../stores/calorie.store";
  import {
    settingsStore,
    nutritionDisplayDecimals,
  } from "../../stores/settings.store";
  import { secretsStore } from "../../stores/secrets";
  import {
    roundFoodDisplay,
    scaleNutrition,
    FOOD_PORTIONS_ATTR,
    NUTRITION_INFO_ATTR,
    type Portion,
    type NutritionInfo,
  } from "../../food/nutrition";
  import {
    buildNutrientPills,
    buildNutrientBreakdown,
  } from "../../food/nutrient-display";
  import {
    CORE,
    DETAIL,
    MICROS,
    ALL_FIELDS,
    buildLabelPanel,
    toDisplay,
    type FieldDef,
    type Basis,
    type PortionRow,
  } from "../../food/label-form";
  import { buildLabelCapture } from "../../food/provenance";
  import {
    decodeBarcode,
    decodeBarcodeFromImage,
  } from "../../food/barcode-scan";
  import {
    emptyAutofillResult,
    type AIAutofillResult,
  } from "../../food/ai-autofill";
  import { hydrateFdcFood } from "../../food/usda-fdc";
  import type {
    FoodChoice,
    ChooseOutcome,
    StagerSeed,
    StagerExtraTab,
    StagerIds,
    PrimaryLabelContext,
  } from "../../food/food-staging";

  import Alert from "../../ui/Alert.svelte";
  import Input from "../../ui/Input.svelte";
  import FoodResultsList from "./FoodResultsList.svelte";
  import LabelPhotoReader from "./LabelPhotoReader.svelte";
  import MacroPills from "./MacroPills.svelte";
  import NutrientBreakdown from "./NutrientBreakdown.svelte";
  import QuantityGrams from "./QuantityGrams.svelte";

  // The shared food-staging surface behind both the direct-log sheet and the
  // add-ingredient sheet (issue #16). It owns the Search / Scan / Custom method
  // switch, each sub-flow, the staged-food card with its live macro preview
  // (reusing the QuantityGrams control, ADR-0023), and the bottom method dock
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
    /** Hides the method switcher — the direct-log sheet's edit mode locks onto
     *  one food's amount. */
    lockMethods = false,
    /** One-time pre-population for edit mode (see {@link StagerSeed}). */
    seed = null,
    /** Host-injected method tabs beyond Search / Scan / Custom (e.g. the log
     *  sheet's Recipe browser), rendered via the `tabContent` snippet. */
    extraTabs = [],
    /** Recently used foods, newest first, shown in the Search tab while the
     *  query box is empty so a repeat food is one tap away. Host-supplied (it
     *  knows what "recent" means for its surface); empty hides the section. */
    recent = [],
    /** DOM ids for each host's e2e selectors. */
    ids,
    /** The staged food, exposed so the host header's back button can clear it
     *  ("Change food" / "Back"). */
    staged = $bindable(null),
    tabContent,
  }: {
    onChoose: (choice: FoodChoice) => ChooseOutcome | Promise<ChooseOutcome>;
    primaryLabel: (ctx: PrimaryLabelContext) => string;
    primaryDisabled?: boolean;
    allowPhoto?: boolean;
    lockMethods?: boolean;
    seed?: StagerSeed | null;
    extraTabs?: StagerExtraTab[];
    recent?: FoodResult[];
    ids: StagerIds;
    staged?: FoodResult | null;
    tabContent?: import("svelte").Snippet<[string]>;
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

  let method = $state<string>("search");
  let query = $state("");
  let barcode = $state("");

  let status = $state<"idle" | "loading" | "error">("idle");
  let error = $state("");
  let results = $state<FoodResult[]>([]);

  // `grams` is the authoritative amount owned by the QuantityGrams control
  // (ADR-0023); it stays a clean number, so `factor` simply scales by it.
  let grams = $state(100);
  let factor = $derived(grams / 100);

  // The staged food's full nutrition panel (per its serving basis), scaled to the
  // typed amount and turned into the always-on Calories pill + one pill per
  // selected nutrient (default Protein/Fat/Carbs/Fibre, ticket #29). Built from
  // the panel — not the four flat macros — so a selected micronutrient can show.
  let stagedInfo = $derived(
    staged?.payload.attributes[NUTRITION_INFO_ATTR] as NutritionInfo | undefined
  );
  let stagedBreakdown = $derived(scaleNutrition(stagedInfo, factor));
  let stagedPills = $derived(
    buildNutrientPills(
      stagedBreakdown,
      $settingsStore.visible_nutrients,
      $nutritionDisplayDecimals
    )
  );
  // The full panel breakdown — every macro AND micronutrient the food carries,
  // scaled to the typed amount — behind a collapsed disclosure so the default
  // card (name · macro pills) stays uncluttered (ticket #30). Absent fields are
  // omitted, micronutrients reformatted to mg/µg, all in the domain layer.
  let stagedFullRows = $derived(
    buildNutrientBreakdown(stagedBreakdown, $nutritionDisplayDecimals)
  );

  // The staged food's household portions (ADR-0030), surfaced as picker presets.
  // Read live off the staged payload so they appear the moment hydration spreads
  // them on; empty (and the picker renders as today) for a portion-less food.
  let stagedPortions = $derived<Portion[]>(
    (staged?.payload.attributes[FOOD_PORTIONS_ATTR] as Portion[] | undefined) ??
      []
  );
  // True while a searched food's detail record is being fetched for its portions
  // — a non-blocking affordance only: the gram field is fully usable throughout,
  // and a failed fetch degrades to no portions (ADR-0030 §5).
  let hydratingPortions = $state(false);

  // Portion detail fetched this staging session, keyed by FDC id. Re-selecting a
  // searched food (tapping back to the results and choosing it again) reuses
  // this instead of re-hitting `/food/{fdcId}` — the search results array holds
  // the un-hydrated item, so without the cache every re-selection refetches.
  // Foods that were *logged* already persist their portions on the ledger twin
  // (they arrive via `recent` carrying `food/portions` and skip below), so this
  // only covers the not-yet-logged, in-session re-selection path.
  const portionCache = new Map<number, Record<string, unknown>>();

  // Spread a portion/provenance augmentation onto a search result's payload,
  // keeping its search-time name and nutrition and merely adding portions.
  function mergePortions(
    item: FoodResult,
    attributes: Record<string, unknown>
  ): FoodResult {
    return {
      ...item,
      payload: {
        ...item.payload,
        attributes: { ...item.payload.attributes, ...attributes },
      },
    };
  }

  // Stage a chosen food and, for a searched USDA food that arrived without
  // portions, hydrate its `/food/{fdcId}` detail once (ADR-0030 §5) — not per
  // keystroke, off the select. The augmentation (portions + refreshed
  // provenance) is SPREAD onto the staged payload so the food keeps its
  // search-time name and nutrition and merely gains portions; the search-time
  // nutrition/info is never re-mapped. A non-fdc food (a scanned OFF product, a
  // local recent twin) or one already carrying portions skips the fetch, as does
  // one whose portions this session already fetched.
  async function stageFood(item: FoodResult) {
    staged = item;
    grams = 100;
    hydratingPortions = false;
    const match = /^fdc:(\d+)$/.exec(item.entity);
    if (!match) return;
    if (item.payload.attributes[FOOD_PORTIONS_ATTR]) return;
    const fdcId = Number(match[1]);
    const cached = portionCache.get(fdcId);
    if (cached) {
      staged = mergePortions(item, cached);
      return;
    }
    hydratingPortions = true;
    try {
      const augmentation = await hydrateFdcFood(fdcId);
      portionCache.set(fdcId, augmentation.attributes);
      const merged = mergePortions(item, augmentation.attributes);
      // Only apply if this food is still the staged one — a fast user may have
      // gone back or staged another before the fetch resolved.
      if (staged?.entity === item.entity) staged = merged;
    } catch {
      // Degrade to no portions; gram logging is never blocked (ADR-0030 §5).
    } finally {
      if (staged?.entity === item.entity) hydratingPortions = false;
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
  let customBasis = $state<Basis>("per_100g");
  // Grams one serving weighs — only meaningful when the basis is per_serving.
  let customServingGrams = $state("");
  // Per-field typed strings keyed by NutritionInfo field; "" ⇒ absent (not 0).
  let customValues = $state<Record<string, string>>({});
  let customPortions = $state<PortionRow[]>([]);
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

  // ── The four label-capture doors (ADR-0034 §1) ─────────────────────────────
  // The Custom form is reached four ways: a 404 (missing), a poor-quality OFF
  // twin (found-but-poor), an undecodable barcode (unreadable), and the plain
  // manual tab (always-on). The first three set a reason banner and carry the
  // barcode/partial payload in; the manual tab is a fresh empty form. `barcode`
  // (already declared above) is the single key source: whatever code reached the
  // form keys the save (`gtin:` enrich vs `food:custom_` mint, §6), so the doors
  // just keep or clear it.
  // Which door routed into the Custom form — a shared alias so the union is
  // stated once, not restated at every call site (§3.1).
  type CaptureReason = "missing" | "poor" | "unreadable";
  let captureReason = $state<CaptureReason | null>(null);
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
  // Open the read-only OFF reference reader on this index; null = closed.
  let refReaderIndex = $state<number | null>(null);
  // The OFF payload carried into the form by the found-but-poor door, so the host
  // ingests it beside the correction — its `twin/raw_provenance` survives and the
  // enriched `gtin:` twin is genuinely dual-origin (ADR-0034 §6/§7). Null for the
  // missing/unreadable/manual doors, which have no OFF record to preserve.
  let captureOffPayload = $state<EntityPayload | null>(null);
  // Unreadable door: the scanner elevates a "photograph the label" escape after a
  // persistent failure. A tunable threshold (~10 s), not a hard requirement (#48).
  const UNREADABLE_ELEVATE_MS = 10_000;
  let scanStalled = $state(false);
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  // The staged twin's origin badge (§7), driven purely by the PRESENCE of a
  // `food/label_capture` datom: "edited from label" when OFF provenance sits
  // beside it (a corrected `gtin:` twin), "your entry" when it stands alone (a
  // `food:custom_` mint). Advisory only — it never changes logging.
  let stagedOrigin = $derived.by<null | "edited" | "your">(() => {
    const attrs = staged?.payload.attributes;
    if (!attrs?.["food/label_capture"]) return null;
    return attrs["twin/raw_provenance"] ? "edited" : "your";
  });

  // Reason-specific copy shown at the top of the Custom form per door (§1).
  const CAPTURE_COPY: Record<CaptureReason, string> = {
    missing:
      "This barcode isn’t in Open Food Facts yet — add it here and it’s yours on the next scan.",
    poor: "Open Food Facts only had partial data for this — fill in what’s missing from the label.",
    unreadable:
      "Couldn’t read the barcode. Enter the label details here; add the digits below if you can read them.",
  };

  // Route one of the doors into the Custom form: set the reason banner, keep the
  // barcode (already in `barcode` state), and prefill from a partial OFF payload
  // when the door carries one (found-but-poor). Missing/unreadable start empty.
  function openCaptureForm(
    reason: CaptureReason,
    payload?: OffPayload,
    completeness?: number
  ) {
    method = "custom";
    staged = null;
    status = "idle";
    error = "";
    nudge = false;
    captureReason = reason;
    captureCompleteness = completeness;
    // Only the found-but-poor door preserves an OFF record beside the correction.
    captureOffPayload = reason === "poor" ? (payload ?? null) : null;
    if (payload) prefillFromPayload(payload);
    else resetCustomForm();
    // Desktop upload path: the photo that was dropped/chosen to reach this door
    // rides in as the label photo, so a desktop capture arrives with its photo
    // attached exactly as a phone capture would (both reset labelPhotos above).
    if (uploadedPhoto) labelPhotos = [uploadedPhoto];
  }

  // Blank every custom-form field back to a fresh empty read-along form.
  function resetCustomForm() {
    applyAutofill(emptyAutofillResult());
    customServingGrams = "";
    customPortions = [];
    skipped = new Set();
    labelPhotos = [];
    offRefPhotos = [];
  }

  // Seed the Custom form from a partial OFF payload (found-but-poor door): name
  // (dropping the "Unknown" placeholder), brand, whatever nutriments OFF carried
  // (typed back into the label's units), and its portions — all editable, none
  // marked "unverified" (that amber accent is the deferred AI-confirm path, §4).
  function prefillFromPayload(payload: OffPayload) {
    const attrs = payload.attributes;
    const name = (attrs["food/name"] as string | undefined) ?? "";
    customName = name === "Unknown" ? "" : name;
    customBrand = (attrs["twin/brand"] as string | undefined) ?? "";
    // OFF panels are per-100 g (the mapper stamps PER_100G); the form matches.
    customBasis = "per_100g";
    customServingGrams = "";
    const info = attrs[NUTRITION_INFO_ATTR] as NutritionInfo | undefined;
    const values: Record<string, string> = {};
    for (const f of ALL_FIELDS) {
      const grams = info?.[f.key];
      values[f.key] = typeof grams === "number" ? toDisplay(grams, f.unit) : "";
    }
    customValues = values;
    prefilled = new Set();
    skipped = new Set();
    const portions = attrs[FOOD_PORTIONS_ATTR] as Portion[] | undefined;
    customPortions = (portions ?? []).map((p) => ({
      label: p.label,
      grams: String(p.grams),
    }));
    // The user starts with no captured photos of their own here.
    labelPhotos = [];
    // OFF's own photos ride alongside as a read-only reference to read the label
    // off — never merged into the user's capture set, never saved.
    offRefPhotos = payload.referenceImages ?? [];
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
      servingGrams: customServingGrams,
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

  let hasKey = $derived(!!$secretsStore.usda_api_key);

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
  // must be ticked every time; the Settings master toggle only SEEDS its default.
  // Seed once each time the offer (re)appears, so a later settings tick doesn't
  // silently re-check a box the user cleared.
  let contributeChecked = $state(false);
  let contributeSeeded = false;
  $effect(() => {
    if (contributeOffered && !contributeSeeded) {
      contributeChecked = $settingsStore.off_contribute;
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
      grams = seed.grams;
    } else {
      method = "custom";
      customName = seed.name;
      if (seed.brand) customBrand = seed.brand;
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
  $effect(() => {
    const trimmed = query.trim();
    if (method !== "search" || staged) return;
    clearTimeout(debounceTimer);
    if (trimmed.length === 0) {
      results = [];
      status = "idle";
      error = "";
      lastQuery = "";
    } else if (
      trimmed.length >= 3 &&
      hasKey &&
      // Skip if these results already match the query (e.g. we just came back
      // from staging a food); a failed query is not cached, so it can retry.
      !(trimmed === lastQuery && status !== "error")
    ) {
      status = "loading";
      debounceTimer = setTimeout(() => handleSearch(), 400);
    }
    return () => clearTimeout(debounceTimer);
  });

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
        formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
      });
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      videoEl.srcObject = stream;
      videoEl.play();
      scanning = true;
      scanError = "";
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
      if (code && scanning) {
        barcode = code;
        stopCamera();
        await handleBarcodeLookup();
      }
    } finally {
      fallbackBusy = false;
    }
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
          barcode = codes[0].rawValue;
          stopCamera();
          await handleBarcodeLookup();
          return;
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
      uploadedPhoto = await readAsDataUrl(file);
    } catch {
      decoding = false;
      uploadError = "Couldn’t read that image file.";
      return;
    }
    try {
      const code = await decodeBarcodeFromImage(file);
      if (code) {
        barcode = code;
        decoding = false;
        await handleBarcodeLookup();
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
    results = [];
    staged = null;
    try {
      results = await searchUsdaFoods(query);
      lastQuery = query.trim();
      status = "idle";
    } catch (e: any) {
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
      const local = await getLocalFoodTwin(`gtin:${code}`);
      // A local twin never nudges — a prior capture already superseded the poor
      // OFF data (latest-wins) — so it stages and returns. Only a freshly
      // looked-up OFF twin (typed `OffPayload`, so `completeness` is in reach)
      // runs the found-but-poor predicate below (§1).
      if (local) {
        staged = mapPayloadToFoodResult(local);
        grams = 100;
        status = "idle";
        return;
      }
      const off = await lookupBarcode(code);
      staged = mapPayloadToFoodResult(off);
      grams = 100;
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
    Promise.allSettled(files.map(readAsDataUrl)).then((outcomes) => {
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

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
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
    error = "";
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
      offRefPhotos = [];
      refReaderIndex = null;
      barcode = "";
    }
  }

  let canPrimary = $derived(
    (!!staged && grams > 0) ||
      (method === "custom" && !!customName.trim() && runningKcal !== "") ||
      (method === "scan" && !staged && !!barcode.trim())
  );

  // Build the household portions the user typed into `Portion` shape, dropping
  // wholly-blank rows. A hand-typed portion carries its own label as the unit.
  function buildCustomPortions(): Portion[] {
    return customPortions
      .filter((p) => p.label.trim() !== "" || p.grams.trim() !== "")
      .map((p) => ({
        label: p.label.trim(),
        amount: 1,
        unit: p.label.trim() || "serving",
        grams: Number(p.grams.trim()) || 0,
      }));
  }

  function primaryAction() {
    if (staged) {
      return commit({ kind: "food", food: staged, grams });
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
        nutrition,
        portions: portions.length ? portions : undefined,
        labelPhotos: photos.length ? photos : undefined,
        labelCapture,
        // The key follows the barcode (§6): a code carried in by a door (or typed
        // in the unreadable banner) enriches `gtin:<code>` in place; an empty one
        // mints a fresh `food:custom_` twin. The host maps this to the save key.
        barcode: barcode.trim() || undefined,
        // The found-but-poor door's OFF record, so the host preserves its
        // provenance beside the correction (§6/§7 dual-origin). Absent otherwise.
        offPayload: captureOffPayload ?? undefined,
      });
    }
    if (method === "scan") return handleBarcodeLookup();
  }

  let showTabs = $derived(!staged && !lockMethods);
  // The custom form carries its own name field in its identity-card header, so
  // the shared dock input is dropped for it (Search/Scan still use it).
  let showInput = $derived(!staged && !isExtra(method) && method !== "custom");
  let showPrimary = $derived(!isExtra(method));
</script>

<div class="stager">
  <!-- Staging / results area -->
  <div class="stage">
    {#if staged}
      <div class="staged">
        <div class="staged-head">
          <h3>{staged.name}</h3>
          {#if stagedOrigin}
            <!-- Origin badge (§7): user-entered vs OFF-sourced, at a glance. -->
            <span class="origin-badge" data-testid="origin-badge">
              ✏️ {stagedOrigin === "edited"
                ? "edited from label"
                : "your entry"}
            </span>
          {/if}
        </div>
        {#if nudge}
          <!-- Found-but-poor nudge (§1): soft, dismissible, never blocks logging
               the poor twin as-is — the Log button below stays live. -->
          <div class="nudge" data-testid="poor-nudge" role="status">
            <span class="nudge-text"
              >This entry looks incomplete. Improve it from the label?</span
            >
            <div class="nudge-acts">
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
              <button
                type="button"
                class="nudge-x"
                aria-label="Dismiss"
                onclick={() => (nudge = false)}>✕</button
              >
            </div>
          </div>
        {/if}
        <p class="per">
          Per 100g · {roundFoodDisplay(
            staged.calories,
            $nutritionDisplayDecimals
          )} kcal · P {roundFoodDisplay(
            staged.protein,
            $nutritionDisplayDecimals
          )}g · F {roundFoodDisplay(staged.fat, $nutritionDisplayDecimals)}g · C {roundFoodDisplay(
            staged.carbs,
            $nutritionDisplayDecimals
          )}g
        </p>
        <span class="fl">Quantity (grams)</span>
        <QuantityGrams
          bind:grams
          portions={stagedPortions}
          hydrating={hydratingPortions}
        />
        <div class="preview">
          <MacroPills pills={stagedPills} />
        </div>
        <div class="full-panel">
          <NutrientBreakdown
            rows={stagedFullRows}
            testid="food-nutrient-breakdown"
          />
        </div>
      </div>
    {:else if isExtra(method)}
      {@render tabContent?.(method)}
    {:else if method === "search"}
      {#if !hasKey}
        <Alert variant="warning">
          Add a USDA API key in Settings to search the food database.
        </Alert>
      {/if}
      {#if query.trim().length === 0 && recent.length > 0}
        <!-- Idle search box: offer recent foods so a repeat log is one tap. -->
        <FoodResultsList
          results={recent}
          heading="Recent"
          onSelect={(item) => stageFood(item)}
        />
      {:else}
        <FoodResultsList
          {results}
          heading={results.length ? "Results" : undefined}
          onSelect={(item) => stageFood(item)}
        />
        {#if hasKey && status === "idle" && query.trim().length >= 3 && results.length === 0}
          <p class="hint">No matches for “{query.trim()}”.</p>
        {/if}
      {/if}
    {:else if method === "scan"}
      {#if scanError}<Alert variant="warning">{scanError}</Alert>{/if}
      {#if showLiveScanner}
        <!-- Live camera scanner (native BarcodeDetector present + camera OK). -->
        <div class="viewport">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={videoEl} class="scanner-video" playsinline></video>
          <div class="reticle"></div>
        </div>
        <p class="hint">
          Point the camera at a barcode, or type the number below. No result? <button
            class="link"
            onclick={() => switchMethod("custom")}>Add a custom entry</button
          >.
        </p>
        {#if scanStalled}
          <!-- Unreadable door (§1): after a persistent no-decode stretch, elevate
               a prominent "photograph the label" escape so a barcode that won't
               scan still leads somewhere. Routes barcode-less to the Custom form;
               the user can still add legible digits in the form's reason banner. -->
          <button
            type="button"
            class="escape"
            data-testid="unreadable-escape"
            onclick={() => openCaptureForm("unreadable")}
          >
            📷 Can’t scan it? Photograph the label instead
          </button>
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
            <img src={uploadedPhoto} alt="" class="dropzone-preview" />
          {/if}
          <div class="dropzone-body">
            {#if decoding}
              <span class="dropzone-spinner" aria-hidden="true"></span>
              <span class="dropzone-title">Reading the barcode…</span>
            {:else}
              <span class="dropzone-icon" aria-hidden="true">📷</span>
              <span class="dropzone-title"
                >Drop a photo of the barcode, or click to choose</span
              >
              <span class="dropzone-sub"
                >or type the number below — it looks the product up the same way
                a scan does</span
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
          <button
            type="button"
            class="escape"
            data-testid="unreadable-escape"
            onclick={() => openCaptureForm("unreadable")}
          >
            ✏️ Enter the label details instead
          </button>
        {/if}
      {/if}
    {:else}
      <!-- Custom = the #52 "Read-along" full-panel form (ADR-0034 §2–§4). Name +
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
              >Open Food Facts photos — read the label to fill the gaps</span
            >
            <div class="cf-off-ref-strip">
              {#each offRefPhotos as src, i (src)}
                <button
                  type="button"
                  class="cf-off-ref-thumb"
                  onclick={() => (refReaderIndex = i)}
                  aria-label={`View Open Food Facts photo ${i + 1} of ${offRefPhotos.length}`}
                >
                  <img {src} alt="" loading="lazy" />
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
                <img src={labelPhotos[0]} alt="Label" class="photo-preview" />
                {#if labelPhotos.length > 1}
                  <span class="cf-thumb-badge" data-testid="photo-count-badge"
                    >+{labelPhotos.length - 1}</span
                  >
                {/if}
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
              class="cf-brand"
              placeholder="Brand — optional"
              aria-label="Brand"
              bind:value={customBrand}
            />
          </div>
        </div>

        <div
          class="cf-basis"
          role="group"
          aria-label="Values on the label are per"
        >
          <span class="cf-basis-lbl">Values per</span>
          <div class="cf-seg">
            <button
              type="button"
              class:on={customBasis === "per_100g"}
              onclick={() => (customBasis = "per_100g")}>100 g</button
            >
            <button
              type="button"
              class:on={customBasis === "per_serving"}
              onclick={() => (customBasis = "per_serving")}>serving</button
            >
          </div>
          {#if customBasis === "per_serving"}
            <!-- A serving weight resolves the panel's serving_size to `N g`; left
                 blank it stays the bare `1 serving` (§3). -->
            <label class="cf-serving">
              <input
                id="cf-serving-grams"
                type="text"
                inputmode="decimal"
                placeholder="g"
                aria-label="Grams per serving"
                bind:value={customServingGrams}
              />
              <span>g / serving</span>
            </label>
          {/if}
        </div>

        {#each customSections as sec (sec.head)}
          <section class="cf-group">
            <div class="cf-grouphead">
              <div class="cf-gh-text">
                <h3>{sec.head}</h3>
                {#if sec.hint}<span class="cf-gh-hint">{sec.hint}</span>{/if}
              </div>
              <button
                type="button"
                class="cf-skip-all"
                onclick={() => skipSection(sec.fields)}>none on label</button
              >
            </div>
            <div class="cf-list">
              {#each sec.fields as f (f.key)}
                <div
                  class="cf-row"
                  class:skip={skipped.has(f.key)}
                  class:unverified={prefilled.has(f.key)}
                >
                  <label class="cf-lbl" for={idFor[f.key] ?? `cf-${f.key}`}
                    >{f.label}</label
                  >
                  <div class="cf-ctl">
                    <input
                      id={idFor[f.key] ?? `cf-${f.key}`}
                      type="text"
                      inputmode="decimal"
                      placeholder={skipped.has(f.key) ? "not on label" : "0"}
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
              <div class="cf-prow">
                <input
                  placeholder="e.g. 1 slice"
                  aria-label="Portion label"
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

        {#if contributeOffered}
          <!-- OFF contribution (§8): offered only for a barcoded (`gtin:`) twin
               with an OFF login. Model-C consent — the checkbox is always shown
               and must be ticked; the Settings master toggle only seeds it.
               Decoupled from Save so nothing is ever sent by accident, and the
               button persists for online-only manual retry. -->
          <section class="cf-contrib" data-testid="off-contribute">
            <div class="cf-contrib-head">
              <h3>Contribute to Open Food Facts</h3>
              <span class="cf-gh-hint">optional · barcoded products</span>
            </div>
            <label class="cf-contrib-consent">
              <input
                type="checkbox"
                data-testid="off-contribute-consent"
                bind:checked={contributeChecked}
              />
              <span
                >Share this product's structured data with Open Food Facts under
                your OFF login. No photos are sent.</span
              >
            </label>
            <button
              type="button"
              class="cf-contrib-btn"
              data-testid="off-contribute-submit"
              disabled={!contributeChecked || contributeStatus === "sending"}
              onclick={contributeToOff}
            >
              {contributeStatus === "sending"
                ? "Contributing…"
                : "Contribute to OFF"}
            </button>
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

    {#if status === "error"}
      <div class="mt"><Alert variant="error">{error}</Alert></div>
    {/if}
  </div>

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
            bind:value={barcode}
            onkeydown={(e) => e.key === "Enter" && handleBarcodeLookup()}
          />
        {:else}
          <div class="in-wrap">
            <Input
              id={ids.search}
              placeholder="Search foods…"
              bind:value={query}
              disabled={!hasKey}
              onkeydown={(e) => e.key === "Enter" && handleSearch()}
            />
            {#if status === "loading"}
              <span class="in-spinner" aria-label="Searching USDA"></span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if showTabs}
      <div class="methods">
        {#each methodTabs as [m, ico, label]}
          <button
            class="method"
            class:on={method === m}
            onclick={() => switchMethod(m)}
          >
            <span class="mi">{ico}</span><span class="ml">{label}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if method === "custom" && !staged}
      <div class="cf-sum">
        <span><strong>{runningKcal || "—"}</strong> kcal</span>
        {#if toReview > 0}
          <span class="cf-review-chip">{toReview} to review</span>
        {/if}
      </div>
    {/if}

    {#if showPrimary}
      <button
        class="primary"
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
      </button>
    {/if}
  </div>
</div>

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
    color: #000;
  }
  .mt {
    margin-top: var(--space-s);
  }

  .staged {
    display: flex;
    flex-direction: column;
  }
  .staged-head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }
  .staged h3 {
    font-size: var(--step-1);
    font-weight: 700;
  }
  /* Origin badge (§7) — a quiet advisory pill, never competing with the name. */
  .origin-badge {
    flex: 0 0 auto;
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-secondary);
    background: var(--surface-2, #f4f4f5);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    white-space: nowrap;
  }
  /* Found-but-poor nudge (§1) — soft amber, dismissible; never blocks the Log
     button beneath it. */
  .nudge {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: var(--space-2xs);
    padding: var(--space-2xs) var(--space-xs);
    background: rgba(255, 204, 0, 0.12);
    border: 1px solid #f5b301;
    border-radius: 10px;
  }
  .nudge-text {
    flex: 1;
    min-width: 0;
    font-size: 0.82rem;
    color: var(--text-primary);
  }
  .nudge-acts {
    display: flex;
    align-items: center;
    gap: var(--space-3xs);
  }
  .nudge-go {
    background: #000;
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 0.35rem 0.7rem;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    min-height: 36px;
  }
  .nudge-x {
    background: none;
    border: 0;
    color: var(--text-secondary);
    font: inherit;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    min-height: 36px;
  }
  .per {
    color: var(--text-secondary);
    font-size: var(--step-n2);
    margin-top: 2px;
  }
  .fl {
    display: block;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    margin: var(--space-m) 0 var(--space-3xs);
  }
  .preview {
    margin-top: var(--space-m);
  }
  .full-panel {
    margin-top: var(--space-s);
  }

  .viewport {
    position: relative;
    height: 240px;
    background: #000;
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
    border: 3px solid #ff3333;
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
    border: 2px dashed var(--border-accent);
    border-radius: 12px;
    background: var(--surface-2, #f4f4f5);
    cursor: pointer;
    overflow: hidden;
    text-align: center;
  }
  .dropzone.drag {
    border-style: solid;
    border-color: var(--border-accent);
    background: rgba(204, 255, 0, 0.15);
  }
  .dropzone:focus-visible {
    outline: 2px solid var(--border-accent);
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
    border: 3px solid var(--border-accent);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* Unreadable-door escape (§1), elevated after ~10 s of no decode. */
  .escape {
    width: 100%;
    margin-top: var(--space-s);
    background: #000;
    color: #fff;
    border: 2px solid #000;
    border-radius: 10px;
    padding: var(--space-s);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    min-height: 52px;
  }
  .escape:active {
    transform: scale(0.98);
  }

  .hidden-file-input {
    display: none;
  }

  /* Door reason banner (§1) at the top of the Custom form. */
  .cf-reason {
    margin-bottom: var(--space-s);
    padding: var(--space-xs);
    background: rgba(255, 204, 0, 0.1);
    border: 1px solid #f5b301;
    border-radius: 10px;
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
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
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
    border: 1px dashed var(--border-accent);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
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
    background: var(--bg-base, #fff);
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
  .cf-brand {
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
    border: 1.5px solid var(--border-accent);
    background: none;
    cursor: pointer;
    border-radius: 10px;
    overflow: hidden;
  }
  /* "+N" extras badge on the display photo — N is the count beyond the first. */
  .cf-thumb-badge {
    position: absolute;
    right: 3px;
    bottom: 3px;
    min-width: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: #000;
    color: #fff;
    font-size: 0.68rem;
    font-weight: 800;
    line-height: 18px;
    text-align: center;
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
  .cf-basis {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-bottom: var(--space-m);
  }
  .cf-basis-lbl {
    font-size: 0.82rem;
    color: var(--text-secondary);
  }
  .cf-serving {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .cf-serving input {
    width: 4.5rem;
    text-align: right;
    min-height: 40px;
  }
  .cf-seg {
    display: inline-flex;
    flex: 1;
    max-width: 16rem;
    border: 1.5px solid var(--border-accent);
    border-radius: 10px;
    overflow: hidden;
  }
  .cf-seg button {
    flex: 1;
    border: 0;
    background: #fff;
    padding: 0.5rem 0.6rem;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    min-height: 40px;
  }
  .cf-seg button.on {
    background: #000;
    color: #fff;
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
    border-bottom: 2px solid var(--border-accent);
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
    border-radius: 6px;
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
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    font: inherit;
    color: var(--text-secondary);
  }
  .cf-skip[aria-pressed="true"] {
    background: #000;
    color: #fff;
    border-color: #000;
  }
  .cf-row.skip {
    opacity: 0.5;
  }
  /* Restrained AI-confirm "unverified" accent — a left rule + faint wash, not a
     loud fill; clears the instant the row is edited (markReviewed), §4. */
  .cf-row.unverified {
    box-shadow: inset 3px 0 0 #f5b301;
    background: rgba(255, 204, 0, 0.09);
  }
  .cf-prow {
    display: grid;
    grid-template-columns: 1fr 6rem 40px;
    gap: var(--space-xs);
    align-items: center;
    padding: 0.25rem 0.4rem;
  }
  .cf-add {
    margin-top: var(--space-2xs);
    width: 100%;
    background: #fff;
    border: 1px dashed var(--border-accent);
    border-radius: 10px;
    padding: 0.6rem;
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    min-height: 44px;
  }
  /* Every text field in the read-along form shares one look. */
  .cf input {
    font: inherit;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.6rem;
    color: var(--text-primary);
  }
  .cf input:focus-visible {
    outline: 2px solid var(--accent, #000);
    outline-offset: -1px;
  }

  /* OFF contribution panel (§8) — visually set apart from the read-along rows
     with a boxed, tinted card so it reads as an optional extra action, not part
     of the food's data entry. */
  .cf-contrib {
    margin-bottom: var(--space-m);
    padding: var(--space-s);
    border: 1.5px solid var(--border-accent);
    border-radius: 12px;
    background: var(--surface-2, #f4f4f5);
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
  .cf-contrib-consent {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2xs);
    font-size: 0.82rem;
    line-height: 1.35;
    color: var(--text-primary);
    cursor: pointer;
  }
  .cf-contrib-consent input {
    flex: 0 0 auto;
    width: 1.15rem;
    height: 1.15rem;
    margin-top: 0.1rem;
  }
  .cf-contrib-btn {
    width: 100%;
    margin-top: var(--space-xs);
    background: #000;
    color: #fff;
    border: 2px solid #000;
    border-radius: 10px;
    padding: 0.6rem;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    min-height: 48px;
  }
  .cf-contrib-btn:disabled {
    background: #e4e4e7;
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
  }
  .cf-contrib-btn:active:not(:disabled) {
    transform: scale(0.98);
  }
  /* Outcome line: red by default (auth/data-quality/network), green on success —
     surfaced inline so a failed send is legible beside the persistent retry. */
  .cf-contrib-msg {
    margin: var(--space-2xs) 0 0;
    font-size: 0.8rem;
    font-weight: 600;
    color: #b91c1c;
  }
  .cf-contrib-msg.ok {
    color: #15803d;
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
    background: #f5b301;
    color: #000;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
  }

  .dock {
    border-top: 2px solid #000;
    background: #fafafa;
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
  .in-spinner {
    position: absolute;
    top: 50%;
    right: var(--space-s);
    transform: translateY(-50%);
    width: 1.15rem;
    height: 1.15rem;
    border: 2px solid #000;
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

  .methods {
    display: flex;
    gap: var(--space-2xs);
  }
  .method {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: #fff;
    border: 2px solid #000;
    padding: var(--space-2xs) 0;
    cursor: pointer;
    min-height: 52px;
  }
  .method.on {
    background: #000;
    color: #fff;
  }
  .mi {
    font-size: var(--step-0);
  }
  .ml {
    font-size: var(--step-n3);
    font-weight: 700;
    text-transform: uppercase;
  }

  .primary {
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
  .primary:active:not(:disabled) {
    transform: scale(0.98);
  }
  .primary:disabled {
    background: #e4e4e7;
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
  }
</style>
