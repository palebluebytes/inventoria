<script lang="ts">
  import type { Snippet } from "svelte";
  import Modal from "./Modal.svelte";

  let {
    isOpen = $bindable(false),
    title = "",
    // Renamed to `body` so it isn't shadowed by Modal's own `children` snippet.
    children: body,
    footer,
    onClose,
    class: className = "",
    onBack,
    backLabel = "Back",
    flushBody = false,
    fillHeight = false,
    elevated = false,
    animate = true,
  }: {
    isOpen?: boolean;
    title?: string;
    children?: Snippet;
    /**
     * Optional docked region pinned below the scrollable body — a method
     * switcher, a primary action, or both. It stays fixed while the body
     * scrolls (the sheet is a flex column; the body flexes, the dock doesn't).
     * Receives `close` so a "Done"/"Cancel" control can dismiss the sheet.
     */
    footer?: Snippet<[{ close: () => void }]>;
    /**
     * Called whenever the sheet closes (Escape, backdrop, or a close button).
     * Forwarded to Modal so a conditionally-mounted caller can unmount on close
     * without re-encoding the "onClose from bound `open`" quirk itself.
     */
    onClose?: () => void;
    /** Extra class on the sheet content, so a caller can tag/scope its sheet. */
    class?: string;
    /**
     * Optional leading control in the header. When set, a back "‹" button is
     * rendered to the left of the title and calls this on click — the food
     * sheets use it for "Change food" / "Back" / "Cancel". Omit for no back
     * affordance (the default header is just title + close).
     */
    onBack?: () => void;
    /** Accessible label for the back button (only when `onBack` is set). */
    backLabel?: string;
    /**
     * Hand the body region's layout to its child instead of scrolling+padding
     * it here. The body becomes a bare flex column (no padding, no scroll) so a
     * child that owns its own scrollable area and pinned dock — e.g. FoodStager
     * — fills it and manages both. Default keeps the padded, scrollable body.
     */
    flushBody?: boolean;
    /**
     * Pin the sheet to its full height regardless of how much content it holds,
     * without handing the body's layout to a child the way `flushBody` does.
     *
     * The two are separate because they answer separate questions. `flushBody`
     * is "who owns the scroll region"; this is "does the sheet size to its
     * content". A sheet whose content count varies with the user's history —
     * the past-meal picker has one row or twenty — should not be a different
     * shape each time it opens, and it does not need to own its own scroll to
     * say so: the default body already flexes and scrolls.
     */
    fillHeight?: boolean;
    /**
     * Raise this sheet a layer above another sheet it is opened over. A default
     * sheet sits at 1700/1701 (backdrop/content); an elevated one at 1800/1801,
     * so its backdrop dims — and its content floats above — a parent sheet's
     * card. The food amount/add-ingredient sheets set this, as they open over
     * the recipe/instantiation sheet.
     */
    elevated?: boolean;
    /**
     * Slide the sheet up on open. True for a sheet appearing fresh; false for one
     * that continues an already-open flow (the recipe sub-sheets replace the log
     * sheet in place), so it doesn't re-slide and jar against the in-sheet tab
     * switches that don't animate.
     */
    animate?: boolean;
  } = $props();

  // Backdrop stacking. The default (1700, one below the content's CSS 1701)
  // raises the sheet over the app's dialog layer; an elevated sheet lifts both
  // a layer so it clears another sheet it is opened over (its content z is the
  // inline override below — the CSS 1701 base stays the single source).
  let overlayZ = $derived(elevated ? 1800 : 1700);
</script>

<Modal
  bind:open={isOpen}
  {onClose}
  overlayBg="rgba(0, 0, 0, 0.4)"
  overlayBlur="blur(2px)"
  {overlayZ}
  overlayEnter={animate}
  {title}
