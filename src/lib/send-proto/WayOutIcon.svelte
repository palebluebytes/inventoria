<script lang="ts">
  // PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
  //
  // Marks for the ways OUT, drawn on `WayInIcon`'s spec (ADR-0059 §5) so a send
  // control can stand in the same header row as the five ways in without
  // looking borrowed: currentColor, 2.25 square-capped stroke, 24 viewBox.
  //
  // `send` and `inbox` are deliberately the same tray with the arrow reversed.
  // The pair is the point — a meal leaving and a meal arriving are one gesture
  // in two directions, and drawing them from one shape says so.
  let { kind }: { kind: "send" | "inbox" | "handover" } = $props();
</script>

<svg
  class="way-out-icon"
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
  fill="none"
>
  {#if kind === "send"}
    <path d="M4 15 L4 20 L20 20 L20 15" />
    <path d="M12 4 L12 15" />
    <path d="M8 8 L12 4 L16 8" />
  {:else if kind === "inbox"}
    <path d="M4 15 L4 20 L20 20 L20 15" />
    <path d="M12 4 L12 15" />
    <path d="M8 11 L12 15 L16 11" />
  {:else}
    <path d="M3 9 L18 9" />
    <path d="M14 5 L18 9 L14 13" />
    <path d="M21 15 L6 15" />
    <path d="M10 11 L6 15 L10 19" />
  {/if}
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
