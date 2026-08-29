<script lang="ts">
  import type { Snippet } from "svelte";
  import Modal from "../../ui/Modal.svelte";

  // The nutrition panel shell — the fixed card, its header, and the scrolling
  // body its sections stack in. Extracted from `DailyDashboard`'s full-day modal
  // so a second surface at another scale (one meal rather than the day) is
  // literally the same panel rather than a copy that drifts.
  //
  // The body has NO padding of its own: `NutrientGroupHead` is a band that spans
  // its container edge to edge, and a padded body would inset every band by the
  // width of the padding. Sections that want an inset carry it themselves.
  //
  // `actions` is an optional slot in the header, ahead of the close button, for
  // a control that belongs to the panel's subject rather than to the panel.
  let {
    title,
    testId = undefined,
    onClose,
    actions = undefined,
    body,
  }: {
    /** Names the panel: the header's heading and the dialog's accessible name. */
    title: string;
    /** `data-testid` on the card, for the specs that address one panel. */
    testId?: string;
    onClose?: () => void;
    actions?: Snippet;
    body: Snippet<[{ close: () => void }]>;
  } = $props();
</script>

<Modal {onClose} {title}>
  {#snippet children({ props, close })}
    <div {...props} class="day-nutrition-modal" data-testid={testId}>
      <header class="day-nutrition-header">
        <h3>{title}</h3>
        <div class="day-nutrition-actions">
          {@render actions?.()}
          <button
            type="button"
            class="day-nutrition-close"
            aria-label="Close"
            onclick={close}>&times;</button
          >
        </div>
      </header>
      <div class="day-rda-body">
        {@render body({ close })}
      </div>
    </div>
  {/snippet}
</Modal>

<style>
  .day-nutrition-modal {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    width: min(92vw, 26rem);
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    background: var(--food-surface-bg, var(--paper));
    border: var(--edge);
    box-shadow: var(--shadow-3);
    /* Clip to the padding box: the sections inside are full-bleed bands, and a
       band's own rule must never be able to paint across the frame. */
    overflow: hidden;
  }
  .day-nutrition-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    padding: var(--space-xs) var(--space-m);
    /* The frame's own edge token rather than the pale `--border`. This division
       is part of the frame, and a section band can sit directly under it — a
       NutrientGroupHead is a tinted full-bleed band, so a pale rule above a
       tinted band reads as one grey smudge meeting the black frame rather than
       as two edges. ADR-0038's vocabulary says a frame division is ink. */
    border-bottom: var(--edge-thin);
  }
  .day-nutrition-header h3 {
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-primary);
  }
  /* One group so the close button keeps the row's right edge whether or not a
     subject control sits beside it. */
  .day-nutrition-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    flex-shrink: 0;
  }
  .day-nutrition-close {
    flex-shrink: 0;
    background: none;
    border: none;
    font-size: 1.75rem;
    line-height: 1;
    cursor: pointer;
    color: var(--text-primary);
  }
  /* Scrolls under the fixed header, its sections headed by the shared
     NutrientGroupHead.
     
     The scrollbar is hidden rather than styled. A classic desktop scrollbar
     takes width from this box but not from the header above it, so the header's
     rule reaches the frame and every band beneath it stops a scrollbar short —
     a pale strip down the right side that reads as a broken frame, worst at the
     top corner where the two meet. The panel is a phone surface where
     scrollbars overlay and cost nothing, and it still scrolls by wheel, touch,
     keyboard and drag with no bar drawn. */
  .day-rda-body {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .day-rda-body::-webkit-scrollbar {
    display: none;
  }
</style>
