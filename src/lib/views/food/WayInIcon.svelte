<script lang="ts">
  import type { WayIn } from "../../food/ways-in";

  // One mark per way into a meal (ADR-0059 §5). These sit in the meal header
  // beside the meal name rather than on a tab, so they are drawn rather than
  // borrowed: stroke marks on the old `+`'s spec — currentColor, a 2.25
  // square-capped stroke — where the stager dock's emoji would read as stickers
  // in a grayscale header.
  //
  // `past` is a clock with a counter-clockwise sweep, not a copy-mark. The
  // action is a copy, but the button opens history, and the mark says what the
  // tap reveals rather than what it will afterwards do (ADR-0058 §13).
  let { kind }: { kind: WayIn } = $props();
</script>

<svg
  class="entry-icon"
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
  fill="none"
>
  {#if kind === "past"}
    <circle cx="12" cy="13" r="7" />
    <path d="M12 9 L12 13 L15 15" />
    <path d="M5 6 L5 10 L9 10" />
  {:else if kind === "custom"}
    <path d="M4 20 L4 16 L15 5 L19 9 L8 20 Z" />
    <path d="M13 7 L17 11" />
  {:else if kind === "recipe"}
    <path d="M4 9 L20 9 L20 14 A6 6 0 0 1 14 20 L10 20 A6 6 0 0 1 4 14 Z" />
    <path d="M4 11 L1 11" />
    <path d="M20 11 L23 11" />
    <path d="M9 5 L9 7" />
    <path d="M15 4 L15 7" />
  {:else if kind === "scan"}
    <path d="M3 8 L3 4 L7 4" />
    <path d="M17 4 L21 4 L21 8" />
    <path d="M21 16 L21 20 L17 20" />
    <path d="M7 20 L3 20 L3 16" />
    <path d="M8 8 L8 16" />
    <path d="M12 8 L12 16" />
    <path d="M16 8 L16 16" />
  {:else}
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15 L20 20" />
  {/if}
</svg>

<style>
  .entry-icon {
    width: 1.1rem;
    height: 1.1rem;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: square;
  }
</style>
