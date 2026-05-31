<script lang="ts">
  import { dbClient } from "../../db/db.client";
  import {
    lookupBarcode,
    ProductNotFoundError,
  } from "../../food/open-food-facts";
  import { searchFdc } from "../../food/usda-fdc";
  import { ingestEntity } from "../../ingestion/ingest";
  import { logFoodConsumption } from "../../stores/calorie.store";

  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Card from "../../ui/Card.svelte";
  import Alert from "../../ui/Alert.svelte";
  import Badge from "../../ui/Badge.svelte";

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

  let activeTab = $state<"usda" | "barcode">("usda");
  let query = $state("");
  let barcode = $state("");

  let searchStatus = $state<"idle" | "loading" | "error">("idle");
  let searchError = $state("");

  // Results list
  let searchResults = $state<any[]>([]);

  // Selected item detail flow
  let selectedFood = $state<any | null>(null);
  let loggedGrams = $state("100");
  let factor = $derived((parseFloat(loggedGrams) || 0) / 100);
  let selected_meal_type = $state(meal_type);

  function parseAttrValue(val: string | number | undefined): number {
    if (typeof val === "number") return val;
    if (!val) return 0;
    const match = val.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  async function handleUsdaSearch() {
    if (!query.trim()) return;
    searchStatus = "loading";
    searchError = "";
    searchResults = [];
    selectedFood = null;
    try {
      const payloads = await searchFdc(query.trim());
      if (payloads.length === 0) {
        throw new Error("No foods found matching your query.");
      }
      searchResults = payloads.map((payload) => ({
        entity: payload.entity,
        name: payload.attributes["food/name"],
        calories: parseAttrValue(payload.attributes["food/calories"]),
        protein: parseAttrValue(payload.attributes["food/protein"]),
        fat: parseAttrValue(payload.attributes["food/fat"]),
        carbs: parseAttrValue(payload.attributes["food/carbs"]),
        payload,
      }));
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
    selectedFood = null;
    try {
      const payload = await lookupBarcode(barcode.trim());
      const mapped = {
        entity: payload.entity,
        name: payload.attributes["food/name"],
        calories: parseAttrValue(payload.attributes["food/calories"]),
        protein: parseAttrValue(payload.attributes["food/protein"]),
        fat: parseAttrValue(payload.attributes["food/fat"]),
        carbs: parseAttrValue(payload.attributes["food/carbs"]),
        payload,
      };
      searchResults = [mapped];
      selectedFood = mapped; // auto select barcode match
      searchStatus = "idle";
    } catch (e: any) {
      searchStatus = "error";
      searchError =
        e instanceof ProductNotFoundError
          ? "Barcode not found in Open Food Facts database."
          : (e.message ?? String(e));
    }
  }

  async function logSelection() {
    if (!selectedFood) return;
    searchStatus = "loading";
    try {
      // 1. Ingest the food twin datoms first
      const datoms = ingestEntity(selectedFood.payload);
      await dbClient.append(datoms);

      // 2. Calculate proportional nutrition
      const calcCalories = Math.round(selectedFood.calories * factor);
      const calcProtein = Math.round(selectedFood.protein * factor * 10) / 10;
      const calcFat = Math.round(selectedFood.fat * factor * 10) / 10;
      const calcCarbs = Math.round(selectedFood.carbs * factor * 10) / 10;

      // 3. Log consumption event
      await logFoodConsumption(
        selectedFood.entity,
        `${loggedGrams}g`,
        selected_meal_type,
        calcCalories,
        calcProtein,
        calcFat,
        calcCarbs,
        selectedDate
      );

      onClose();
    } catch (e: any) {
      searchStatus = "error";
      searchError = e.message ?? String(e);
    }
  }
</script>

<div class="modal-overlay" onclick={onClose} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-card" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h2>Log Food</h2>
      <button class="close-btn" onclick={onClose}>&times;</button>
    </div>

    {#if !selectedFood}
      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab-btn"
          class:active={activeTab === "usda"}
          onclick={() => (activeTab = "usda")}
        >
          🔍 USDA Search
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === "barcode"}
          onclick={() => (activeTab = "barcode")}
        >
          🏷️ Barcode Lookup
        </button>
      </div>

      <!-- Search fields -->
      <div class="search-section mt-4">
        {#if activeTab === "usda"}
          <div class="input-row">
            <Input
              id="usda-modal-input"
              placeholder="Search food by name (e.g. banana, oats...)"
              bind:value={query}
              onkeydown={(e) => e.key === "Enter" && handleUsdaSearch()}
            />
            <Button
              onclick={handleUsdaSearch}
              disabled={searchStatus === "loading" || !dbReady}
              loading={searchStatus === "loading"}
            >
              Search
            </Button>
          </div>
        {:else}
          <div class="input-row">
            <Input
              id="barcode-modal-input"
              placeholder="Enter 13-digit barcode (e.g. 3017620422003)"
              bind:value={barcode}
              onkeydown={(e) => e.key === "Enter" && handleBarcodeLookup()}
            />
            <Button
              onclick={handleBarcodeLookup}
              disabled={searchStatus === "loading" || !dbReady}
              loading={searchStatus === "loading"}
            >
              Lookup
            </Button>
          </div>
        {/if}
      </div>

      <!-- Results list -->
      {#if searchResults.length > 0}
        <div class="results-container mt-4">
          <h3>Results</h3>
          <ul class="results-list">
            {#each searchResults as item}
              <li>
                <button
                  class="result-item-btn"
                  onclick={() => (selectedFood = item)}
                >
                  <div class="result-details">
                    <span class="result-name">{item.name}</span>
                    <span class="result-macros">
                      Per 100g: {item.calories} kcal | P: {item.protein}g | F: {item.fat}g
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
      <!-- Selected food logger view -->
      <div class="selected-details mt-4">
        <div class="food-banner">
          <h3>{selectedFood.name}</h3>
          <p class="base-macros">
            Nutrition per 100g: <strong>{selectedFood.calories} kcal</strong> |
            P: {selectedFood.protein}g | F: {selectedFood.fat}g | C: {selectedFood.carbs}g
          </p>
        </div>

        <div class="log-form mt-4">
          <div class="form-field">
            <label for="quantity-input">Quantity (grams)</label>
            <Input id="quantity-input" type="number" bind:value={loggedGrams} />
          </div>

          <div class="form-field">
            <label for="meal-type-select">Meal Type</label>
            <select
              id="meal-type-select"
              bind:value={selected_meal_type}
              class="custom-select"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          <!-- Dynamic Proportional Nutrition Preview -->
          <div class="nutrition-preview mt-4">
            <h4>Logging Preview ({loggedGrams}g)</h4>
            <div class="preview-grid">
              <div class="preview-pill cal">
                <span class="pill-label">Calories</span>
                <span class="pill-val"
                  >{Math.round(selectedFood.calories * factor)} kcal</span
                >
              </div>
              <div class="preview-pill prot">
                <span class="pill-label">Protein</span>
                <span class="pill-val"
                  >{Math.round(selectedFood.protein * factor * 10) / 10}g</span
                >
              </div>
              <div class="preview-pill fat">
                <span class="pill-label">Fat</span>
                <span class="pill-val"
                  >{Math.round(selectedFood.fat * factor * 10) / 10}g</span
                >
              </div>
              <div class="preview-pill carbs">
                <span class="pill-label">Carbs</span>
                <span class="pill-val"
                  >{Math.round(selectedFood.carbs * factor * 10) / 10}g</span
                >
              </div>
            </div>
          </div>

          <div class="actions-row mt-4">
            <Button variant="secondary" onclick={() => (selectedFood = null)}
              >Back</Button
            >
            <Button
              onclick={logSelection}
              disabled={searchStatus === "loading" ||
                (parseFloat(loggedGrams) || 0) <= 0}
              loading={searchStatus === "loading"}
            >
              Log Food
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
    max-width: 500px;
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

  .input-row {
    display: flex;
    gap: var(--space-2xs);
  }

  .results-container h3 {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }
  .results-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    max-height: 250px;
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
  .food-banner h3 {
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
  }
  .base-macros {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    margin-top: 4px;
  }

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
  .custom-select {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--space-xs);
    color: var(--text-primary);
    font-size: var(--step-n1);
    outline: none;
  }

  .nutrition-preview h4 {
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
