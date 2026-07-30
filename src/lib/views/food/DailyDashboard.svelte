<script lang="ts">
  import {
    consumptionStore,
    consumptionForDay,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import { totalNutrition } from "../../food/consumption-state";
  import {
    buildNutrientMeters,
    buildNutrientBreakdown,
  } from "../../food/nutrient-display";
  import {
    settingsStore,
    nutritionDisplayDecimals,
  } from "../../stores/settings.store";
  import { parseLoggedQuantity } from "../../food/recipe-ingredient";
  import Modal from "../../ui/Modal.svelte";
  import FoodItemRow from "./FoodItemRow.svelte";
  import CalorieRing from "./CalorieRing.svelte";
  import MacroMeters from "./MacroMeters.svelte";
  import WeekStrip from "./WeekStrip.svelte";
  import { longpress } from "../../actions/longpress";

  let {
    dbReady,
    selectedDate = $bindable(new Date()),
    onAddMeal,
    selectedIds,
    onLongPressItem,
    onTapItem,
    onEditItem,
    onRemoveItem,
  }: {
    dbReady: boolean;
    selectedDate: Date;
    onAddMeal: (meal_type: "breakfast" | "lunch" | "dinner" | "snack") => void;
    selectedIds: Set<string>;
    onLongPressItem: (id: string) => void;
    onTapItem: (id: string) => void;
    /** Plain click on a card (outside selection mode) opens it for editing. */
    onEditItem: (item: ConsumptionEvent) => void;
    /** The card's ✕ removes the logged entry (append-only retraction). */
    onRemoveItem: (id: string) => void;
  } = $props();

  // Long-press a logged item to start selecting; while a selection is active,
  // tapping items toggles them (for building a recipe from them).
  let selectionActive = $derived(selectedIds.size > 0);

  // A long-press is followed by a synthetic click on release; without this the
  // click would immediately toggle the item we just selected back off.
  let suppressNextClick = false;

  function onCardLongPress(id: string) {
    suppressNextClick = true;
    onLongPressItem(id);
  }

  // Clear the flag at the start of every new pointer gesture. The trailing
  // click belongs to the long-press's own gesture (no fresh pointerdown), so it
  // is still suppressed — but if that click never arrives (a reflow when the
  // selection UI appears can move the card out from under the pointer; touch
  // long-presses often emit no click at all), the flag would otherwise stay set
  // and swallow the user's next tap. Resetting here makes it self-healing.
  function onCardPointerDown() {
    suppressNextClick = false;
  }

  function onCardClick(item: ConsumptionEvent) {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    // In selection mode a tap toggles the item; otherwise it opens the editor.
    if (selectionActive) onTapItem(item.id);
    else onEditItem(item);
  }

  // Selected day's consumption, narrowed from the global projection on the main thread
  let dayItems = $derived(consumptionForDay($consumptionStore, selectedDate));

  // Default target goals (typical active adult defaults, premium UI targets).
  // Only the three macros carry a target; a newly-shown nutrient renders its
  // total with no bar (see buildNutrientMeters).
  const targetCalories = 2000;
  const NUTRIENT_TARGETS: Record<string, number> = {
    protein: 130, // g
    fat: 70, // g
    carbs: 220, // g
  };

  // The full day breakdown for ANY nutrient, summed from each event's frozen
  // metrics (#28's totalNutrition) — the single source the meters read from, so
  // we never re-derive day totals here.
  let dayTotals = $derived(totalNutrition(dayItems));
  let totalCalories = $derived(dayTotals.calories);

  // Turn the user's selection (default Protein/Fat/Carbs/Fibre) + the day totals
  // + the macro targets into the meter view models the summary renders.
  let meters = $derived(
    buildNutrientMeters(
      dayTotals,
      $settingsStore.visible_nutrients,
      NUTRIENT_TARGETS,
      $nutritionDisplayDecimals
    )
  );

  // The "show everything" day breakdown (ticket #31, parent #21): every nutrient
  // the day's foods contributed, beyond the ring and the always-on selected
  // meters. Built from the same frozen day totals via #30's shared
  // buildNutrientBreakdown, so it reads identically to the per-ingredient list —
  // Calories first, then each catalogued nutrient PRESENT in the total (a
  // nutrient no logged food carried is absent, never shown as 0). Surfaced on
  // demand: tapping the aggregates (ring + meters) opens it in a modal rather
  // than an always-on disclosure below them.
  let dayBreakdown = $derived(
    buildNutrientBreakdown(dayTotals, $nutritionDisplayDecimals)
  );

  // The modal only carries something once a food is logged — an empty day totals
  // to just the Calories row, so there is nothing extra to reveal and the
  // aggregates stay inert (matching the old disclosure's hide-when-empty rule).
  let hasFullDay = $derived(dayBreakdown.length > 1);
  let showFullDay = $state(false);

  function formatDateHeader(date: Date): string {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  // Group events by meal type
  const meal_types = ["breakfast", "lunch", "dinner", "snack"] as const;
  let groupedMeals = $derived.by(() => {
    const groups: Record<(typeof meal_types)[number], any[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const item of dayItems) {
      const type = (
        item.meal_type || "snack"
      ).toLowerCase() as (typeof meal_types)[number];
      if (groups[type]) {
        groups[type].push(item);
      } else {
        groups.snack.push(item);
      }
    }
    return groups;
  });

  // Selected photo modal inside dashboard
  let previewPhoto = $state<string | null>(null);
</script>

<!-- Week Strip date selector -->
<WeekStrip bind:selectedDate />

<!-- Header Info -->
<div class="dashboard-header mt-4">
  <h2>{formatDateHeader(selectedDate)}</h2>
</div>

<!-- Aggregates Grid — tapping anywhere on the ring + meters opens the full day
     nutrition (every macro AND micronutrient) in a modal (ticket #31). It is a
     bare button wrapper, so the presentational cards inside are unchanged. -->
<button
  type="button"
  class="aggregates-grid"
  class:tappable={hasFullDay}
  disabled={!hasFullDay}
  aria-haspopup="dialog"
  aria-label="Show full day nutrition"
  onclick={() => (showFullDay = true)}
>
  <CalorieRing
    {totalCalories}
    {targetCalories}
    decimals={$nutritionDisplayDecimals}
  />

  <MacroMeters {meters} />
</button>

<!-- Timeline & Logged Meals -->
<div class="timeline mt-6">
  {#each meal_types as meal_type}
    <div class="meal-section">
      <div class="meal-section-header">
        <h3 class="meal-title">{meal_type.toUpperCase()}</h3>
        <button
          class="add-meal"
          disabled={!dbReady}
          aria-label="Add {meal_type}"
          title="Add {meal_type}"
          onclick={() => onAddMeal(meal_type)}
        >
          <svg
            class="add-meal-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {#if groupedMeals[meal_type].length === 0}
        <div class="empty-meal">
          <p>No {meal_type} logged yet.</p>
        </div>
      {:else}
        <div class="meal-items-list">
          {#each groupedMeals[meal_type] as item}
            {@const isSelected = selectedIds.has(item.id)}
            {@const qty = parseLoggedQuantity(item.quantity)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="meal-item-card"
              class:selectable={selectionActive}
              class:selected={isSelected}
              use:longpress={{ onlongpress: () => onCardLongPress(item.id) }}
              onpointerdown={onCardPointerDown}
              onclick={() => onCardClick(item)}
              onkeydown={(e) =>
                selectionActive &&
                (e.key === "Enter" || e.key === " ") &&
                onTapItem(item.id)}
              role={selectionActive ? "button" : undefined}
              tabindex={selectionActive ? 0 : undefined}
            >
              <FoodItemRow
                name={item.foodName || "Unknown Food"}
                amount={qty.amount}
                unit={qty.unit}
                calories={Number(item.calories) || 0}
                selected={isSelected}
                onRemove={() => onRemoveItem(item.id)}
              >
                {#snippet lead()}
                  {#if selectionActive}
                    <span
                      class="select-check"
                      class:on={isSelected}
                      aria-hidden="true">{isSelected ? "✓" : ""}</span
                    >
                  {/if}
                  {#if item.photoBase64}
                    <button
                      type="button"
                      class="meal-item-thumb-btn"
                      aria-label="View {item.foodName} photo"
                      onpointerdown={(e) => e.stopPropagation()}
                      onclick={(e) => {
                        e.stopPropagation();
                        if (suppressNextClick) {
                          suppressNextClick = false;
                          return;
                        }
                        if (selectionActive) onTapItem(item.id);
                        else previewPhoto = item.photoBase64;
                      }}
                    >
                      <img
                        src={item.photoBase64}
                        alt={item.foodName}
                        class="meal-item-thumb"
                      />
                    </button>
                  {/if}
                {/snippet}
              </FoodItemRow>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<!-- Full day nutrition Modal: opened by tapping the aggregates. Lists Calories
     first, then every macro and micronutrient the day's foods actually carried
     (absent nutrients omitted, never shown as 0). -->
{#if showFullDay}
  <Modal onClose={() => (showFullDay = false)} title="Full day nutrition">
    {#snippet children({ props, close })}
      <div
        {...props}
        class="day-nutrition-modal"
        data-testid="day-nutrient-breakdown"
      >
        <header class="day-nutrition-header">
          <h3>Full day nutrition</h3>
          <button
            type="button"
            class="day-nutrition-close"
            aria-label="Close"
            onclick={close}>&times;</button
          >
        </header>
        <dl class="day-nutrition-rows">
          {#each dayBreakdown as row (row.key)}
            <div class="day-nutrition-row nutrient-{row.key}">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          {/each}
        </dl>
      </div>
    {/snippet}
  </Modal>
{/if}

<!-- Photo preview Modal -->
{#if previewPhoto}
  <Modal
    onClose={() => (previewPhoto = null)}
    overlayBg="rgba(0, 0, 0, 0.85)"
    title="Food log photo preview"
  >
    {#snippet children({ props, close })}
      <div {...props} class="photo-modal-content">
        <img
          src={previewPhoto}
          alt="Food Log Preview"
          class="photo-modal-img"
        />
        <button class="photo-modal-close" onclick={close}>&times;</button>
      </div>
    {/snippet}
  </Modal>
{/if}

<style>
  .dashboard-header {
    text-align: center;
  }
  .dashboard-header h2 {
    font-size: var(--step-1);
    font-weight: 700;
    color: var(--text-primary);
  }

  /* The aggregates are a bare button wrapper so the whole ring + meters block is
     one tap target for the full-day modal. Strip the native button chrome and
     inherit typography so the cards inside render exactly as before. */
  .aggregates-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-m);
    margin-top: var(--space-m);
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: inherit;
    appearance: none;
  }
  .aggregates-grid.tappable {
    cursor: pointer;
  }
  /* An empty day has nothing to reveal: keep the block at full opacity (it is
     just an inert wrapper) rather than dimming it like a disabled control. */
  .aggregates-grid:disabled {
    cursor: default;
    opacity: 1;
  }
  /* No focus frame around the block: it wraps the ring + meters purely as a tap
     target, and a full-width ring/outline reads as a stray border (it lingers
     after the modal closes and restores focus here). */
  .aggregates-grid:focus,
  .aggregates-grid:focus-visible {
    outline: none;
    box-shadow: none;
  }
  @media (max-width: 768px) {
    .aggregates-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Full day nutrition modal */
  .day-nutrition-modal {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    width: min(92vw, 26rem);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    background: var(--food-surface-bg, #fff);
    border: 2px solid #000;
    box-shadow: 8px 8px 0 #000;
  }
  .day-nutrition-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    padding: var(--space-xs) var(--space-m);
    border-bottom: 1px solid var(--border, #000);
  }
  .day-nutrition-header h3 {
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-primary);
  }
  .day-nutrition-close {
    flex-shrink: 0;
    background: none;
    border: none;
    font-size: 1.75rem;
    line-height: 1;
    cursor: pointer;
    color: var(--text-primary);
  }
  .day-nutrition-rows {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .day-nutrition-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-s);
    padding: var(--space-2xs) var(--space-m);
  }
  .day-nutrition-row + .day-nutrition-row {
    border-top: 1px solid var(--border-subtle, #e4e4e7);
  }
  .day-nutrition-row dt {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .day-nutrition-row dd {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-l);
  }
  .meal-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .meal-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-3xs);
  }
  .meal-title {
    font-size: var(--step-n1);
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--text-primary);
  }
  /* Icon-only add action — the meal header already names the meal, so the
     button just needs to read as "add here". Filled black square to mark it as
     the section's primary action; inverts on hover like the other buttons. */
  .add-meal {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    background: #000;
    color: #fff;
    border: 1px solid #000;
    border-radius: 0;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
      transform 0.1s ease;
  }
  .add-meal:hover:not(:disabled) {
    background: #fff;
    color: #000;
  }
  .add-meal:active:not(:disabled) {
    transform: scale(0.92);
  }
  .add-meal:focus-visible {
    outline: none;
    box-shadow:
      0 0 0 2px var(--bg-base),
      0 0 0 4px var(--accent);
  }
  .add-meal:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
  .add-meal-icon {
    width: 1.1rem;
    height: 1.1rem;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: square;
  }
  .empty-meal {
    padding: var(--space-m);
    text-align: center;
    background: #fff;
    border: 1px dashed #000;
    border-radius: 0;
  }
  .empty-meal p {
    color: var(--text-muted);
    font-size: var(--step-n2);
  }

  .meal-items-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  /* The card is now a bare interactive wrapper — the bordered row visual and
     its selected highlight live in the shared FoodItemRow. */
  .meal-item-card.selectable {
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
  .select-check {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border: 2px solid #000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.85rem;
  }
  .select-check.on {
    background: #000;
    color: #ccff00;
  }
  .meal-item-thumb-btn {
    display: inline-flex;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }
  .meal-item-thumb {
    width: 48px;
    height: 48px;
    border-radius: 0;
    object-fit: cover;
    cursor: pointer;
    border: 1px solid #000;
    transition: transform 0.2s;
  }
  .meal-item-thumb:hover {
    transform: scale(1.05);
  }

  /* Photo Modal */
  .photo-modal-content {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    max-width: 90vw;
    max-height: 90vh;
  }
  .photo-modal-img {
    max-width: 100%;
    max-height: 80vh;
    border-radius: 0;
    border: 2px solid #000;
    box-shadow: 8px 8px 0 #000;
  }
  .photo-modal-close {
    position: absolute;
    top: -40px;
    right: 0;
    background: none;
    border: none;
    color: white;
    font-size: 32px;
    cursor: pointer;
  }

  :global(.mt-6) {
    margin-top: var(--space-l);
  }
</style>
