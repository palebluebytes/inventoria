<script lang="ts">
  import type { FoodSourceKind } from "../../food/food-source";
  import {
    curatedStandInNote,
    type CuratedStandIn,
  } from "../../food/curated-foods";
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
    standIn,
    onEdit,
    onClose,
  }: {
    /** The tapped food's origin bucket from `foodSourceView` (ADR-0043 §2). */
    kind: FoodSourceKind;
    /**
     * Set when this food is a curated stand-in for a base ingredient no reference
     * table carries (ADR-0046 §5). The origin sheet is where the disclosure
     * belongs: the stand-in IS an origin story, and the tag that opens this is
     * already the one saying "OFF".
     */
    standIn?: CuratedStandIn;
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
  let note = $derived(standIn ? curatedStandInNote(standIn) : null);
</script>

<!-- The shared explainer frame supplies the over-sheet elevation and the one
     explainer height (see ExplainerSheet); this owns only the copy. -->
<ExplainerSheet title="Where this came from" class="source-explainer" {onClose}>
  <h3 class="source-title">{copy.title}</h3>
  <p class="source-body">{copy.body}</p>

  {#if kind === "usda"}
    <!-- ODbL attribution (ADR-0049 §4). No OFF data is DISPLAYED on a USDA food;
         the search simply understands alternative names for it, which is still a
         substantial extraction from OFF's taxonomy and still owes the licence a
         visible line. It rides on every USDA food rather than only the ones an
         expansion reached, which over-attributes in the safe direction and needs
         no navigation and no tracking of how a food was found. Same quiet-but-
         visible treatment as the NOVA explainer's. -->
    <p class="attribution">
      Search understands other names for these foods — aubergine, courgette,
      minced beef — from <strong>Open Food Facts</strong>' ingredient taxonomy,
      made available under the
      <span class="odbl">Open Database License (ODbL)</span>.
    </p>
  {/if}

  {#if note}
    <!-- The stand-in disclosure (ADR-0046 §5). Above the edit affordance, because
         a user who reads this is exactly the one who may want to correct it. -->
    <div class="stand-in" data-testid="stand-in-note">
      <p class="stand-in-head">{note.headline}</p>
      <p class="source-body">{note.body}</p>
    </div>
  {/if}

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
  /* Set apart from the origin copy above it without inventing a new surface:
     the house edge token, the same one every framed block uses (ADR-0038). */
  .stand-in {
    margin-top: var(--space-m);
    padding: var(--space-s);
    border: var(--edge);
    background: var(--highlight-bg);
  }
  .stand-in-head {
    margin: 0 0 var(--space-2xs);
    font-size: var(--step-0);
    font-weight: 700;
    color: var(--ink);
  }
  .source-body {
    margin: 0;
    font-size: var(--step-0);
    line-height: 1.5;
    color: var(--ink);
  }
  /* ODbL attribution — quiet but visible, per the OFF licence (ADR-0049 §4).
     Deliberately the NOVA explainer's treatment, so one licence line reads the
     same wherever it appears. */
  .attribution {
    margin: var(--space-m) 0 0;
    padding-top: var(--space-s);
    border-top: var(--edge-thin);
    font-size: var(--step-n2);
    line-height: 1.4;
    color: var(--text-secondary);
  }
  .odbl {
    white-space: nowrap;
  }
</style>
