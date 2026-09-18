<script lang="ts">
  import type { ConsumptionEvent } from "../../stores/calorie.store";
  import {
    correctOccasion,
    occasionSizeOf,
    seedOccasionRows,
  } from "../../stores/recipe.store";
  import {
    addOrMergeIngredient,
    sourceFromIngredients,
    toReferenceIngredient,
    type IngredientAddOutcome,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import { deriveIngredientMacros } from "../../food/recipe-nutrition";
  import {
    enteredUnit,
    NUTRITION_INFO_ATTR,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import { appError } from "../../logs/app-log";
  import FoodItemRow from "./FoodItemRow.svelte";
  import IngredientAmountSheet from "./IngredientAmountSheet.svelte";
  import AddIngredientSheet from "./AddIngredientSheet.svelte";

  // The **Occasion fold**: a logged recipe's ingredients, open on the day under
  // the row that logged them (ADR-0022, amended 2026-09-17; #462).
  //
  // **An ingredient is drawn as the logged food it behaves like.** Each line is
  // the day's own `FoodItemRow logged` — a name over its amount, no kcal, the ✕
  // in the corner — so a row inside a dish and a row outside one are the same
  // row, read the same way down one list. What marks these as contents is the
  // fold's rule and its inset under the parent's name; nothing about the line
  // itself is this component's to draw.
  //
  // This replaced a bespoke line carrying its amount in a small box. Two row
  // treatments on one screen was the whole of what that bought, and it cost an
  // amount that was not read where every other amount on the day is read.
  //
  // **The parent row is untouched** — the same card, inside the wrapper that
  // carries long-press, the selection check and its own ✕ — so a logged recipe
  // keeps everything a logged food has and gains a caret.
  //
  // **Tapping a line opens the app's own picker** (`IngredientAmountSheet`),
  // which is what tapping a logged food already does, and the same screen the
  // recipe builder opens on a row: its unit chips, its basis caption, its
  // breakdown and its source marks. Changing how much of something there is has
  // one surface in this app.
  //
  // **Every act writes at once and there is no Save.** These lines are another
  // view of the ingredients this occasion already records, so a logged
  // ingredient behaves like a logged food: the sheet's Done writes, the ✕
  // writes, an added row writes. The day's own amount picker already works this
  // way, and a second rule on one screen is not worth what batching would save.
  //
  // The price is that an instantiation's ingredients are ONE frozen blob and no
  // datom holds a single row (ADR-0022 §2), so each act appends a whole fresh
  // copy of the list. It appends onto the occasion itself (ADR-0111 §1), which
  // is what lets this fold exist at all: the id does not move, so the open state
  // keyed on it survives every write, and so does the Selection's membership.
  let {
    item,
    onOpenOccasion,
  }: {
    item: ConsumptionEvent;
    /**
     * Opens the whole occasion in `InstantiationSheet` — the one surface that
     * asks what the batch weighed and how much of it was eaten (ADR-0106 §5).
     * The fold corrects ingredients and carries those weights forward untouched,
     * so this is the way to the question it does not ask.
     */
    onOpenOccasion: () => void;
  } = $props();

  /** The occasion's rows against their current twins, or `null` until read. */
  let rows = $state<RecipeIngredient[] | null>(null);
  let busy = $state(false);
  let note = $state("");
  /** The row whose amount sheet is open — held by entity, which is the list's
   *  key end to end (ADR-0024), so a re-seed under it cannot move the sheet. */
  let editing = $state<string | null>(null);
  let adding = $state(false);

  let based_on = $derived(item.instantiation?.based_on || item.target || "");
  let editingRow = $derived(rows?.find((r) => r.entity === editing) ?? null);

  // Re-seeded whenever the occasion's snapshot changes, which includes every
  // correction this fold makes: the write lands on the event, the projection
  // hands the row back, and the lines are re-read from what was actually stored
  // rather than from what this component believed it wrote. `seq` drops a read
  // that a later one has already overtaken.
  let seq = 0;
  $effect(() => {
    const snapshot = item.instantiation;
    const mine = ++seq;
    void (async () => {
      const seeded = await seedOccasionRows({
        ...item,
        instantiation: snapshot,
      });
      if (mine === seq) rows = seeded;
    })();
  });

  /**
   * Writes a corrected list onto the occasion — the one commit path, shared by
   * the amount sheet's Done, the ✕ and the add.
   *
   * The size is carried forward rather than re-derived ({@link occasionSizeOf}),
   * so correcting an ingredient never restates how much of the pot was eaten:
   * an occasion logged at 220 g stays 220 g, and one logged at two servings
   * stays two servings.
   */
  async function commit(next: RecipeIngredient[], what: string) {
    if (busy) return;
    busy = true;
    note = "";
    try {
      await correctOccasion(item.id, based_on, next, 1, occasionSizeOf(item));
      rows = next;
    } catch (e) {
      appError(`${what} failed`, e);
      // Nothing was written, so the lines on screen are still true and the act
      // can be repeated. The note is the only thing that changes.
      note = "That change could not be saved.";
    } finally {
      busy = false;
    }
  }

  function setAmount(
    entity: string,
    amount: number,
    unit: RecipeIngredient["unit"]
  ) {
    const next = (rows ?? []).map((row) =>
      row.entity === entity ? { ...row, amount, unit } : row
    );
    void commit(next, "correcting an ingredient's amount");
  }

  function removeRow(row: RecipeIngredient) {
    // The last ingredient is refused rather than written. An occasion with no
    // rows has no snapshot to derive from and `Σrows` is not a dish; the way to
    // remove the whole thing is the ✕ on the card above, which is a removal
    // (1 → 0) rather than a correction.
    if ((rows ?? []).length <= 1) {
      note = "A recipe needs an ingredient. Remove the dish with its own ✕.";
      return;
    }
    void commit(
      (rows ?? []).filter((r) => r.entity !== row.entity),
      "removing an ingredient"
    );
  }

  function addIngredient(ing: RecipeIngredient): IngredientAddOutcome {
    const result = addOrMergeIngredient(rows ?? [], ing);
    if (!result.ok) {
      return {
        ok: false,
        message: `${result.name} is already in this dish at a different unit — edit its amount instead.`,
      };
    }
    void commit(result.ingredients, "adding an ingredient");
    adding = false;
    return { ok: true };
  }

  const panelOf = (row: RecipeIngredient) =>
    row.payload.attributes[NUTRITION_INFO_ATTR] as NutritionInfo | undefined;
</script>

<div class="fold" data-testid="occasion-fold-{item.id}">
  {#if rows === null}
    <p class="fold-note">Reading the ingredients…</p>
  {:else}
    {#each rows as row (row.entity)}
      <!-- The whole row is the target, as it is on the day: a logged food opens
           its amount by being tapped, and so does an ingredient of a dish. The
           tap floor, the corner ✕ and the two lines are `Row`'s, so nothing here
           argues for them (ADR-0093, widened by ADR-0098).

           Neither handler is withdrawn while a write is in flight: the guard is
           in `commit`, so a second tap is dropped rather than the controls going
           away under the thumb that is on them. -->
      <FoodItemRow
        logged
        name={row.name}
        amount={row.amount}
        unit={row.unit}
        calories={deriveIngredientMacros(toReferenceIngredient(row), (ref) =>
          sourceFromIngredients(rows ?? [], ref)
        ).calories}
        onclick={() => (editing = row.entity)}
        onRemove={() => removeRow(row)}
      />
    {/each}

    <div class="fold-acts">
      <button
        type="button"
        class="fold-act"
        disabled={busy}
        onclick={() => (adding = true)}>＋ Add ingredient</button
      >
      <!-- The one question this surface does not ask (ADR-0106 §5, §8). -->
      <button type="button" class="fold-act muted" onclick={onOpenOccasion}
        >How much of it?</button
      >
    </div>
  {/if}

  <!-- One status line, silent on success: the lines visibly change, which needs
       no narrating, and this carries only what a reader could not otherwise
       see. -->
  {#if note}
    <p class="fold-note" role="status">{note}</p>
  {/if}
</div>

{#if editingRow}
  {@const row = editingRow}
  <IngredientAmountSheet
    payload={row.payload}
    name={row.name}
    amount={row.amount}
    unit={enteredUnit(row.unit, panelOf(row)?.serving_size)}
    portions={(row.payload.attributes["food/portions"] as Portion[]) ?? []}
    panel={sourceFromIngredients(rows ?? [], row.entity)?.panel}
    onCommit={(amount, unit) => setAmount(row.entity, amount, unit)}
    onClose={() => (editing = null)}
  />
{/if}

{#if adding}
  <AddIngredientSheet onAdd={addIngredient} onClose={() => (adding = false)} />
{/if}

<style>
  /* The fold drops from the parent's left edge and its rows hang off it. One
     step of inset, so the contents sit under the parent's NAME rather than under
     its frame — which is the whole of what marks them as contents now that the
     rows themselves are the day's own rows.

     The gap is `.meal-items-list`'s, because rows inside a dish are read down
     the same rhythm as the rows outside one. */
  .fold {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    border-left: var(--edge);
    margin-left: var(--space-s);
    padding-left: var(--space-2xs);
  }
  .fold-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
  }
  .fold-act {
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
  .fold-act:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .fold-act.muted {
    font-weight: 400;
    color: var(--text-secondary);
  }
  .fold-note {
    padding: var(--space-2xs) 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
</style>
