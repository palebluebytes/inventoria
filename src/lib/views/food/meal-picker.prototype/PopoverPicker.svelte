<script lang="ts">
  import { Popover } from "bits-ui";
  import type { MealType } from "../../../food/meal-type";
  import MealTiles from "./MealTiles.svelte";

  // THROWAWAY — variant C. **A popover from the chip.**
  //
  // The claim: the shape the native picker has is the right shape — a small
  // panel of four choices, over the control that opened it — and the only thing
  // wrong with it is that somebody else drew it. So this draws the same shape in
  // the app's ink and changes nothing about the interaction.
  //
  // bits-ui `Popover` for the same reason ADR-0068 §1 gives for reaching for
  // bits at all: there is no platform control for an anchored panel, so this is
  // the side of the line bits is for. It brings the focus trap, the escape key,
  // the outside-click dismissal and `aria-expanded` wiring — all of which a
  // hand-rolled panel would have to earn, and which the native select had for
  // free.
  //
  // What it spends is a **new surface shape**. This app has sheets, modals and
  // pinned bars; it has no popovers. ADR-0100's brake asks what a new member
  // removes, and the honest answer here is "nothing a sheet could not do" —
  // which is variant B. So C has to win on feel to be worth the vocabulary, and
  // that is exactly what a phone can say and a desktop cannot.
  //
  // Its own trigger rather than the shared `ChipTrigger`, because bits owns the
  // trigger's `aria-expanded` and its click handling; the class is the same, so
  // the tile is the same tile.
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

<Popover.Root bind:open>
  <Popover.Trigger class="chip pop-chip" aria-label="Which meal these land in">
    <span class="chip-word">{target.toUpperCase()}</span>
    <svg class="chip-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 6 L17 12 L7 18 Z" fill="currentColor" />
    </svg>
  </Popover.Trigger>
  <Popover.Content
    class="pop-panel"
    side="top"
    align="start"
    sideOffset={4}
    collisionPadding={8}
  >
    <MealTiles {target} onPick={pick} />
  </Popover.Content>
</Popover.Root>

<style>
  /* bits renders both elements itself, so every rule is `:global` — the same
     shape `ui/Segmented` uses for `.seg-row`. */
  :global(.pop-chip) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3xs);
    min-height: var(--tap-min);
    padding: 0 var(--space-2xs);
    background: var(--ink);
    border: 0;
    border-radius: 0;
    color: var(--paper);
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
  }
  :global(.pop-chip .chip-word) {
    white-space: nowrap;
  }
  :global(.pop-chip .chip-mark) {
    width: 0.8rem;
    height: 0.8rem;
    transform: rotate(90deg);
    transition: var(--turn-mark);
  }
  :global(.pop-chip[data-state="open"] .chip-mark) {
    transform: rotate(-90deg);
  }
  /* The panel is the plate again: an ink rectangle with paper tiles on it, so
     the popover reads as a piece of the bar that has come up rather than as a
     card floating over the day. The vertical stack is the one difference from
     A's row — a panel anchored to a chip is as wide as the chip's own column,
     which is not four meal names. */
  :global(.pop-panel) {
    z-index: 950;
    padding: var(--edge-width);
    background: var(--ink);
    border-radius: 0;
    box-shadow: none;
  }
  :global(.pop-panel .tiles) {
    grid-auto-flow: row;
    grid-auto-columns: auto;
    min-width: 11rem;
  }
</style>
