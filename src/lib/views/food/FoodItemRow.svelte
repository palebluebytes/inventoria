<script lang="ts">
  import type { Snippet } from "svelte";
  import { unitLabel } from "../../food/recipe-ingredient";
  import { round2 } from "../../food/nutrition";

  // One food line, shared by the dashboard's logged-food list and the
  // recipe/instantiation ingredient list so the two read identically — modelled
  // on the dashboard card: name over a muted quantity subtitle, the kcal on the
  // right, a corner remove. Tapping the row opens the amount picker (via
  // `onclick`); the dashboard instead lets its own wrapper handle the tap, so it
  // passes no `onclick` here. `lead` slots a photo thumb or selection check
  // ahead of the name without this component knowing about either.
  let {
    name,
    amount,
    unit,
    calories,
    onRemove,
    onclick,
    lead,
    selected = false,
    class: extraClass = "",
  }: {
    name: string;
    amount: number;
    unit: "g" | "serving";
    calories: number;
    onRemove?: () => void;
    /** Whole-row tap (opens the amount picker). Omit to make the row inert —
     *  the dashboard's wrapper owns the tap; a locked serving row passes none. */
    onclick?: () => void;
    lead?: Snippet;
    /** Dashboard selection highlight; ignored by the recipe list. */
    selected?: boolean;
    class?: string;
  } = $props();

  // Match the dashboard's quantity string: "363g" for a scaled food (no space),
  // "1 serving" for a whole-serving one. The label itself comes from unitLabel.
  let qtyLabel = $derived(
    `${amount}${unit === "g" ? "" : " "}${unitLabel(amount, unit)}`
  );
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
  <span class="fi-cals">{round2(calories)} kcal</span>
  {#if onRemove}
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
    background: #fff;
    border: 1px solid #000;
    padding: var(--space-s);
  }
  .food-item.clickable {
    cursor: pointer;
    -webkit-user-select: none;
    user-select: none;
    touch-action: manipulation;
  }
  .food-item.selected {
    background: #ffffe0;
    box-shadow: 4px 4px 0 #000;
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
  /* Borderless ✕ tucked into the row's top-right corner. */
  .fi-remove {
    position: absolute;
    top: var(--space-3xs);
    right: var(--space-3xs);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
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
