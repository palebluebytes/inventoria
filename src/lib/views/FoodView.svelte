<script lang="ts">
  import { createQueryStore } from "../stores/datoms.store";
  import { HLC_ORDER_DESC } from "../db/hlc";
  import {
    consumptionStore,
    consumptionForDay,
    getLocalFoodTwin,
  } from "../stores/calorie.store";
  import {
    customIngredient,
    parseLoggedQuantity,
  } from "../food/recipe-ingredient";
  import DailyDashboard from "./food/DailyDashboard.svelte";
  import LogFoodSheet from "./food/LogFoodSheet.svelte";
  import RecipeModal from "./food/RecipeModal.svelte";

  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";

  type MealType = "breakfast" | "lunch" | "dinner" | "snack";

  let { dbReady }: { dbReady: boolean } = $props();

  let selectedDate = $state(new Date());
  // The meal whose log sheet is open (null = closed). Opening is direct — no
  // intermediate chooser.
  let sheetMeal = $state<MealType | null>(null);
  // Consumption-event ids selected (long-press) for building a recipe.
  let selected_ids = $state<Set<string>>(new Set());
  let recipeOpen = $state(false);
  let recipe_meal_type = $state<MealType>("dinner");
  let recipe_seed = $state<any[]>([]);

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

  function openSheet(meal_type: MealType) {
    sheetMeal = meal_type;
  }

  function longPress(id: string) {
    const next = new Set(selected_ids);
    next.add(id);
    selected_ids = next;
  }

  function tapItem(id: string) {
    if (selected_ids.size === 0) return;
    const next = new Set(selected_ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected_ids = next;
  }

  function clearSelection() {
    selected_ids = new Set();
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
    recipe_seed = await Promise.all(
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
    recipe_meal_type = (items[0]?.meal_type as MealType) || "dinner";
    recipeOpen = true;
    clearSelection();
  }
</script>

<header class="page-header">
  <h1>{entityName}</h1>
  <p>
    Track your daily nutritional intake, build custom recipes, and log food
    photos locally.
  </p>
</header>

<!-- Main Dashboard -->
<DailyDashboard
  {dbReady}
  bind:selectedDate
  onAddMeal={openSheet}
  selectedIds={selected_ids}
  onLongPressItem={longPress}
  onTapItem={tapItem}
/>

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

<!-- Log sheet — opens directly from a meal's "+ Add" -->
{#if sheetMeal}
  <LogFoodSheet
    {dbReady}
    meal_type={sheetMeal}
    {selectedDate}
    onClose={() => (sheetMeal = null)}
  />
{/if}

<!-- Selection action bar — only when foods are selected (long-press) -->
{#if selected_ids.size > 0}
  <div class="selbar">
    <span class="selcount">{selected_ids.size} selected</span>
    <button class="selclear" onclick={clearSelection}>Clear</button>
    <button class="selbuild" id="build-recipe-btn" onclick={buildRecipe}
      >🍲 Build recipe</button
    >
  </div>
{/if}

<!-- Recipe builder, seeded from the selected foods -->
{#if recipeOpen}
  <RecipeModal
    meal_type={recipe_meal_type}
    {selectedDate}
    initialIngredients={recipe_seed}
    onClose={() => (recipeOpen = false)}
  />
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-s);
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.05em;
    text-transform: uppercase;
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
    border-bottom: 1px solid #000;
    transition: background 0.2s;
  }
  .twin-item:hover {
    background: #f4f4f5;
  }
  .twin-item:last-child {
    border-bottom: none;
  }
  .twin-entity {
    font-family: monospace;
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
    gap: var(--space-s);
    padding: var(--space-s);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
    background: #000;
    color: #fff;
    animation: slideUp 0.2s ease-out;
  }
  .selcount {
    font-weight: 700;
  }
  .selclear {
    margin-left: auto;
    background: none;
    border: 1px solid #fff;
    color: #fff;
    padding: var(--space-2xs) var(--space-s);
    cursor: pointer;
  }
  .selbuild {
    background: #ccff00;
    color: #000;
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
</style>