>
  {#snippet children({ props, close })}
    <div
      {...props}
      class="bottom-sheet-content {className}"
      class:flush={flushBody}
      class:fill={fillHeight}
      class:no-anim={!animate}
      style:z-index={elevated ? 1801 : null}
    >
      <div class="bottom-sheet-handle-bar">
        <div class="drag-handle"></div>
      </div>

      <div class="bottom-sheet-header">
        {#if onBack}
          <button class="back-btn" onclick={onBack} aria-label={backLabel}
            ><span class="glyph" aria-hidden="true">‹</span></button
          >
        {/if}
        <h2>{title}</h2>
        <button class="close-btn" onclick={close} aria-label="Close"
          ><span class="glyph" aria-hidden="true">&times;</span></button
        >
      </div>

      <div class="bottom-sheet-body" class:flush={flushBody}>
        {@render body?.()}
      </div>

      {#if footer}
        <div class="bottom-sheet-footer">
          {@render footer({ close })}
        </div>
      {/if}
    </div>
  {/snippet}
</Modal>

<style>
  /* The backdrop is owned by Modal; the sheet pins itself one z-index above it.
     Both sit above the app's dialog-card layer (bits-ui dialogs render their
     card at 1600), so this sheet can be raised over a parent dialog and float —
     with its own backdrop — above that card. `pointer-events: auto` is the
     other half: an open bits-ui dialog sets `pointer-events: none` on <body>,
     which a nested sheet would otherwise inherit, leaving its buttons visually
     present but click-through. Absorbing both here means callers get correct
     over-dialog behaviour for free — the food sheets fold onto this rather than
     re-deriving the fix (ADR-0027, ADR-0028).

     The box is the visible band, at every width and never a viewport unit: the
     bottom edge is the band's, and the cap is the band's height (ADR-0089 §5).
     `85vh` was keyboard-blind by construction — measured, every viewport unit
     is inert under `resizes-visual`, so `vh == svh == dvh == lvh` at all sizes.

     One consequence is worth naming rather than discovering: the cap used to be
     85vh, so a sheet with more content than that used to leave a strip of
     backdrop above it and now does not, on a desktop as much as on a phone.
     That strip is the peek, and §5 prices it at nothing — the only thing it
     bought is dismiss-by-tapping-outside, which the close button provides. */
  .bottom-sheet-content {
    position: fixed;
    bottom: var(--vv-bottom);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1701;
    pointer-events: auto;
    background: var(--bg-surface, var(--paper));
    border: var(--edge-thick);
    border-bottom: none;
    box-shadow: 0 -8px 0 var(--ink);
    width: 100%;
    max-width: 600px;
    max-height: var(--vv-h);
    display: flex;
    flex-direction: column;
    /* `backwards` commits the `from` keyframe before the first paint, so the
       sheet never flashes at its resting position for a frame on mount. */
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) backwards;
  }

  /* A sheet that continues an already-open flow (the recipe sub-sheets) appears
     in place instead of sliding up, matching the non-animated in-sheet tab
     switches it follows. */
  .bottom-sheet-content.no-anim {
    animation: none;
  }

  /* Pinned height, for a sheet whose content height swings but whose shape
     should not. A flush-body sheet always wants this — FoodStager's height
     changes on every staging switch (empty search → results → staged food →
     custom form), and left to size to content the whole sheet would grow and
     shrink under the user. `fill` asks for the same pin on its own, for a sheet
     that keeps the default body: the tallest state already reached the cap, and
     the body's own `flex: 1; overflow-y: auto` absorbs the difference either
     way.

     These two flags are also the app's proxy for "holds a text field", so on a
     phone they are the sheets that go **full height** — no peek. Three of the
     four carry one (both flush sheets search; the food-settings sheet edits
     names); the past-meal picker does not, and is carried along, which costs it
     nothing it had. The peek is precisely the fraction a keyboard eats, and the
     only thing it ever bought is dismiss-by-tapping-outside, which the close
     button already provides (ADR-0089 §5).

     `top` plus an explicit `height`, deliberately **not** `top` plus `bottom`.
     Stretching between the two edges makes the box depend on the layout
     viewport's height as well as the band's, so any error in that number
     reappears as a gap; a pinned top edge and a height depend on the band alone
     and structurally cannot. The inherited `bottom` above is over-constrained
     here and correctly ignored — which holds because the vertical margins are
     not `auto`, guaranteed by `app.css`'s reset; with `auto` margins the box
     would centre in the leftover space and `top` would stop naming the band's
     top edge. The inherited `max-height` is lifted so the height is the
     height. */
  .bottom-sheet-content.flush,
  .bottom-sheet-content.fill {
    top: var(--vv-top);
    height: var(--vv-h);
    max-height: none;
  }

  /* Above the breakpoint the peek returns: there is room for it, and a pointer
     has no software keyboard to hide behind. One design that widens, not a
     second design — a width difference may buy more room, never a different
     shape (ADR-0089 §5). */
  @media (min-width: 768px) {
    .bottom-sheet-content.flush,
    .bottom-sheet-content.fill {
      top: auto;
      height: 85vh;
      max-height: 85vh;
    }
  }

  .bottom-sheet-handle-bar {
    display: flex;
    justify-content: center;
    padding: var(--space-xs) 0 0 0;
    cursor: pointer;
  }

  .drag-handle {
    width: 40px;
    height: 5px;
    background: var(--ink);
    border: var(--edge-thin);
  }

  /* Three columns — [back] [title] [close] — with equal-width side rails, so the
     title sits dead-centre whether or not a back button is present. The side
     rails reserve their width even when empty, so a title never shifts left just
     because a flow has no back affordance. */
  .bottom-sheet-header {
    display: grid;
    grid-template-columns: 2.5rem 1fr 2.5rem;
    align-items: center;
    /* Query container for the title below. Safe to contain: the header's inline
       size comes from the sheet (width:100%, max 600px), never from its own
       contents, which is the condition `inline-size` containment requires. */
    container-type: inline-size;
    border-bottom: var(--edge);
    padding: 0 var(--space-m) var(--space-xs) var(--space-m);
    margin-top: var(--space-xs);
  }

  .bottom-sheet-header h2 {
    grid-column: 2;
    /* Sized against the header's own width (`cqi`), not the viewport: the title
       column is what the text has to fit into, and on a phone --step-1 was wide
       enough to push a short label ("Where this came from") onto a second line.
       It floors at --step-n1 so a title never shrinks to unreadable, and caps at
       --step-1 so a roomy 600px sheet keeps the full heading size.

       Note this is width-driven, not line-driven: CSS cannot ask "did this
       wrap?", so the nowrap below is what enforces the single line — the
       container query is what makes that one line usually enough. */
    font-size: clamp(var(--step-n1), 5.4cqi, var(--step-1));
    font-weight: 700;
    margin: 0;
    text-transform: uppercase;
    text-align: center;
    /* One line, always: the header is a fixed band beside two icon buttons, so a
       title that wrapped would push them off their centre line. A title too long
       even at the smallest size ellipsises rather than wrapping.

       The leading must clear the font's ink, not just its em box: at
       `line-height: 1` the caps overflowed a line box the ellipsis `overflow:
       hidden` then shaved, so a title read as slightly clipped top and bottom.
       Growing it symmetrically leaves the caps' optical centre — what the glyph
       nudges below are measured against — exactly where it was. */
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The side glyphs (‹ / ×) are flex-centred in a box the height of the title's
     line, so their line box's centre lands on the title's centre line. */
  .close-btn,
  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--step-1);
    padding: 0;
    background: none;
    border: none;
    color: var(--ink);
    font-size: 2rem;
    line-height: 1;
    cursor: pointer;
  }

  /* Flex-centring aligns the glyphs' line boxes, but a glyph's ink sits off its
     line-box centre by a font-specific amount, and the uppercase title's caps
     sit ~0.1em high in their own box — so the raw glyphs still read low against
     the title. These translate each glyph's ink onto the title's optical centre
     (measured for the app font; `‹` and `×` differ, hence per-glyph values). */
  .back-btn .glyph {
    display: block;
    transform: translateY(-0.135em);
  }
  .close-btn .glyph {
    display: block;
    transform: translateY(-0.081em);
  }

  .close-btn {
    grid-column: 3;
    justify-self: end;
  }

  .close-btn:hover {
    transform: scale(1.1);
  }

  /* Leading back affordance — mirrors the food sheets' hand-rolled header
     back control ("‹"). Only rendered when a caller passes `onBack`. */
  .back-btn {
    grid-column: 1;
    justify-self: start;
    font-weight: 700;
  }

  .back-btn:active {
    transform: scale(0.9);
  }

  .bottom-sheet-body {
    flex: 1;
    overflow-y: auto;
    /* A full-height sheet scrolled to the end of its list would otherwise chain
       the scroll into the page behind it — which is invisible under the sheet,
       and so reads as the sheet fighting the finger (ADR-0089 §8). The flush
       body hands its scroll to a child, which carries the same rule itself. */
    overscroll-behavior: contain;
    padding: var(--space-m);
  }

  /* Flush body: the child owns its own scroll region and dock (e.g. FoodStager),
     so drop this region's padding and scroll and let it fill as a flex column. */
  .bottom-sheet-body.flush {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Pinned dock: sits below the body, never scrolls. Mirrors the hand-rolled
     `.dock` / `.foot` chrome the food sheets used before folding onto this.

     It carries the sheet's whole bottom inset, which `viewport-fit=cover` made
     real (ADR-0089 §2), and it is the only place that can: it is the last child
     of a box pinned to the band's bottom edge. **A sheet passing no footer
     therefore reserves nothing**, and its body's last row sits under the home
     indicator; reserving it on the body instead would double the gap for every
     sheet that does have a dock. §5 was expected to settle this by replacing
     the height model, and did not: the model moved from `bottom: 0` to
     `bottom: var(--vv-bottom)`, which is the same edge whenever no keyboard is
     up, so the gap under a sheet with no dock is untouched and belongs to
     #325's safe-area sweep. The inset is also over-reserved *while* a keyboard
     is up, when the sheet's bottom edge sits above the home indicator entirely
     — a home indicator's worth of dead dock, bounded and cosmetic, and not
     worth an unratified `max()` here. */
  .bottom-sheet-footer {
    flex-shrink: 0;
    border-top: var(--edge);
    background: var(--bg-base);
    padding: var(--space-s) var(--space-m);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
  }

  /* Start 12px lower than a bare `translateY(100%)` so the sheet's top
     `box-shadow: 0 -8px 0` (an 8px ink bar above its top edge) clears the
     viewport bottom at rest — otherwise that bar flicks at the screen edge on
     the first frames of the slide. */
  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(calc(100% + 12px));
    }
    to {
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
