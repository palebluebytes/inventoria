<script lang="ts">
  import type { Snippet } from "svelte";
  import Row from "../../ui/Row.svelte";
  import { quantityLabel } from "../../food/recipe-ingredient";
  import { roundFoodDisplay, type AmountUnit } from "../../food/nutrition";
  import { calorieDisplayDecimals } from "../../stores/device-settings";

  // One food line, shared by the dashboard's logged-food list and the
  // recipe/instantiation ingredient list. Since #319 the row itself — the
  // lead/title/subtitle/trailing layout, the corner, the selection highlight
  // and the keyboard path — is the shared `ui/Row` primitive, and what is left
  // here is the food formatting: the app's one quantity phrase, and the figure
  // each surface is read for.
  //
  // **The two surfaces put that figure in different places**, because a mark
  // beside the title is a column taken from the title:
  //
  //  • A `logged` row is the dashboard's. Its name runs the full width of the
  //    card and the AMOUNT is the figure, alone on the line below — the amount
  //    is what its reader is checking and what the row's own controls change
  //    (the picker, and Scale). A logged food's kcal is not stated here at all:
  //    it is in the meal's subtotal under the list, in the day's meters, and in
  //    the picker that opens on a tap, and reserving a column for it on every
  //    row cost the name enough width to wrap a food's name in two.
  //  • A recipe ingredient row is read for its derived kcal, so it keeps the
  //    older shape: quantity under the name, kcal on the right.
  //
  // Tapping the row opens the amount picker (via `onclick`); the dashboard
  // instead lets its own wrapper handle the tap, so it passes no `onclick`
  // here. `lead` slots a photo thumb ahead of the name, and `corner` slots the
  // dashboard's selection check into the top-right, without this component
  // knowing about either.
  let {
    name,
    amount,
    unit,
    calories,
    logged = false,
    onRemove,
    onclick,
    lead,
    corner,
    selected = false,
    preview,
    note = "",
    class: extraClass = "",
  }: {
    name: string;
    amount: number;
    unit: AmountUnit;
    calories: number;
    /** The dashboard's shape: a full-width name over the amount, and no kcal.
     *  Omitted, the row is a recipe ingredient — quantity under the name, the
     *  derived kcal on the right. */
    logged?: boolean;
    onRemove?: () => void;
    /** Whole-row tap (opens the amount picker). Omit to make the row inert —
     *  the dashboard's wrapper owns the tap; a locked serving row passes none. */
    onclick?: () => void;
    lead?: Snippet;
    /** Top-right corner content. Takes the remove ✕'s place when given — the
     *  dashboard puts its selection check here while a selection is active. */
    corner?: Snippet;
    /** Dashboard selection highlight; ignored by the recipe list. */
    selected?: boolean;
    /** What this food WOULD read at, while a Scale preview is live (ADR-0088
     *  §6). Set, and the quantity and kcal are drawn from it wearing the
     *  Provisional figure mark; absent, the row shows what is stored. */
    preview?: { amount: number; unit: AmountUnit; calories: number };
    /** A word about this row appended to its quantity — "no weight to scale"
     *  for a food a preview cannot touch. It rides the quantity line rather
     *  than a line of its own, because a row may not change height
     *  (ADR-0088 §6). */
    note?: string;
    class?: string;
  } = $props();

  // The app's one quantity phrase (`quantityLabel`), shared with the past-meal
  // picker so a row there reads exactly like the row it will become.
  // A previewed row states the amount it WOULD be logged at, in the unit it
  // would be logged in — which is not always the unit it reads now, since a
  // weightless entry scaled against a per-100 panel lands as a measurement.
  let shownAmount = $derived(preview?.amount ?? amount);
  let shownUnit = $derived(preview?.unit ?? unit);
  let shownCalories = $derived(preview?.calories ?? calories);
  let qtyLabel = $derived(
    note
      ? `${quantityLabel(shownAmount, shownUnit)} · ${note}`
      : quantityLabel(shownAmount, shownUnit)
  );
</script>

<!-- `food-item` and the `fi-*` part classes are this row's shipped DOM
     contract: the recipe-list e2e locates the name, the quantity and the ✕ by
     them, and the quantity is `fi-qty` on both shapes. -->
