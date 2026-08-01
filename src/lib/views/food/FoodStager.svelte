<script lang="ts">
  import {
    lookupBarcode,
    ProductNotFoundError,
  } from "../../food/open-food-facts";
  import {
    searchUsdaFoods,
    mapPayloadToFoodResult,
    type FoodResult,
  } from "../../food/food-search";
  import { getLocalFoodTwin } from "../../stores/calorie.store";
  import {
    settingsStore,
    nutritionDisplayDecimals,
  } from "../../stores/settings.store";
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

  // Stage a chosen food and, for a searched USDA food that arrived without
  // portions, hydrate its `/food/{fdcId}` detail once (ADR-0030 §5) — not per
  // keystroke, off the select. The augmentation (portions + refreshed
  // provenance) is SPREAD onto the staged payload so the food keeps its
  // search-time name and nutrition and merely gains portions; the search-time
  // nutrition/info is never re-mapped. A non-fdc food (a scanned OFF product, a
  // local recent twin) or one already carrying portions skips the fetch.
  async function stageFood(item: FoodResult) {
    staged = item;
    grams = 100;
    hydratingPortions = false;
    const match = /^fdc:(\d+)$/.exec(item.entity);
    if (!match) return;
    if (item.payload.attributes[FOOD_PORTIONS_ATTR]) return;
    hydratingPortions = true;
    try {
      const augmentation = await hydrateFdcFood(Number(match[1]));
      const merged: FoodResult = {
        ...item,
        payload: {
          ...item.payload,
          attributes: {
            ...item.payload.attributes,
            ...augmentation.attributes,
          },
        },
      };
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
  let photo_base64 = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

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

  let hasKey = $derived(!!$settingsStore.usda_api_key);

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
      photo_base64 = seed.photo_base64;
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

  $effect(() => {
    if (method === "scan" && !staged) startCamera();
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
      rafId = requestAnimationFrame(scanFrame);
    } catch {
      scanError = "Camera access denied or unavailable.";
      scanning = false;
    }
  }

  function stopCamera() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
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
    status = "loading";
    error = "";
    try {
      const local = await getLocalFoodTwin(`gtin:${barcode.trim()}`);
      const payload = local ?? (await lookupBarcode(barcode.trim()));
      staged = mapPayloadToFoodResult(payload);
      grams = 100;
      status = "idle";
    } catch (e: any) {
      status = "error";
      error =
        e instanceof ProductNotFoundError
          ? "Barcode not found. Add it as a custom entry."
          : (e.message ?? String(e));
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

  function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => (photo_base64 = ev.target?.result as string);
    reader.onerror = () => {
      status = "error";
      error = "Failed to read image file.";
    };
    reader.readAsDataURL(file);
  }

  function switchMethod(m: string) {
    staged = null;
    method = m;
    error = "";
    status = "idle";
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
      // Assemble the full panel (grams stored, absent ≠ 0) and the user-origin
      // provenance envelope; the host commits it through saveLabelFood (#56).
      const { nutrition, filledKeys } = buildLabelPanel({
        values: customValues,
        basis: customBasis,
        servingGrams: customServingGrams,
        skipped,
      });
      const portions = buildCustomPortions();
      const photos = allowPhoto && photo_base64 ? [photo_base64] : [];
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
        photo_base64: allowPhoto ? photo_base64 : null,
        brand: customBrand.trim() || undefined,
        nutrition,
        portions: portions.length ? portions : undefined,
        labelPhotos: photos.length ? photos : undefined,
        labelCapture,
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
        <h3>{staged.name}</h3>
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
        <span class="fl">
          Quantity (grams)
          {#if hydratingPortions}
            <span class="portions-loading" data-testid="portions-loading">
              <span class="portions-spinner" aria-hidden="true"></span>
              Loading portions…
            </span>
          {/if}
        </span>
        <QuantityGrams bind:grams portions={stagedPortions} />
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
    {:else}
      <!-- Custom = the #52 "Read-along" full-panel form (ADR-0034 §2–§4). Name +
           brand in a sticky identity card, then every panel row grouped Macros ·
           fats/fibre/sugar/salt · vitamins & minerals · portions, transcribed
           top-to-bottom. Macros lead so the fast path stays name + calories →
           Save. -->
      <div class="cf">
        <div class="cf-idrow">
          {#if allowPhoto}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              class="hidden-file-input"
              bind:this={fileInput}
              onchange={handleFileChange}
            />
            {#if photo_base64}
              <button
                class="cf-thumb"
                onclick={() => fileInput?.click()}
                aria-label="Change the label photo"
              >
                <img
                  src={photo_base64}
                  alt="Custom food"
                  class="photo-preview"
                />
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
  .staged h3 {
    font-size: var(--step-1);
    font-weight: 700;
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
  /* Non-blocking hint while a searched food's portions hydrate (ADR-0030 §5) —
     the gram field beneath stays fully usable throughout. */
  .portions-loading {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3xs);
    margin-left: var(--space-2xs);
    font-size: var(--step-n2);
    font-weight: 400;
    text-transform: none;
    color: var(--text-secondary);
  }
  .portions-spinner {
    width: 0.9rem;
    height: 0.9rem;
    border: 2px solid var(--border-accent);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
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

  .hidden-file-input {
    display: none;
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
    flex: 0 0 auto;
    width: 60px;
    padding: 0;
    border: 1.5px solid var(--border-accent);
    background: none;
    cursor: pointer;
    border-radius: 10px;
    overflow: hidden;
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
