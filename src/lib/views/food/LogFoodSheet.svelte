<script lang="ts">
  import { dbClient } from "../../db/db.client";
  import {
    lookupBarcode,
    ProductNotFoundError,
  } from "../../food/open-food-facts";
  import {
    searchUsdaFoods,
    mapPayloadToFoodResult,
    type FoodResult,
  } from "../../food/food-search";
  import { ingestEntity } from "../../ingestion/ingest";
  import { settingsStore } from "../../stores/settings.store";
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
  import { round2 } from "../../food/nutrition";

  import Modal from "../../ui/Modal.svelte";
  import Alert from "../../ui/Alert.svelte";
  import FoodResultsList from "./FoodResultsList.svelte";
  import MacroPills from "./MacroPills.svelte";

  // A single sheet for logging food into one meal. Opens directly on "+ Add"
  // (no chooser); method (Search / Scan / Custom) is switched from the dock at
  // the bottom. Search hits USDA, Scan reads a barcode via camera or manual
  // entry, Custom is a manual macro entry with an optional photo. The meal is
  // fixed by the "+ Add {meal}" button that opened the sheet.
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

  type Method = "search" | "scan" | "custom" | "recipe";

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

  // Method tabs — the Recipe browser only appears when the parent wired an
  // Instantiate handler.
  let methodTabs = $derived<[Method, string, string][]>(
    onPickRecipe
      ? [
          ["search", "🔍", "Search"],
          ["scan", "📷", "Scan"],
          ["custom", "✏️", "Custom"],
          ["recipe", "🍲", "Recipe"],
        ]
      : [
          ["search", "🔍", "Search"],
          ["scan", "📷", "Scan"],
          ["custom", "✏️", "Custom"],
        ]
  );
  let method = $state<Method>("search");
  let query = $state("");
  let barcode = $state("");

  let searchStatus = $state<"idle" | "loading" | "error">("idle");
  let searchError = $state("");
  let results = $state<FoodResult[]>([]);

  // The result staged for quantifying (a USDA hit or a barcode match).
  let staged = $state<FoodResult | null>(null);
  let grams = $state<number | string>(100);
  let gramsNum = $derived(Number(grams) || 0);
  let factor = $derived(gramsNum / 100);

  // Custom entry
  let customName = $state("");
  let customCal = $state("");
  let customProt = $state("");
  let customFat = $state("");
  let customCarb = $state("");
  let photo_base64 = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  let hasKey = $derived(!!$settingsStore.usda_api_key);

  // Editing: pre-load the sheet from the event being edited, once. A gram-logged
  // food re-stages from its twin's panel (so the amount editor scales the same
  // way it did originally); a per-serving custom entry re-opens the custom form
  // pre-filled from the event's frozen macros.
  let editLoaded = false;
  $effect(() => {
    if (!edit || editLoaded) return;
    editLoaded = true;
    const e = edit;
    const { amount, unit } = parseLoggedQuantity(e.quantity);
    if (unit === "serving") {
      method = "custom";
      customName = e.foodName ?? "";
      customCal = e.calories != null ? String(e.calories) : "";
      customProt = e.protein != null ? String(e.protein) : "";
      customFat = e.fat != null ? String(e.fat) : "";
      customCarb = e.carbs != null ? String(e.carbs) : "";
      photo_base64 = e.photoBase64 ?? null;
    } else if (e.target) {
      void getLocalFoodTwin(e.target).then((twin) => {
        if (!twin) return;
        staged = mapPayloadToFoodResult(twin);
        grams = amount;
      });
    }
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
      searchStatus = "idle";
      searchError = "";
      lastQuery = "";
    } else if (
      trimmed.length >= 3 &&
      hasKey &&
      // Skip if these results already match the query (e.g. we just came back
      // from staging a food); a failed query is not cached, so it can retry.
      !(trimmed === lastQuery && searchStatus !== "error")
    ) {
      searchStatus = "loading";
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
    searchStatus = "loading";
    searchError = "";
    results = [];
    staged = null;
    try {
      results = await searchUsdaFoods(query);
      lastQuery = query.trim();
      searchStatus = "idle";
    } catch (e: any) {
      searchStatus = "error";
      searchError = e.message ?? String(e);
    }
  }

  async function handleBarcodeLookup() {
    if (!barcode.trim()) return;
    searchStatus = "loading";
    searchError = "";
    try {
      const local = await getLocalFoodTwin(`gtin:${barcode.trim()}`);
      const payload = local ?? (await lookupBarcode(barcode.trim()));
      staged = mapPayloadToFoodResult(payload);
      grams = 100;
      searchStatus = "idle";
    } catch (e: any) {
      searchStatus = "error";
      searchError =
        e instanceof ProductNotFoundError
          ? "Barcode not found. Add it as a custom entry."
          : (e.message ?? String(e));
    }
  }

  async function logStaged() {
    if (!staged || gramsNum <= 0) return;
    searchStatus = "loading";
    try {
      // Ingest the food twin, then append a proportional Consumption Event.
      await dbClient.append(ingestEntity(staged.payload));
      const newId = await logFoodConsumption(
        staged.entity,
        `${gramsNum}g`,
        meal_type,
        Math.round(staged.calories * factor),
        Math.round(staged.protein * factor * 10) / 10,
        Math.round(staged.fat * factor * 10) / 10,
        Math.round(staged.carbs * factor * 10) / 10,
        selectedDate
      );
      if (edit) await retractConsumptionEvent(edit.id, newId);
      onClose();
    } catch (e: any) {
      searchStatus = "error";
      searchError = e.message ?? String(e);
    }
  }

  async function logCustom() {
    const cal = parseFloat(customCal);
    if (!customName.trim() || isNaN(cal)) return;
    searchStatus = "loading";
    try {
      const prot = parseFloat(customProt) || 0;
      const fat = parseFloat(customFat) || 0;
      const carb = parseFloat(customCarb) || 0;
      const twinId = await saveCustomFood(
        customName.trim(),
        cal,
        prot,
        fat,
        carb,
        photo_base64 || undefined
      );
      const newId = await logFoodConsumption(
        twinId,
        "1 serving",
        meal_type,
        cal,
        prot,
        fat,
        carb,
        selectedDate
      );
      if (edit) await retractConsumptionEvent(edit.id, newId);
      onClose();
    } catch (e: any) {
      searchStatus = "error";
      searchError = e.message ?? String(e);
    }
  }

  function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => (photo_base64 = ev.target?.result as string);
    reader.onerror = () => {
      searchStatus = "error";
      searchError = "Failed to read image file.";
    };
    reader.readAsDataURL(file);
  }

  function switchMethod(m: Method) {
    staged = null;
    method = m;
    searchError = "";
    searchStatus = "idle";
  }

  let canLog = $derived(
    (!!staged && gramsNum > 0) ||
      (method === "custom" && !!customName.trim() && customCal !== "") ||
      (method === "scan" && !staged && !!barcode.trim())
  );

  function primaryLabel(): string {
    if (staged)
      return edit
        ? "Save changes"
        : `Log ${Math.round(staged.calories * factor)} kcal`;
    if (method === "custom") return edit ? "Save changes" : "Save & Log";
    if (method === "scan") return "Look up";
    return "Log";
  }

  function primaryAction() {
    if (staged) return logStaged();
    if (method === "custom") return logCustom();
    if (method === "scan") return handleBarcodeLookup();
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
            <label class="fl" for="quantity-input">Quantity (grams)</label>
            <input
              id="quantity-input"
              class="qtin"
              type="number"
              inputmode="numeric"
              bind:value={grams}
            />
            <div class="preview">
              <MacroPills
                calories={Math.round(staged.calories * factor)}
                protein={Math.round(staged.protein * factor * 10) / 10}
                fat={Math.round(staged.fat * factor * 10) / 10}
                carbs={Math.round(staged.carbs * factor * 10) / 10}
              />
            </div>
          </div>
        {:else if method === "search"}
          {#if !hasKey}
            <Alert variant="warning">
              Add a USDA API key in Settings to search the food database.
            </Alert>
          {/if}
          <FoodResultsList
            {results}
            heading={results.length ? "Results" : undefined}
            onSelect={(item) => {
              staged = item;
              grams = 100;
            }}
          />
          {#if hasKey && searchStatus === "idle" && query.trim().length >= 3 && results.length === 0}
            <p class="hint">No matches for “{query.trim()}”.</p>
          {/if}
        {:else if method === "scan"}
          {#if scanError}<Alert variant="warning">{scanError}</Alert>{/if}
          <div class="viewport">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video bind:this={videoEl} class="scanner-video" playsinline
            ></video>
            <div class="reticle"></div>
          </div>
          <p class="hint">
            Point the camera at a barcode, or type the number below. No result? <button
              class="link"
              onclick={() => switchMethod("custom")}>Add a custom entry</button
            >.
          </p>
        {:else if method === "recipe"}
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
        {:else}
          <p class="hint">Enter the name and macros for your custom food.</p>
          <div class="grid2">
            <div class="fld">
              <label for="custom-cal">Calories (kcal)</label><input
                id="custom-cal"
                type="number"
                bind:value={customCal}
              />
            </div>
            <div class="fld">
              <label for="custom-prot">Protein (g)</label><input
                id="custom-prot"
                type="number"
                bind:value={customProt}
              />
            </div>
            <div class="fld">
              <label for="custom-fat">Fat (g)</label><input
                id="custom-fat"
                type="number"
                bind:value={customFat}
              />
            </div>
            <div class="fld">
              <label for="custom-carb">Carbs (g)</label><input
                id="custom-carb"
                type="number"
                bind:value={customCarb}
              />
            </div>
          </div>
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

        {#if searchStatus === "error"}
          <div class="mt"><Alert variant="error">{searchError}</Alert></div>
        {/if}
      </div>

      <!-- Dock: input · methods · primary action. When a food is staged its name
           already headlines the staging area above, so the input row is dropped
           (no duplicate echo). Editing targets one entry, so the method switcher
           is dropped too — the sheet stays focused on that food's amount. -->
      <div class="dock">
        {#if !staged && method !== "recipe"}
          <div class="dock-input">
            {#if method === "custom"}
              <input
                class="cin"
                id="custom-name"
                placeholder="Food name…"
                bind:value={customName}
              />
            {:else if method === "scan"}
              <input
                class="cin"
                id="barcode-input"
                placeholder="Enter barcode…"
                bind:value={barcode}
                onkeydown={(e) => e.key === "Enter" && handleBarcodeLookup()}
              />
            {:else}
              <div class="in-wrap">
                <input
                  class="cin"
                  id="food-search-input"
                  placeholder="Search foods…"
                  bind:value={query}
                  disabled={!hasKey}
                  onkeydown={(e) => e.key === "Enter" && handleSearch()}
                />
                {#if searchStatus === "loading"}
                  <span class="in-spinner" aria-label="Searching USDA"></span>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if !staged && !edit}
          <div class="methods">
            {#each methodTabs as [m, ico, label]}
              <button
                class="method"
                class:on={method === m}
                onclick={() => switchMethod(m as Method)}
              >
                <span class="mi">{ico}</span><span class="ml">{label}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if method !== "recipe"}
          <button
            class="log-btn"
            id="log-food-btn"
            disabled={!canLog || !dbReady || searchStatus === "loading"}
            onclick={primaryAction}
          >
            {primaryLabel()}
          </button>
        {/if}
      </div>
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
  .qtin {
    width: 100%;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-1);
    font-weight: 700;
    text-align: center;
    font-family: inherit;
    background: #fff;
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
  .fld input {
    width: 100%;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-size: var(--step-0);
    font-family: inherit;
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
  .cin {
    width: 100%;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: inherit;
    background: #fff;
  }
  .cin:disabled {
    background: #f4f4f5;
    color: var(--text-muted);
  }
  .in-wrap {
    position: relative;
  }
  .in-wrap .cin {
    padding-right: calc(var(--space-s) + 1.75rem);
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

  .log-btn {
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
  .log-btn:active:not(:disabled) {
    transform: scale(0.98);
  }
  .log-btn:disabled {
    background: #e4e4e7;
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
  }
</style>
