<script lang="ts">
  import type { MealType } from "../../../food/meal-type";
  import ChipTrigger from "./ChipTrigger.svelte";
  import MealTiles from "./MealTiles.svelte";

  // THROWAWAY — variant A. **The plate grows a row.**
  //
  // The claim: the app already has a surface in exactly the right place, and it
  // is the bar. So the picker is not a surface at all — the plate opens a second
  // row of four tiles above the marks, you tap one, it closes. Two taps, the same
  // as the native picker, and nothing is portalled, dimmed or animated in from
  // off screen.
  //
  // It is last round's variant A, on demand: the two-row bar that lost on 50px
  // of band, borrowed back for the two seconds you are choosing a meal. That is
  // the argument for it — the row was never wrong, it was only wrong to keep.
  //
  // What it spends: the bar changes height, which moves the day's foot reserve
  // (measured, so it follows) and moves the marks under a thumb that is already
  // travelling toward them. Whether that reads as the bar opening or as the
  // buttons dodging is the thing to look at on the phone.
  //
  // The disclosure is `grid-template-rows: 0fr -> 1fr`, which is the fold in
  // `WayInBar` run backwards — the same reason it is a grid there applies here:
  // the row's height is a tap floor plus a seam and nobody has measured it.
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

<!-- The whole picker is this column: the meals when open, and the chip always.
     It sits in the plate's first flex slot, so the marks stay where they were. -->
<div class="grow">
  <div class="opener" class:open>
    <div class="opener-window">
      <MealTiles {target} onPick={pick} />
    </div>
  </div>
  <ChipTrigger {target} {open} onToggle={() => (open = !open)} />
</div>

<style>
  .grow {
    display: flex;
    flex-direction: column;
    gap: var(--edge-width);
    /* The row is four meal names wide and the chip is one, so the tiles decide
       this column's width — which is the point: the meals row is full width and
       the marks keep the line below it. */
    flex: 1 1 auto;
  }
  .opener {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.22s var(--ease-snap);
  }
  .opener.open {
    grid-template-rows: 1fr;
  }
  .opener-window {
    overflow: hidden;
    min-height: 0;
  }
  /* The gap only exists while the row does, or the closed state carries a 2px
     line of ink under nothing. */
  .grow:has(.opener:not(.open)) {
    gap: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .opener {
      transition: none;
    }
  }
</style>
