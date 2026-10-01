<script lang="ts">
  import NutrientCard from "./NutrientCard.svelte";
  import Meter from "../../ui/Meter.svelte";
  import type { DayRdaRow } from "../../food/nutrient-display";

  // The cell a {@link NutritionPanel} tiles into a NutrientCardGrid: a figure
  // above a fill bar, over-target tinted amber, an absent nutrient dimmed.
  //
  // `showTarget` is the whole difference between the two panels that render it.
  // The day panel asks "how far through your day are you", so the figure is
  // `value / target` over a bar. One meal has no target of its own — a bar
  // filling toward a DAILY figure would read as a meal falling short of a day,
  // which is not a shortfall — so that panel shows what the meal contains and
  // nothing else.
  //
  // `row.overPct` rides the muted target span when the row carries it, which is
  // only ever a breached cap (#506). The bar clamps at 100, so the percentage is
  // the only thing distinguishing a day just over from one four times over. It
  // stays muted deliberately: the amber on the value has already done the
  // attention-getting, and a second amber element would double the alarm without
  // adding information (the ADR-0041 Amendment's trade, in this same meter).
  let { row, showTarget = true }: { row: DayRdaRow; showTarget?: boolean } =
    $props();
</script>

<NutrientCard label={row.label} rowKey={row.key}>
  {#snippet children()}
    {#if showTarget}
      <span class="rda-cell-vt" class:over={row.over} class:absent={row.absent}
        >{row.value}
        <span class="rda-cell-target"
          >/ {row.target}{row.overPct === undefined
            ? ""
            : ` · ${row.overPct}%`}</span
        ></span
      >
      <Meter
        fill={row.fill}
        over={row.over}
        valueText={row.overPct === undefined
          ? `${row.value} of ${row.target}`
          : `${row.value} of ${row.target}, ${row.overPct}% of the limit`}
      />
    {:else}
      <span class="rda-cell-vt" class:absent={row.absent}>{row.value}</span>
    {/if}
  {/snippet}
</NutrientCard>

<style>
  .rda-cell-vt {
    font-size: var(--step-n1);
    font-weight: 800;
    color: var(--text-primary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .rda-cell-vt.over {
    color: var(--rda-over);
  }
  .rda-cell-vt.absent {
    color: var(--text-muted);
  }
  .rda-cell-target {
    font-size: var(--step-n3);
    font-weight: 500;
    color: var(--text-muted);
  }
</style>
