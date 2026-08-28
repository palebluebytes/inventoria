<script lang="ts">
  import type { NutrientMeter } from "../../food/nutrient-display";
  import Card from "../../ui/Card.svelte";
  import Meter from "../../ui/Meter.svelte";
  import Skeleton from "../../ui/Skeleton.svelte";

  // The dashboard's nutrient meters: a labelled row per nutrient with a fill bar
  // clamped to its target. Presentational — the caller (via buildNutrientMeters)
  // supplies each meter's formatted value and, when the nutrient has a configured
  // target, its fill percent + formatted target. A meter with no target renders
  // as a plain total over a neutral (empty) track, never a NaN bar.
  //
  // Calories arrive as the leading meter like any other: the row draws whatever
  // the builder hands it, so nothing here knows kcal from grams.
  //
  // `loading` draws the same rows with their figures withheld. It lives here
  // rather than in the caller because this component owns the row's shape, and a
  // placeholder that does not match the shape it stands in for is just a jump
  // waiting to happen: same Card, same two-line layout, same bar height, so the
  // real values land exactly where the blanks were.
  let {
    meters,
    loading = false,
  }: { meters: NutrientMeter[]; loading?: boolean } = $props();
</script>

<div class="macros-subgrid">
  {#each meters as meter (meter.key)}
    <Card class="macro-item {meter.key}">
      {#if loading}
        <div class="macro-meta">
          <Skeleton height="var(--step-n1)" width="5.5rem" />
          <Skeleton height="var(--step-n1)" width="4.5rem" />
        </div>
        <Skeleton height="6px" />
      {:else}
        <div class="macro-meta">
          <span class="macro-name">{meter.label}</span>
          <span class="macro-val"
            ><span class="macro-now">{meter.value}</span>
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
      {/if}
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
