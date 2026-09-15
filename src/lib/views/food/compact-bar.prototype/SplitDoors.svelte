<script lang="ts">
  import type { MealType } from "../../../food/meal-type";
  import { WAYS_IN, type WayIn } from "../../../food/ways-in";
  import DoorCell from "./DoorCell.svelte";

  // THROWAWAY — variant C's second half: the doors, and only the doors.
  //
  //   2 top rule + 48 = 50px at the band's edge. The meal is up at the head of
  //   the day in `SplitTabs.svelte`; see there for what the split buys and what
  //   it spends.
  let {
    target,
    folded,
    dbReady,
    hasPast,
    onEnterMeal,
    height = $bindable(0),
  }: {
    target: MealType;
    folded: boolean;
    dbReady: boolean;
    hasPast: boolean;
    onEnterMeal: (meal_type: MealType, kind: WayIn) => void;
    height?: number;
  } = $props();
</script>

<div class="way-in-bar" class:folded bind:offsetHeight={height}>
  <div class="folder" inert={folded}>
    <div class="folder-window">
      <div class="folder-slide">
        <div class="plate">
          {#each WAYS_IN as kind (kind)}
            {#if kind !== "past" || hasPast}
              <DoorCell
                {kind}
                meal_type={target}
                disabled={!dbReady}
                onclick={() => onEnterMeal(target, kind)}
              />
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .way-in-bar {
    /* `--edge`'s weight as a bare length, for the seams. The palette already
       has `--hairline` — 1px, `--edge-thin`'s weight, and `app.css` names this
       exact technique in its docblock ("a grid whose `gap` shows its own
       background through as a rule") — but no counterpart for `--edge`'s 2px,
       because nothing has drawn the HEAVY rule as a gap before. The seams here
       have to match the 2px every other edge on this screen wears, so the
       weight is derived from the token that exists rather than typed as a
       number. **Folding any variant in owes `app.css` that token.** */
    --rule: calc(var(--hairline) * 2);
    --fold: 0.22s var(--ease-snap);
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--vv-bottom) + var(--shell-floor));
    z-index: 90;
    padding: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--ink);
    max-width: var(--measure-solo);
    margin-inline: auto;
    transition: padding var(--fold);
  }
  .plate {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--rule);
    padding-top: var(--rule);
    background: var(--ink);
  }

  .folder {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows var(--fold);
  }
  .folder-window {
    overflow: hidden;
    min-height: 0;
  }
  .folder-slide {
    transition: transform var(--fold);
  }
  .way-in-bar.folded {
    padding-bottom: 0;
  }
  .way-in-bar.folded .folder {
    grid-template-rows: 0fr;
  }
  .way-in-bar.folded .folder-slide {
    transform: translateY(-100%);
  }
  @media (prefers-reduced-motion: reduce) {
    .way-in-bar {
      --fold: 0s;
    }
  }

  @media (min-width: 768px) {
    .way-in-bar {
      position: static;
      background: var(--bg-base);
      max-width: none;
      margin-inline: 0;
      margin-bottom: var(--space-2xs);
    }
    .plate {
      padding: var(--rule);
    }
  }
</style>
