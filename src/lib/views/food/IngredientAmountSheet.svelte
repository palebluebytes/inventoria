<script lang="ts">
  import QuantityGrams from "./QuantityGrams.svelte";

  // Edits a single food line's gram amount in a small sheet raised over the
  // recipe/instantiation dialog or the dashboard. The same picker serves both:
  // it edits a working copy and reports the chosen amount once on Done, so the
  // caller commits it its own way — a recipe mutates the ingredient in memory,
  // the dashboard retract-and-replaces the logged event (append-only, ADR-0008)
  // — without this sheet knowing which. Grams only; whole-serving amounts are
  // locked upstream (future work), so this is never opened for them.
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

<div
  class="scrim"
  role="button"
  tabindex="-1"
  aria-label="Cancel amount edit"
  onclick={onClose}
  onkeydown={(e) => e.key === "Escape" && onClose()}
></div>
<div
  class="panel amount-sheet"
  role="dialog"
  aria-label="Edit amount of {name}"
>
  <header class="head">
    <h2>{name}</h2>
    <button class="hbtn x" onclick={onClose} aria-label="Cancel">✕</button>
  </header>

  <div class="body">
    <QuantityGrams bind:grams={value} />
  </div>

  <button class="done" id="amount-done-btn" onclick={done}>Done</button>
</div>

<style>
  /* The recipe/instantiation dialog is a bits-ui dialog, which sets
     `pointer-events: none` on <body>; this sheet is a sibling overlay, so it
     re-enables events on itself the way AddIngredientSheet does. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 1800;
    background: rgba(0, 0, 0, 0.4);
    pointer-events: auto;
    cursor: default;
  }
  .panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1801;
    background: #fff;
    border-top: 3px solid #000;
    box-shadow: 0 -8px 0 #000;
    padding: var(--space-s) var(--space-s)
      calc(env(safe-area-inset-bottom, 0px) + var(--space-s));
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    pointer-events: auto;
    animation: up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes up {
    from {
      transform: translateY(8%);
      opacity: 0.6;
    }
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
  }
  .head h2 {
    font-size: var(--step-0);
    font-weight: 800;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hbtn {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    background: none;
    border: none;
    font-weight: 700;
    font-size: var(--step-0);
    cursor: pointer;
  }
  .body {
    display: flex;
    flex-direction: column;
  }
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
