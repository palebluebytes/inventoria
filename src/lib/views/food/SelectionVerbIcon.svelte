<script lang="ts">
  // The two marks the Selection bar draws that no other surface has (ADR-0088
  // §2). They follow `WayInIcon`'s spec exactly — a 24×24 box, `currentColor`,
  // a 2.25 square-capped stroke, no fill — because the bar sits directly under
  // the meal headers those marks live in and the two rows must read as one
  // vocabulary.
  //
  // Recipe is deliberately NOT here: it is `WayInIcon kind="recipe"`, reused
  // verbatim, which is what retired the 🍲 the bar used to carry.
  let { kind }: { kind: "scale" | "move" } = $props();
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
  {:else}
    <!-- A list, and an arrow leaving it: these foods go somewhere else. -->
    <path d="M3 7 L12 7" />
    <path d="M3 12 L12 12" />
    <path d="M3 17 L12 17" />
    <path d="M15 12 L21 12" />
    <path d="M18 9 L21 12 L18 15" />
  {/if}
</svg>

<style>
  .verb-icon {
    width: 1.3rem;
    height: 1.3rem;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: square;
  }
</style>
