<script lang="ts">
  import { MEAL_TYPES, mealNearest, type MealType } from "../../food/meal-type";
  import type { WayIn } from "../../food/ways-in";
  import Select from "../../ui/Select.svelte";
  import WayInRail from "./WayInRail.svelte";

  // ── THROWAWAY: branch `prototype/meal-picker-skin`, issue #453 ────────────
  // Three app-drawn pickers against the platform's own, switched by `?variant=`.
  // Dead in a production build: `readVariant()` returns `null` outside DEV, so
  // Rollup drops every branch and the shipped bar is exactly what it was. Delete
  // this block, the five imports and the `{#if variant}` below to un-prototype.
  import GrowPicker from "./meal-picker.prototype/GrowPicker.svelte";
  import SheetPicker from "./meal-picker.prototype/SheetPicker.svelte";
  import PopoverPicker from "./meal-picker.prototype/PopoverPicker.svelte";
  import PrototypeSwitcher from "./meal-picker.prototype/PrototypeSwitcher.svelte";
  import { readVariant, type Variant } from "./meal-picker.prototype/variants";

  let variant = $state<Variant | null>(readVariant());
  $effect(() => {
    const onSwitch = (e: Event) =>
      (variant = (e as CustomEvent<Variant>).detail);
    window.addEventListener("prototype-variant", onSwitch);
    return () => window.removeEventListener("prototype-variant", onSwitch);
  });

  // The **Way-in bar** (ADR-0101, and *Way-in bar* in `CONTEXT.md`): one bar for
  // the whole day, in three positions.
  //
  //   below 768     pinned to the foot of the visible band, under the thumb
  //   768 and up    sticky at the head of the day's timeline column
  //   1440 and up   the day's left flank, beside the meals rather than over them
  //
  // **The number is `BREAKPOINTS.sheet`, and it is not a new one.** Its own
  // docblock already carries this argument for the overlay shape: below it a
  // surface anchors to the visible band's bottom edge "because that edge is
  // where the hand is", and above it one rising from the far end of a large
  // screen "is imitating a device that is not there" (ADR-0089 §6). A way-in
  // bar is that question asked about a different surface, so it takes the same
  // answer and `lib/ui/breakpoints.ts` gains nothing.
  //
  // **The meal is chosen and never inferred** (§2). The chip is the only thing
  // that moves the target; the clock picks the FIRST one, which is a starting
  // value rather than a change. Scroll-position inference was built and refused:
  // a target that moves while you read is a target you have to re-check before
  // every tap, and the cost of it being wrong is paid silently, one meal at a
  // time, in a ledger whose whole design is that nothing is edited afterwards.
  //
  // ── One line, and what that cost (ADR-0101, amended 2026-09-15) ───────────
  //
  // This bar was a tab list over a rail of captioned cells and measured 154.1px
  // on a phone — 96px of control under ~58px of chrome, which is a fifth of the
  // band spent on padding, a groove, a gap and five drop shadows. The floor is
  // not negotiable (ADR-0093/0098), so the only two numbers on the table were
  // how many 48px rows the bar has and how much chrome sits between them. It is
  // now **one row of 50px**: the meal is one control rather than four, the ways
  // in are marks without captions, and every rule in the plate is a gap over an
  // ink ground rather than a border on each tile.
  //
  // **What that gives up is the tab pattern, and it is a real loss.** A tab list
  // claims that the panel below belongs to the tab you picked, and this bar could
  // honestly claim it: the rail's contents change with the meal, since the
  // past-meal control appears only for a meal with history (ADR-0059 §4). A
  // picker claims less — "one of four values" — and the five buttons beside it
  // are then simply buttons that read it. The claim was worth 48px of band and no
  // more, and the ARIA the tab list brought (a roving tabindex, arrow keys)
  // arrives here as the platform's own picker instead, which is the trade
  // ADR-0095 §2 already made for every other one-of-N in the app.
  //
  // The chip is `ui/Select` and not a `<select>` of its own: ADR-0095 §3 holds
  // this element's population at exactly one, and the census in
  // `tests/unit/ui-primitives.test.ts` fails on a second. What the bar does to it
  // is re-skin it from outside, which is ADR-0098 §5's sanctioned shape — the
  // primitive keeps the floor, the native picker and the caret, and the plate
  // takes the frame off, because inside a plate whose seams are rules a border
  // would be a second edge drawn on top of one.
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
     * at 90 — but winning the paint is not the same as leaving: the bar still
     * stood proud of the Selection's upper edge, which read as two bars
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
     * buy that height back or the Snack section ends underneath it. **And #440
     * reads the same box from the other side**: the free band a newly logged row
     * has to land inside is the scrollport minus whatever this bar covers, taken
     * off the bar's own rect rather than derived from the breakpoint that put it
     * there.
     *
     * Still genuinely unknown, one line or not: the rail drops a cell for a meal
     * with no past (ADR-0059 §4), the plate restacks in a container narrower than
     * its contents, and the safe-area reserve is the device's. So it is MEASURED
     * rather than restated — a spacer written as a sum of tokens is a second copy
     * of this box's geometry, and the kind that is wrong on one of the four
     * meals.
     *
     * Above 768 the bar is in flow and owes the day nothing, so the consumer
     * drops this. `bind:offsetHeight` rather than `clientHeight` because the
     * border and the safe-area padding are both part of what stands over the
     * page.
     */
    height?: number;
  } = $props();

  // The meal nearest the clock, read ONCE at mount. A starting value, never a
  // later change, which is the whole of §2: nothing moves under you once the
  // screen is up, and only the chip moves the target afterwards. Which meal an
  // hour belongs to is `food/meal-type.ts`'s to say, not this bar's.
  let target = $state<MealType>(mealNearest(new Date()));

  // Upper-cased in the option's text rather than by `text-transform`, so the
  // accessible name really is "BREAKFAST" — the same spelling the tab carried,
  // which is what keeps `tests/support/ways-in.ts` reaching it by name.
  const mealOptions = MEAL_TYPES.map((meal_type) => ({
    value: meal_type,
    label: meal_type.toUpperCase(),
  }));
