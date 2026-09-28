<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import ContentsRow from "./ContentsRow.svelte";
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
  // about to be copied is legible without a second tap. That row anatomy is
  // `ContentsRow`, shared since ADR-0110 §6 put a second list of occasions on
  // the Recipes screen.
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
        <!-- The verb is the point here, not the contents: a copy names the meal
             it is about to reproduce rather than reading its foods out. -->
        <ContentsRow
          head={dayLabel(meal.date)}
          trailing="{roundFoodDisplay(
            meal.calories,
            $calorieDisplayDecimals
          )} kcal"
          lines={meal.items.map((item) => ({
            id: item.id,
            label: item.foodName ?? "",
            amount: amountLabel(item.quantity),
          }))}
          ariaLabel="Copy {dayLabel(meal.date)}'s {meal_type}"
          onclick={() => onCopy(meal)}
        />
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
</style>
