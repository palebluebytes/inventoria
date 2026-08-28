<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import { roundFoodDisplay } from "../../food/nutrition";
  import {
    quantityLabel,
    parseLoggedQuantity,
  } from "../../food/recipe-ingredient";
  import { calorieDisplayDecimals } from "../../stores/device-settings";
  import { dayLabel, type PastMeal } from "../../food/past-meals";
  import { wayInTitle } from "../../food/ways-in";
  import type { MealType } from "../../food/meal-type";

  // The past-meal picker (ADR-0058 §12): one row per past day, newest first,
  // each spelling the meal out one food per line with its amount, so what is
  // about to be copied is legible without a second tap.
  //
  // Its own sheet, not a tab in the stager: every method there picks a FOOD,
  // this picks a MEAL and commits several entries at once (ADR-0059 §2). It
  // carries no dock for the same reason every header-reached sheet carries
  // none — the header already chose.
  //
  // There is no confirm step (§3). The row already showed the contents, so the
  // tap IS the informed decision, and the sheet closes behind it.
  let {
    meal_type,
    meals,
    onCopy,
    onClose,
  }: {
    meal_type: MealType;
    meals: PastMeal[];
    onCopy: (meal: PastMeal) => void;
    onClose: () => void;
  } = $props();

  /** The dashboard's own quantity phrasing, so a picker row reads like the row
   *  it will become ("60g", "1 serving"). */
  function amountLabel(quantity: string | undefined): string {
    const { amount, unit } = parseLoggedQuantity(quantity);
    return quantityLabel(amount, unit);
  }
</script>

<!-- `fillHeight`: how many past meals you have is a fact about your history, not
     about this sheet, so the sheet opens at the same size the staging sheets do
     whether it holds one row or twenty. -->
<BottomSheet isOpen title={wayInTitle("past")} fillHeight {onClose}>
  <ul class="pm-list" data-testid="past-meal-list">
    {#each meals as meal (meal.date.getTime())}
      <li>
        <button
          type="button"
          class="pm-row"
          onclick={() => onCopy(meal)}
          aria-label="Copy {dayLabel(meal.date)}'s {meal_type}"
        >
          <span class="pm-head">
            <span class="pm-date">{dayLabel(meal.date)}</span>
            <span class="pm-kcal"
              >{roundFoodDisplay(meal.calories, $calorieDisplayDecimals)} kcal</span
            >
          </span>
          <span class="pm-foods">
            {#each meal.items as item (item.id)}
              <span class="pm-food">
                <span class="pm-name">{item.foodName}</span>
                <span class="pm-amount">{amountLabel(item.quantity)}</span>
              </span>
            {/each}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</BottomSheet>

<style>
  .pm-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .pm-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    width: 100%;
    padding: var(--space-xs);
    font: inherit;
    text-align: left;
    color: var(--ink);
    background: var(--paper);
    border: var(--edge);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
    cursor: pointer;
  }
  .pm-row:active {
    box-shadow: none;
    transform: translate(1px, 1px);
  }
  .pm-row:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .pm-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2xs);
  }
  .pm-date {
    font-size: var(--step-n1);
    font-weight: 700;
    letter-spacing: 0.03em;
  }
  .pm-kcal {
    font-size: var(--step-n2);
    font-weight: 700;
  }
  .pm-foods {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding-top: var(--space-3xs);
    border-top: var(--edge-thin);
  }
  .pm-food {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2xs);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  .pm-amount {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
</style>
