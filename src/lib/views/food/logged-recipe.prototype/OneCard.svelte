<script lang="ts">
  import type { ConsumptionEvent } from "../../../stores/calorie.store";
  import { parseLoggedQuantity } from "../../../food/recipe-ingredient";
  import FoodItemRow from "../FoodItemRow.svelte";
  import DebugStrip from "./DebugStrip.svelte";
  import {
    PANTRY,
    addRow,
    draftFromEvent,
    pretendCommit,
    removeRow,
    setRowAmount,
    totalCalories,
  } from "./draft";

  // THROWAWAY — variant D, "one card".
  //
  // **The guide, round two: the recipe keeps the logged row it already is, and
  // its ingredients are indented slightly under it.** All three of D, E and F
  // obey that; what they disagree about is where the children's box is and how
  // a child is edited.
  //
  // D puts them **inside the parent's frame**. The recipe is one object on the
  // day — one card, one ✕, one place in the list — and opening it shows what is
  // in it rather than adding things beside it. The children are lines, not
  // cards: a box inside a box is two objects, and the whole claim here is that
  // this is one.
  //
  // The parent is the app's own `FoodItemRow logged`, untouched, with the caret
  // as its lead mark — so a closed recipe is EXACTLY today's row plus one mark,
  // and the card's bottom edge is dropped by CSS while it is open so the
  // children sit inside the same frame.
  //
  // Editing is one line at a time and writes on ✓: tapping a child turns its
  // amount into a field in place. No Save, because a logged correction is an
  // append either way (ADR-0022) and a per-line ✓ is the same idiom the day's
  // amount picker already commits with.
  let { item }: { item: ConsumptionEvent } = $props();

  // Seeded once, on purpose: the draft is this occasion's edit buffer.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftFromEvent(item));
  let open = $state(false);
  let editingKey = $state<string | null>(null);
  let field = $state("");
  let adding = $state(false);
  let bodyId = $derived(`proto-onecard-${item.id}`);

  let qty = $derived(parseLoggedQuantity(item.quantity));
  let total = $derived(totalCalories(draft));

  function startEdit(key: string, amount: number) {
    editingKey = key;
    field = String(amount);
  }

  function commitEdit() {
    if (editingKey) {
      setRowAmount(draft, editingKey, Number(field));
      pretendCommit(draft);
    }
    editingKey = null;
  }
</script>

<div class="one-card" class:open>
  {#snippet caret()}
    <span class="caret" class:open aria-hidden="true">›</span>
  {/snippet}

  <FoodItemRow
    logged
    name={draft.name}
    amount={qty.amount}
    unit={qty.unit}
    calories={total}
    note="{total} kcal · {draft.rows.length} ingredients"
    lead={caret}
    onclick={() => (open = !open)}
    onRemove={() => {}}
  />

  {#if open}
    <div class="kids" id={bodyId}>
      {#each draft.rows as row (row.key)}
        <div class="kid">
          {#if editingKey === row.key}
            <span class="kid-name">{row.name}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="kid-field"
              inputmode="decimal"
              autofocus
              bind:value={field}
              aria-label="Amount of {row.name} in {row.unit}"
              onkeydown={(e) => e.key === "Enter" && commitEdit()}
            />
            <span class="kid-unit">{row.unit}</span>
            <button
              type="button"
              class="kid-ok"
              aria-label="Done"
              onclick={commitEdit}>✓</button
            >
          {:else}
            <button
              type="button"
              class="kid-tap"
              onclick={() => startEdit(row.key, row.amount)}
            >
              <span class="kid-name">{row.name}</span>
              <span class="kid-amt"
                >{row.amount}{row.unit === "serving" ? " srv" : row.unit}</span
              >
            </button>
            <span class="kid-cals">{Math.round(row.calories)}</span>
            <button
              type="button"
              class="kid-x"
              aria-label="Remove {row.name}"
              onclick={() => {
                removeRow(draft, row.key);
                pretendCommit(draft);
              }}>✕</button
            >
          {/if}
        </div>
      {/each}

      {#if adding}
        <div class="pantry">
          {#each PANTRY as p (p.ref)}
            <button
              type="button"
              onclick={() => {
                addRow(draft, p);
                pretendCommit(draft);
                adding = false;
              }}>{p.name}</button
            >
          {/each}
          <button
            type="button"
            class="pantry-x"
            onclick={() => (adding = false)}>cancel</button
          >
        </div>
      {:else}
        <button type="button" class="add" onclick={() => (adding = true)}
          >＋ Add ingredient</button
        >
      {/if}

      <DebugStrip {draft} />
    </div>
  {/if}
</div>

<style>
  /* The children's box carries the frame's sides and foot; the parent row
     carries its top. Together they are one card — which is why the row loses
     its bottom edge and its shadow gap while open. */
  .one-card.open :global(.food-item) {
    border-bottom: 0;
    margin-bottom: 0;
  }
  .kids {
    background: var(--paper);
    border: var(--edge-thin);
    border-top: 0;
    /* Slightly in, and no further: the children are inside their parent's
       padding, one step past the name above them. */
    padding: 0 var(--space-s) var(--space-2xs) var(--space-m);
    margin-right: var(--shadow-2-reach);
    margin-bottom: var(--shadow-2-reach);
  }
  .caret {
    display: inline-block;
    align-self: center;
    font-size: var(--step-0);
    line-height: 1;
    transition: transform 0.15s var(--ease-snap);
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .kid {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    min-height: var(--tap-min);
    border-bottom: 1px solid var(--border);
  }
  .kid:last-of-type {
    border-bottom: 0;
  }
  /* A line, not a card: the tap target is the text itself, full width. */
  .kid-tap {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: var(--space-2xs);
    min-width: 0;
    min-height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .kid-name {
    flex: 1;
    min-width: 0;
    font-size: var(--step-n2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kid-amt {
    flex-shrink: 0;
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .kid-cals {
    flex-shrink: 0;
    min-width: 3em;
    font-size: var(--step-n2);
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .kid-x {
    flex-shrink: 0;
    width: 1.5rem;
    background: none;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
  }
  /* The field takes the line it is on, in place — nothing opens over the day. */
  .kid-field {
    width: 4.5rem;
    min-height: var(--tap-min);
    border: var(--edge-thin);
    padding: 0 var(--space-3xs);
    font: inherit;
    /* 16px floor, or a phone zooms the page on focus. */
    font-size: var(--step-0);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .kid-unit {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  .kid-ok {
    width: var(--tap-min);
    min-height: var(--tap-min);
    background: var(--ink);
    border: 0;
    color: var(--paper);
    font-size: var(--step-n1);
    cursor: pointer;
  }
  .add,
  .pantry button {
    align-self: flex-start;
    min-height: var(--tap-min);
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--step-n2);
    font-weight: 700;
    text-align: left;
    color: var(--text-primary);
    cursor: pointer;
  }
  .pantry {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
  }
  .pantry-x {
    color: var(--text-muted);
  }
</style>
