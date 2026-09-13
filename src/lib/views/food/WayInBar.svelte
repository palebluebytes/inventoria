<script lang="ts">
  import { Tabs } from "bits-ui";
  import { asMealType, MEAL_TYPES, type MealType } from "../../food/meal-type";
  import type { WayIn } from "../../food/ways-in";
  import WayInRail from "./WayInRail.svelte";

  // The **Way-in bar** (ADR-0101, and *Way-in bar* in `CONTEXT.md`): one bar for
  // the whole day, in two positions.
  //
  //   below 768   pinned to the foot of the visible band, under the thumb
  //   768 and up  sticky at the head of the day's timeline column
  //
  // **The number is `BREAKPOINTS.sheet`, and it is not a new one.** Its own
  // docblock already carries this argument for the overlay shape: below it a
  // surface anchors to the visible band's bottom edge "because that edge is
  // where the hand is", and above it one rising from the far end of a large
  // screen "is imitating a device that is not there" (ADR-0089 §6). A way-in
  // bar is that question asked about a different surface, so it takes the same
  // answer and `lib/ui/breakpoints.ts` gains nothing.
  //
  // **The meal is chosen and never inferred** (§2). The tabs are the only thing
  // that moves the target; the clock picks the FIRST one, which is a starting
  // value rather than a change. Scroll-position inference was built and refused:
  // a target that moves while you read is a target you have to re-check before
  // every tap, and the cost of it being wrong is paid silently, one meal at a
  // time, in a ledger whose whole design is that nothing is edited afterwards.
  //
  // ── Why bits-ui Tabs is honest here and not a costume ──────────────────────
  //
  // A `role="tab"` with no `role="tabpanel"` behind it is the usual way this
  // component gets misused, and it is not what this is: **the rail IS the
  // panel.** Each meal's `Tabs.Content` holds the five ways into THAT meal, so
  // the tab list selects a meal and the panel below it is that meal's doors —
  // the tab pattern's actual contract rather than a borrowed look. The ARIA
  // wiring, the roving tabindex and the arrow keys come with it.
  //
  // That is ADR-0068 §1's test satisfied rather than bypassed — reach for bits
  // only where the platform supplies less, not more. There is no native tab
  // control, so this is the side of the line bits is for.
  //
  // The sibling it is NOT: `ui/Segmented` (RadioGroup) is this app's one-of-N
  // whose selection must persist, and it would fit. It lost on what the control
  // CLAIMS. A radiogroup says "pick one of four values"; a tab list says "this
  // panel belongs to the one you picked", and the second is the true sentence
  // here, because the rail's contents change with the meal — the past-meal
  // control appears only for a meal with history (ADR-0059 §4).
  //
  // The GROOVE stays here rather than becoming `ui/Tabs`, on ADR-0100's own
  // test: it is one copy, and the brake settles it — a member with one consumer
  // removes no surface. The bits wiring is a third copy rather than a second
  // (`FoodStager`'s `.method`, `ReportsPage`'s `.period`), which is the count
  // ADR-0101's Consequences got wrong and its Amendment corrects; what those two
  // share with this one is an import line, and what they do not share is every
  // rule that draws them.
  let {
    folded,
    dbReady,
    mealHasPast,
    onEnterMeal,
    height = $bindable(0),
  }: {
    /**
     * A Selection is live, so the bar folds away (ADR-0101 §4).
     *
     * The two surfaces share one slot and the Selection takes it. On a phone
     * the Selection also wins the paint — it is at `z-index: 900` and this is
     * at 90 — but winning the paint is not the same as leaving: the tab row
     * still stood proud of the Selection's upper edge, which read as two bars
     * fighting over the foot of the screen.
     *
     * **Both layouts, not just the phone.** Above 768 the two stack in one grid
     * cell and the Selection paints over, so folding is not needed there to
     * clear a collision. It happens anyway, because the reason is the mode
     * rather than the geometry: a Selection has its own verbs and adding is not
     * one of them, so a control that cannot act does not hold space (ADR-0089
     * §8's rule, read one level out).
     */
    folded: boolean;
    dbReady: boolean;
    mealHasPast: Record<MealType, boolean>;
    onEnterMeal: (meal_type: MealType, kind: WayIn) => void;
    /**
     * The bar's own border-box height, reported out (read-only in practice —
     * writing it does not resize anything).
     *
     * Below 768 the bar is pinned over the day's last rows, so the day has to
     * buy that height back or the Snack section ends underneath it. The height
     * is genuinely unknown: the rail drops a cell for a meal with no past
     * (ADR-0059 §4), the captions sit on a fluid scale, and the safe-area
     * reserve is the device's. So it is MEASURED rather than restated — a
     * spacer written as a sum of tokens is a second copy of this box's
     * geometry, and the kind that is wrong on one of the four meals.
     *
     * Above 768 the bar is in flow and owes the day nothing, so the consumer
     * drops this. `bind:offsetHeight` rather than `clientHeight` because the
     * border and the safe-area padding are both part of what stands over the
     * page.
     */
    height?: number;
  } = $props();

  /**
   * The meal nearest the clock. A starting value, never a later change — which
   * is the whole of §2: nothing moves under you once the screen is up.
   *
   * The bounds are the ones a day divides on rather than a derivation from
   * anything in the ledger: before 11 is breakfast, before 15 is lunch, before
   * 21 is dinner, and the late hours are the snack. Being wrong costs one tap
   * on a tab, which is the cost §2 accepts in exchange for the target holding
   * still.
   */
  function nearestMeal(): MealType {
    const hour = new Date().getHours();
    if (hour < 11) return "breakfast";
    if (hour < 15) return "lunch";
    if (hour < 21) return "dinner";
    return "snack";
  }

  let target = $state<MealType>(nearestMeal());
