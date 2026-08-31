<script lang="ts">
  // The mark on the **Way out** of a meal (ADR-0074 §3), drawn on
  // `WayInIcon`'s spec (ADR-0059 §5) so it can stand in the meal's own panel
  // without looking borrowed: currentColor, a 2.25 square-capped stroke, a 24
  // viewBox.
  //
  // A tray with an arrow leaving it. There is deliberately no arriving twin:
  // receiving has no control of its own (§4), so a pair drawn from one shape
  // would be half a vocabulary nothing ever says.
</script>

<svg
  class="way-out-icon"
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
  fill="none"
>
  <path d="M4 15 L4 20 L20 20 L20 15" />
  <path d="M12 4 L12 15" />
  <path d="M8 8 L12 4 L16 8" />
</svg>

<style>
  .way-out-icon {
    width: 1.1rem;
    height: 1.1rem;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: square;
  }
</style>
