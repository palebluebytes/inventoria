<script lang="ts">
  import type { NutritionBreakdown } from "../../food/nutrition";
  import {
    buildNutrientPills,
    buildNutrientBreakdown,
  } from "../../food/nutrient-display";
  import {
    visibleNutrients,
    calorieDisplayDecimals,
  } from "../../stores/device-settings";
  import NutrientBreakdown from "./NutrientBreakdown.svelte";
  import EstMark from "./EstMark.svelte";

  // How a set of derived nutrition figures is shown, wherever they come from —
  // a food scaled to an amount, a recipe divided by its yield. Two parts, one
  // rule: a 2-column grid of thin-framed rows reading label → value on one line
  // ("Energy   634 kcal"), and the rest of the panel behind the collapsed full-
  // nutrition disclosure.
  //
  // The split between the two is the whole point, so it lives here rather than
  // in each caller: the grid shows Calories plus every TRACKED nutrient
  // (`visible_nutrients`) the figures have a real amount of — hideEmpty drops
  // both absent nutrients (no data) and declared zeros — and the disclosure
  // carries what is present but NOT already in the grid, so nothing is ever
  // shown twice and nothing a food actually carries is lost.
  let {
    breakdown,
    estimated = undefined,
    testid = "nutrient-breakdown",
  }: {
    /** The figures to show, already scaled/derived by the caller. */
    breakdown: NutritionBreakdown;
    /**
     * The keys a **Pack pairing**'s reference food supplied rather than the
     * manufacturer (ADR-0113 §5). Each such figure wears an `est` mark and a
     * lighter weight, on both halves of the split above — the grid and the
     * disclosure are one panel, so a borrowed nutrient the user happens to track
     * may not shed its mark by being promoted into the grid.
     *
     * Omitted everywhere a figure cannot have been borrowed, which today is
     * every surface but a paired pack's own panel. The recipe editor's live
     * per-serving figures are the one worth naming: `deriveRecipeNutrition`
     * reads each ingredient twin's stored `nutrition/info`, which is strictly
     * the label (§7), so no figure in that sum is borrowed and none is owed a
     * mark. A dish's rows start borrowing when the occasion freezes them, which
     * is #521's.
     */
    estimated?: ReadonlySet<string>;
    /** Test id for the disclosure, so a surface keeps its own selector. */
    testid?: string;
  } = $props();

  let pills = $derived(
    buildNutrientPills(
      breakdown,
      $visibleNutrients,
      $calorieDisplayDecimals,
      true,
      estimated
    )
  );
  let pillKeys = $derived(new Set(pills.map((p) => p.key)));
  let fullRows = $derived(
    buildNutrientBreakdown(
      breakdown,
      $calorieDisplayDecimals,
      true,
      pillKeys,
      estimated
    )
  );
</script>

<div class="nutrients">
  {#each pills as pill (pill.key)}
    <div class="n nutrient-{pill.key}">
      <span title={pill.label}>{pill.label}</span><strong class:est={pill.est}
        >{pill.value}{#if pill.est}<EstMark />{/if}</strong
      >
    </div>
  {/each}
</div>
<div class="full-panel">
  <NutrientBreakdown rows={fullRows} {testid} />
</div>

<style>
  /* Two-column grid: each cell a thin-framed row, label left, value right. */
  .nutrients {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3xs);
  }
  .n {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2xs);
    border: var(--edge-thin);
    padding: var(--space-3xs) var(--space-2xs);
    font-size: var(--step-n1);
  }
  /* A value is one token — "437 kcal" breaking after the number left a two-line
     cell in a grid of one-line ones, and the whole row grew with it. So the
     value never wraps and the label gives way instead: it shrinks, and at the
     extreme ellipsises (its full text stays in the `title`). A clipped
     "Saturat…" still reads; a wrapped value breaks the layout. This is the same
     rule the full-nutrition rows already keep. */
  .n span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .n strong {
    flex: 0 0 auto;
    white-space: nowrap;
    font-weight: 700;
  }
  /* The same mark the full-nutrition rows carry, at the same weights: the grid
     and the disclosure are one panel split by what the user tracks, so a
     borrowed figure may not read differently depending on which half it landed
     in (ADR-0113 §5). */
  .n strong.est {
    font-weight: 400;
  }
  .full-panel {
    margin-top: var(--space-s);
  }
</style>
