<script lang="ts">
  import { roundFoodDisplay } from "../../food/nutrition";
  import Card from "../../ui/Card.svelte";

  // The dashboard's three macro meters (protein / fat / carbs): a labelled row
  // with a fill bar clamped to its target. Presentational — the caller supplies
  // each running total and its goal.
  let {
    protein,
    fat,
    carbs,
    targetProtein,
    targetFat,
    targetCarbs,
  }: {
    protein: number;
    fat: number;
    carbs: number;
    targetProtein: number;
    targetFat: number;
    targetCarbs: number;
  } = $props();

  // One meter's descriptor, so the markup can loop instead of repeating thrice.
  let meters = $derived([
    { key: "protein", name: "Protein", value: protein, target: targetProtein },
    { key: "fat", name: "Fat", value: fat, target: targetFat },
    { key: "carbs", name: "Carbs", value: carbs, target: targetCarbs },
  ]);
</script>

<div class="macros-subgrid">
  {#each meters as meter}
    <Card class="macro-item {meter.key}">
      <div class="macro-meta">
        <span class="macro-name">{meter.name}</span>
        <span class="macro-val"
          >{roundFoodDisplay(meter.value)}g
          <span class="macro-target">/ {meter.target}g</span></span
        >
      </div>
      <div class="progress-bar-bg">
        <div
          class="progress-bar-fill"
          style="width: {Math.min((meter.value / meter.target) * 100, 100)}%"
        ></div>
      </div>
    </Card>
  {/each}
</div>

<style>
  .macros-subgrid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  :global(.macro-item) {
    padding: var(--space-xs) var(--space-m) !important;
    background: rgba(255, 255, 255, 0.01) !important;
  }
  .macro-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-2xs);
  }
  .macro-name {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .macro-val {
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-primary);
  }
  .macro-target {
    font-size: var(--step-n3);
    color: var(--text-muted);
    font-weight: 400;
  }

  .progress-bar-bg {
    width: 100%;
    height: 6px;
    background: #e4e4e7;
    border-radius: 0;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    border-radius: 0;
    transition: width 0.35s ease-out;
  }

  :global(.macro-item.protein) .progress-bar-fill {
    background: #000;
  }
  :global(.macro-item.fat) .progress-bar-fill {
    background: #000;
  }
  :global(.macro-item.carbs) .progress-bar-fill {
    background: #000;
  }
</style>
