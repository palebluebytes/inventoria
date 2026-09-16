<script lang="ts">
  import type { ConsumptionEvent } from "../../../stores/calorie.store";
  import { parseLoggedQuantity } from "../../../food/recipe-ingredient";
  import BottomSheet from "../../../ui/BottomSheet.svelte";
  import Button from "../../../ui/Button.svelte";
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
    type DraftRow,
  } from "./draft";

  // THROWAWAY — variant E, "a list within the list".
  //
  // **The guide: the recipe keeps the logged row it already is, its ingredients
  // indented slightly under it.** E takes that at its word and gives the
  // children the same row too — each one is a `FoodItemRow logged`, a card of
  // its own, inset by one step from the parent's left edge.
  //
  // **The claim: a logged ingredient is a logged food, and the day already
  // knows how to draw and edit one.** So a recipe's contents are visually
  // indistinguishable from foods logged directly — same card, same ✕, same tap
  // — and the indent is the only thing saying who they belong to. Nothing new
  // is invented for a recipe's insides: tapping a child opens the app's amount
  // picker and Done writes, exactly as it does for a banana.
  //
  // **Open by default.** A recipe whose contents are hidden is the complaint;
  // E's answer is that they should not have been hidden, and the fold is for
  // the day you logged three recipes and want the list short again.
  //
  // The cost, which is the thing to judge: a six-ingredient stew is seven cards
  // in a meal, and a card is heavier than a line.
  let { item }: { item: ConsumptionEvent } = $props();

  // Seeded once, on purpose: the draft is this occasion's edit buffer.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftFromEvent(item));
  let open = $state(true);
  let editing = $state<DraftRow | null>(null);
  let field = $state("");
  let adding = $state(false);
  let bodyId = $derived(`proto-subcards-${item.id}`);

  let qty = $derived(parseLoggedQuantity(item.quantity));
  let total = $derived(totalCalories(draft));

  function done() {
    if (editing) {
      setRowAmount(draft, editing.key, Number(field));
      // The day's picker writes on Done. So does this.
      pretendCommit(draft);
    }
    editing = null;
  }
</script>

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
      <FoodItemRow
        logged
        class="kid"
        name={row.name}
        amount={row.amount}
        unit={row.unit}
        calories={Math.round(row.calories)}
        onclick={() => {
          editing = row;
          field = String(row.amount);
        }}
        onRemove={() => {
          removeRow(draft, row.key);
          pretendCommit(draft);
        }}
      />
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
        <button type="button" class="pantry-x" onclick={() => (adding = false)}
          >cancel</button
        >
      </div>
    {:else}
      <button type="button" class="add" onclick={() => (adding = true)}
        >＋ Add ingredient to {draft.name}</button
      >
    {/if}

    <DebugStrip {draft} />
  </div>
{/if}

<!-- The stand-in for the app's own amount picker (`IngredientAmountSheet`),
     which is what a real E would open here: same sheet, same Done, same
     append-only write. Only the field is faked. -->
{#if editing}
  {@const row = editing}
  <BottomSheet isOpen title={row.name} onClose={() => (editing = null)}>
    <p class="picker-note">
      Stand-in for the app's amount picker — the same sheet a logged food opens.
    </p>
    <div class="picker">
      <input
        class="picker-field"
        inputmode="decimal"
        bind:value={field}
        aria-label="Amount in {row.unit}"
      />
      <span class="picker-unit">{row.unit}</span>
    </div>
    {#snippet footer()}
      <Button variant="primary" onclick={done}>Done</Button>
    {/snippet}
  </BottomSheet>
{/if}

<style>
  /* Slightly in, and nothing else: no spine, no rule, no wrapper. The inset IS
     the statement — these are the day's own rows, one step further from the
     margin than the recipe they came out of. */
  .kids {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-left: var(--space-m);
    margin-top: var(--space-xs);
  }
  /* A child is the same row one size down: the parent is what you are looking
     for in the list, and a column of identical cards would hide it. */
  .kids :global(.food-item.kid) {
    padding: var(--space-3xs) var(--space-xs);
  }
  .kids :global(.food-item.kid .row-title) {
    font-size: var(--step-n2);
  }
  .kids :global(.food-item.kid .row-subtitle) {
    font-size: var(--step-n3);
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
  .picker-note {
    font-size: var(--step-n2);
    color: var(--text-muted);
  }
  .picker {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    padding-top: var(--space-s);
  }
  .picker-field {
    flex: 1;
    min-height: var(--tap-min);
    border: var(--edge);
    padding: 0 var(--space-2xs);
    font: inherit;
    font-size: var(--step-1);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .picker-unit {
    font-size: var(--step-0);
    font-weight: 700;
  }
</style>
