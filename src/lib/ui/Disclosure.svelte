<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  // The control that opens one region (#316, ADR-0100).
  //
  // Five sites wrote this out: the dashboard's nutrition fold, the food
  // screen's About, two round-ⓘ explanations and a "Show why" on an ending
  // line. Three visual shapes, one control.
  //
  // **It is not a bits-ui `Accordion`, and ADR-0068 §1 is the test.** A new
  // primitive reaches for bits when the platform has no control with the
  // behaviour, never merely because its siblings did, and a single disclosure
  // fails that four ways. Everything `Accordion` contributes is *between-item*
  // behaviour: roving arrow-key focus has no sibling header to move to, and an
  // open policy is a boolean when there is one item. It would not even save the
  // ARIA — bits omits the header/region links, which is why `RecipeBuilder`
  // wires `aria-controls`, `role=region` and `aria-labelledby` by hand under a
  // comment saying so. `Accordion.Header level={3}` injects a heading into a
  // screen's outline. And `Accordion.Content` mounts and unmounts rather than
  // carrying the `hidden` attribute that `aria-expanded` describes. That last
  // one matters here: the dashboard's open-ness is a persisted store, not a
  // value array bits controls. `RecipeBuilder`'s own accordion is the
  // counter-example and stays on bits, because it has many items, roving focus
  // between headers and a multiple-open policy — the behaviour the platform
  // lacks.
  //
  // **It owns the trigger, not the region, and the ticket expected otherwise.**
  // #316 asked for a component owning the button *and* the region *and* the
  // generated id linking them. Reading the five sites, the two boxes have
  // **different parents at four of them**: the dashboard's toggle shares a head
  // row with the Full-day button while its region is the row's sibling, both ⓘ
  // sites sit beside a heading, and `FoodView`'s trigger is in the screen
  // header with its region four hundred lines away. A component rendering both
  // adjacently fits one site of five, and modelling the rest would have meant a
  // `before` snippet, a `beside` snippet and a caller still able to put the
  // region somewhere else. So the region stays the caller's and `controls` is a
  // **required** prop.
  //
  // What that gives up is a typo: an id naming nothing. What it keeps is the
  // defect the ticket was actually about — `EndingLine` shipped `aria-expanded`
  // with **no** `aria-controls` at all, announcing itself as expanded while
  // pointing at nothing — because the type refuses a trigger with no region.
  // The typo is covered instead by `tests/unit/disclosure.test.ts`, which
  // resolves every `aria-controls` in the app against the ids in its own file.
  // That is a stronger guarantee than ownership would have been at the four
  // sites where ownership was not available.
  //
  // **The mark is the primitive's by default and the caller's by snippet**, and
  // three shapes cost zero variant axis (ADR-0100 §3): a snippet is a hole, and
  // a hole is free however many callers fill it. The default is the drawn
  // caret, because `▸`/`▾` (U+25B8/U+25BE) fall outside every unicode-range
  // Epilogue is served in — neither was ever *our* mark, and both were drawn by
  // whatever fallback the platform happened to have, at that font's size and
  // height above the baseline. One shape rotated rather than two glyphs
  // swapped, so the word beside it cannot shift sideways and there is something
  // to interpolate between.
  //
  // **The cap-height repair lives here.** Epilogue's ascent is 0.79em against a
  // 0.7375em cap height, so the caps of an all-caps title sit 0.091em above the
  // centre of their own box, and flex centring — which aligns boxes — put the
  // mark beside them low. `text-box-trim` where the engine has it, the measured
  // nudge where it does not.
  type DisclosureProps = {
    /** Whether the region is open. The caller holds the state: the dashboard's
     *  is a persisted store, which is not something to own from here. */
    open: boolean;
    /** The `id` of the region this opens. Required, and that is the whole
     *  point — `aria-expanded` without it is what `EndingLine` shipped. */
    controls: string;
    onToggle: () => void;
    /** The label beside the mark, where there is one. Both ⓘ sites and
     *  `FoodView`'s icon carry an `aria-label` instead and draw no text. */
    title?: string;
    /** Overrides the caret. Takes the open state, so a mark may turn. `null`
     *  is "no mark", which `EndingLine` uses because its label *is* the mark:
     *  the words flip between Show and Hide. */
    mark?: Snippet<[boolean]> | null;
    class?: string;
  } & Omit<HTMLButtonAttributes, "class" | "onclick" | "type">;

  let {
    open,
    controls,
    onToggle,
    title,
    mark,
    class: className = "",
    ...rest
  }: DisclosureProps = $props();
