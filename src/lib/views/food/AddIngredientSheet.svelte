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
  import {
    ingredientFromFood,
    customIngredient,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import Alert from "../../ui/Alert.svelte";
  import FoodResultsList from "./FoodResultsList.svelte";
  import QuantityGrams from "./QuantityGrams.svelte";

  // Add an ingredient to a recipe using the same Search / Scan / Custom flow as
  // logging a food. Emits the chosen food as a RecipeIngredient; never logs.
  let {
    onAdd,
    onClose,
  }: { onAdd: (ing: RecipeIngredient) => void; onClose: () => void } = $props();

  type Method = "search" | "scan" | "custom";
  let method = $state<Method>("search");
  let query = $state("");
  let barcode = $state("");
  let status = $state<"idle" | "loading" | "error">("idle");
  let error = $state("");
  let results = $state<FoodResult[]>([]);
  let staged = $state<FoodResult | null>(null);
  let grams = $state(100);
  let gramsNum = $derived(grams);
  let factor = $derived(gramsNum / 100);

  let cName = $state("");
  let cCal = $state("");
  let cProt = $state("");
  let cFat = $state("");
  let cCarb = $state("");

  let hasKey = $derived(!!$settingsStore.usda_api_key);

  let debounce: ReturnType<typeof setTimeout>;
  $effect(() => {
    const q = query.trim();
    if (method !== "search" || staged) return;
    clearTimeout(debounce);
    if (q.length >= 3 && hasKey) {
      status = "loading";
      debounce = setTimeout(() => runSearch(), 400);
    } else if (q.length === 0) {
      results = [];
      status = "idle";
      error = "";
    }
    return () => clearTimeout(debounce);
  });

  async function runSearch() {
    clearTimeout(debounce);
    if (!query.trim()) return;
    status = "loading";
    error = "";
    results = [];
    try {
      results = await searchUsdaFoods(query);
      status = "idle";
    } catch (e: any) {
      status = "error";
      error = e.message ?? String(e);
    }
  }

  async function lookup() {
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
          ? "Barcode not found. Add it as a custom ingredient."
          : (e.message ?? String(e));
    }
  }

  function switchMethod(m: Method) {
    staged = null;
    method = m;
    error = "";
    status = "idle";
  }

  let canAdd = $derived(
    (!!staged && gramsNum > 0) ||
      (method === "custom" && !!cName.trim() && cCal !== "") ||
      (method === "scan" && !staged && !!barcode.trim())
  );

  function primaryLabel() {
    if (staged) return `Add ${Math.round(staged.calories * factor)} kcal`;
    if (method === "custom") return "Add";
    if (method === "scan") return "Look up";
    return "Add";
  }

  function primary() {
    if (staged) {
      onAdd(ingredientFromFood(staged, gramsNum));
    } else if (method === "custom") {
      const cal = parseFloat(cCal);
      if (!cName.trim() || isNaN(cal)) return;
      onAdd(
        customIngredient(
          cName.trim(),
          cal,
          parseFloat(cProt) || 0,
          parseFloat(cFat) || 0,
          parseFloat(cCarb) || 0
        )
      );
    } else if (method === "scan") {
      lookup();
    }
  }
</script>

