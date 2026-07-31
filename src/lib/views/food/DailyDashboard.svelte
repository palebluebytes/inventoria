<script lang="ts">
  import {
    consumptionStore,
    consumptionForDay,
    type ConsumptionEvent,
  } from "../../stores/calorie.store";
  import { totalNutrition } from "../../food/consumption-state";
  import {
    buildNutrientMeters,
    buildNutrientPills,
    buildDayRdaView,
    macroNutrients,
    nutrientShortLabel,
    SECTION_MACROS,
    SECTION_MICROS,
    SECTION_LIMITS,
    type DayRdaRow,
  } from "../../food/nutrient-display";
  import {
    resolveNutrientTargets,
    resolveNutrientLimits,
    defaultNutrientTargets,
  } from "../../food/nutrition-targets";
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
  import NutrientCard from "./NutrientCard.svelte";
  import NutrientCardGrid from "./NutrientCardGrid.svelte";
  import NutrientGroupHead from "./NutrientGroupHead.svelte";
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

  // The resolved daily targets both surfaces read: the default set — the cited
  // baked reference (energy + macros + fibre + the twelve micronutrients) with the
  // calculator's frozen energy/macro figures layered on top (ADR-0033 §4) — under
  // the user's per-nutrient overrides via the merge resolver (ADR-0031 §1/§2). An
  // untouched target stays at that default; a `> 0` override wins; a `0` opts a
  // nutrient out of a bar. `energy` clamps a non-positive override back to the
  // default so the always-on ring can never be target-less. Every visible
  // micronutrient fills against its FDA Daily Value instead of an empty track.
  let resolvedTargets = $derived(
    resolveNutrientTargets(
      $settingsStore.food_targets,
      defaultNutrientTargets($settingsStore.food_calculated_targets)
    )
  );

  // The resolved stay-under limits (ADR-0032): the baked caps layered with the
  // user's `settings/food/limits` overrides, fed to the modal builder so its
  // Limits section fills each carried limit toward its cap (amber once over).
  let resolvedLimits = $derived(
    resolveNutrientLimits($settingsStore.food_limits)
  );

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
      resolvedTargets,
      $nutritionDisplayDecimals
    )
  );

  // The full-day RDA-vs-target view (ticket #42/#43, ADR-0031 §4 / ADR-0032 §4):
  // the same day totals grouped against the resolved targets and limits — Biggest
  // gaps, Energy & macros, Vitamins & minerals, Limits, and Not tracked.
  // Independent of `visible_nutrients`: the targeted sections carry the whole
  // reach-toward set (an absent nutrient reads `— / target`), so the modal is the
  // "everything, against target" surface while the meters above stay
  // selection-gated. The Limits section shows only the limits the day carried.
  let dayRda = $derived(
    buildDayRdaView(dayTotals, resolvedTargets, {
      decimals: $nutritionDisplayDecimals,
      selection: $settingsStore.visible_nutrients,
      limits: resolvedLimits,
    })
  );

  // Whether any food has been logged for the day. The RDA sections always carry
  // the full reach-toward set (every macro/micro shows, absent ones as
  // `— / target`), so on an untouched day the modal would be a wall of "no data".
  // Gate on real logged items: an empty day shows a plain "no food added" state
  // instead, and only fills the sections once something is logged.
  let hasLoggedFood = $derived(dayItems.length > 0);
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
     RDA-vs-target modal (ticket #42). It is a bare button wrapper, so the
     presentational cards inside are unchanged. Always tappable: an untouched day
     opens to a plain "no food added" state rather than nothing. -->
<button
  type="button"
  class="aggregates-grid tappable"
  aria-haspopup="dialog"
  aria-label="Show full day nutrition"
  onclick={() => (showFullDay = true)}
>
  <CalorieRing
    {totalCalories}
    targetCalories={resolvedTargets.energy}
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
        {@const mealPills = buildNutrientPills(
          totalNutrition(groupedMeals[meal_type]),
          macroNutrients($settingsStore.visible_nutrients),
          $nutritionDisplayDecimals
        )}
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
        <!-- Subtle one-line subtotal for the section: Calories + just the macros
             the user tracks (micronutrients belong on the full-day RDA surface,
             not a running tally), summed over only this meal's items. -->
        <div class="meal-total" data-testid="meal-total-{meal_type}">
          {#each mealPills as pill (pill.key)}
            <span class="meal-total-item nutrient-{pill.key}">
              {#if pill.key !== "calories"}<span class="meal-total-label"
                  >{nutrientShortLabel(pill.key)}</span
                >{/if}<span class="meal-total-value">{pill.value}</span>
            </span>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<!-- One targeted RDA cell (Variant C): a shared NutrientCard whose body is the
     `value / target` figure and a fill bar. Absent nutrients read `— / target`;
     an over-target nutrient fills full and tints amber. -->
{#snippet rdaCell(row: DayRdaRow)}
  <NutrientCard label={row.label} rowKey={row.key}>
    {#snippet children()}
      <span class="rda-cell-vt" class:over={row.over} class:absent={row.absent}
        >{row.value} <span class="rda-cell-target">/ {row.target}</span></span
      >
      <div class="rda-cell-bar" class:over={row.over}>
        <div class="rda-cell-bar-fill" style="width: {row.fill}%"></div>
      </div>
    {/snippet}
  </NutrientCard>
{/snippet}

<!-- Full day nutrition Modal: opened by tapping the aggregates. The full
     RDA-vs-target picture (ticket #42) — a Biggest-gaps ranking strip, then every
     reach-toward nutrient against its target (absent ones as `— / target`), then
     the untargeted nutrients the day carried. Independent of visible_nutrients. -->
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
        <div class="day-rda-body">
          {#if !hasLoggedFood}
            <!-- Nothing logged: the reach-toward sections would be a wall of "no
                 data", so show a plain empty state instead. -->
            <div class="rda-empty" data-testid="rda-empty">
              <p class="rda-empty-title">No food added yet</p>
              <p class="rda-empty-hint">
                Log a meal to see your day against target.
              </p>
            </div>
          {:else}
            {#if dayRda.gaps.length > 0}
              <NutrientGroupHead label="Biggest gaps" />
              <div class="rda-gaps" data-testid="rda-gaps">
                {#each dayRda.gaps as gap (gap.key)}
                  <span class="rda-chip nutrient-{gap.key}">
                    {gap.label}
                    <span class="rda-chip-pct"
                      >{gap.percent === null
                        ? "no data"
                        : `${gap.percent}%`}</span
                    >
                  </span>
                {/each}
              </div>
            {/if}

            <NutrientGroupHead label={SECTION_MACROS} />
            <NutrientCardGrid>
              {#each dayRda.macros as row (row.key)}
                {@render rdaCell(row)}
              {/each}
            </NutrientCardGrid>

            {#if dayRda.micros.length > 0}
              <NutrientGroupHead label={SECTION_MICROS} />
              <NutrientCardGrid>
                {#each dayRda.micros as row (row.key)}
                  {@render rdaCell(row)}
                {/each}
              </NutrientCardGrid>
            {/if}

            <!-- Stay-under limits (ADR-0032): the same rdaCell, filling toward the
                 cap and tinting amber once over. Only limits the day carried show. -->
            {#if dayRda.limits.length > 0}
              <NutrientGroupHead label={SECTION_LIMITS} />
              <NutrientCardGrid>
                {#each dayRda.limits as row (row.key)}
                  {@render rdaCell(row)}
                {/each}
              </NutrientCardGrid>
            {/if}

            {#if dayRda.untracked.length > 0}
              <NutrientGroupHead
                label="Not tracked ({dayRda.untracked.length})"
              />
              {#each dayRda.untracked as row (row.key)}
                <div class="rda-untracked-row nutrient-{row.key}">
                  <span class="rda-untracked-label">{row.label}</span>
                  <span class="rda-untracked-value">{row.value}</span>
                </div>
              {/each}
            {/if}
          {/if}
        </div>
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
  /* Full-day RDA-vs-target body (#42): scrolls under the fixed header, its
     sections headed by the shared NutrientGroupHead — Biggest gaps / Energy &
     macros / Vitamins & minerals / Not tracked. */
  .day-rda-body {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  /* Untouched-day empty state: a plain centred message in place of the sections. */
  .rda-empty {
    padding: var(--space-xl) var(--space-m);
    text-align: center;
  }
  .rda-empty-title {
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--text-primary);
  }
  .rda-empty-hint {
    margin-top: var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  /* Biggest gaps: a wrap of severity chips. The only percentage in the modal — a
     shortfall ranking, not a % DV. "no data" marks a nutrient never logged. */
  .rda-gaps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
    padding: var(--space-xs) var(--space-m);
  }
  .rda-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35em;
    font-size: var(--step-n2);
    font-weight: 700;
    padding: var(--space-3xs) var(--space-2xs);
    border: 1.5px solid var(--border, #000);
    background: var(--food-surface-bg, #fff);
    white-space: nowrap;
  }
  .rda-chip-pct {
    font-variant-numeric: tabular-nums;
    color: var(--rda-over, #b45309);
  }

  /* The RDA cell body — a `value / target` figure above a fill bar — that the
     shared NutrientCard tiles into a NutrientCardGrid. Over-target tints amber; an
     absent nutrient (`— / target`) dims the value. */
  .rda-cell-vt {
    font-size: var(--step-n1);
    font-weight: 800;
    color: var(--text-primary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .rda-cell-vt.over {
    color: var(--rda-over, #b45309);
  }
  .rda-cell-vt.absent {
    color: var(--text-muted);
  }
  .rda-cell-target {
    font-size: var(--step-n3);
    font-weight: 500;
    color: var(--text-muted);
  }
  .rda-cell-bar {
    height: 6px;
    background: #e4e4e7;
    overflow: hidden;
  }
  .rda-cell-bar-fill {
    height: 100%;
    background: #000;
  }
  .rda-cell-bar.over .rda-cell-bar-fill {
    background: var(--rda-over, #b45309);
  }

  /* Not tracked: plain value, no bar — the untargeted nutrients the day carried. */
  .rda-untracked-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-s);
    padding: var(--space-2xs) var(--space-m);
  }
  .rda-untracked-row + .rda-untracked-row {
    border-top: 1px solid var(--border-subtle, #e4e4e7);
  }
  .rda-untracked-label {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .rda-untracked-value {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
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
    /* A query container so the macro subtotal below can size its text to this
       section's width — it fills the line on a wide phone and shrinks to stay on
       one line on a narrow one, instead of a fixed small size. */
    container-type: inline-size;
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

  /* One-line macro subtotal under a meal's items — muted and small so it reads
     as a running tally, not another card. Kept to a single line; if the chosen
     nutrient set is wide enough to overrun a narrow section it scrolls sideways
     rather than wrapping. */
  .meal-total {
    display: flex;
    flex-wrap: nowrap;
    align-items: baseline;
    justify-content: center;
    overflow-x: auto;
    scrollbar-width: none;
    /* Container-relative: ~2.9% of the section width makes the default macro set
       span (near-)full width, so the tally grows on a wide phone and shrinks on
       a narrow one. Clamped so it never turns illegibly small nor oversized; a
       broader nutrient selection overruns the clamp and scrolls sideways rather
       than wrapping. */
    font-size: clamp(0.5rem, 2.9cqi, 1rem);
    /* One uniform weight/colour across labels, values, and separators (like the
       headline calories figure) so the whole tally reads at a glance — faint
       labels beside bold values were hard to pick out. */
    font-weight: 700;
    color: var(--text-secondary);
  }
  .meal-total::-webkit-scrollbar {
    display: none;
  }
  /* A middot before every item but the first — the only separator (no flex gap),
     a compact tally that reads as one running line without the width a real gap
     would cost. */
  .meal-total-item + .meal-total-item::before {
    content: "·";
    margin: 0 0.35em;
  }
  .meal-total-item {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25em;
    white-space: nowrap;
  }
  .meal-total-label {
    text-transform: uppercase;
    letter-spacing: 0.04em;
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
