<script lang="ts">
  import type { NutritionInfo, Portion } from "../../food/nutrition";
  import type { NovaVerdict } from "../../food/nova-verdict";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import FoodAmountPanel from "./FoodAmountPanel.svelte";
  import NovaBadge from "./NovaBadge.svelte";
  import CommitButton from "./CommitButton.svelte";

  // Edits a single food line's gram amount in a small sheet raised over the
  // recipe/instantiation dialog or the dashboard. The same picker serves both:
  // it edits a working copy and reports the chosen amount once on Done, so the
  // caller commits it its own way — a recipe mutates the ingredient in memory,
  // the dashboard retract-and-replaces the logged event (append-only, ADR-0008)
  // — without this sheet knowing which. Grams only: a per-serving food is passed
  // in with its serving surfaced as a "1 serving — N g" portion chip (via the
  // caller's servingSizePortion), so a whole-serving food is edited in grams too.
  //
  // The amount body — basis caption, gram control, portion chips, macro preview,
  // full breakdown — is the shared FoodAmountPanel, the very screen the search /
  // scan staging flow shows (DRY). This sheet adds only the over-dialog chrome
  // (BottomSheet, ADR-0027/0028) and the docked Done action.
  let {
    name,
    amount,
    portions = [],
    panel,
    verdict,
    onExplainNova,
    onCommit,
    onClose,
  }: {
    name: string;
    amount: number;
    /** The food's household portions (ADR-0030) plus any synthesised serving,
     *  shown as picker chips. Empty for a portion-less food. */
    portions?: Portion[];
    /** The food's `nutrition/info` panel, per its serving basis. When present the
     *  sheet shows the basis caption + macro preview + full breakdown scaled to
     *  the working amount; omit it to render the plain amount picker. */
    panel?: NutritionInfo;
    /** The food's NOVA processing verdict (ADR-0041 §5), read back off its twin
     *  by the caller. Renders the word-first badge at the head of the detail; omit
     *  it (a caller that hasn't resolved a twin) to hide the badge. */
    verdict?: NovaVerdict;
    /** Tap-through on the NOVA badge — the explainer handoff seam (#92). */
    onExplainNova?: (verdict: NovaVerdict) => void;
    onCommit: (amount: number) => void;
    onClose: () => void;
  } = $props();

  // A working copy — nothing is committed until Done, so closing via the scrim
  // or ✕ leaves the row untouched. Seeded once from `amount`: the sheet is
  // mounted fresh each time a row is opened, so it never needs to track later
  // prop changes.
  // svelte-ignore state_referenced_locally
  let value = $state(amount);

  function done() {
    onCommit(value);
    onClose();
  }
</script>

<BottomSheet isOpen title={name} class="amount-sheet" elevated {onClose}>
  {#if verdict}
    <div class="nova-row">
      <NovaBadge
        {verdict}
        onExplain={onExplainNova ? () => onExplainNova(verdict) : undefined}
      />
    </div>
  {/if}
  <FoodAmountPanel {panel} {portions} bind:grams={value} />

  {#snippet footer()}
    <CommitButton id="amount-done-btn" onclick={done}>Done</CommitButton>
  {/snippet}
</BottomSheet>

<style>
  /* The NOVA badge heads the food detail, above the amount body (ADR-0041 §5). */
  .nova-row {
    display: flex;
    margin-bottom: var(--space-s);
  }
</style>
