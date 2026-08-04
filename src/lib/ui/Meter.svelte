<script lang="ts">
  import { Meter } from "bits-ui";

  // The one nutrition progress bar (ADR-0037): a track with a fill clamped to a
  // target, backed by bits-ui Meter so `role="meter"` + aria-valuenow/min/max
  // exist in one place rather than being absent at each hand-drawn bar. The dial
  // and every macro/RDA bar were previously divs with a `width: %` and no value
  // semantics; this gives the two bar surfaces (MacroMeters, the full-day RDA
  // cells) one accessible, brutalist bar.
  //
  // The value model is percent-based: `fill` is the bar width (0–100) and
  // `valueText` is the human reading ("62 g of 90 g") announced as aria-valuetext,
  // so callers pass what they already have (a clamped percent + formatted strings)
  // and never thread raw grams/targets through. A nutrient with **no** target has
  // no range to measure against, so it is deliberately *not* a meter — it renders
  // a flat striped track with no role, never a misleading empty progress bar.
  let {
    fill,
    valueText,
    over = false,
    testid,
  }: {
    /** Bar width 0–100; undefined = no target (a striped, role-less track). */
    fill?: number;
    /** aria-valuetext, e.g. "62 g of 90 g" — the reading a screen reader hears. */
    valueText?: string;
    /** Day total past its target — the fill tints amber. */
    over?: boolean;
    /** Forwarded as data-testid on the track. */
    testid?: string;
  } = $props();
</script>

{#if fill === undefined}
  <!-- No target → not a meter (nothing to measure against): a flat striped track. -->
  <div class="meter-track" data-meter-state="empty" data-testid={testid}></div>
{:else}
  <Meter.Root
    class="meter-track"
    value={fill}
    min={0}
    max={100}
    data-meter-state={over ? "over" : "normal"}
    aria-valuetext={valueText}
    data-testid={testid}
  >
    <div class="meter-fill" style="width: {fill}%"></div>
  </Meter.Root>
{/if}

<style>
  /* bits-ui renders Meter.Root itself, so target it (and the fill it wraps) with
     :global, exactly as QuantityGrams styles its bits Slider parts. */
  :global(.meter-track) {
    width: 100%;
    height: 6px;
    background: var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  /* No configured target: a neutral striped track, so it reads as "tracked, no
     goal" rather than an empty progress bar. */
  :global(.meter-track[data-meter-state="empty"]) {
    background: repeating-linear-gradient(
      45deg,
      var(--border),
      var(--border) 4px,
      var(--bg-input) 4px,
      var(--bg-input) 8px
    );
  }
  :global(.meter-fill) {
    height: 100%;
    border-radius: var(--radius);
    background: var(--ink);
    transition: width 0.35s ease-out;
  }
  /* Day total past target — the fill runs full and tints amber. */
  :global(.meter-track[data-meter-state="over"] .meter-fill) {
    background: var(--rda-over, #b45309);
  }
</style>
