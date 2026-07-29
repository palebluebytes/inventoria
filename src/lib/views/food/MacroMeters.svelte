<script lang="ts">
  import type { NutrientMeter } from "../../food/nutrient-display";
  import Card from "../../ui/Card.svelte";

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
      <div class="progress-bar-bg" class:no-target={meter.fill === undefined}>
        {#if meter.fill !== undefined}
          <div class="progress-bar-fill" style="width: {meter.fill}%"></div>
        {/if}
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
  /* A nutrient with no configured target: a flat neutral track (no fill), so it
     reads as "tracked, no goal" rather than an empty progress bar. */
  .progress-bar-bg.no-target {
    background: repeating-linear-gradient(
      45deg,
      #e4e4e7,
      #e4e4e7 4px,
      #f4f4f5 4px,
      #f4f4f5 8px
    );
  }
  .progress-bar-fill {
    height: 100%;
    border-radius: 0;
    background: #000;
    transition: width 0.35s ease-out;
  }
</style>
