<script lang="ts">
  import type { NutrientMeter } from "../../food/nutrient-display";
  import Card from "../../ui/Card.svelte";
  import Meter from "../../ui/Meter.svelte";

  // The dashboard's nutrient meters: a labelled row per selected nutrient with a
  // fill bar clamped to its target. Presentational — the caller (via
  // buildNutrientMeters) supplies each meter's formatted value and, when the
  // nutrient has a configured target, its fill percent + formatted target. A
  // meter with no target renders as a plain total over a neutral (empty) track,
  // never a NaN bar.
  let { meters }: { meters: NutrientMeter[] } = $props();
</script>

<div class="macros-subgrid">
  {#each meters as meter (meter.key)}
    <Card class="macro-item {meter.key}">
      <div class="macro-meta">
        <span class="macro-name">{meter.label}</span>
        <span class="macro-val"
          >{meter.value}
          {#if meter.target}<span class="macro-target">/ {meter.target}</span
            >{/if}</span
        >
      </div>
      <Meter
        fill={meter.fill}
        valueText={meter.target
          ? `${meter.value} of ${meter.target}`
          : undefined}
      />
    </Card>
  {/each}
</div>

<style>
  .macros-subgrid {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    /* Tighter than a default card, and filled with the page ground it sits on
       rather than the card fill. Both inherit into the Cards below. */
    --card-padding: var(--space-xs) var(--space-m);
    --card-bg: var(--bg-base);
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
</style>
