<script lang="ts">
  import type { MealType } from "../../food/meal-type";
  import {
    WAYS_IN,
    wayInCaption,
    wayInLabel,
    type WayIn,
  } from "../../food/ways-in";
  import Button from "../../ui/Button.svelte";
  import WayInIcon from "./WayInIcon.svelte";

  // The five ways into one meal, across a full line: ADR-0059's roster, its
  // order and its labels verbatim, in the geometry ADR-0101 §1 moved them into.
  // This is the selected tab's PANEL — the rail belongs to the meal named above
  // it, which is why `WayInBar` is a tab list and not a group of toggles.
  //
  // `grid-auto-columns: 1fr` rather than `repeat(5, 1fr)` so ADR-0059 §4's
  // hidden past-meal control leaves four cells that still fill the line,
  // instead of a gap where the fifth would have been.
  //
  // The line is what the whole change buys: five floored cells plus their gaps
  // is 276px, which fits inside a 320px phone's gutters with room to spare. It
  // never fitted beside the meal's name, and that is the sum ADR-0101 opens on.
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
      <Button
        variant="secondary"
        size="sm"
        class="way-in-cell"
        disabled={!dbReady}
        aria-label={wayInLabel(kind, meal_type)}
        title={wayInLabel(kind, meal_type)}
        onclick={() => onEnterMeal(meal_type, kind)}
      >
        <span class="stack">
          <WayInIcon {kind} />
          <span class="caption">{wayInCaption(kind)}</span>
        </span>
      </Button>
    {/if}
  {/each}
</div>

<style>
  .rail {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--space-2xs);
    width: 100%;
  }
  /* A `ui/Button` reshaped from outside, so ADR-0098 §5 applies: a `:global`
     rule outranks the primitive's own, and the floor is restated here rather
     than inherited. The width is no longer square — that is the point of the
     line — but the height still names the token, plus room for the caption. */
  .rail :global(.way-in-cell) {
    min-width: var(--tap-min);
    min-height: calc(var(--tap-min) + 0.75rem);
    padding: 0;
    /* ADR-0102 §2's first worked site. `ui/Button`'s own `--shadow-1` is
       painted outside its box and therefore outside the grid track. The
       left-hand cells got away with it — their shadow fell into the gap —
       while the last one's was clipped by the bar, which is why one cell in
       four wore a different edge from its siblings. */
    margin-right: var(--shadow-1-reach);
    margin-bottom: var(--shadow-1-reach);
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3xs);
  }
  /* Below the scale's floor deliberately: `--step-n3` is the smallest step and
     this sits under it, because the caption is a label on a mark rather than
     text to be read — the mark is what is being tapped and the word only says
     which one it is. */
  .caption {
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1;
  }
</style>
