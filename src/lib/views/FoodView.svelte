<script lang="ts">
  import { createQueryStore } from "../stores/datoms.store";
  import { HLC_ORDER_DESC } from "../db/hlc";
  import {
    consumptionStore,
    consumptionForDay,
    getLocalFoodTwin,
    retractConsumptionEvent,
    changeLoggedFoodAmount,
    type ConsumptionEvent,
  } from "../stores/calorie.store";
  import {
    customIngredient,
    parseLoggedQuantity,
    type RecipeIngredient,
  } from "../food/recipe-ingredient";
  import {
    servingSizeGrams,
    servingSizePortion,
    type NutritionInfo,
    type Portion,
  } from "../food/nutrition";
  import DailyDashboard from "./food/DailyDashboard.svelte";
  import LogFoodSheet from "./food/LogFoodSheet.svelte";
  import RecipeModal from "./food/RecipeModal.svelte";
  import InstantiationSheet from "./food/InstantiationSheet.svelte";
  import IngredientAmountSheet from "./food/IngredientAmountSheet.svelte";
  import FoodSettingsSheet from "./food/FoodSettingsSheet.svelte";

  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";

  const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
  type MealType = (typeof MEAL_TYPES)[number];

  // Narrow a stored `event/meal_type` (an arbitrary ledger string) back to the
  // MealType union at the single read boundary — validating membership rather
  // than blindly casting, so an out-of-set value falls back instead of slipping
  // through typed as valid. This is the one sanctioned meal_type cast.
  function asMealType(value: string | undefined, fallback: MealType): MealType {
    return (MEAL_TYPES as readonly string[]).includes(value ?? "")
      ? (value as MealType)
      : fallback;
  }

  let { dbReady }: { dbReady: boolean } = $props();

  // The food screen's own settings sheet (top-right gear) — food-specific
  // settings (USDA/OFF credentials, contribution consent, nutrition targets)
  // that moved off the global Settings tab so they live with the food.
  let settingsOpen = $state(false);

  let selectedDate = $state(new Date());
  // The meal whose log sheet is open (null = closed). Opening is direct — no
  // intermediate chooser.
  let sheet_meal_type = $state<MealType | null>(null);
  // The logged event being edited (null = adding). When set, the log sheet opens
  // in edit mode and saving replaces this event (append-only).
  let editEvent = $state<ConsumptionEvent | null>(null);
  // Consumption-event ids selected (long-press) for building a recipe.
  let selected_ids = $state<Set<string>>(new Set());
  let recipeOpen = $state(false);
  let recipe_meal_type = $state<MealType>("dinner");
  let recipe_seed = $state<RecipeIngredient[]>([]);
  // Which verb the recipe builder performs (ADR-0022): consolidate (build from
  // selected foods), define (new template, no log), or edit (amend a template).
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
  // A logged food whose amount is being changed in the picker sheet (the shared
  // FoodAmountPanel; the dashboard equivalent of a recipe row tap). Carries the
  // resolved twin panel + portions so the sheet shows the same screen the search
  // flow does — with the food's serving surfaced as a chip. `grams` is the
  // opening amount; Done retract-and-replaces the event via changeLoggedFoodAmount.
  let amountEdit = $state<{
    event: ConsumptionEvent;
    name: string;
    grams: number;
    panel?: NutritionInfo;
    portions: Portion[];
  } | null>(null);

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
    editEvent = null;
    sheet_meal_type = meal_type;
  }

  // Open the right editor for a tapped card. A Recipe Instantiation (carries a
  // frozen `event/instantiation` snapshot) opens the instantiation editor to be
  // corrected by supersession (ADR-0022); a plain food opens the log sheet.
  async function editItem(item: ConsumptionEvent) {
    if (item.instantiation) {
      instantiate_template = null;
      instantiate_edit = item;
      instantiate_meal_type = asMealType(item.meal_type, "snack");
      instantiateOpen = true;
      return;
    }
    // Both a gram-logged food and a per-serving food with a KNOWN serving weight
    // edit their amount in the shared picker — the same screen the search flow
    // stages into. Resolve the twin for its panel + portions, and surface the
    // food's own serving as a chip so a whole-serving food is a one-tap away from
    // its serving while still editable to any gram amount. Both re-log in grams
    // via changeLoggedFoodAmount (which scales the panel from ITS basis).
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
    // Deduped by gram weight so a serving listed both ways isn't doubled.
    const portions = dedupePortionsByGrams([
      ...servingSizePortion(panel),
      ...twinPortions,
    ]);
    // A gram basis to open at and scale against: the panel's weighed serving if
    // it has one, else the food's first real portion weight (the OFF serving). A
    // food with neither has no gram basis and can't be gram-edited.
    const servingGrams =
      (panel ? servingSizeGrams(panel.serving_size) : null) ??
      portions.find((p) => Number.isFinite(p.grams) && p.grams > 0)?.grams ??
      null;

    // Open at the logged grams (gram foods), or the serving's gram weight × how
    // many servings were logged (per-serving foods with a gram basis). Anything
    // else has no gram basis and stays null → falls through to the full sheet.
    let openGrams: number | null = null;
    if (unit === "g") openGrams = amount;
    else if (unit === "serving" && panel != null && servingGrams != null)
      openGrams = servingGrams * amount;

    if (openGrams != null) {
      amountEdit = {
        event: item,
        name: item.foodName ?? "Food",
        grams: openGrams,
        panel,
        portions,
      };
      return;
    }

    // A weightless "1 serving" custom food (no panel or no gram basis to scale
    // by) can't be gram-edited, so it still opens the full edit sheet where its
    // macros, name and photo remain editable.
    editEvent = item;
    sheet_meal_type = asMealType(item.meal_type, "snack");
  }

  // Drop portions that resolve to a gram weight already listed — keeps the first
  // (the synthesised "1 serving" precedes the twin's own portions), so the amount
  // picker never shows two chips for the same weight.
  function dedupePortionsByGrams(portions: Portion[]): Portion[] {
    const seen = new Set<number>();
    return portions.filter((p) => {
      if (seen.has(p.grams)) return false;
      seen.add(p.grams);
      return true;
    });
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
  function removeItem(id: string) {
    void retractConsumptionEvent(id);
  }

  function closeSheet() {
    sheet_meal_type = null;
    editEvent = null;
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
    const seed = await Promise.all(
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
    recipe_meal_type = asMealType(items[0]?.meal_type, "dinner");
    openRecipe("consolidate", null, seed);
    clearSelection();
  }
</script>

<header class="page-header">
  <div class="header-text">
    <h1>{entityName}</h1>
    <p>
      Track your daily nutritional intake, build custom recipes, and log food
      photos locally.
    </p>
  </div>
  <button
    type="button"
    class="settings-btn"
    id="food-settings-btn"
    aria-label="Food settings"
    onclick={() => (settingsOpen = true)}
  >
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
  </button>
</header>

<!-- Main Dashboard -->
<DailyDashboard
  {dbReady}
  bind:selectedDate
  onAddMeal={openSheet}
  selectedIds={selected_ids}
  onLongPressItem={longPress}
  onTapItem={tapItem}
  onEditItem={editItem}
  onRemoveItem={removeItem}
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

<!-- Log sheet — opens directly from a meal's "+ Add", or in edit mode from a
     tapped food card. -->
{#if sheet_meal_type}
  <LogFoodSheet
    {dbReady}
    meal_type={sheet_meal_type}
    {selectedDate}
    edit={editEvent}
    onClose={closeSheet}
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
     retract-and-replaces the event in grams via changeLoggedFoodAmount. -->
{#if amountEdit}
  {@const ae = amountEdit}
  <IngredientAmountSheet
    name={ae.name}
    amount={ae.grams}
    panel={ae.panel}
    portions={ae.portions}
    onCommit={(grams) => changeLoggedFoodAmount(ae.event, grams)}
    onClose={() => (amountEdit = null)}
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

<!-- Food settings — the top-right gear opens the food-specific settings sheet
     (USDA/OFF credentials, contribution consent, nutrition targets). -->
{#if settingsOpen}
  <FoodSettingsSheet onClose={() => (settingsOpen = false)} />
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
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-s);
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
    border-bottom: var(--edge);
    padding-bottom: var(--space-s);
  }
  .header-text {
    min-width: 0;
  }
  /* Top-right gear: a bare icon button (no box) that opens the food settings
     sheet. Sits opposite the title, aligned to the header's top. */
  .settings-btn {
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
  .settings-btn svg {
    width: 1.5rem;
    height: 1.5rem;
  }
  .settings-btn:hover {
    color: var(--text-secondary);
  }
  .settings-btn:active {
    transform: scale(0.92);
  }
  .settings-btn:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
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
    background: var(--ink);
    color: var(--paper);
    animation: slideUp 0.2s ease-out;
  }
  .selcount {
    font-weight: 700;
  }
  .selclear {
    margin-left: auto;
    background: none;
    border: 1px solid var(--paper);
    color: var(--paper);
    padding: var(--space-2xs) var(--space-s);
    cursor: pointer;
  }
  .selbuild {
    background: var(--green-bg);
    color: var(--ink);
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
