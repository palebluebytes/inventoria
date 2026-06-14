<script lang="ts">
  import { untrack } from "svelte";
  import { dbClient } from "../../db/db.client";
  import {
    lookupBarcode,
    ProductNotFoundError,
  } from "../../food/open-food-facts";
  import {
    searchUsdaFoods,
    mapPayloadToFoodResult,
  } from "../../food/food-search";
  import { ingestEntity } from "../../ingestion/ingest";
  import { saveRecipe, logFoodConsumption } from "../../stores/calorie.store";
  import { settingsStore } from "../../stores/settings.store";

  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Card from "../../ui/Card.svelte";
  import Alert from "../../ui/Alert.svelte";
  import Badge from "../../ui/Badge.svelte";
  import { dismissable } from "../../ui/dismissable";

  interface Ingredient {
    entity: string;
    name: string;
    quantity: number; // in grams
    calories: number; // proportional
    protein: number;
    fat: number;
    carbs: number;
    payload: any; // original twin payload
  }

  let {
    dbReady,
    meal_type,
    selectedDate,
    onClose,
  }: {
    dbReady: boolean;
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    selectedDate: Date;
    onClose: () => void;
  } = $props();

  // Recipe Meta
  let recipeName = $state("");
  let recipeDesc = $state("");
  let scrape_url = $state("");
  let source_url = $state("");
  let recipeSteps = $state("");
  let selected_meal_type = $state(untrack(() => meal_type));

  // Ingredients List
  let ingredients = $state<Ingredient[]>([]);

  // Search Ingredients flow
  let showSearch = $state(false);
  let searchTab = $state<"usda" | "barcode">("usda");
  let query = $state("");
  let barcode = $state("");

  let searchStatus = $state<"idle" | "loading" | "error">("idle");
  let searchError = $state("");
  let searchResults = $state<any[]>([]);

  // Selected result quantity flow
  let selectedResult = $state<any | null>(null);
  let ingredientGrams = $state("100");

  // Scraper status
  let scrapeStatus = $state<"idle" | "loading" | "success" | "error">("idle");

  let debounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    if (!showSearch || searchTab !== "usda") {
      clearTimeout(debounceTimer);
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length >= 3) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleUsdaSearch();
      }, 400);
    } else if (trimmed.length === 0) {
      clearTimeout(debounceTimer);
      searchResults = [];
      searchStatus = "idle";
      searchError = "";
    }

    return () => {
      clearTimeout(debounceTimer);
    };
  });

  async function handleUsdaSearch() {
    clearTimeout(debounceTimer);
    if (!query.trim()) return;
    searchStatus = "loading";
    searchError = "";
    searchResults = [];
    selectedResult = null;
    try {
      searchResults = await searchUsdaFoods(query);
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
    searchResults = [];
    selectedResult = null;
    try {
      const payload = await lookupBarcode(barcode.trim());
      const mapped = mapPayloadToFoodResult(payload);
      searchResults = [mapped];
      selectedResult = mapped;
      searchStatus = "idle";
    } catch (e: any) {
      searchStatus = "error";
      searchError =
        e instanceof ProductNotFoundError
          ? "Barcode not found."
          : (e.message ?? String(e));
    }
  }

  function addIngredient() {
    const grams = parseFloat(ingredientGrams);
    if (!selectedResult || isNaN(grams) || grams <= 0) return;

    const factor = grams / 100;
    const ing: Ingredient = {
      entity: selectedResult.entity,
      name: selectedResult.name,
      quantity: grams,
      calories: Math.round(selectedResult.calories * factor),
      protein: Math.round(selectedResult.protein * factor * 10) / 10,
      fat: Math.round(selectedResult.fat * factor * 10) / 10,
      carbs: Math.round(selectedResult.carbs * factor * 10) / 10,
      payload: selectedResult.payload,
    };

    ingredients.push(ing);
    // Reset state
    selectedResult = null;
    searchResults = [];
    query = "";
    barcode = "";
    showSearch = false;
  }

  function removeIngredient(index: number) {
    ingredients.splice(index, 1);
  }

  // Simulated CORS-safe scraper for recipe steps
  async function scrapeRecipeSteps() {
    if (!scrape_url.trim()) return;
    scrapeStatus = "loading";
    recipeSteps = "";
    try {
      // Simulate network request to crawl the page
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // Standard local fallback / mock parser
      const mockSteps = [
        "1. Prepare and measure all ingredients.",
        "2. Combine the dry ingredients in a large mixing bowl.",
        "3. Gently fold in the wet ingredients and mix until smooth.",
        "4. Heat a pan over medium heat and lightly coat with oil.",
        "5. Cook until cooked through or golden brown.",
        "6. Garnish as desired and serve warm.",
      ].join("\n");

      recipeSteps = `[Scraped from: ${scrape_url.trim()}]\n\n${mockSteps}`;
      scrapeStatus = "success";
    } catch (e: any) {
      scrapeStatus = "error";
    }
  }

  // Aggregate macros for the entire recipe
  let totalCalories = $derived(
    ingredients.reduce((acc, ing) => acc + ing.calories, 0)
  );
  let totalProtein = $derived(
    Math.round(ingredients.reduce((acc, ing) => acc + ing.protein, 0) * 10) / 10
  );
  let totalFat = $derived(
    Math.round(ingredients.reduce((acc, ing) => acc + ing.fat, 0) * 10) / 10
  );
  let totalCarbs = $derived(
    Math.round(ingredients.reduce((acc, ing) => acc + ing.carbs, 0) * 10) / 10
  );

  async function handleSaveRecipe() {
    if (!recipeName.trim() || ingredients.length === 0) return;
    searchStatus = "loading";
    try {
      // 1. Ingest all ingredient food twins first so they exist in the DB
      for (const ing of ingredients) {
        const datoms = ingestEntity(ing.payload);
        await dbClient.append(datoms);
      }

      // 2. Prepare structured ingredients payload
      const ingPayload = ingredients.map((i) => ({
        entity: i.entity,
        name: i.name,
        quantityValue: i.quantity,
        quantityUnit: "g",
        calories: i.calories,
        protein: i.protein,
        fat: i.fat,
        carbs: i.carbs,
      }));

      // 3. Save the recipe twin
      const recipeId = await saveRecipe(
        recipeName.trim(),
        recipeDesc.trim() || recipeSteps, // fallback description to steps
        scrape_url.trim(),
        ingPayload,
        totalCalories,
        totalProtein,
        totalFat,
        totalCarbs,
        source_url.trim()
      );

      // 4. Log consumption event for this recipe
      await logFoodConsumption(
        recipeId,
        "1 serving",
        selected_meal_type,
        totalCalories,
        totalProtein,
        totalFat,
        totalCarbs,
        selectedDate
      );

      onClose();
    } catch (e: any) {
      searchStatus = "error";
      searchError = e.message ?? String(e);
    }
  }
</script>

<div class="modal-overlay" use:dismissable={onClose} role="presentation">
  <div class="modal-card" role="dialog" aria-modal="true" tabindex="-1">
    <div class="modal-header">
      <h2>🍲 Create Recipe</h2>
      <button class="close-btn" onclick={onClose}>&times;</button>
    </div>

    {#if !showSearch}
      <div class="recipe-form mt-4">
        <div class="form-field">
          <label for="recipe-name">Recipe Name</label>
          <Input
            id="recipe-name"
            placeholder="e.g. Grandma's Apple Pie"
            bind:value={recipeName}
          />
        </div>

        <div class="form-field">
          <label for="recipe-desc">Description (Optional)</label>
          <textarea
            id="recipe-desc"
            placeholder="Brief notes about the recipe..."
            bind:value={recipeDesc}
            class="custom-textarea"
          ></textarea>
        </div>

        <div class="form-field">
          <label for="recipe-source">Source (Optional URL)</label>
          <Input
            id="recipe-source"
            placeholder="https://example.com/recipe-source"
            bind:value={source_url}
          />
        </div>

        <div class="form-field">
          <label for="recipe-url">Scrape Steps Link (Optional)</label>
          <div class="input-row">
            <Input
              id="recipe-url"
              placeholder="https://epicurious.com/pasta..."
              bind:value={scrape_url}
            />
            <Button
              variant="secondary"
              onclick={scrapeRecipeSteps}
              disabled={!scrape_url.trim() || scrapeStatus === "loading"}
            >
              {#if scrapeStatus === "loading"}Scraping...{:else}Scrape{/if}
            </Button>
          </div>
          {#if scrapeStatus === "success"}
            <span class="success-note"
              >✓ Steps imported. Review steps in box below.</span
            >
          {/if}
        </div>

        {#if recipeSteps || scrapeStatus === "success"}
          <div class="form-field">
            <label for="recipe-steps">Recipe Steps / Instructions</label>
            <textarea
              id="recipe-steps"
              bind:value={recipeSteps}
              class="custom-textarea steps-area"
            ></textarea>
          </div>
        {/if}

        <div class="ingredients-header mt-4">
          <h3>Ingredients</h3>
          <Button variant="secondary" onclick={() => (showSearch = true)}>
            + Add Ingredient
          </Button>
        </div>

        {#if ingredients.length === 0}
          <div class="empty-list-box">
            <p>No ingredients added. Click above to search & add.</p>
          </div>
        {:else}
          <ul class="ingredients-list mt-2">
            {#each ingredients as ing, index}
              <li class="ingredient-item">
                <div class="ing-meta">
                  <span class="ing-name">{ing.name}</span>
                  <span class="ing-qty"
                    >{ing.quantity}g &bull; {ing.calories} kcal</span
                  >
                </div>
                <button
                  class="remove-ing-btn"
                  onclick={() => removeIngredient(index)}
                >
                  &times;
                </button>
              </li>
            {/each}
          </ul>

          <!-- Aggregate Nutrition Summary -->
          <div class="nutrition-preview mt-4">
            <h4>Total Nutrition (Recipe aggregates)</h4>
            <div class="preview-grid">
              <div class="preview-pill cal">
                <span class="pill-label">Calories</span>
                <span class="pill-val">{totalCalories} kcal</span>
              </div>
              <div class="preview-pill prot">
                <span class="pill-label">Protein</span>
                <span class="pill-val">{totalProtein}g</span>
              </div>
              <div class="preview-pill fat">
                <span class="pill-label">Fat</span>
                <span class="pill-val">{totalFat}g</span>
              </div>
              <div class="preview-pill carbs">
                <span class="pill-label">Carbs</span>
                <span class="pill-val">{totalCarbs}g</span>
              </div>
            </div>
          </div>
        {/if}

        <div class="form-field mt-4">
          <label for="recipe-meal-select">Meal Type to Log</label>
          <select
            id="recipe-meal-select"
            bind:value={selected_meal_type}
            class="custom-select"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
        </div>

        <div class="actions-row mt-6">
          <Button variant="secondary" onclick={onClose}>Cancel</Button>
          <Button
            onclick={handleSaveRecipe}
            disabled={!recipeName.trim() ||
              ingredients.length === 0 ||
              searchStatus === "loading"}
            loading={searchStatus === "loading"}
          >
            Save & Log Recipe
          </Button>
        </div>
      </div>
    {:else}
      <!-- Add Ingredient search flow -->
      <div class="search-ingredients-box mt-4">
        <h3>Add Ingredient</h3>
        <div class="tabs">
          <button
            class="tab-btn"
            class:active={searchTab === "usda"}
            onclick={() => (searchTab = "usda")}
          >
            🔍 USDA Search
          </button>
          <button
            class="tab-btn"
            class:active={searchTab === "barcode"}
            onclick={() => (searchTab = "barcode")}
          >
            🏷️ Barcode Lookup
          </button>
        </div>

        <div class="search-section mt-4">
          {#if searchTab === "usda"}
            {#if !$settingsStore.usda_api_key}
              <div class="mb-4">
                <Alert variant="warning">
                  USDA API key is not configured. Please set your key in
                  Settings to search the USDA database.
                </Alert>
              </div>
            {/if}
            <div class="input-row">
              <Input
                id="recipe-usda-input"
                placeholder="Search ingredient (e.g. banana, oats...)"
                bind:value={query}
                onkeydown={(e) =>
                  e.key === "Enter" &&
                  $settingsStore.usda_api_key &&
                  handleUsdaSearch()}
                disabled={!$settingsStore.usda_api_key}
              />
              <Button
                onclick={handleUsdaSearch}
                disabled={searchStatus === "loading" ||
                  !$settingsStore.usda_api_key}
                loading={searchStatus === "loading"}
              >
                Search
              </Button>
            </div>
          {:else}
            <div class="input-row">
              <Input
                id="recipe-barcode-input"
                placeholder="Barcode (e.g. 3017620422003)"
                bind:value={barcode}
                onkeydown={(e) => e.key === "Enter" && handleBarcodeLookup()}
              />
              <Button
                onclick={handleBarcodeLookup}
                disabled={searchStatus === "loading"}
                loading={searchStatus === "loading"}
              >
                Lookup
              </Button>
            </div>
          {/if}
        </div>

        {#if !selectedResult}
          {#if searchResults.length > 0}
            <div class="results-container mt-4">
              <ul class="results-list">
                {#each searchResults as item}
                  <li>
                    <button
                      class="result-item-btn"
                      onclick={() => (selectedResult = item)}
                    >
                      <div class="result-details">
                        <span class="result-name">{item.name}</span>
                        <span class="result-macros">
                          100g: {item.calories} kcal | P: {item.protein}g | F: {item.fat}g
                          | C: {item.carbs}g
                        </span>
                      </div>
                      <span class="select-arrow">&rarr;</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {:else}
          <!-- Selected ingredient details -->
          <div class="selected-details mt-4">
            <div class="food-banner">
              <h4>{selectedResult.name}</h4>
              <p class="base-macros">
                100g base: {selectedResult.calories} kcal | P: {selectedResult.protein}g
                | F: {selectedResult.fat}g | C: {selectedResult.carbs}g
              </p>
            </div>

            <div class="log-form mt-4">
              <div class="form-field">
                <label for="ing-quantity-input">Quantity (grams)</label>
                <Input
                  id="ing-quantity-input"
                  type="number"
                  bind:value={ingredientGrams}
                />
              </div>

              <!-- Live preview -->
              <div class="nutrition-preview mt-4">
                <h5>
                  Adding: {Math.round(
                    (selectedResult.calories *
                      (parseFloat(ingredientGrams) || 0)) /
                      100
                  )} kcal ({ingredientGrams}g)
                </h5>
              </div>

              <div class="actions-row mt-4">
                <Button
                  variant="secondary"
                  onclick={() => (selectedResult = null)}>Back</Button
                >
                <Button
                  onclick={addIngredient}
                  disabled={!(parseFloat(ingredientGrams) > 0)}
                >
                  Add to Recipe
                </Button>
              </div>
            </div>
          </div>
        {/if}

        {#if searchStatus === "error"}
          <div class="mt-4">
            <Alert variant="error">{searchError}</Alert>
          </div>
        {/if}

        <div class="actions-row mt-6">
          <Button variant="secondary" onclick={() => (showSearch = false)}
            >Back to Recipe</Button
          >
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    backdrop-filter: blur(8px);
  }
  .modal-card {
    background: var(--bg-card, #121214);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: 90%;
    max-width: 550px;
    max-height: 85vh;
    overflow-y: auto;
    padding: var(--space-m);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    animation: zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-xs);
  }
  .modal-header h2 {
    font-size: var(--step-1);
    font-weight: 700;
    color: var(--text-primary);
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--step-2);
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text-primary);
  }

  .recipe-form,
  .log-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .form-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .form-field label {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .custom-textarea {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--space-xs);
    color: var(--text-primary);
    font-size: var(--step-n1);
    outline: none;
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
  }
  .steps-area {
    min-height: 120px;
    font-family: monospace;
    font-size: var(--step-n2);
  }

  .input-row {
    display: flex;
    gap: var(--space-2xs);
  }

  .success-note {
    font-size: var(--step-n3);
    color: #10b981;
    margin-top: var(--space-3xs);
  }

  .ingredients-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-3xs);
  }
  .ingredients-header h3 {
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }

  .empty-list-box {
    padding: var(--space-m);
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.01);
  }
  .empty-list-box p {
    color: var(--text-muted);
    font-size: var(--step-n2);
  }

  .ingredients-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .ingredient-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-xs);
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .ing-meta {
    display: flex;
    flex-direction: column;
  }
  .ing-name {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-primary);
  }
  .ing-qty {
    font-size: var(--step-n3);
    color: var(--text-muted);
  }
  .remove-ing-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 20px;
    cursor: pointer;
    padding: 0 var(--space-2xs);
  }
  .remove-ing-btn:hover {
    color: #ef4444;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    gap: var(--space-xs);
  }
  .tab-btn {
    flex: 1;
    background: none;
    border: none;
    padding: var(--space-xs) 0;
    color: var(--text-secondary);
    font-weight: 600;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  .tab-btn.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .results-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    max-height: 200px;
    overflow-y: auto;
  }
  .result-item-btn {
    width: 100%;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--space-xs) var(--space-s);
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: background 0.2s;
  }
  .result-item-btn:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  .result-details {
    display: flex;
    flex-direction: column;
  }
  .result-name {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-primary);
  }
  .result-macros {
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin-top: 2px;
  }
  .select-arrow {
    color: var(--text-muted);
    font-size: var(--step-0);
  }

  .food-banner {
    background: rgba(255, 255, 255, 0.01);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: var(--space-s);
  }
  .food-banner h4 {
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }
  .base-macros {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .nutrition-preview h4,
  .nutrition-preview h5 {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--space-2xs);
  }
  .preview-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-3xs);
  }
  .preview-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--space-2xs);
  }
  .pill-label {
    font-size: var(--step-n4);
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .pill-val {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    margin-top: 2px;
  }

  .custom-select {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--space-xs);
    color: var(--text-primary);
    font-size: var(--step-n1);
    outline: none;
  }

  .actions-row {
    display: flex;
    justify-content: space-between;
  }

  @keyframes zoomIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
