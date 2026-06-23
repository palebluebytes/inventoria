<script lang="ts">
  import {
    createCalorieTrackerStore,
    getDayBounds,
  } from "../../stores/calorie.store";
  import Button from "../../ui/Button.svelte";
  import Card from "../../ui/Card.svelte";
  import Badge from "../../ui/Badge.svelte";
  import Modal from "../../ui/Modal.svelte";

  let {
    dbReady,
    selectedDate = $bindable(new Date()),
    onOpenLogFlow,
  }: {
    dbReady: boolean;
    selectedDate: Date;
    onOpenLogFlow: (
      meal_type: "breakfast" | "lunch" | "dinner" | "snack"
    ) => void;
  } = $props();

  // Selected date store
  const trackerStore = $derived(createCalorieTrackerStore(selectedDate));

  // Default target goals (typical active adult defaults, premium UI targets)
  const targetCalories = 2000;
  const targetProtein = 130; // g
  const targetFat = 70; // g
  const targetCarbs = 220; // g

  // Derived daily aggregates
  let totalCalories = $derived(
    $trackerStore.reduce((acc, item) => acc + (Number(item.calories) || 0), 0)
  );
  let totalProtein = $derived(
    $trackerStore.reduce((acc, item) => acc + (Number(item.protein) || 0), 0)
  );
  let totalFat = $derived(
    $trackerStore.reduce((acc, item) => acc + (Number(item.fat) || 0), 0)
  );
  let totalCarbs = $derived(
    $trackerStore.reduce((acc, item) => acc + (Number(item.carbs) || 0), 0)
  );

  // SVG Progress Ring calculations
  let calProgress = $derived(Math.min(totalCalories / targetCalories, 1));
  const ringRadius = 90;
  const ringCircumference = 2 * Math.PI * ringRadius; // 565.487
  let ringOffset = $derived(
    ringCircumference - calProgress * ringCircumference
  );

  // Generate a week strip (7 days centering on selectedDate or current week)
  let weekDays = $derived.by(() => {
    const days = [];
    const base = new Date(selectedDate);
    // Align to Monday of selectedDate's week
    const day = base.getDay();
    const diff = base.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(base.setDate(diff));

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  });

  function selectDate(d: Date) {
    selectedDate = d;
  }

  function changeWeek(direction: number) {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + direction * 7);
    selectedDate = newDate;
  }

  function isSameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

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
    for (const item of $trackerStore) {
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
<div class="week-strip-container">
  <button
    class="nav-arrow"
    onclick={() => changeWeek(-1)}
    aria-label="Previous Week"
  >
    &larr;
  </button>
  <div class="week-days">
    {#each weekDays as day}
      {@const active = isSameDay(day, selectedDate)}
      {@const isToday = isSameDay(day, new Date())}
      <button
        class="day-btn"
        class:active
        class:is-today={isToday}
        onclick={() => selectDate(day)}
      >
        <span class="day-label">
          {day.toLocaleDateString("en-US", { weekday: "short" })}
        </span>
        <span class="day-number">{day.getDate()}</span>
      </button>
    {/each}
  </div>
  <button
    class="nav-arrow"
    onclick={() => changeWeek(1)}
    aria-label="Next Week"
  >
    &rarr;
  </button>
</div>

<!-- Header Info -->
<div class="dashboard-header mt-4">
  <h2>{formatDateHeader(selectedDate)}</h2>
</div>

<!-- Aggregates Grid -->
<div class="aggregates-grid">
  <!-- Circle progress -->
  <Card class="ring-card">
    <div class="ring-container">
      <svg class="progress-ring" width="240" height="240">
        <!-- Subtle radial tick marks to add a premium, precision-instrument layout -->
        <circle
          class="progress-ring-ticks"
          stroke="var(--text-muted)"
          stroke-width="1"
          stroke-dasharray="2 6"
          fill="transparent"
          r={ringRadius - 12}
          cx="120"
          cy="120"
          opacity="0.25"
        />
        <circle
          class="progress-ring-bg"
          stroke="var(--border)"
          stroke-width="4"
          fill="transparent"
          r={ringRadius}
          cx="120"
          cy="120"
        />
        <circle
          class="progress-ring-circle"
          stroke="var(--accent)"
          stroke-width="8"
          fill="transparent"
          r={ringRadius}
          cx="120"
          cy="120"
          stroke-dasharray={ringCircumference}
          stroke-dashoffset={ringOffset}
          stroke-linecap="round"
        />
      </svg>
      <div class="ring-label">
        <span class="calories-num">{totalCalories}</span>
        <span class="calories-sub">{targetCalories} kcal</span>
      </div>
    </div>
  </Card>

  <!-- Macro cards -->
  <div class="macros-subgrid">
    <Card class="macro-item protein">
      <div class="macro-meta">
        <span class="macro-name">Protein</span>
        <span class="macro-val"
          >{totalProtein}g
          <span class="macro-target">/ {targetProtein}g</span></span
        >
      </div>
      <div class="progress-bar-bg">
        <div
          class="progress-bar-fill"
          style="width: {Math.min((totalProtein / targetProtein) * 100, 100)}%"
        ></div>
      </div>
    </Card>

    <Card class="macro-item fat">
      <div class="macro-meta">
        <span class="macro-name">Fat</span>
        <span class="macro-val"
          >{totalFat}g <span class="macro-target">/ {targetFat}g</span></span
        >
      </div>
      <div class="progress-bar-bg">
        <div
          class="progress-bar-fill"
          style="width: {Math.min((totalFat / targetFat) * 100, 100)}%"
        ></div>
      </div>
    </Card>

    <Card class="macro-item carbs">
      <div class="macro-meta">
        <span class="macro-name">Carbs</span>
        <span class="macro-val"
          >{totalCarbs}g
          <span class="macro-target">/ {targetCarbs}g</span></span
        >
      </div>
      <div class="progress-bar-bg">
        <div
          class="progress-bar-fill"
          style="width: {Math.min((totalCarbs / targetCarbs) * 100, 100)}%"
        ></div>
      </div>
    </Card>
  </div>
</div>

<!-- Timeline & Logged Meals -->
<div class="timeline mt-6">
  {#each meal_types as meal_type}
    <div class="meal-section">
      <div class="meal-section-header">
        <h3 class="meal-title">{meal_type.toUpperCase()}</h3>
        <Button
          variant="secondary"
          disabled={!dbReady}
          onclick={() => onOpenLogFlow(meal_type)}
        >
          + Add {meal_type}
        </Button>
      </div>

      {#if groupedMeals[meal_type].length === 0}
        <div class="empty-meal">
          <p>No {meal_type} logged yet.</p>
        </div>
      {:else}
        <div class="meal-items-list">
          {#each groupedMeals[meal_type] as item}
            <div class="meal-item-card">
              {#if item.photoBase64}
                <button
                  type="button"
                  class="meal-item-thumb-btn"
                  aria-label="View {item.foodName} photo"
                  onclick={() => (previewPhoto = item.photoBase64)}
                >
                  <img
                    src={item.photoBase64}
                    alt={item.foodName}
                    class="meal-item-thumb"
                  />
                </button>
              {/if}
              <div class="meal-item-details">
                <span class="meal-item-name"
                  >{item.foodName || "Unknown Food"}</span
                >
                <span class="meal-item-quantity"
                  >{item.quantity || "1 serving"}</span
                >
              </div>
              <div class="meal-item-macros">
                <span class="meal-item-cals">{item.calories} kcal</span>
                <span class="meal-item-protein">{item.protein}g protein</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

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
  .week-strip-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fff;
    border: 1px solid #000;
    border-radius: 0;
    padding: var(--space-xs);
  }
  .nav-arrow {
    background: none;
    border: none;
    color: #000;
    font-size: var(--step-0);
    padding: var(--space-xs);
    cursor: pointer;
    transition: color 0.2s;
    flex-shrink: 0;
  }
  .nav-arrow:hover {
    color: var(--accent);
  }
  .week-days {
    display: flex;
    flex: 1;
    justify-content: space-between;
    gap: var(--space-3xs);
    overflow-x: auto;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }
  .week-days::-webkit-scrollbar {
    display: none; /* Chrome/Safari/Opera */
  }
  .day-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: none;
    border: 1px solid transparent;
    padding: var(--space-xs) var(--space-s);
    border-radius: 0;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    color: #000;
    flex-shrink: 0;
  }
  .day-btn:hover {
    background: #f4f4f5;
  }
  .day-btn.active {
    background: #000;
    color: #fff;
    border: 1px solid #000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }
  .day-btn.is-today:not(.active) {
    border: 1px solid #000;
    color: #000;
  }
  .day-label {
    font-size: var(--step-n3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }
  .day-number {
    font-size: var(--step-n1);
    font-weight: 700;
    margin-top: var(--space-3xs);
  }

  .dashboard-header {
    text-align: center;
  }
  .dashboard-header h2 {
    font-size: var(--step-1);
    font-weight: 700;
    color: var(--text-primary);
  }

  .aggregates-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-m);
    margin-top: var(--space-m);
  }
  @media (max-width: 768px) {
    .aggregates-grid {
      grid-template-columns: 1fr;
    }
  }

  :global(.ring-card) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-m) !important;
  }
  .ring-container {
    position: relative;
    width: 240px;
    height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .progress-ring {
    transform: rotate(-90deg);
    width: 240px;
    height: 240px;
  }
  .progress-ring-circle {
    transition: stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ring-label {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    pointer-events: none;
  }
  .calories-num {
    font-size: var(--step-4);
    font-weight: 800;
    color: var(--text-primary);
    line-height: 0.85;
    letter-spacing: -0.04em;
    margin: 0;
  }
  .calories-sub {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: var(--space-3xs);
    line-height: 1;
    white-space: nowrap;
  }

  .macros-subgrid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  :global(.macro-item) {
    padding: var(--space-xs) var(--space-m) !important;
    background: rgba(255, 255, 255, 0.01) !important;
  }
  .macro-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-2xs);
  }
  .macro-name {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .macro-val {
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }
  .macro-target {
    font-size: var(--step-n3);
    color: var(--text-muted);
    font-weight: 400;
  }

  .progress-bar-bg {
    width: 100%;
    height: 6px;
    background: #e4e4e7;
    border-radius: 0;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    border-radius: 0;
    transition: width 0.35s ease-out;
  }

  :global(.macro-item.protein) .progress-bar-fill {
    background: #000;
  }
  :global(.macro-item.fat) .progress-bar-fill {
    background: #000;
  }
  :global(.macro-item.carbs) .progress-bar-fill {
    background: #000;
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
  .meal-item-card {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    background: #fff;
    border: 1px solid #000;
    border-radius: 0;
    padding: var(--space-s);
    transition: background 0.2s;
  }
  .meal-item-card:hover {
    background: rgba(255, 255, 255, 0.04);
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
  .meal-item-details {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .meal-item-name {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-primary);
  }
  .meal-item-quantity {
    font-size: var(--step-n2);
    color: var(--text-muted);
  }
  .meal-item-macros {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .meal-item-cals {
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }
  .meal-item-protein {
    font-size: var(--step-n3);
    color: var(--text-muted);
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
