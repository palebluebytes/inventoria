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
  import { settingsStore } from "../../stores/settings.store";
  import { round2 } from "../../food/nutrition";
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

  // Custom entry
  let customName = $state("");
  let customCal = $state("");
  let customProt = $state("");
  let customFat = $state("");
  let customCarb = $state("");
  let photo_base64 = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

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
      customCal = seed.calories;
      customProt = seed.protein;
      customFat = seed.fat;
      customCarb = seed.carbs;
      photo_base64 = seed.photo_base64;
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
      (method === "custom" && !!customName.trim() && customCal !== "") ||
      (method === "scan" && !staged && !!barcode.trim())
  );

  function primaryAction() {
    if (staged) {
      return commit({ kind: "food", food: staged, grams });
    }
    if (method === "custom") {
      const cal = parseFloat(customCal);
      if (!customName.trim() || isNaN(cal)) return;
      return commit({
        kind: "custom",
        name: customName.trim(),
        calories: cal,
        protein: parseFloat(customProt) || 0,
        fat: parseFloat(customFat) || 0,
        carbs: parseFloat(customCarb) || 0,
        photo_base64: allowPhoto ? photo_base64 : null,
      });
    }
    if (method === "scan") return handleBarcodeLookup();
  }

  let showTabs = $derived(!staged && !lockMethods);
  let showInput = $derived(!staged && !isExtra(method));
  let showPrimary = $derived(!isExtra(method));
</script>

<div class="stager">
  <!-- Staging / results area -->
  <div class="stage">
    {#if staged}
      <div class="staged">
        <h3>{staged.name}</h3>
        <p class="per">
          Per 100g · {round2(staged.calories)} kcal · P {round2(
            staged.protein
          )}g · F {round2(staged.fat)}g · C {round2(staged.carbs)}g
        </p>
        <span class="fl">Quantity (grams)</span>
        <QuantityGrams bind:grams />
        <div class="preview">
          <MacroPills
            calories={Math.round(staged.calories * factor)}
            protein={Math.round(staged.protein * factor * 10) / 10}
            fat={Math.round(staged.fat * factor * 10) / 10}
            carbs={Math.round(staged.carbs * factor * 10) / 10}
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
          onSelect={(item) => {
            staged = item;
            grams = 100;
          }}
        />
      {:else}
        <FoodResultsList
          {results}
          heading={results.length ? "Results" : undefined}
          onSelect={(item) => {
            staged = item;
            grams = 100;
          }}
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
      <p class="hint">Enter the name and macros for your custom food.</p>
      <div class="grid2">
        <div class="fld">
          <label for={ids.customCal}>Calories (kcal)</label>
          <Input id={ids.customCal} type="number" bind:value={customCal} />
        </div>
        <div class="fld">
          <label for={ids.customProt}>Protein (g)</label>
          <Input id={ids.customProt} type="number" bind:value={customProt} />
        </div>
        <div class="fld">
          <label for={ids.customFat}>Fat (g)</label>
          <Input id={ids.customFat} type="number" bind:value={customFat} />
        </div>
        <div class="fld">
          <label for={ids.customCarb}>Carbs (g)</label>
          <Input id={ids.customCarb} type="number" bind:value={customCarb} />
        </div>
      </div>
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
          <div class="photo-preview-box">
            <img src={photo_base64} alt="Custom food" class="photo-preview" />
            <button class="change-photo" onclick={() => fileInput?.click()}
              >Change</button
            >
          </div>
        {:else}
          <button class="photo" onclick={() => fileInput?.click()}
            >📷 Add photo (optional)</button
          >
        {/if}
      {/if}
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
        {#if method === "custom"}
          <Input
            id={ids.customName}
            placeholder="Food name…"
            bind:value={customName}
          />
        {:else if method === "scan"}
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

    {#if showPrimary}
      <button
        class="primary"
        id={ids.primary}
        disabled={!canPrimary || primaryDisabled || status === "loading"}
        onclick={primaryAction}
      >
        {primaryLabel({ method, staged, factor })}
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

  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }
  .fld label {
    display: block;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: var(--space-3xs);
  }
  .hidden-file-input {
    display: none;
  }
  .photo {
    width: 100%;
    margin-top: var(--space-s);
    border: 2px dashed #000;
    background: #fff;
    padding: var(--space-s);
    font-weight: 700;
    cursor: pointer;
  }
  .photo-preview-box {
    position: relative;
    margin-top: var(--space-s);
    border: 2px solid #000;
    overflow: hidden;
    max-height: 220px;
  }
  .photo-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .change-photo {
    position: absolute;
    bottom: var(--space-xs);
    right: var(--space-xs);
    background: #000;
    color: #fff;
    border: none;
    padding: var(--space-2xs) var(--space-s);
    font-weight: 700;
    cursor: pointer;
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
