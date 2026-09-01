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
    class?: string;
  } = $props();

  // The app's one quantity phrase (`quantityLabel`), shared with the past-meal
  // picker so a row there reads exactly like the row it will become.
  let qtyLabel = $derived(quantityLabel(amount, unit));
</script>

<!-- `food-item` and the `fi-*` part classes are this row's shipped DOM
     contract: the recipe-list e2e locates the name, the quantity and the ✕ by
     them, so the move onto the primitive keeps them where they were. -->
<Row
  class="food-item {extraClass}"
  title={name}
  subtitle={qtyLabel}
  titleClass="fi-name"
  subtitleClass="fi-qty"
  removeClass="fi-remove"
  {onRemove}
  {onclick}
  {lead}
  {corner}
  {selected}
>
  {#snippet trailing()}
    <span class="fi-cals"
      >{roundFoodDisplay(calories, $calorieDisplayDecimals)} kcal</span
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
  }
</style>
