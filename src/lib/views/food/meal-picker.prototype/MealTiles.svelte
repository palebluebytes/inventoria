<script lang="ts">
  import { MEAL_TYPES, type MealType } from "../../../food/meal-type";

  // THROWAWAY. The four meals as tiles, shared by A and C — what differs between
  // those two is where the row stands, not what it is, and that is the comparison
  // worth making. B uses rows rather than tiles because a sheet is a list.
  //
  // A group of buttons rather than bits-ui `RadioGroup`: the surface closes on
  // the first tap, so nothing here is ever read as a persisted selection you
  // could come back and change. `aria-pressed` says which one you are on without
  // claiming the roving-tabindex semantics a radiogroup would.
  let {
    target,
    onPick,
  }: {
    target: MealType;
    onPick: (m: MealType) => void;
  } = $props();
</script>

<div class="tiles" role="group" aria-label="Which meal these land in">
  {#each MEAL_TYPES as meal_type (meal_type)}
    <button
      type="button"
      class="tile"
      aria-pressed={meal_type === target}
      onclick={() => onPick(meal_type)}>{meal_type.toUpperCase()}</button
    >
  {/each}
</div>

<style>
  /* Same ink-and-gap construction as the bar's own plate, so the row reads as
     part of the same object rather than as a panel laid over it. */
  .tiles {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--edge-width);
  }
  .tile {
    min-height: var(--tap-min);
    padding-inline: var(--space-3xs);
    background: var(--paper);
    border: 0;
    border-radius: 0;
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .tile[aria-pressed="true"] {
    background: var(--ink);
    color: var(--paper);
  }
  .tile:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -4px;
  }
</style>
