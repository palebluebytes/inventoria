<script lang="ts">
  import type { ConsumptionEvent } from "../../../stores/calorie.store";
  import { parseLoggedQuantity } from "../../../food/recipe-ingredient";
  import type { NutritionInfo, Portion } from "../../../food/nutrition";
  import type { RecipeIngredient } from "../../../food/recipe-ingredient";
  import Button from "../../../ui/Button.svelte";
  import FoodItemRow from "../FoodItemRow.svelte";
  import IngredientAmountSheet from "../IngredientAmountSheet.svelte";
  import DebugStrip from "./DebugStrip.svelte";
  import {
    PANTRY,
    addRow,
    draftFromEvent,
    ingredientFor,
    isDirty,
    pretendCommit,
    removeRow,
    setRowAmount,
    totalCalories,
    type DraftRow,
  } from "./draft";

  // THROWAWAY — variant F, "hanging from the parent".
  //
  // **The guide: the recipe keeps the logged row it already is, its ingredients
  // indented slightly under it.** F's children are lines rather than cards, and
  // they hang from a rule dropped under the parent's left edge — so the weight
  // stays on the card that is the day's actual entry, and the list below it
  // reads as its contents rather than as six more entries.
  //
  // **The claim: every amount is a box, on every row, the moment the recipe is
  // open.** D and E leave a line as text until it is chosen, so the target is
  // the whole row and what it does is only learnt by doing it. Here the column
  // of boxes IS the affordance — a cook fixing a stew can see the three numbers
  // to change before touching any of them.
  //
  // **The box opens the app's own ingredient picker** (`IngredientAmountSheet`)
  // rather than editing in place, which is the same screen the recipe builder
  // and the instantiation editor open on a row: its unit chips, its basis
  // caption, its breakdown, its NOVA and source marks. An inline field was a
  // cheaper thing that happened to fit the box; it is not what the app means by
  // changing how much of something there is.
  //
  // That is what buys the Save. A per-line ✓ writes a superseding instantiation
  // per line (ADR-0022), which for three amounts is three retract-and-replace
  // pairs on the ledger for one correction; a dock at the foot of the spine
  // makes it one. The cost is that this is the one variant of the three with an
  // unsaved state to lose, and the dock is what has to make that obvious.
  //
  // **Chosen at round two, then tightened.** The per-ingredient kcal is gone
  // and the amount box shrank in both directions. Both moves say the same thing
  // about what an open recipe is FOR: it is the place you fix an amount, not a
  // second nutrition panel. The figure that matters is the occasion's, and that
  // is on the parent row where the day reads it; a column of per-row kcal only
  // competed with the amounts beside it and pushed the names into an ellipsis.
  // The line is now name · amount · unit · ✕, which is the shortest thing that
  // can still be edited.
  //
  // **And the boxes share an edge.** The unit after them is a reserved column
  // rather than a word, because "g" and "srv" are three characters apart and
  // that difference was sliding each box against the one above it — the list is
  // read DOWN the numbers, so a column that does not line up is the one defect
  // this shape cannot carry.
  let { item }: { item: ConsumptionEvent } = $props();

  // Seeded once, on purpose: the draft is this occasion's edit buffer.
  // svelte-ignore state_referenced_locally
  let draft = $state(draftFromEvent(item));
  let open = $state(false);
  let adding = $state(false);
  let saved = $state(false);
  let bodyId = $derived(`proto-spine-${item.id}`);

  /** The row whose amount sheet is open, with the twin it resolved to. */
  let editing = $state<{ row: DraftRow; ing: RecipeIngredient } | null>(null);
  /** Which row is waiting on that resolution — one database read, and the box
   *  says so rather than looking dead for it. */
  let opening = $state<string | null>(null);

  let editPanel = $derived(
    editing?.ing.payload.attributes["nutrition/info"] as
      | NutritionInfo
      | undefined
  );
  let editPortions = $derived(
    (editing?.ing.payload.attributes["food/portions"] as
      | Portion[]
      | undefined) ?? []
  );

  async function openAmount(row: DraftRow) {
    opening = row.key;
    try {
      const ing = await ingredientFor(row);
      // The row may have been removed while the twin was being read.
      if (draft.rows.some((r) => r.key === row.key)) editing = { row, ing };
    } finally {
      opening = null;
    }
  }

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
          <button
            type="button"
            class="line-amt"
            class:waiting={opening === row.key}
            aria-label="Amount of {row.name}"
            onclick={() => openAmount(row)}>{row.amount}</button
          >
          <span class="line-unit"
            >{row.unit === "serving" ? "srv" : row.unit}</span
          >
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

<!-- The app's own ingredient amount sheet — `IngredientAmountSheet`, the same
     component the recipe builder and the instantiation editor open on a row,
     with the same chips, the same basis caption and the same breakdown. Not a
     stand-in this time: the box on the line is the trigger and this is the
     picker.

     **It commits to the draft, not to the ledger**, which is how the builder
     uses it too (`IngredientListEditor` assigns straight into its list). That
     is what leaves F's dock a job: the sheet says what the amount is, Save says
     the occasion is corrected. If the implementation instead writes on the
     sheet's Done — the way the DAY's picker does for a logged food — then this
     variant loses its one-write-per-correction property and the dock should go
     with it. The prototype cannot decide that; it can only show both halves. -->
{#if editing}
  {@const e = editing}
  <IngredientAmountSheet
    payload={e.ing.payload}
    name={e.row.name}
    amount={e.row.amount}
    portions={editPortions}
    panel={editPanel}
    onCommit={(amount) => setRowAmount(draft, e.row.key, amount)}
    onClose={() => (editing = null)}
  />
{/if}

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
     no line that has to be chosen before it can be changed.

     **A small box, and deliberately smaller than a control usually gets here.**
     The field holds three or four characters and sits on a line whose whole
     height is still the tap floor, so the tappable area a thumb actually meets
     is the line; the box is what the eye reads down the column. What it costs
     is real and belongs in the record when this ships: ADR-0093 binds the floor
     to the BOX, not to the row it sits on, and ADR-0098 widened that to every
     control — so a 2rem-high field is an exemption somebody has to argue, or a
     row that grows its hit area back some other way.

     The text stays at 16px whatever the box does: under it, a phone zooms the
     page on focus and the day goes sideways. */
  .line-amt {
    flex-shrink: 0;
    width: 3.4rem;
    height: 2rem;
    background: var(--paper);
    border: var(--edge-thin);
    padding: 0 var(--space-3xs);
    font: inherit;
    font-size: var(--step-0);
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: inherit;
    cursor: pointer;
  }
  /* One database read while the twin resolves. It is usually a frame, and the
     box says so rather than looking dead for it. */
  .line-amt.waiting {
    opacity: 0.5;
  }
  /* **A column, not a word.** The unit sits after the box, so its width decides
     where the box ends: "g" and "srv" are three characters apart and that is
     exactly how far the boxes were sliding against each other down the list.
     Reserved at the widest unit this app writes, left-aligned inside it, so
     every box in the spine shares an edge. The ✕ after it is already fixed. */
  .line-unit {
    flex-shrink: 0;
    width: 2.2rem;
    font-size: var(--step-n3);
    font-weight: 700;
    color: var(--text-secondary);
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
