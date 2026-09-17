<script lang="ts">
  import type { Annotation } from "./annotate";

  // THROWAWAY (#244) — variant A: the panel splits into two columns.
  //
  // One column is what the pack printed, one is what the reference food says.
  // Every nutrient is one row across both, so the seam is vertical and constant
  // rather than a mark you have to notice per row.
  //
  // It is the ONLY variant that draws a CONTESTED row — a nutrient both sources
  // carry. #240 rules that the label wins and the reference's figure is hidden;
  // here it is shown, struck through, with the reference's name above it. That
  // is deliberate rule-breaking: #244 asks whether the silence reads as honest
  // or as suspicious, and that cannot be judged against silence alone. On the
  // maple syrup the label prints sodium 0 and the reference reports 12 mg.
  let { annotation }: { annotation: Annotation } = $props();

  let groups = $derived([
    { head: "Energy & macros", rows: annotation.macros },
    { head: "Vitamins & minerals", rows: annotation.micros },
    { head: "Limits", rows: annotation.limits },
  ]);
</script>

<div class="cols">
  <div class="head">
    <span class="head-label"></span>
    <span class="head-src measured">The pack</span>
    <span class="head-src estimated"
      >{annotation.food.reference.description}</span
    >
  </div>

  {#each groups as group (group.head)}
    {#if group.rows.length > 0}
      <div class="group">{group.head}</div>
      {#each group.rows as row (row.key)}
        <div class="row" data-provenance={row.provenance}>
          <span class="label">{row.label}</span>
          <span class="cell measured">
            {row.provenance === "estimated" ? "—" : row.shown}
          </span>
          <span class="cell estimated">
            {#if row.provenance === "contested"}
              <s>{row.reference}</s>
            {:else if row.provenance === "estimated"}
              {row.shown}
              {#if row.dayPercent !== null}
                <em>{row.dayPercent}%</em>
              {/if}
            {:else}
              —
            {/if}
          </span>
        </div>
      {/each}
    {/if}
  {/each}

  <p class="foot">
    Struck figures are the reference food's where your label already prints one.
    They are a measurement of {annotation.food.reference.description.toLowerCase()},
    not of your pack.
  </p>
</div>

<style>
  .cols {
    border: var(--edge-thin);
    background: var(--paper);
  }
  .head,
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5.5rem 6.5rem;
    gap: var(--space-2xs);
    align-items: baseline;
    padding: var(--space-3xs) var(--space-2xs);
  }
  .head {
    border-bottom: var(--edge-thin);
    align-items: end;
  }
  .head-src {
    font-size: var(--step-n3);
    font-weight: 700;
    text-transform: uppercase;
    line-height: 1.15;
    text-align: right;
  }
  .head-src.estimated {
    color: var(--text-secondary);
  }
  .group {
    padding: var(--space-3xs) var(--space-2xs);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    background: var(--bg-input);
    font-size: var(--step-n3);
    font-weight: 700;
    text-transform: uppercase;
  }
  .row + .row {
    border-top: 1px solid var(--border-subtle, var(--border));
  }
  .label {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell {
    font-size: var(--step-n2);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .cell.measured {
    font-weight: 700;
    color: var(--text-primary);
  }
  /* The whole seam: the reference column is set in the mono face and stays
     lighter than the pack's, on every row, whatever the row is doing. */
  .cell.estimated {
    font-family: var(--font-mono);
    color: var(--text-secondary);
  }
  .cell.estimated em {
    font-style: normal;
    font-size: var(--step-n4);
    color: var(--text-muted);
    margin-left: 0.25em;
  }
  .cell s {
    color: var(--text-muted);
  }
  .foot {
    margin: 0;
    padding: var(--space-2xs);
    border-top: var(--edge-thin);
    font-size: var(--step-n3);
    color: var(--text-secondary);
  }
</style>
