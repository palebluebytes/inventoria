<script lang="ts">
  import type { FoodResult } from "../../food/food-search";
  import { roundFoodDisplay } from "../../food/nutrition";
  import { nutritionDisplayDecimals } from "../../stores/settings.store";

  let {
    results,
    heading,
    onSelect,
  }: {
    results: FoodResult[];
    heading?: string;
    onSelect: (item: FoodResult) => void;
  } = $props();
</script>

{#if results.length > 0}
  <div class="results-container mt-4">
    {#if heading}<h3>{heading}</h3>{/if}
    <ul class="results-list">
      {#each results as item}
        <li>
          <button class="result-item-btn" onclick={() => onSelect(item)}>
            <div class="result-details">
              <span class="result-name">{item.name}</span>
              <span class="result-macros">
                Per 100g: {roundFoodDisplay(
                  item.calories,
                  $nutritionDisplayDecimals
                )} kcal | P: {roundFoodDisplay(
                  item.protein,
                  $nutritionDisplayDecimals
                )}g | F: {roundFoodDisplay(
                  item.fat,
                  $nutritionDisplayDecimals
                )}g | C: {roundFoodDisplay(
                  item.carbs,
                  $nutritionDisplayDecimals
                )}g
              </span>
            </div>
            <span class="select-arrow">&rarr;</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .results-container h3 {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--space-xs);
  }
  .results-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    /* No own height cap / scroll: the enclosing sheet body (.stage) already
       scrolls. A local max-height here nested a second scroll area that clipped
       the list to ~3 rows while the sheet sat mostly empty. */
  }
  .result-item-btn {
    width: 100%;
    background: var(--food-surface-bg, #fff);
    border: var(--food-surface-border, 1px solid #000);
    border-radius: var(--food-item-radius, 0);
    padding: var(--space-xs) var(--space-s);
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: background 0.2s;
  }
  .result-item-btn:hover {
    background: var(--food-surface-hover, #f4f4f5);
  }
  .result-details {
    display: flex;
    flex-direction: column;
  }
  .result-name {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-primary);
  }
  .result-macros {
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin-top: 2px;
  }
  .select-arrow {
    color: var(--text-muted);
    font-size: var(--step-0);
  }
</style>
