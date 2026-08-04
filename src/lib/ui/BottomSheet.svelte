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
  {title}
>
  {#snippet children({ props, close })}
    <div
      {...props}
      class="bottom-sheet-content {className}"
      class:flush={flushBody}
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
     re-deriving the fix (ADR-0027, ADR-0028). */
  .bottom-sheet-content {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1701;
    pointer-events: auto;
    background: var(--bg-surface, #fff);
    border: var(--edge-thick);
    border-bottom: none;
    box-shadow: 0 -8px 0 #000;
    width: 100%;
    max-width: 600px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* A sheet that continues an already-open flow (the recipe sub-sheets) appears
     in place instead of sliding up, matching the non-animated in-sheet tab
     switches it follows. */
  .bottom-sheet-content.no-anim {
    animation: none;
  }

  /* A flush-body sheet hands its layout to a child that owns its own scroll +
     dock (FoodStager), whose content height swings widely between staging
     states (empty search → results list → staged food → custom form). Left to
     size to content, the whole sheet would grow and shrink on every switch, so
     pin it to the max height — the tallest state already reaches 85vh — and let
     the child's scroll region flex to absorb the difference. */
  .bottom-sheet-content.flush {
    height: 85vh;
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
    background: #000;
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
    border-bottom: var(--edge);
    padding: 0 var(--space-m) var(--space-xs) var(--space-m);
    margin-top: var(--space-xs);
  }

  .bottom-sheet-header h2 {
    grid-column: 2;
    font-size: var(--step-1);
    font-weight: 700;
    margin: 0;
    text-transform: uppercase;
    text-align: center;
    /* Match the icon buttons' tight line box so all three share one centre line
       (a `normal` line-height would seat the caps higher than the glyphs). */
    line-height: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    color: #000;
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
     `.dock` / `.foot` chrome the food sheets used before folding onto this. */
  .bottom-sheet-footer {
    flex-shrink: 0;
    border-top: var(--edge);
    background: #fafafa;
    padding: var(--space-s) var(--space-m);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
  }

  @keyframes slideUp {
    from {
      transform: translateX(-50%) translateY(100%);
    }
    to {
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
