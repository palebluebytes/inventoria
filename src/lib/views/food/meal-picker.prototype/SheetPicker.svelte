<script lang="ts">
  import { MEAL_TYPES, type MealType } from "../../../food/meal-type";
  import BottomSheet from "../../../ui/BottomSheet.svelte";
  import Row from "../../../ui/Row.svelte";
  import ChipTrigger from "./ChipTrigger.svelte";

  // THROWAWAY — variant B. **A bottom sheet.**
  //
  // The claim: this app already decided how a choice is made. Every way in opens
  // a single-purpose sheet; a meal's nutrition opens a sheet; a past meal opens a
  // sheet. A picker that is a sheet needs no new vocabulary, no new surface shape
  // and no argument — `ui/BottomSheet` already handles the visible band, the
  // keyboard, the safe area, the backdrop and the escape key, and it is the one
  // shape every user of this app has already learned.
  //
  // It is also the heaviest of the three by some distance: a full sheet, a dimmed
  // day and a header, for four words. Four `ui/Row`s rather than tiles, because a
  // sheet is a list and a list of four 48px rows in a sheet is what every other
  // list in this app looks like.
  //
  // What it spends: the day goes away while you pick. On a phone that is a whole
  // screen of motion for the smallest decision on it — and the thing to judge is
  // whether that reads as heavy or simply as normal, given everything else here
  // opens the same way.
  let {
    target,
    onTarget,
  }: {
    target: MealType;
    onTarget: (m: MealType) => void;
  } = $props();

  let open = $state(false);

  function pick(meal_type: MealType) {
    onTarget(meal_type);
    open = false;
  }
</script>

<ChipTrigger {target} {open} onToggle={() => (open = !open)} />

<BottomSheet
  isOpen={open}
  title="Which meal"
  onClose={() => (open = false)}
  testId="meal-picker-sheet"
>
  <div class="rows">
    {#each MEAL_TYPES as meal_type (meal_type)}
      <!-- `ui/Row` is the app's list line (ADR-0100): a title, an optional
           trailing mark, and a selected state that is already drawn. The tick
           rides the `trailing` snippet rather than being a second control —
           the whole row is the tap target. -->
      <Row
        title={meal_type.toUpperCase()}
        selected={meal_type === target}
        onclick={() => pick(meal_type)}
      >
        {#snippet trailing()}
          <span aria-hidden="true">{meal_type === target ? "✓" : ""}</span>
        {/snippet}
      </Row>
    {/each}
  </div>
</BottomSheet>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
</style>
