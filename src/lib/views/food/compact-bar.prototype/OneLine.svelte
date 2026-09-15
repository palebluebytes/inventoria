<script lang="ts">
  import {
    asMealType,
    MEAL_TYPES,
    type MealType,
  } from "../../../food/meal-type";
  import { WAYS_IN, type WayIn } from "../../../food/ways-in";
  import DoorCell from "./DoorCell.svelte";

  // THROWAWAY — variant B, **one line**. The bar is a single 48px row and
  // nothing else: a meal chip, then the marks.
  //
  //   2 top rule + 48 = 50px, a third of what ships.
  //
  // It gets there by refusing the premise the other two keep. A tab list is
  // four controls permanently on screen to hold ONE value, and four controls is
  // a row; a chip is one control holding the same value, and one control fits
  // on the row that was going to exist anyway. The arithmetic works on a 390px
  // phone — a ~92px chip leaves 298px over five doors, 59px each, comfortably
  // over the floor — and it is the meal that pays: choosing one is a tap, then
  // the platform's picker, then a choice, where the shipped bar makes it one
  // tap on a target you can already see.
  //
  // **This is the variant that breaks ADR-0101 §2's shape rather than its
  // size.** "The meal is chosen and never inferred" survives — nothing moves
  // under you — but "the tabs are the only thing that moves the target" becomes
  // a select, and with it goes the tab pattern's honest claim that the doors
  // below are THAT meal's panel. What is left is a form control and five
  // buttons that read it, which is a weaker sentence about the same act.
  //
  // A bare `<select>` rather than `ui/Select` (ADR-0095) on purpose: the
  // primitive brings the retro field skin — frame, inset, its own height — and
  // this cell is a tile on a plate. Folding B in means a flat variant of that
  // primitive, and the cost belongs on screen where it can be judged.
  let {
    target,
    onTarget,
    folded,
    dbReady,
    mealHasPast,
    onEnterMeal,
    height = $bindable(0),
  }: {
    target: MealType;
    onTarget: (m: MealType) => void;
    folded: boolean;
    dbReady: boolean;
    mealHasPast: Record<MealType, boolean>;
    onEnterMeal: (meal_type: MealType, kind: WayIn) => void;
    height?: number;
  } = $props();
</script>

<div class="way-in-bar" class:folded bind:offsetHeight={height}>
  <div class="folder" inert={folded}>
    <div class="folder-window">
      <div class="folder-slide">
        <div class="plate">
          <div class="chip">
            <select
              class="chip-select"
              aria-label="Which meal these land in"
              value={target}
              onchange={(e) =>
                onTarget(asMealType(e.currentTarget.value, target))}
            >
              {#each MEAL_TYPES as meal_type (meal_type)}
                <option value={meal_type}>{meal_type.toUpperCase()}</option>
              {/each}
            </select>
            <span class="caret" aria-hidden="true">▾</span>
          </div>
          {#each WAYS_IN as kind (kind)}
            {#if kind !== "past" || mealHasPast[target]}
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

  /* One row, same ink-and-gap rules as A: the chip is just the first tile. */
  .plate {
    display: grid;
    /* One explicit `auto` track for the chip, then implicit 1fr tracks for
       however many doors this meal has (four or five, ADR-0059 SS4). */
    grid-template-columns: auto;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--rule);
    padding-top: var(--rule);
    background: var(--ink);
  }

  /* The chip reads as the row's subject rather than as a sixth door: ink
     ground, paper letters, the one inverted tile on the line. That inversion is
     doing the work the whole tab row used to do — it is the only thing on
     screen that says which meal a tap lands in. */
  .chip {
    position: relative;
    display: flex;
    align-items: center;
    min-height: var(--tap-min);
    background: var(--ink);
    color: var(--paper);
  }
  .chip-select {
    appearance: none;
    min-height: var(--tap-min);
    /* Room for the caret on the right, which is drawn rather than the
       platform's — an appearance-stripped select has none. */
    padding: 0 calc(var(--space-s) + var(--space-3xs)) 0 var(--space-2xs);
    background: none;
    border: 0;
    border-radius: 0;
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--paper);
    cursor: pointer;
  }
  .chip-select:focus-visible {
    outline: 2px solid var(--paper);
    outline-offset: -4px;
  }
  /* The list itself is the platform's, so its options are drawn in the
     platform's colours and need the app's ink back. */
  .chip-select option {
    background: var(--paper);
    color: var(--ink);
  }
  .caret {
    position: absolute;
    right: var(--space-2xs);
    font-size: var(--step-n3);
    pointer-events: none;
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
