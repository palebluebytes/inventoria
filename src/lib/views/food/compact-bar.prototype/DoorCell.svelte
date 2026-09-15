<script lang="ts">
  import type { MealType } from "../../../food/meal-type";
  import { wayInLabel, type WayIn } from "../../../food/ways-in";
  import WayInIcon from "../WayInIcon.svelte";

  // THROWAWAY. One way-in cell, **mark only** — the caption the shipped rail
  // prints under the mark is gone, which is half the ask and 12px of the 48px
  // saving a single row makes.
  //
  // What that costs, stated rather than hidden: `wayInCaption` loses its only
  // consumer, and the mark is then the whole of what a sighted user has to go
  // on. The name is still `wayInLabel` on `aria-label` and on `title`, so a
  // screen reader and a long-press are unchanged; a first-time user meets five
  // unglossed marks and the ⓘ legend (`wayInLegend`) becomes the only place
  // they are explained. All three variants take that bet, so nothing here
  // isolates it — if it is the wrong bet, it is wrong four times.
  //
  // **Not `ui/Button`**, and that is the prototype's second bill. Every variant
  // draws its rules as gaps over an ink ground, so a cell carrying ADR-0038's
  // offset shadow would be a second frame inside a frame that already has one
  // (and ADR-0102's reach would push the grid apart by 2px it does not have).
  // Folding a variant in means arguing either a `ui/Button` variant that drops
  // the shadow, or an exception at these five call sites.
  let {
    kind,
    meal_type,
    disabled = false,
    onclick,
  }: {
    kind: WayIn;
    meal_type: MealType;
    disabled?: boolean;
    onclick: () => void;
  } = $props();
</script>

<button
  type="button"
  class="door"
  {disabled}
  aria-label={wayInLabel(kind, meal_type)}
  title={wayInLabel(kind, meal_type)}
  {onclick}
>
  <WayInIcon {kind} />
</button>

<style>
  /* The floor is the whole box, both axes (ADR-0093 §1). It is also all the
     height this cell has now — 48px and not a pixel of caption — which is the
     one number every variant below is buying. */
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
  /* Pressed state is the ink swap rather than a shift, because there is no
     shadow left to shift into. */
  .door:active:not(:disabled) {
    background: var(--ink);
    color: var(--paper);
  }
  .door:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: -4px;
  }
  /* The mark carries the cell on its own now, so it is drawn a step larger
     than the shipped rail's 1.1rem. */
  .door :global(.entry-icon) {
    width: 1.4rem;
    height: 1.4rem;
  }
</style>
