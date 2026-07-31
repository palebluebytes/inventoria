<script lang="ts">
  import type { Snippet } from "svelte";

  // The 2-column grid that tiles {@link NutrientCard}s — the shared container for
  // the full-day RDA modal's macro/micro sections (#42) and the Settings target
  // editor's (#41). The 1px grid gap over a hairline background draws the dividers
  // between cards; each card paints its own surface over it. A query container so
  // a card's long single-word label can shrink to fit a narrow column.
  let { children }: { children: Snippet } = $props();
</script>

<div class="nutrient-card-grid">{@render children()}</div>

<style>
  .nutrient-card-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1px;
    background: var(--border-subtle, #e4e4e7);
    container-type: inline-size;
  }
</style>
