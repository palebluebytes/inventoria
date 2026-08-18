<script lang="ts">
  import type { FoodSourceKind } from "../../food/food-source";
  import Button from "../../ui/Button.svelte";
  import ExplainerSheet from "./ExplainerSheet.svelte";

  // The source explainer (ADR-0043 §2, ticket B/#103) — the tap-through sheet the
  // source tag (top-right of the food name) hands its origin to. One house
  // `BottomSheet`; per-origin trust copy tells the user what "from OFF / from
  // USDA / your entry / from a recipe" means for how far to trust the numbers.
  //
  // Conditionally mounted by FoodStager off a `sourceExplain` state and closed via
  // `onClose` → that state back to null, mirroring the NOVA explainer seam.
  let {
    kind,
    onEdit,
    onClose,
  }: {
    /** The tapped food's origin bucket from `foodSourceView` (ADR-0043 §2). */
    kind: FoodSourceKind;
    /**
     * Correct this food from its label. Offered for EVERY origin, not just a
     * hand entry: a source panel the user can see is wrong is exactly the one
     * worth correcting, and the correction appends beside the source record
     * rather than replacing it (ADR-0034 §6/§7). Omit where the host has no
     * edit surface to open.
     */
    onEdit?: () => void;
    /** Dismiss — the surface clears its `sourceExplain` back to null. */
    onClose: () => void;
  } = $props();

  // Per-origin heading + trust copy. Kept here (presentation), keyed off the pure
  // `FoodSourceKind` the tag already resolved. The headings name the origin only
  // — the sheet's own header already says "Where this came from", so a leading
  // "From…" on each was reading the same word twice.
  const COPY: Record<FoodSourceKind, { title: string; body: string }> = {
    off: {
      title: "Open Food Facts",
      body: "Scanned from a barcode in Open Food Facts — a free, crowd-sourced product database anyone can add to or edit. Coverage is broad but quality varies product to product, so treat the panel as a good starting point and check it against the pack.",
    },
    usda: {
      title: "USDA FoodData Central",
      body: "A base ingredient from the US government's FoodData Central — laboratory-analysed reference values for whole and lightly-processed foods. These are among the most trustworthy figures available, but they describe a generic food, not a specific brand.",
    },
    manual: {
      title: "Your own entry",
      body: "You entered this yourself — from a label, a menu, or an estimate. It's exactly as accurate as what you typed in, and only you can see it.",
    },
    recipe: {
      title: "One of your recipes",
      body: "Built from one of your saved recipes — its nutrition is summed from the ingredients you listed and divided across the yield, so it's only as accurate as those ingredients and portions.",
    },
  };

  let copy = $derived(COPY[kind]);
</script>

<!-- The shared explainer frame supplies the over-sheet elevation and the one
     explainer height (see ExplainerSheet); this owns only the copy. -->
<ExplainerSheet title="Where this came from" class="source-explainer" {onClose}>
  <h3 class="source-title">{copy.title}</h3>
  <p class="source-body">{copy.body}</p>

  {#if onEdit}
    <!-- The correction affordance lives with the origin it corrects: this is the
         screen where the user decides the numbers are wrong. A correction is an
         append beside the source record (ADR-0034 §6/§7), so an OFF or USDA food
         keeps its origin — the tag does not flip to "manual". -->
    <div class="source-edit">
      <Button
        variant="secondary"
        data-testid="source-edit-btn"
        onclick={() => {
          onEdit();
          onClose();
        }}>Edit</Button
      >
    </div>
  {/if}
</ExplainerSheet>

<style>
  .source-title {
    margin: 0 0 var(--space-s);
    font-size: var(--step-1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--ink);
  }
  .source-edit {
    margin-top: var(--space-m);
  }
  .source-body {
    margin: 0;
    font-size: var(--step-0);
    line-height: 1.5;
    color: var(--ink);
  }
</style>
