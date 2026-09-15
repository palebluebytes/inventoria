<script lang="ts">
  import type { ConsumptionEvent } from "../../../stores/calorie.store";
  import BottomSheet from "../../../ui/BottomSheet.svelte";
  import Button from "../../../ui/Button.svelte";
  import FoodItemRow from "../FoodItemRow.svelte";
  import DebugStrip from "./DebugStrip.svelte";
  import {
    DEMO_ID,
    PANTRY,
    addRow,
    draftFromEvent,
    pretendCommit,
    removeRow,
    setRowAmount,
    totalCalories,
    type DraftRow,
  } from "./draft";

  // THROWAWAY — variant B, "the recipe is a group".
  //
  // **The claim: a logged recipe is a meal inside a meal.** It is already a set
  // of foods with amounts; the day already knows how to draw one of those. So
  // the ingredients are drawn as what they are — `FoodItemRow logged`, the same
  // component, the same ✕, the same tap — indented under a header that carries
  // the recipe's name and its total, with a rule down the left saying they
  // belong to it.
  //
  // **Open is the default and folding is the exception.** A logged recipe whose
  // contents are hidden is the thing being complained about; B's answer is that
  // they should never have been hidden, and the fold exists for the day you
  // logged three recipes and want the list short.
  //
  // **There is no Save**, and that is the structural half of the claim: a row
  // here is edited exactly the way a logged food is edited — tap, amount
  // picker, Done — and the day's amount picker writes on Done, append-only.
  // Two editing languages on one screen is what B is trying to delete, so it
  // does not get to invent a staged one. The cost is visible: a sheet per
  // ingredient, which is the thing to judge.
  let { item }: { item: ConsumptionEvent } = $props();

  // Seeded once, on purpose: see `Unfold`.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftFromEvent(item));
  let folded = $state(false);
  let editing = $state<DraftRow | null>(null);
  let field = $state("");
  let adding = $state(false);
  let bodyId = $derived(`proto-nested-${item.id}`);

  let total = $derived(totalCalories(draft));

  function open(row: DraftRow) {
    editing = row;
    field = String(row.amount);
  }

  function done() {
    if (editing) {
      setRowAmount(draft, editing.key, Number(field));
      // The day's picker writes on Done. So does this.
      pretendCommit(draft);
    }
    editing = null;
  }
</script>

<div class="group" class:folded>
  <div class="group-head">
    <button
      type="button"
      class="fold"
      aria-expanded={!folded}
      aria-controls={bodyId}
      onclick={() => (folded = !folded)}
    >
      <span class="caret" class:open={!folded} aria-hidden="true">›</span>
      <span class="g-name"
        >{draft.name}{#if item.id === DEMO_ID}<span class="demo">DEMO</span
          >{/if}</span
      >
      <span class="g-meta"
        >{draft.rows.length} ingredients{folded ? ` · ${total} kcal` : ""}</span
      >
    </button>
    {#if !folded}
      <span class="g-cals">{total} kcal</span>
    {/if}
    <button type="button" class="g-x" aria-label="Remove {draft.name}">✕</button
    >
  </div>

  {#if !folded}
    <div class="group-body" id={bodyId}>
      {#each draft.rows as row (row.key)}
        <FoodItemRow
          logged
          name={row.name}
          amount={row.amount}
          unit={row.unit}
          calories={Math.round(row.calories)}
          onclick={() => open(row)}
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
          <button
            type="button"
            class="pantry-x"
            onclick={() => (adding = false)}>cancel</button
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
</div>

<!-- The stand-in for the app's own amount picker (`IngredientAmountSheet`),
     which is what a real B would open here: same sheet, same Done, same
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
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  /* A header for a set, not a card for a thing: a rule under it, the way the
     meal's own name is set, one step in from the meal's heading. */
  .group-head {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    border-bottom: 1px solid var(--border);
  }
  .fold {
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
  .caret {
    align-self: center;
    display: inline-block;
    font-size: var(--step-0);
    line-height: 1;
    transition: transform 0.15s var(--ease-snap);
  }
  .caret.open {
    transform: rotate(90deg);
  }
  .g-name {
    font-size: var(--step-n1);
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .g-meta {
    flex: 1;
    font-size: var(--step-n3);
    color: var(--text-muted);
    white-space: nowrap;
  }
  .g-cals {
    font-size: var(--step-n1);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .g-x {
    width: var(--tap-min);
    min-height: var(--tap-min);
    background: none;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
  }
  /* The rule down the left is what says "these rows belong to that header" —
     the only mark B adds to a list of otherwise ordinary logged rows. */
  .group-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    border-left: var(--edge);
    padding-left: var(--space-2xs);
    margin-left: calc(var(--space-2xs) + 0.2rem);
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
  .demo {
    margin-left: var(--space-3xs);
    padding: 0 var(--space-3xs);
    background: var(--highlight-bg);
    font-size: var(--step-n3);
    font-weight: 800;
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
