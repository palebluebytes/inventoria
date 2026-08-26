<script lang="ts">
  import type { Snippet } from "svelte";
  import { quantityLabel } from "../../food/recipe-ingredient";
  import { roundFoodDisplay, type AmountUnit } from "../../food/nutrition";
  import { calorieDisplayDecimals } from "../../stores/settings.store";

  // One food line, shared by the dashboard's logged-food list and the
  // recipe/instantiation ingredient list so the two read identically — modelled
  // on the dashboard card: name over a muted quantity subtitle, the kcal on the
  // right, a corner remove. Tapping the row opens the amount picker (via
  // `onclick`); the dashboard instead lets its own wrapper handle the tap, so it
  // passes no `onclick` here. `lead` slots a photo thumb ahead of the name, and
  // `corner` slots the dashboard's selection check into the top-right, without
  // this component knowing about either.
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
  let clickable = $derived(!!onclick);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="food-item {extraClass}"
  class:selected
  class:clickable
  role={clickable ? "button" : undefined}
  tabindex={clickable ? 0 : undefined}
  {onclick}
  onkeydown={clickable
    ? (e) => (e.key === "Enter" || e.key === " ") && onclick?.()
    : undefined}
>
  {@render lead?.()}
  <div class="details">
    <span class="fi-name">{name}</span>
    <span class="fi-qty">{qtyLabel}</span>
  </div>
  <span class="fi-cals"
    >{roundFoodDisplay(calories, $calorieDisplayDecimals)} kcal</span
  >
  {#if corner}
    <span class="fi-corner">{@render corner()}</span>
  {:else if onRemove}
    <button
      class="fi-remove"
      aria-label="Remove {name}"
      title="Remove"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => {
        e.stopPropagation();
        onRemove?.();
      }}>✕</button
    >
  {/if}
</div>

<style>
  .food-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-s);
    background: var(--paper);
    border: var(--edge-thin);
    padding: var(--space-s);
  }
  .food-item.clickable {
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
  .food-item.selected {
    background: var(--highlight-bg);
    box-shadow: var(--shadow-2);
  }
  .details {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .fi-name {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-primary);
  }
  .fi-qty {
    font-size: var(--step-n2);
    color: var(--text-muted);
  }
  .fi-cals {
    flex-shrink: 0;
    /* Sit at the bottom of the row, clear of the ✕ in the top corner. */
    align-self: flex-end;
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }
  /* Borderless ✕ tucked into the row's top-right corner — and the same box for
     whatever `corner` puts there instead, so the two never shift the row. */
  .fi-remove,
  .fi-corner {
    position: absolute;
    top: var(--space-3xs);
    right: var(--space-3xs);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
  }
  .fi-remove {
    padding: 0;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: var(--step-n1);
    line-height: 1;
    cursor: pointer;
    transition:
      color 0.15s ease,
      transform 0.1s ease;
  }
  .fi-remove:hover {
    color: var(--text-muted);
  }
  .fi-remove:active {
    transform: scale(0.85);
  }
</style>
