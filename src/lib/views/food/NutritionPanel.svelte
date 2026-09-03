<script lang="ts">
  import type { Snippet } from "svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";

  // The nutrition panel — the sheet, its header, and the scrolling body its
  // sections stack in. Extracted from `DailyDashboard`'s full-day modal so a
  // second surface at another scale (one meal rather than the day) is literally
  // the same panel rather than a copy that drifts.
  //
  // It is `BottomSheet` and not a card of its own (ADR-0089 §6, #329): a sheet
  // on a phone, centred above 768px, which is where it used to hand-roll
  // `translate(-50%, -50%)` at 85vh with a keyboard-blind cap.
  //
  // `flushBody`, so the body it renders is its own. The sections inside are
  // full-bleed bands — `NutrientGroupHead` spans its container edge to edge —
  // and the sheet's default body would inset every one of them by its padding.
  // Taking the body also takes the scroll, which `.day-rda-body` carries below.
  // On a phone that makes the panel full height, and it should be: what it
  // holds is a list whose length is the user's history, and §5's argument for
  // pinning a shape that would otherwise change on every open is this panel's
  // as much as the past-meal picker's.
  //
  // `actions` is an optional slot in the header's leading rail, opposite the
  // close button, for a control that belongs to the panel's subject rather than
  // to the panel. Opposite and not beside: the two glyphs balance the title
  // between them, one at each end of the header.
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
    /**
     * A control on the panel's subject, in the header's leading rail opposite
     * the way out. Pass it only when one will render — a snippet holding a
     * conditional leaves a hole where the header promised a control. See
     * `BottomSheet`.
     */
    actions?: Snippet;
    body: Snippet;
  } = $props();
</script>

<BottomSheet
  isOpen
  {title}
  {testId}
  {onClose}
  headerActions={actions}
  flushBody
>
  <div class="day-rda-body">
    {@render body()}
  </div>
</BottomSheet>

<style>
  /* The panel's scroll region, in the flush body the sheet hands over.
     
     The scrollbar is hidden rather than styled. A classic desktop scrollbar
     takes width from this box but not from the header above it, so the header's
     rule reaches the frame and every band beneath it stops a scrollbar short —
     a pale strip down the right side that reads as a broken frame, worst at the
     top corner where the two meet. The panel is a phone surface where
     scrollbars overlay and cost nothing, and it still scrolls by wheel, touch,
     keyboard and drag with no bar drawn.

     `overscroll-behavior` is the flush body's own obligation: the sheet's
     default body contains its chaining, and a child that takes the scroll takes
     that with it (ADR-0089 §8).

     `min-height: 0` is what makes `flex: 1` mean "share what is left" rather
     than "at least my content" — without it a long list makes the panel taller
     than the sheet instead of scrolling inside it. */
  .day-rda-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .day-rda-body::-webkit-scrollbar {
    display: none;
  }
</style>
