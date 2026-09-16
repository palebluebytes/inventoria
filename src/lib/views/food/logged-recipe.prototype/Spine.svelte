<script lang="ts">
  import type { ConsumptionEvent } from "../../../stores/calorie.store";
  import { parseLoggedQuantity } from "../../../food/recipe-ingredient";
  import Button from "../../../ui/Button.svelte";
  import FoodItemRow from "../FoodItemRow.svelte";
  import DebugStrip from "./DebugStrip.svelte";
  import {
    PANTRY,
    addRow,
    draftFromEvent,
    isDirty,
    pretendCommit,
    removeRow,
    setRowAmount,
    totalCalories,
  } from "./draft";

  // THROWAWAY — variant F, "hanging from the parent".
  //
  // **The guide: the recipe keeps the logged row it already is, its ingredients
  // indented slightly under it.** F's children are lines rather than cards, and
  // they hang from a rule dropped under the parent's left edge — so the weight
  // stays on the card that is the day's actual entry, and the list below it
  // reads as its contents rather than as six more entries.
  //
  // **The claim: opening IS editing.** D and E both make you tap twice — once
  // to open, once to say which line — and the second tap exists only because
  // the line was drawn as text. Here an open line is already a field: the
  // amount sits in its own box on every row, and a cook fixing a stew moves
  // three of them in one go.
  //
  // That is what buys the Save. A per-line ✓ writes a superseding instantiation
  // per line (ADR-0022), which for three amounts is three retract-and-replace
  // pairs on the ledger for one correction; a dock at the foot of the spine
  // makes it one. The cost is that this is the one variant of the three with an
  // unsaved state to lose, and the dock is what has to make that obvious.
  let { item }: { item: ConsumptionEvent } = $props();

  // Seeded once, on purpose: the draft is this occasion's edit buffer.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftFromEvent(item));
  let open = $state(false);
  let adding = $state(false);
  let saved = $state(false);
  let bodyId = $derived(`proto-spine-${item.id}`);

  let qty = $derived(parseLoggedQuantity(item.quantity));
  let total = $derived(totalCalories(draft));
  let dirty = $derived(isDirty(draft));
</script>

{#snippet caret()}
  <span class="caret" class:open aria-hidden="true">›</span>
{/snippet}

<div class="recipe" class:open>
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
    <div class="spine" id={bodyId}>
      {#each draft.rows as row (row.key)}
        <div class="line">
          <span class="line-name">{row.name}</span>
          <input
            class="line-amt"
            inputmode="decimal"
            value={row.amount}
            aria-label="Amount of {row.name} in {row.unit}"
            onchange={(e) =>
              setRowAmount(draft, row.key, Number(e.currentTarget.value))}
          />
          <span class="line-unit"
            >{row.unit === "serving" ? "srv" : row.unit}</span
          >
          <span class="line-cals">{Math.round(row.calories)}</span>
          <button
            type="button"
            class="line-x"
            aria-label="Remove {row.name}"
            onclick={() => removeRow(draft, row.key)}>✕</button
          >
        </div>
      {/each}

      {#if adding}
        <div class="pantry">
          {#each PANTRY as p (p.ref)}
            <button
              type="button"
              onclick={() => {
                addRow(draft, p);
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

      <!-- The dock only exists once there is something to lose. A row of dead
           controls under every open recipe would say the opposite of what this
           variant is claiming — that reading one costs nothing. -->
      {#if dirty}
        <div class="dock">
          <Button
            variant="primary"
            size="sm"
            onclick={() => {
              pretendCommit(draft);
              saved = true;
              setTimeout(() => (saved = false), 1400);
            }}>Save — {total} kcal</Button
          >
          <Button
            variant="secondary"
            size="sm"
            onclick={() => (draft = draftFromEvent(item))}>Revert</Button
          >
        </div>
      {:else if saved}
        <p class="said" role="status">Saved</p>
      {/if}

      <DebugStrip {draft} />
    </div>
  {/if}
</div>

<style>
  /* The spine drops from the parent's left edge and the lines hang off it. The
     inset is one step, so the children sit under the parent's NAME rather than
     under its frame. */
  .spine {
    display: flex;
    flex-direction: column;
    border-left: var(--edge);
    margin-left: var(--space-s);
    padding-left: var(--space-2xs);
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
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    min-height: var(--tap-min);
    border-bottom: 1px solid var(--border);
  }
  .line-name {
    flex: 1;
    min-width: 0;
    font-size: var(--step-n2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Every row's amount is live the moment the recipe is open — no second tap,
     no line that has to be chosen before it can be changed. */
  .line-amt {
    width: 4.2rem;
    min-height: var(--tap-min);
    border: var(--edge-thin);
    padding: 0 var(--space-3xs);
    font: inherit;
    /* 16px floor, or a phone zooms the page on focus. */
    font-size: var(--step-0);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .line-unit {
    flex-shrink: 0;
    font-size: var(--step-n3);
    font-weight: 700;
    color: var(--text-secondary);
  }
  .line-cals {
    flex-shrink: 0;
    min-width: 3em;
    font-size: var(--step-n2);
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .line-x {
    flex-shrink: 0;
    width: 1.5rem;
    background: none;
    border: 0;
    color: var(--text-muted);
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
  .dock {
    display: flex;
    gap: var(--space-2xs);
    padding: var(--space-2xs) 0;
  }
  .said {
    padding: var(--space-2xs) 0;
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
</style>
