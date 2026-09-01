<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Row from "../../ui/Row.svelte";
  import { MEAL_TYPES, type MealType } from "../../food/meal-type";

  // The meal picker the Selection bar's `move` verb opens (ADR-0088 §8).
  //
  // **All four meals, always, in that order** — including ones that already
  // hold part of the Selection. A Selection may span meals, so there is no
  // single meal it is moving *from* and none to sensibly exclude; a list that is
  // sometimes four rows and sometimes three teaches nothing and is slower the
  // second time you reach for it.
  //
  // No confirm step, for the reason the past-meal picker has none (ADR-0058
  // §3): the tap names the destination, which is the whole decision, and the
  // foods visibly relocate behind the closing sheet.
  let {
    count,
    onMove,
    onClose,
  }: {
    /** How many foods are about to move. The sheet is opened from the bar. */
    count: number;
    onMove: (meal_type: MealType) => void;
    onClose: () => void;
  } = $props();

  const label = (meal: MealType) =>
    meal.charAt(0).toUpperCase() + meal.slice(1);
</script>

<BottomSheet isOpen title="Move to" {onClose}>
  <p class="mm-lede">
    {count === 1 ? "This food" : `These ${count} foods`} keep their amounts and their
    time of day.
  </p>
  <ul class="mm-list" data-testid="move-meal-list">
    {#each MEAL_TYPES as meal (meal)}
      <li>
        <Row
          title={label(meal)}
          data-testid="move-to-{meal}"
          onclick={() => onMove(meal)}
        />
      </li>
    {/each}
  </ul>
</BottomSheet>

<style>
  .mm-lede {
    margin-bottom: var(--space-s);
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }

  .mm-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    list-style: none;
  }
</style>
