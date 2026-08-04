<script lang="ts">
  import type { NutrientRow } from "../../food/nutrient-display";

  // A read-only, collapsed-by-default disclosure of a food's *full* nutrition
  // panel (ticket #30, parent #21): every macro and micronutrient it carries,
  // scaled to the amount in view, one labelled value per row. Presentational —
  // the caller builds `rows` via buildNutrientBreakdown(scaleNutrition(panel,
  // factor)), so absent fields are already omitted and micronutrients already
  // reformatted to mg/µg; this only lays them out behind a <summary> so the
  // default card/pills stay uncluttered. Rendered only when the food carries
  // something beyond the always-on calories row.
  let {
    rows,
    label = "Full nutrition",
    testid = "nutrient-breakdown",
  }: { rows: NutrientRow[]; label?: string; testid?: string } = $props();
</script>

{#if rows.length > 1}
  <details class="breakdown" data-testid={testid}>
    <summary>{label}</summary>
    <dl class="rows">
      {#each rows as row (row.key)}
        <div class="row nutrient-{row.key}">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      {/each}
    </dl>
  </details>
{/if}

<style>
  .breakdown {
    border: 1px solid var(--border, var(--ink));
    background: var(--food-surface-bg, var(--paper));
  }
  summary {
    cursor: pointer;
    padding: var(--space-2xs) var(--space-xs);
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    list-style-position: inside;
  }
  .rows {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border, var(--ink));
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-s);
    padding: var(--space-3xs) var(--space-xs);
  }
  .row + .row {
    border-top: 1px solid var(--border-subtle, #e4e4e7);
  }
  dt {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  dd {
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
  }
</style>
