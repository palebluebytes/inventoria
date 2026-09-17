<script lang="ts">
  import type { MealType } from "../../food/meal-type";
  import { WAYS_IN, wayInLabel, type WayIn } from "../../food/ways-in";
  import WayInIcon from "./WayInIcon.svelte";

  // The five ways into one meal, as five marks: ADR-0059's roster and its order
  // verbatim, in the geometry ADR-0101 §1 moved them into and the shape its
  // 2026-09-15 amendment cut them down to.
  //
  // **A mark and nothing else.** The cell carried its own caption for one
  // release — a fourth gloss, invented so that a fifth of a full line could say
  // what it was — and that caption is what made the cell 60px in a 154px bar.
  // What it bought is smaller than it looks: the word sat at `--step-n4`, the
  // smallest step the scale has, under a mark drawn at 1.1rem, which is a label
  // on a label. The mark is now drawn at 1.4rem and is the whole of the cell,
  // `wayInLabel` is still its accessible name and its `title`, and `wayInLegend`
  // behind the day's ⓘ is where a mark is explained in words. The gloss itself
  // is gone rather than kept for a future caller (ADR-0097): a name no rule
  // reaches is a name that goes stale.
  //
  // **Not `ui/Button`**, which is the second thing the amendment changed. Every
  // tile in this bar is drawn by the plate it sits in: the seam either side of a
  // cell is the plate's ink showing through a gap, so a cell carrying ADR-0038's
  // frame would be a border inside a border, and ADR-0102's `--shadow-1-reach`
  // would push the grid apart by 2px that the one line does not have. That is
  // the same reading the bar's old tab triggers took — a control inside a groove
  // is drawn by the groove — and ADR-0095 §3 does not object, because `<button>`
  // is the element it deliberately holds no census over.
  //
  // `grid-auto-columns: 1fr` rather than `repeat(5, 1fr)` so ADR-0059 §4's
  // hidden past-meal control leaves four cells that still fill the line, instead
  // of a gap where the fifth would have been.
  let {
    meal_type,
    dbReady,
    hasPast,
    onEnterMeal,
  }: {
    meal_type: MealType;
    dbReady: boolean;
    /** ADR-0059 §4: absent, not disabled, until this meal has history. */
    hasPast: boolean;
    onEnterMeal: (meal_type: MealType, kind: WayIn) => void;
  } = $props();
</script>

<div class="rail">
  {#each WAYS_IN as kind (kind)}
    {#if kind !== "past" || hasPast}
      <button
        type="button"
        class="door"
        disabled={!dbReady}
        aria-label={wayInLabel(kind, meal_type)}
        title={wayInLabel(kind, meal_type)}
        onclick={() => onEnterMeal(meal_type, kind)}
      >
        <WayInIcon {kind} />
      </button>
    {/if}
  {/each}
</div>

<style>
  /* The rail draws no ground of its own: the plate's ink is behind this box, and
     the gap here is the same `--edge-width` the plate uses between its own two
     tracks, so a seam between two marks and the seam beside the chip are one
     weight drawn by one surface. */
  .rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--edge-width);
  }
  /* The floor is the whole box, both axes (ADR-0093 §1) — and it is now also all
     the height the cell has, which is the 12px the caption used to add. */
  .door {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    padding: 0;
    background: var(--paper);
    border: 0;
    border-radius: 0;
    color: var(--ink);
    cursor: pointer;
  }
  .door:disabled {
    color: var(--text-secondary);
    cursor: not-allowed;
  }
  /* Pressed is the ink swap rather than a shift, because there is no shadow left
     to shift into. */
  .door:active:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }
  .door:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -4px;
  }
  /* The mark carries the cell alone now, so it is drawn a step larger than the
     1.1rem it wore under a caption. */
  .door :global(.entry-icon) {
    width: 1.4rem;
    height: 1.4rem;
  }
</style>
