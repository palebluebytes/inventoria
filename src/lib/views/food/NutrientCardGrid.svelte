<script lang="ts">
  import type { Snippet } from "svelte";

  // The 2-column grid that tiles {@link NutrientCard}s — the shared container for
  // the full-day RDA modal's macro/micro sections (#42) and the nutrition target
  // editor's (#41). The 1px grid gap over a hairline background draws the dividers
  // between cards; each card paints its own surface over it. A query container so
  // a card's long single-word label can shrink to fit a narrow column.
  let { children }: { children: Snippet } = $props();
</script>

<div class="nutrient-card-grid">{@render children()}</div>

<style>
  .nutrient-card-grid {
    display: grid;
    /* minmax(0, 1fr) — not the default `1fr` (= minmax(auto, 1fr)) — so a column
       can shrink below its cards' min-content instead of forcing the grid wider
       than its container. A card's allowance row (a fixed-width numeric input +
       unit + reset ↺) would otherwise overflow the two narrow columns on a phone. */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--border-subtle, var(--border));
    container-type: inline-size;
  }
</style>
