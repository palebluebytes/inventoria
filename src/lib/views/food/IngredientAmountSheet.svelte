<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import QuantityGrams from "./QuantityGrams.svelte";

  // Edits a single food line's gram amount in a small sheet raised over the
  // recipe/instantiation dialog or the dashboard. The same picker serves both:
  // it edits a working copy and reports the chosen amount once on Done, so the
  // caller commits it its own way — a recipe mutates the ingredient in memory,
  // the dashboard retract-and-replaces the logged event (append-only, ADR-0008)
  // — without this sheet knowing which. Grams only; whole-serving amounts are
  // locked upstream (future work), so this is never opened for them.
  //
  // The over-dialog chrome (fixed sheet, own backdrop, pointer-events fix) is
  // the shared BottomSheet primitive's now (ADR-0027/0028); this sheet just
  // composes the amount body and a docked Done action.
  let {
    name,
    amount,
    onCommit,
    onClose,
  }: {
    name: string;
    amount: number;
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
  <QuantityGrams bind:grams={value} />

  {#snippet footer()}
    <button class="done" id="amount-done-btn" onclick={done}>Done</button>
  {/snippet}
</BottomSheet>

<style>
  .done {
    width: 100%;
    background: #ccff00;
    color: #000;
    border: 3px solid #000;
    padding: var(--space-s);
    font-size: var(--step-1);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
    min-height: 56px;
  }
  .done:active {
    transform: scale(0.98);
  }
</style>
