<script lang="ts">
  import type { FoodSourceKind } from "../../food/food-source";
  import BottomSheet from "../../ui/BottomSheet.svelte";

  // The source explainer (ADR-0043 §2, ticket B/#103) — the tap-through sheet the
  // source tag (top-right of the food name) hands its origin to. One house
  // `BottomSheet`; per-origin trust copy tells the user what "from OFF / from
  // USDA / your entry / from a recipe" means for how far to trust the numbers.
  //
  // Conditionally mounted by FoodStager off a `sourceExplain` state and closed via
  // `onClose` → that state back to null, mirroring the NOVA explainer seam.
  let {
    kind,
    onClose,
  }: {
    /** The tapped food's origin bucket from `foodSourceView` (ADR-0043 §2). */
    kind: FoodSourceKind;
    /** Dismiss — the surface clears its `sourceExplain` back to null. */
    onClose: () => void;
  } = $props();

  // Per-origin heading + trust copy. Kept here (presentation), keyed off the pure
  // `FoodSourceKind` the tag already resolved.
  const COPY: Record<FoodSourceKind, { title: string; body: string }> = {
    off: {
      title: "From Open Food Facts",
      body: "Scanned from a barcode in Open Food Facts — a free, crowd-sourced product database anyone can add to or edit. Coverage is broad but quality varies product to product, so treat the panel as a good starting point and check it against the pack.",
    },
    usda: {
      title: "From USDA FoodData Central",
      body: "A base ingredient from the US government's FoodData Central — laboratory-analysed reference values for whole and lightly-processed foods. These are among the most trustworthy figures available, but they describe a generic food, not a specific brand.",
    },
    manual: {
      title: "Your own entry",
      body: "You entered this yourself — from a label, a menu, or an estimate. It's exactly as accurate as what you typed in, and only you can see it. Edit it any time from the pencil badge.",
    },
    recipe: {
      title: "From one of your recipes",
      body: "Built from one of your saved recipes — its nutrition is summed from the ingredients you listed and divided across the yield, so it's only as accurate as those ingredients and portions.",
    },
  };

  let copy = $derived(COPY[kind]);
</script>

<!-- Elevated so it floats over the sheet the tag was tapped in (the log sheet in
     FoodStager), matching the NOVA explainer's over-sheet precedent. -->
<BottomSheet isOpen elevated title="Where this came from" {onClose}>
  <h3 class="source-title">{copy.title}</h3>
  <p class="source-body">{copy.body}</p>
</BottomSheet>

<style>
  .source-title {
    margin: 0 0 var(--space-s);
    font-size: var(--step-1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink);
  }
  .source-body {
    margin: 0;
    font-size: var(--step-0);
    line-height: 1.5;
    color: var(--ink);
  }
</style>