</script>

{#snippet caret(isOpen: boolean)}
  <svg
    class="disclosure-caret"
    class:is-open={isOpen}
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path d="M7 6 L17 12 L7 18 Z" fill="currentColor"></path>
  </svg>
{/snippet}

<button
  {...rest}
  type="button"
  class="disclosure {className}"
  aria-expanded={open}
  aria-controls={controls}
  onclick={onToggle}
>
  {#if mark !== null}{@render (mark ?? caret)(open)}{/if}
  {#if title}<span class="disclosure-title">{title}</span>{/if}
</button>

<style>
  /* Deliberately almost nothing: the five shapes this replaced are a bare
     caret row, a header icon button, two round ⓘ rings and an underlined text
     button, and the frame each wears is the caller's `class`. What is here is
     what every one of them had to get right and two of them did not. */
  .disclosure {
    display: inline-flex;
    align-items: center;
    /* Centres a mark inside the floor above, which is the whole reason the
       floor is safe to declare here: a 21.6px ⓘ in a 48px box sits in the
       middle of it rather than against its left edge. Content wider than the
       floor is unaffected, so a title row is untouched. */
    justify-content: center;
    gap: var(--space-2xs);
    /* ADR-0093: the box that accepts the tap is this one, whatever is drawn
       inside it — and on **both** axes, which is not a detail. A trigger whose
       whole content is a 21.6px mark shrinks to fit it, so `min-height` alone
       leaves a 21.6x48 target. `.info-btn` carried `min-width` for exactly that
       reason and #316 dropped it on the way in; `tap-floor.test.ts` could not
       see it, because `narrowness()` convicts a *declared* width under the
       floor and a box that declares none at all reads as unbounded. The
       screenshot caught it. */
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  /* The same hard offset ring the Button and the pressable Card carry
     (ADR-0039), since this one draws its own chrome. */
  .disclosure:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  /* A square box of our own geometry, blockified as a flex item, so it centres
     against the title exactly. Sized in `em` off the title's own step, so the
     mark tracks the type ramp. */
  .disclosure-caret {
    width: 1em;
    height: 1em;
    flex-shrink: 0;
    color: var(--text-secondary);
    /* The shared turn (app.css), which is `none` under prefers-reduced-motion. */
    transition: var(--turn-mark);
  }

  /* The ink is symmetric about the centre of the box, so a quarter turn is the
     open mark: the row's geometry does not change with it, and the rotation has
     no apparent centre to drift from. */
  .disclosure-caret.is-open {
    transform: rotate(90deg);
  }

  /* **The alignment, and not the typography.** Tight to the em, as a panel
     header's title is (#304). That sets the row's height; it does NOT centre
     the letters, because leading is added symmetrically and so never moves ink
     relative to its own box. The fallback for engines without `text-box-trim`
     is to nudge the text down by the measured 0.09em — the same repair
     `ui/Checkbox`'s label carries.

     What is deliberately absent is the size, the weight, the tracking and the
     case. The dashboard's title is an all-caps section header and the ending
     line's is a small underlined aside, and a primitive that declared either
     one would be telling every future disclosure what it must look like. That
     is exactly the widening ADR-0100 §1's brake refuses. Both inherit from the
     button, whose `font: inherit` hands them the caller's `class`. */
  .disclosure-title {
    position: relative;
    top: 0.09em;
    line-height: 1;
  }

  /* Preferred: trim the box to the cap-height/baseline block so the box IS the
     letters. Flex centring then centres what the eye sees, at every step, with
     no magic number. Chromium and Safari honour this; anywhere else the nudge
     above stands in. */
  @supports (text-box-trim: trim-both) {
    .disclosure-title {
      text-box-trim: trim-both;
      text-box-edge: cap alphabetic;
      top: 0;
    }
  }
</style>
