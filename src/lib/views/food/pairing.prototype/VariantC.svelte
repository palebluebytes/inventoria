<script lang="ts">
  import type { Annotation } from "./annotate";

  // THROWAWAY (#244) — variant C: one list, marked.
  //
  // One panel, one list, in the app's existing single-column breakdown shape
  // (`NutrientBreakdown`). A reference-supplied row sits in normal nutrient
  // order beside a measured one and is told apart only by a MARK. Nothing is
  // segregated, nothing is framed off, and a contested row is simply absent —
  // #240's silence, in the most compact form the question has.
  //
  // This is the variant that stakes everything on a mark being enough, which is
  // exactly what ADR-0041's 2026-08-06 amendment decided was NOT enough and
  // removed: the "est" tag came off the NOVA badge because the owner preferred
  // a calmer surface, and the honesty moved one tap deeper into an explainer.
  // C reopens that call on a surface where the stakes are numbers rather than a
  // word, so the two can be compared rather than inherited.
  let { annotation }: { annotation: Annotation } = $props();

  // Every row, in panel order. A contested row is in here too, carrying the
  // LABEL's figure and no mark — which is what #240's rule means on this
  // variant: the reference's disagreeing number is not hidden in a fold, it
  // simply never existed as far as this list is concerned.
  let rows = $derived([
    ...annotation.macros,
    ...annotation.micros,
    ...annotation.limits,
  ]);
</script>

<div class="list">
  <p class="head">
    Full nutrition · <b>est</b> rows from
    <span class="ref">{annotation.food.reference.description}</span>
  </p>
  <dl>
    {#each rows as row (row.key)}
      <div class="row" data-provenance={row.provenance}>
        <dt>
          {row.label}
          {#if row.provenance === "estimated"}<span class="mark">est</span>{/if}
        </dt>
        <dd>{row.shown}</dd>
      </div>
    {/each}
  </dl>
</div>

<style>
  .list {
    border: var(--edge-thin);
    background: var(--paper);
    margin-top: var(--space-m);
  }
  .head {
    margin: 0;
    padding: var(--space-2xs) var(--space-xs);
    border-bottom: var(--edge-thin);
    font-size: var(--step-n3);
    text-transform: uppercase;
    font-weight: 700;
    color: var(--text-secondary);
  }
  .head .ref {
    text-transform: none;
    font-weight: 400;
  }
  .head b {
    font-family: var(--font-mono);
    background: var(--highlight-bg);
    padding: 0 0.25em;
  }
  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-s);
    padding: var(--space-3xs) var(--space-xs);
  }
  .row + .row {
    border-top: 1px solid var(--border-subtle, var(--border));
  }
  dt {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  dd {
    margin: 0;
    font-size: var(--step-n2);
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  /* The whole seam, and the whole question: one small mark, in-line. */
  .mark {
    display: inline-block;
    margin-left: 0.4em;
    padding: 0 0.3em;
    font-family: var(--font-mono);
    font-size: var(--step-n4);
    font-weight: 700;
    text-transform: uppercase;
    background: var(--highlight-bg);
    color: var(--text-primary);
  }
  [data-provenance="estimated"] dd {
    font-weight: 500;
    color: var(--text-secondary);
  }
</style>
