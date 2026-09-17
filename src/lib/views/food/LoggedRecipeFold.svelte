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
    type IngredientAddOutcome,
    type RecipeIngredient,
  } from "../../food/recipe-ingredient";
  import {
    enteredUnit,
    NUTRITION_INFO_ATTR,
    type NutritionInfo,
    type Portion,
  } from "../../food/nutrition";
  import { appError } from "../../logs/app-log";
  import IngredientAmountSheet from "./IngredientAmountSheet.svelte";
  import AddIngredientSheet from "./AddIngredientSheet.svelte";

  // The **Occasion fold**: a logged recipe's ingredients, open on the day under
  // the row that logged them (ADR-0022, amended 2026-09-17; #462).
  //
  // **Lines, not cards.** The weight stays on the card above, which is the day's
  // actual entry; what hangs under it reads as that entry's contents rather than
  // as six more of them. The parent row is untouched — the dashboard's own
  // `FoodItemRow logged`, inside the wrapper that carries long-press, the
  // selection check and the ✕ — so a logged recipe keeps everything a logged
  // food has and gains a caret.
  //
  // **Every amount is a box, on every row, the moment the fold is open.** The
  // column of boxes IS the affordance: a cook fixing a stew sees the three
  // numbers to change before touching any of them. A line that had to be chosen
  // first would teach what it does only by doing it.
  //
  // **The box opens the app's own picker** (`IngredientAmountSheet`) rather than
  // editing in place — the same screen the recipe builder opens on a row, with
  // its unit chips, its basis caption, its breakdown and its source marks.
  // Changing how much of something there is has one surface in this app, and an
  // inline field would be a cheaper thing that merely fitted the box.
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
      <div class="line">
        <span class="line-name">{row.name}</span>
        <!-- The whole control is the tap target and the box is what the eye
             reads: the button meets `--tap-min` in both directions (ADR-0093,
             widened by ADR-0098) while the drawn box stays the height the
             column needs. The floor is given back rather than argued away. -->
        <button
          type="button"
          class="line-amt"
          disabled={busy}
          aria-label="Amount of {row.name}"
          onclick={() => (editing = row.entity)}
        >
          <span class="line-box">{row.amount}</span>
        </button>
        <span class="line-unit"
          >{row.unit === "serving" ? "srv" : row.unit}</span
        >
        <button
          type="button"
          class="line-x"
          disabled={busy}
          aria-label="Remove {row.name}"
          onclick={() => removeRow(row)}>✕</button
        >
      </div>
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
  /* The fold drops from the parent's left edge and the lines hang off it. One
     step of inset, so the contents sit under the parent's NAME rather than
     under its frame. */
  .fold {
    display: flex;
    flex-direction: column;
    border-left: var(--edge);
    margin-left: var(--space-s);
    padding-left: var(--space-2xs);
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
  .line-amt {
    flex-shrink: 0;
    /* The control, not the box: the floor is the tappable area, and the mark
       inside it is what the column is read down. */
    min-width: var(--tap-min);
    min-height: var(--tap-min);
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
  }
  .line-amt:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .line-box {
    display: grid;
    place-items: center end;
    width: 3.4rem;
    height: 2rem;
    background: var(--paper);
    border: var(--edge-thin);
    padding: 0 var(--space-3xs);
    /* Never under 16px: a smaller field zooms the page on focus and the day
       goes sideways. */
    font-size: var(--step-0);
    font-variant-numeric: tabular-nums;
    color: inherit;
  }
  /* **A column, not a word.** The unit sits after the box, so its width decides
     where the box ends: `g` and `srv` are three characters apart, and that is
     how far the boxes slid against each other down the list. Reserved at the
     widest unit this app writes, so every box in the fold shares an edge. */
  .line-unit {
    flex-shrink: 0;
    width: 2.2rem;
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
  }
  .line-x {
    flex-shrink: 0;
    width: var(--tap-min);
    min-height: var(--tap-min);
    background: none;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
  }
  .line-x:disabled {
    opacity: 0.5;
    cursor: default;
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