</script>

<div class="way-in-bar" class:folded bind:offsetHeight={height}>
  <!-- `inert`, not merely zero height: a folded bar still holds nine controls,
       and a tab stop inside a box nobody can see is worse than a visible one. -->
  <div class="folder" inert={folded}>
    <div class="folder-window">
      <div class="folder-slide">
        <Tabs.Root
          class="wib-root"
          value={target}
          onValueChange={(v) => (target = asMealType(v, target))}
        >
          <!-- The groove: the track recedes and the selected cell fills with ink
               inside it, so the control reads as a switch rather than as four
               more of the buttons below it. -->
          <Tabs.List class="wib-list" aria-label="Which meal these land in">
            {#each MEAL_TYPES as meal_type (meal_type)}
              <Tabs.Trigger value={meal_type} class="wib-tab"
                >{meal_type.toUpperCase()}</Tabs.Trigger
              >
            {/each}
          </Tabs.List>
          {#each MEAL_TYPES as meal_type (meal_type)}
            <!-- No class: the panel is a box the rail fills, and ADR-0097
                 deletes a name no rule reaches. A spec that wants it asks for
                 `[role="tabpanel"]`, which is the thing being claimed. -->
            <Tabs.Content value={meal_type}>
              <WayInRail
                {meal_type}
                {dbReady}
                hasPast={mealHasPast[meal_type]}
                {onEnterMeal}
              />
            </Tabs.Content>
          {/each}
        </Tabs.Root>
      </div>
    </div>
  </div>
</div>

<style>
  /* ── The phone, which is the unprefixed case ────────────────────────────── */
  .way-in-bar {
    /* One duration for the whole fold, so the height, the padding and the ink
       are one gesture rather than three that agree by coincidence — the reason
       `app.css` writes `--turn-mark` as a whole declaration rather than as its
       parts. `--ease-snap` is the app's curve; ADR-0003 §4 rules out a spring. */
    --fold: 0.22s var(--ease-snap);
    position: fixed;
    left: 0;
    right: 0;
    /* The band's bottom edge, MINUS whatever the shell's own chrome already has
       of it (ADR-0089 §1, §3; ADR-0101 §3 as amended). `--vv-bottom` is
       `SelectionBar`'s one declaration for its reason — a surface pinned over
       the page consumes the band rather than deriving a geometry of its own, and
       this bar has no scrolling region to give up, so it writes `bottom` and
       nothing else.

       `--shell-floor` is the second term and it is not a second geometry: it is
       0 in Rations, which has no tab bar (ADR-0078 §1) and is the Facet ADR-0101
       was drawn on, and it is `App.svelte`'s measured nav height in the root
       shell, where a bar on the band's edge would otherwise stand behind the tab
       bar and lose its lower half. A Selection bar may cover that nav because a
       Selection is a mode you leave; this bar is permanent and may not.

       Both are `var()` with no fallback here, which is `src/app.css`'s point in
       declaring both on `:root`: this rule is correct before any measurement has
       run, and in a shell that never takes one. */
    bottom: calc(var(--vv-bottom) + var(--shell-floor));
    /* Under the Sidebar's 100 and under a Selection's 900: this is a tool on the
       page, not a mode that owns the foot of the screen. A Selection covers it,
       which is right — a Selection has its own verbs and adding is not one of
       them (ADR-0088 §3). */
    z-index: 90;
    padding: var(--space-2xs);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-2xs));
    background: var(--paper);
    border-top: var(--edge);
    /* The shell caps its column and centres it; a full-bleed fixed bar has to
       repeat that or it runs the width of a desktop window. */
    max-width: var(--measure-solo);
    margin-inline: auto;
    transition:
      padding var(--fold),
      margin var(--fold),
      border-top-width var(--fold),
      border-bottom-width var(--fold);
  }

  /* The fold (ADR-0101 §6). `grid-template-rows: 1fr -> 0fr` because it is the
     only way to animate to and from a height nobody has measured — and this
     bar's height is genuinely unknown, since `WayInRail` drops a cell for a meal
     with no past (ADR-0059 §4). A `max-height` would need a magic number that is
     wrong for one of the four meals.

     **This is the app's first animated region, and that is a departure.**
     `app.css` states the opposite position: "The region below a disclosure
     appears at once — it is a `hidden` attribute, not a height animation." That
     holds for a disclosure, where the region is what you asked for and waiting
     for it is waiting for your own tap. This is the other case: nobody asked the
     way-in bar to leave, a Selection took the screen out from under it, and a
     surface that vanishes between frames reads as a glitch rather than as one
     getting out of the way. */
  .folder {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows var(--fold);
  }
  .folder-window {
    /* Both required: a grid row can only shrink past its content's height if the
       item inside it is allowed to, and the overflow is what hides the content
       while it does.

       **This box is the window, and its height is the row's.** That is the whole
       reason `.folder-slide` exists below it — a percentage translate here would
       be a percentage of a box that is itself collapsing. */
    overflow: hidden;
    min-height: 0;
  }
  /* **The window closes and the contents leave through the top of it.**
     `grid-template-rows` alone clips from the bottom up with the content's top
     pinned, which reads as a lid coming down rather than as a bar getting out of
     the way.

     **The travel goes one box further in than it looks like it should, and that
     is measured rather than assumed.** `.folder-window` is the grid item, so its
     used height IS the row's height: put `translateY(-100%)` there and the
     distance collapses along with the row. Sampled through a slowed fold it
     peaked at 12px of travel against a 134px bar, which is why the first attempt
     read as the bar being squashed rather than leaving. This box is not a grid
     item, keeps its natural height the whole way, and so `-100%` is a distance.

     **No opacity.** The bar shrinks in place and its rules travel up with it —
     that is the gesture, and a fade would hide the only part of it you can
     follow. The rules go by WIDTH rather than by colour for the same reason:
     thinning 2px to 0 is imperceptible beside a hundred pixels of travel, where
     a fade is the one thing the eye would read instead of the movement. */
  .folder-slide {
    transition: transform var(--fold);
  }
  .way-in-bar.folded {
    padding-block: 0;
    margin-bottom: 0;
    border-top-width: 0;
    border-bottom-width: 0;
  }
  .way-in-bar.folded .folder {
    grid-template-rows: 0fr;
  }
  .way-in-bar.folded .folder-slide {
    transform: translateY(-100%);
  }
  /* Someone who asks for less motion gets the state change and not the gesture,
     which is `app.css`'s own wording for the same opt-out. */
  @media (prefers-reduced-motion: reduce) {
    .way-in-bar {
      --fold: 0s;
    }
  }

  /* A class handed to a child component carries no scoping hash, so every rule
     below is `:global` — the same shape `ui/Segmented` uses for `.seg-row`. The
     names are this file's and nothing else in the app wears them. */
  :global(.wib-root) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }

  /* The groove. No inset shadow: the recessed ground and the hard edge are the
     whole of it, and a shadow would be a third voice saying the same thing. */
  :global(.wib-list) {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--space-3xs);
    padding: var(--space-3xs);
    background: var(--bg-input);
    border: var(--edge);
    border-radius: var(--radius);
  }
  /* A tab is a control, so it carries the floor (ADR-0098 §1). Unselected it is
     a word and nothing else; only the selected one is ever drawn. */
  :global(.wib-tab) {
    min-height: var(--tap-min);
    padding-inline: var(--space-3xs);
    background: none;
    border: 0;
    border-radius: var(--radius);
    font: inherit;
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
    cursor: pointer;
  }
  :global(.wib-tab[data-state="active"]) {
    background: var(--ink);
    color: var(--paper);
  }
  :global(.wib-tab:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }

  /* ── 768 and up: the same bar, at the other end of the screen ───────────── */
  @media (min-width: 768px) {
    .way-in-bar {
      /* Static. `DailyDashboard`'s `.way-in-slot` is the sticky box up here and
         this rides inside it — see the note there for why a two-item stack
         cannot stick to itself. */
      position: static;
      /* **No inset at the top or the sides** (ADR-0101 §5). The groove's own
         corner is then the bar's corner, which is the point the Selection bar's
         corner lands on when it takes the slot — the two share an origin
         because they share the slot, and a 9px inset here would be 9px of drift
         visible every time the mode changed. The phone keeps its inset: down
         there the bar is a surface standing over the day, and the padding is
         what makes it read as one. */
      padding: 0 0 var(--space-2xs);
      border-top: 0;
      border-bottom: var(--edge);
      /* The page's own ground, not `--paper`. On a phone the bar is in front of
         something — the band's edge below it, a hard rule above — and white says
         so. Stuck at the head of the column it is in front of nothing: the day
         slides under it and reappears the colour it went in, and a white plate
         up here would be a panel the screen does not otherwise have. */
      background: var(--bg-base);
      /* Both, and both matter. `.timeline` is a flex column, and an AUTO inline
         margin on a flex item overrides `stretch`: the box shrinks to its
         content and centres, which is why this bar stood narrower than its
         column and off to one side. The cap is the shell's job up here — the bar
         is inside `.timeline`, which is already capped. */
      max-width: none;
      margin-inline: 0;
    }
  }
</style>