<div class="sheet">
  <header class="head">
    {#if staged}
      <button
        class="hbtn back"
        onclick={() => (staged = null)}
        aria-label="Back">‹</button
      >
    {:else}
      <button class="hbtn back" onclick={onClose} aria-label="Cancel">‹</button>
    {/if}
    <h2>Add ingredient</h2>
    <button class="hbtn x" onclick={onClose} aria-label="Close">✕</button>
  </header>

  <div class="stage">
    {#if staged}
      <div class="staged">
        <h3>{staged.name}</h3>
        <p class="per">
          Per 100g · {staged.calories} kcal · P {staged.protein}g · F {staged.fat}g
          · C {staged.carbs}g
        </p>
        <div class="qtwrap">
          <QuantityGrams bind:grams />
        </div>
        <div class="preview">
          <span><b>{Math.round(staged.calories * factor)}</b> kcal</span>
          <span><b>{Math.round(staged.protein * factor * 10) / 10}</b>g P</span>
        </div>
      </div>
    {:else if method === "search"}
      {#if !hasKey}
        <Alert variant="warning"
          >Add a USDA API key in Settings to search the food database.</Alert
        >
      {/if}
      <FoodResultsList
        {results}
        heading={results.length ? "Results" : undefined}
        onSelect={(item) => {
          staged = item;
          grams = 100;
        }}
      />
    {:else if method === "scan"}
      <div class="viewport">
        <span>📷</span>
        <p>Point at a barcode</p>
        <div class="reticle"></div>
      </div>
      <p class="hint">
        Type the number below. No result? <button
          class="link"
          onclick={() => switchMethod("custom")}>Add it manually</button
        >.
      </p>
    {:else}
      <p class="hint">Enter the ingredient’s name and macros.</p>
      <label class="fl" for="ai-name">Name</label>
      <input
        id="ai-name"
        class="tin"
        placeholder="e.g. Cinnamon"
        bind:value={cName}
      />
      <div class="grid2">
        <div>
          <label class="fl" for="ai-cal">Calories</label><input
            id="ai-cal"
            class="tin"
            type="number"
            bind:value={cCal}
          />
        </div>
        <div>
          <label class="fl" for="ai-prot">Protein (g)</label><input
            id="ai-prot"
            class="tin"
            type="number"
            bind:value={cProt}
          />
        </div>
        <div>
          <label class="fl" for="ai-fat">Fat (g)</label><input
            id="ai-fat"
            class="tin"
            type="number"
            bind:value={cFat}
          />
        </div>
        <div>
          <label class="fl" for="ai-carb">Carbs (g)</label><input
            id="ai-carb"
            class="tin"
            type="number"
            bind:value={cCarb}
          />
        </div>
      </div>
    {/if}
    {#if status === "error"}<div class="mt">
        <Alert variant="error">{error}</Alert>
      </div>{/if}
  </div>

  <div class="dock">
    <div class="dock-input">
      {#if staged}
        <div class="echo">Adding <strong>{staged.name}</strong></div>
      {:else if method === "custom"}
        <div class="echo">Custom ingredient</div>
      {:else if method === "scan"}
        <input
          class="cin"
          id="ai-barcode"
          placeholder="Enter barcode…"
          bind:value={barcode}
          onkeydown={(e) => e.key === "Enter" && lookup()}
        />
      {:else}
        <div class="in-wrap">
          <input
            class="cin"
            id="ai-search"
            placeholder="Search foods…"
            bind:value={query}
            disabled={!hasKey}
            onkeydown={(e) => e.key === "Enter" && runSearch()}
          />
          {#if status === "loading"}<span
              class="in-spinner"
              aria-label="Searching"
            ></span>{/if}
        </div>
      {/if}
    </div>
    <div class="methods">
      {#each [["search", "🔍", "Search"], ["scan", "📷", "Scan"], ["custom", "✏️", "Custom"]] as [m, ico, label]}
        <button
          class="method"
          class:on={method === m && !staged}
          onclick={() => switchMethod(m as Method)}
        >
          <span class="mi">{ico}</span><span class="ml">{label}</span>
        </button>
      {/each}
    </div>
    <button
      class="prim"
      id="add-ingredient-confirm"
      disabled={!canAdd || status === "loading"}
      onclick={primary}>{primaryLabel()}</button
    >
  </div>
</div>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 1700;
    display: flex;
    flex-direction: column;
    background: #fff;
    animation: up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    /* This overlay is a sibling of the recipe dialog, not a bits-ui dialog
       itself. While that dialog is open bits-ui sets `pointer-events: none` on
       <body>, which this sheet would otherwise inherit — making its buttons
       visually present but click-through (the back/close taps fell through to
       the recipe content underneath). Re-enable pointer events for the sheet. */
    pointer-events: auto;
  }
  @keyframes up {
    from {
      transform: translateY(6%);
      opacity: 0.6;
    }
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
  }
  .hbtn {
    flex-shrink: 0;
    width: 2.75rem;
    height: 2.75rem;
    background: none;
    border: none;
    font-weight: 700;
    cursor: pointer;
  }
  .hbtn.back {
    font-size: var(--step-2);
  }
  .hbtn.x {
    font-size: var(--step-0);
  }
  .stage {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-s);
  }
  .fl {
    display: block;
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    margin: var(--space-s) 0 var(--space-3xs);
  }
  .tin {
    width: 100%;
    border: 2px solid #000;
    padding: var(--space-xs);
    font-size: var(--step-0);
    font-family: inherit;
  }
  .qtwrap {
    margin-top: var(--space-m);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
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
  .preview {
    display: flex;
    gap: var(--space-m);
    margin-top: var(--space-m);
    font-size: var(--step-n1);
  }
  .preview b {
    font-size: var(--step-1);
  }
  .viewport {
    position: relative;
    height: 220px;
    background: #000;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2xs);
    margin-top: var(--space-s);
  }
  .viewport span {
    font-size: 2.5rem;
  }
  .reticle {
    position: absolute;
    width: 70%;
    height: 70px;
    border: 3px solid #ff3333;
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
  .dock {
    border-top: 2px solid #000;
    background: #fafafa;
    padding: var(--space-2xs) var(--space-s)
      calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .cin {
    width: 100%;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: inherit;
  }
  .cin:disabled {
    background: #f4f4f5;
    color: var(--text-muted);
  }
  .echo {
    padding: var(--space-2xs) 0;
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }
  .echo strong {
    color: var(--text-primary);
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
  .prim {
    width: 100%;
    background: #ccff00;
    color: #000;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-1);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 56px;
  }
  .prim:disabled {
    background: #e4e4e7;
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
  }
</style>
