<script lang="ts">
  import { Tabs } from "bits-ui";
  import {
    asMealType,
    MEAL_TYPES,
    type MealType,
  } from "../../../food/meal-type";
  import { WAYS_IN, type WayIn } from "../../../food/ways-in";
  import DoorCell from "./DoorCell.svelte";

  // THROWAWAY — variant A, **the fused plate**. The reference sketch, with its
  // doubled seams taken out.
  //
  // The shipped bar is a surface (padding) holding a groove (padding, border)
  // holding a rail of framed buttons (shadow reach). Three nested frames, each
  // paying for itself twice at every boundary. This variant has ONE frame: the
  // plate is an ink rectangle and every cell is a paper tile laid on it with a
  // 2px gap, so each rule — outer edge, the seam between two tabs, the seam
  // between the tab row and the doors — is the same 2px of the same ink, drawn
  // once. That is what "balanced" means here and it is why the rules are GAPS
  // rather than borders: two adjacent 2px borders make a 4px seam beside a 2px
  // edge, and no amount of `border-right: 0` bookkeeping keeps that honest
  // across a row whose cell count changes with the meal (ADR-0059 §4).
  //
  //   2 top rule + 48 tabs + 2 seam + 48 doors  =  100px, against ~150 shipped
  //
  // Everything else is the shipped bar's, deliberately: still `bits-ui Tabs`
  // with the doors as the tab PANEL (ADR-0101's argument for why this is a tab
  // list and not four toggles), still the fold, still nine controls one tap
  // away. The only claim under test is the frame.
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

<div class="way-in-bar fused" class:folded bind:offsetHeight={height}>
  <div class="folder" inert={folded}>
    <div class="folder-window">
      <div class="folder-slide">
        <Tabs.Root
          class="fp-root"
          value={target}
          onValueChange={(v) => onTarget(asMealType(v, target))}
        >
          <Tabs.List class="fp-list" aria-label="Which meal these land in">
            {#each MEAL_TYPES as meal_type (meal_type)}
              <Tabs.Trigger value={meal_type} class="fp-tab"
                >{meal_type.toUpperCase()}</Tabs.Trigger
              >
            {/each}
          </Tabs.List>
          {#each MEAL_TYPES as meal_type (meal_type)}
            <Tabs.Content value={meal_type} class="fp-panel">
              {#each WAYS_IN as kind (kind)}
                {#if kind !== "past" || mealHasPast[meal_type]}
                  <DoorCell
                    {kind}
                    {meal_type}
                    disabled={!dbReady}
                    onclick={() => onEnterMeal(meal_type, kind)}
                  />
                {/if}
              {/each}
            </Tabs.Content>
          {/each}
        </Tabs.Root>
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
    /* **No padding at all**, which is the variant. The shipped bar spends
       `--space-2xs` a side making itself read as a surface standing over the
       day; the plate's own ink does that job, and 19px of the 50 saved is
       this line. The safe-area reserve stays — it is the device's, not a
       decision — and it is ink, so it reads as the plate running under the
       home indicator rather than as a white shelf under it. */
    padding: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--ink);
    max-width: var(--measure-solo);
    margin-inline: auto;
    transition:
      padding var(--fold),
      margin var(--fold);
  }

  /* The plate. Ink ground, 2px everywhere, tiles on top. The top padding is the
     bar's only outer rule on a phone: left and right run off the screen edge,
     which is where the eye already has one. */
  .way-in-bar :global(.fp-root) {
    display: grid;
    gap: var(--rule);
    padding-top: var(--rule);
    background: var(--ink);
  }
  .way-in-bar :global(.fp-list),
  .way-in-bar :global(.fp-panel) {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--rule);
  }
  /* **`display: grid` on the panel itself has to give the `hidden` attribute
     back.** `Tabs.Content` keeps all four panels mounted and marks three of
     them `hidden`, which is a UA `display: none` — and a `display` of our own
     on the same element outranks it, so all four rails would stand at once.
     The shipped rail never met this because its grid is a child of the panel
     rather than the panel; here the panel IS the row, because a wrapper would
     be one more box between the plate and its tiles. */
  .way-in-bar :global(.fp-panel[hidden]) {
    display: none;
  }
  /* A tab is a tile: paper when it is not the target, solid ink when it is, so
     the selected cell reads as a hole cut in the plate rather than as a chip
     sitting on it. No radius, no groove, no shadow — the rules are the whole
     drawing. */
  .way-in-bar :global(.fp-tab) {
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
  .way-in-bar :global(.fp-tab[data-state="active"]) {
    background: var(--ink);
    color: var(--paper);
  }
  .way-in-bar :global(.fp-tab:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: -4px;
  }

  /* The fold, verbatim from the shipped bar — see `WayInBar.svelte` for why the
     travel lives one box further in than it looks like it should. */
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
      padding: 0;
      background: var(--bg-base);
      max-width: none;
      margin-inline: 0;
      margin-bottom: var(--space-2xs);
    }
    /* In the column the plate has four edges of its own to draw, so the ink
       ground pads on all sides instead of only the top. */
    .way-in-bar :global(.fp-root) {
      padding: var(--rule);
    }
  }
</style>
