<script lang="ts">
  // The marks the Selection bar draws that no other surface has (ADR-0088 §2,
  // amended 2026-09-17 for the third). They follow `WayInIcon`'s spec exactly — a 24×24 box, `currentColor`,
  // a 2.25 square-capped stroke, no fill, drawn at 1.1rem — because the bar
  // sits directly under the meal headers those marks live in and the two rows
  // must read as one vocabulary.
  //
  // The size is part of the spec, not a detail: these sit in a row beside
  // `WayOutIcon` and `WayInIcon kind="recipe"`, so drawing them any larger
  // reads as marks weighted above the others rather than five verbs.
  //
  // Recipe is deliberately NOT here: it is `WayInIcon kind="recipe"`, reused
  // verbatim, which is what retired the 🍲 the bar used to carry.
  let { kind }: { kind: "scale" | "move" | "consolidate" } = $props();
</script>

<svg
  class="verb-icon"
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
  fill="none"
>
  {#if kind === "scale"}
    <!-- A balance: the mark asks about an amount, not about an operator. -->
    <path d="M12 5 L12 20" />
    <path d="M8 20 L16 20" />
    <path d="M5 8 L19 8" />
    <path d="M5 8 L2.5 13.5 L7.5 13.5 Z" />
    <path d="M19 8 L16.5 13.5 L21.5 13.5 Z" />
  {:else if kind === "move"}
    <!-- A list, and an arrow leaving it: these foods go somewhere else. -->
    <path d="M3 7 L12 7" />
    <path d="M3 12 L12 12" />
    <path d="M3 17 L12 17" />
    <path d="M15 12 L21 12" />
    <path d="M18 9 L21 12 L18 15" />
  {:else}
    <!-- Two arrows meeting at one line: these foods become one dish. It points
         INWARD where move points away, which is the whole difference between the
         two verbs and the only thing a 20px mark has room to say. -->
    <path d="M3 12 L9 12" />
    <path d="M6 9 L9 12 L6 15" />
    <path d="M21 12 L15 12" />
    <path d="M18 9 L15 12 L18 15" />
    <path d="M12 5 L12 19" />
  {/if}
</svg>

<style>
  .verb-icon {
    width: 1.1rem;
    height: 1.1rem;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: square;
  }
</style>
