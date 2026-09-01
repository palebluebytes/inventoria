<script lang="ts">
  import type { Snippet } from "svelte";
  import Row from "../../ui/Row.svelte";
  import { quantityLabel } from "../../food/recipe-ingredient";
  import { roundFoodDisplay, type AmountUnit } from "../../food/nutrition";
  import { calorieDisplayDecimals } from "../../stores/device-settings";

  // One food line, shared by the dashboard's logged-food list and the
  // recipe/instantiation ingredient list so the two read identically. Since
  // #319 the row itself — the lead/title/subtitle/trailing layout, the corner,
  // the selection highlight and the keyboard path — is the shared `ui/Row`
  // primitive, and what is left here is the food formatting: the app's one
  // quantity phrase as the subtitle, and the kcal figure as the trailing mark.
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
     *  for a food a preview cannot touch. It rides the subtitle rather than a
     *  line of its own, because a row may not change height (ADR-0088 §6). */
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
     them, so the move onto the primitive keeps them where they were. -->
<Row
  class="food-item {extraClass}"
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
    <span class="fi-cals" class:is-preview={!!preview}
      >{roundFoodDisplay(shownCalories, $calorieDisplayDecimals)} kcal</span
    >
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
    /* ADR-0088 §6.3: reserve the column. A scaled figure gains digits (97 →
       48.5) and would otherwise widen this, squeeze the name column and
       rewrap the food's name — a vertical jump while previewing. */
    min-width: 5.4em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ADR-0088 §6: the Provisional figure. The mark's BOX is permanent and only
     its colours switch, so toggling a preview moves nothing; the negative
     inline margin cancels the horizontal padding so the text sits where it
     would with no mark, and the fill bleeds into the row's own padding. */
  .fi-cals,
  :global(.food-item .fi-qty) {
    padding: 1px var(--space-3xs);
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