</script>

<!-- THROWAWAY: the variant switcher. Outside the bar, so folding the bar while
     a Selection is live does not take the switcher with it. -->
{#if variant}
  <PrototypeSwitcher {variant} />
{/if}

<div class="way-in-bar" class:folded bind:offsetHeight={height}>
  <!-- `inert`, not merely zero height: a folded bar still holds six controls,
       and a tab stop inside a box nobody can see is worse than a visible one. -->
  <div class="folder" inert={folded}>
    <div class="folder-window">
      <div class="folder-slide">
        <!-- The plate. One ink rectangle with paper tiles laid on it, so every
             rule the bar has — its outer edge, the seam beside the chip, each
             seam between two marks — is the same `--edge-width` of the same ink
             drawn once. That is why the rules are GAPS rather than borders: two
             adjacent 2px borders make a 4px seam beside a 2px edge, and no
             amount of `border-right: 0` bookkeeping keeps that honest across a
             row whose cell count changes with the meal. -->
        <div class="plate">
          {#if variant === "A"}
            <GrowPicker {target} onTarget={(m) => (target = m)} />
          {:else if variant === "B"}
            <SheetPicker {target} onTarget={(m) => (target = m)} />
          {:else if variant === "C"}
            <PopoverPicker {target} onTarget={(m) => (target = m)} />
          {:else}
            <Select
              class="meal-chip"
              options={mealOptions}
              bind:value={target}
              aria-label="Which meal these land in"
            />
          {/if}
          <!-- The rail in a box of its own, because the bar owns where things
               go and the rail owns what is in them. It is also the flex item
               whose minimum size decides the wrap above. -->
          <div class="doors">
            <WayInRail
              meal_type={target}
              {dbReady}
              hasPast={mealHasPast[target]}
              {onEnterMeal}
            />
          </div>
        </div>
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
    /* **No padding of its own**, which is the whole of what the one line buys
       beyond its missing row. The old bar spent `--space-2xs` a side making
       itself read as a surface standing over the day; the plate's ink does that
       now. It is ink below the cells too, so the reserve reads as the plate
       running under the system's own furniture rather than as a white shelf
       beneath it.

       **The reserve is the device's inset OR a floor, whichever is larger, and
       the floor is the half a phone taught us.** `env(safe-area-inset-bottom)`
       is the platform saying how much room its own furniture needs, and on an
       iPhone with a home indicator it says 34pt — Apple's own answer, since the
       HIG puts a control at the foot "aligned with the bottom of the safe
       area". **On Android with three-button navigation it says 0, and it is
       right to**: the nav bar is not an overlay there, the viewport genuinely
       ends above it, and nothing is hidden. What an inset cannot express is
       PROXIMITY — a 48px mark whose bottom edge is the last row of pixels sits
       directly against the recents button, and a thumb that overshoots leaves
       the app. Reported from a device, 2026-09-15.

       Material's own accessibility rule is the floor's size: touch targets of
       48dp "separated by 8dp of space or more". The system's buttons are touch
       targets like any other, so the app owes them that gap at the one edge it
       shares with them. `--space-xs` is the smallest token on this fluid scale
       that clears 8dp at every root size (13.5px at a 16px root, 15.5px at the
       18.32px this app actually renders). `max()` rather than `+` because the
       inset is already a clearance: adding to 34pt would reserve 48 against a
       hazard the platform has already handled. The three sheet docks DO add
       `--space-s` to their inset, and that is not a precedent — a dock's token
       is its own interior padding, which it would need with no inset at all. */
    padding: 0;
    padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--space-xs));
    background: var(--ink);
    /* The shell caps its column and centres it; a full-bleed fixed bar has to
       repeat that or it runs the width of a desktop window. */
    max-width: var(--measure-solo);
    margin-inline: auto;
    transition:
      padding var(--fold),
      margin var(--fold);
  }

  /* The ink ground and the seams. `--edge-width` is `--edge`'s weight as a bare
     length: a gap cannot reach into a border shorthand, which is why the token
     exists at all (see `app.css`, beside `--hairline`). */
  .plate {
    /* **A wrapping flex row, and the wrap is the narrow fallback.** The one line
       does not fit everywhere this bar stands: a 320px phone cannot hold a chip
       plus five floored marks, and neither can the 22rem flank it moves into
       above `BREAKPOINTS.wide` — one a window and one a column that has nothing
       to do with the size of the window.

       A number was written first and thrown away. `@container (max-width: …)`
       is what `lib/ui/breakpoints.ts` recommends for a box that should answer
       its own width, and `ui/Segmented` already uses it — but a threshold in
       `rem` is wrong twice over here. **This app's root font size is not 16px
       and is not even fixed**: it is a clamp against the viewport, measured at
       18.32px on this screen, so `22.25rem` resolved to 407px and stacked a
       390px phone that had room to spare. And the sum it would have to encode
       moves anyway, because the chip's own width rides that same fluid scale and
       because ADR-0059 §4 drops a cell for a meal with no past — 354px with five
       marks, 304px with four.

       Flex wrap needs none of it. The rail's automatic minimum size IS five
       floored cells and their seams, so the line breaks exactly when they stop
       fitting beside the chip, at whatever those two boxes happen to measure on
       this device, at this root size, for this meal. */
    display: flex;
    flex-wrap: wrap;
    gap: var(--edge-width);
    padding-top: var(--edge-width);
    background: var(--ink);
  }
  /* The growth ratio is what makes one line and two lines both come out right.
     Sharing a line, the rail takes essentially all of the slack and the chip
     stays at the width of its widest option; wrapped onto a line of its own, the
     chip has all the slack to itself and fills it, so the ink never shows
     through beside a half-width tile. */
  .doors {
    flex: 999 1 auto;
  }

  /* The chip reads as the row's subject rather than as a sixth door: ink ground,
     paper letters, the one inverted tile on the line. That inversion is doing the
     work the whole tab row used to do — it is the only thing on screen that says
     which meal a tap lands in, so it may not read as one more button beside the
     five that act.

     `ui/Select` reshaped from outside, and every declaration here is taking
     something OFF rather than restating it (ADR-0098 §5): the frame, because the
     plate's seams already draw this tile's edges; the field's left and right
     padding, because a 22rem flank and a 320px phone are both decided by how
     wide this chip is; and the field's `--step-0`, because the word is a label
     on a control rather than something to read. The floor, the native picker and
     the caret are the primitive's and stay. */
  .plate :global(.meal-chip) {
    flex: 1 1 auto;
    width: auto;
  }
  .plate :global(.meal-chip .select) {
    background: var(--ink);
    border: 0;
    border-radius: 0;
    padding: 0 calc(var(--space-s) + var(--space-3xs)) 0 var(--space-2xs);
    color: var(--paper);
    font-size: var(--step-n3);
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  /* The list itself is the platform's, so its options are drawn in the
     platform's colours and need the app's ink back. */
  .plate :global(.meal-chip option) {
    background: var(--paper);
    color: var(--ink);
  }
  .plate :global(.meal-chip .select:hover:not(:disabled)),
  .plate :global(.meal-chip .select:focus) {
    /* The primitive tints on hover and turns its border on focus; on ink both
       are invisible, and the focus ring below is the one that has to read. */
    background: var(--ink);
    box-shadow: none;
  }
  .plate :global(.meal-chip .select:focus-visible) {
    outline: 2px solid var(--paper);
    outline-offset: -4px;
  }
  .plate :global(.meal-chip .select-mark) {
    right: var(--space-2xs);
    color: var(--paper);
  }

  /* The fold (ADR-0101 §6). `grid-template-rows: 1fr -> 0fr` because it is the
     only way to animate to and from a height nobody has measured — and this
     bar's height is genuinely unknown, since `WayInRail` drops a cell for a meal
     with no past (ADR-0059 §4) and the plate wraps where it must. A
     `max-height` would need a magic number that is wrong for one of those.

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
     follow. */
  .folder-slide {
    transition: transform var(--fold);
  }
  .way-in-bar.folded {
    padding-block: 0;
    margin-bottom: 0;
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

  /* ── 768 and up: the same bar, at the other end of the screen ───────────── */
  @media (min-width: 768px) {
    .way-in-bar {
      /* Static. `DailyDashboard`'s `.way-in-slot` is the sticky box up here and
         this rides inside it — see the note there for why a two-item stack
         cannot stick to itself. */
      position: static;
      /* **No inset at the top or the sides** (ADR-0101 §5). The plate's own
         corner is then the bar's corner, which is the point the Selection bar's
         corner lands on when it takes the slot — the two share an origin
         because they share the slot, and an inset here would be drift visible
         every time the mode changed. The phone keeps its safe-area reserve:
         down there the bar stands on the band's edge, and the reserve is the
         device's. */
      padding: 0 0 var(--space-2xs);
      /* The page's own ground, not the plate's ink. On a phone the bar is in
         front of something — the band's edge below it — and the ink says so.
         Stuck at the head of the column it is in front of nothing: the day
         slides under the plate and reappears the colour it went in, so what is
         behind the plate should be the page. */
      background: var(--bg-base);
      /* Both, and both matter. `.timeline` is a flex column, and an AUTO inline
         margin on a flex item overrides `stretch`: the box shrinks to its
         content and centres, which is why this bar stood narrower than its
         column and off to one side. The cap is the shell's job up here — the bar
         is inside `.timeline`, which is already capped. */
      max-width: none;
      margin-inline: 0;
    }
    /* In the column the plate has four edges of its own to draw, so the ink
       ground pads on every side instead of only the top. */
    .plate {
      padding: var(--edge-width);
    }
  }
</style>