<Row
  class="food-item {logged ? 'fi-logged' : ''} {extraClass}"
  title={name}
  subtitle={qtyLabel}
  titleClass="fi-name"
  subtitleClass={preview ? "fi-qty is-preview" : "fi-qty"}
  removeClass="fi-remove"
  {onRemove}
  {onclick}
  {lead}
  {corner}
  {selected}
>
  {#snippet trailing()}
    {#if !logged}
      <span class="fi-cals" class:is-preview={!!preview}
        >{roundFoodDisplay(shownCalories, $calorieDisplayDecimals)} kcal</span
      >
    {/if}
  {/snippet}
</Row>

<style>
  .fi-cals {
    flex-shrink: 0;
    /* Sit at the bottom of the row, clear of the ✕ in the top corner. */
    align-self: flex-end;
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
    /* ADR-0088 §6.3: reserve the column. A scaled figure gains digits (389 →
       778.5) and would otherwise widen this, squeeze the name column and
       rewrap the food's name — a vertical jump while previewing. */
    min-width: 5.4em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* A logged row is a name over its amount, and the two are set apart rather
     than set alike: the name is the row's subject, the amount is a reading of
     it. Same left edge, one step down the scale, the secondary ink — a figure
     under a heading, not a second heading. Bold and tabular because it IS the
     row's figure, and because a column of them reads down the list. */
  :global(.food-item.fi-logged .row-subtitle) {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-secondary);
    /* Clear of the corner mark, so a long "1 serving · no weight to scale"
       truncates before it reaches the ✕ rather than running under it. */
    max-width: calc(100% - 1.5rem);
  }

  /* Two lines that belong to each other: at the body's own leading a wrapped
     name drifts apart from the amount under it, and the pair stops reading as
     one block. The name also clears the corner ✕ — the ✕ box, plus its inset,
     less the row's own padding it already overhangs. A row with no ✕
     over-reserves by that much and nothing moves, which is cheaper than a
     second class to say so. */
  :global(.food-item.fi-logged .row-title) {
    line-height: 1.25;
    padding-right: calc(1.5rem + var(--space-3xs) - var(--space-s));
  }

  /* A list line, not a poster: two short lines inside the frame's full padding
     left the card mostly air, with the ✕ alone in the band above the name. The
     side padding stays — the frame's left edge and the text's are the alignment
     the whole list is read down. */
  :global(.food-item.fi-logged) {
    padding: var(--space-xs) var(--space-s);
  }

  /* The ✕ is an action on the row, not a figure in it. In full ink it was the
     heaviest mark on a card whose subject is the food's name, and it sits in
     the corner where nothing else competes for the eye. It takes its ink back
     on hover, when it is the thing being reached for. */
  :global(.food-item.fi-logged .fi-remove) {
    color: var(--text-muted);
  }

  :global(.food-item.fi-logged .fi-remove:hover) {
    color: var(--text-primary);
  }

  /* ADR-0088's Amendment of 2026-09-02: a scaled row lets go of the Selection
     the moment its own write lands, and the highlight washing off IS that
     acknowledgement rather than a separate beat after it. Paper is where a
     deselected row already sits, so there is nothing to flash back from.

     On the base rather than behind a `written` flag, because the row has no way
     to be deselected-and-not-written: a cancelled preview leaves the row
     selected, so this transition only ever runs when something happened. At the
     house motion duration (ADR-0003 §4) — sharp, no float, no overshoot. */
  :global(.food-item) {
    transition:
      background-color 0.15s var(--ease-snap),
      box-shadow 0.15s var(--ease-snap);
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.food-item) {
      transition: none;
    }
  }

  /* ADR-0088 §6: the Provisional figure. The mark's BOX is permanent and only
     its colours switch, so toggling a preview moves nothing; the negative
     inline margin cancels the horizontal padding so the text sits where it
     would with no mark, and the fill bleeds into the row's own padding. */
  .fi-cals,
  :global(.food-item .fi-qty) {
    padding: var(--hairline) var(--space-3xs);
    margin: 0 calc(var(--space-3xs) * -1);
  }

  :global(.food-item .fi-qty) {
    /* Hug the text rather than the column, or the fill would span the row. */
    align-self: flex-start;
    /* ADR-0088 §6.4: the quantity line carries the skip note and may not wrap
       — it truncates, which also keeps it inside the frame at 360px. */
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }

  .fi-cals.is-preview,
  :global(.food-item .fi-qty.is-preview) {
    background: var(--ink);
    color: var(--paper);
  }
</style>
