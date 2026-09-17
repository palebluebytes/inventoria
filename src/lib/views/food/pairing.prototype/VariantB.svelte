<script lang="ts">
  import { estimatedRows, type Annotation } from "./annotate";

  // THROWAWAY (#244) — variant B: a block below the rule.
  //
  // #240's rule drawn literally. The shipped panel above this is untouched,
  // byte for byte: the pack is still the food, and nothing has been mixed into
  // it. Underneath, a separate bordered block with its own head naming the
  // reference food, holding ONLY the rows the label is silent on. A nutrient
  // both sources carry does not appear here at all — that is the silence #244
  // asks about, and B is where you read it as a reader would.
  //
  // The block carries the seam in three places at once: its own frame, its own
  // head naming a different food, and the mono face on every figure in it.
  let { annotation }: { annotation: Annotation } = $props();

  let rows = $derived(estimatedRows(annotation));
</script>

{#if rows.length > 0}
  <section class="band" aria-label="Estimated from a reference food">
    <header>
      <span class="kicker">Estimated · not on your label</span>
      <h3>{annotation.food.reference.description}</h3>
      <p class="prov">
        USDA {annotation.food.reference.dataType} · fdc:{annotation.food
          .reference.fdcId} · paired by you
        <button type="button" class="change">change</button>
      </p>
    </header>
    <dl>
      {#each rows as row (row.key)}
        <div class="row" class:limit={row.isLimit}>
          <dt>{row.label}</dt>
          <dd>
            {row.shown}
            {#if row.dayPercent !== null}
              <em>{row.dayPercent}% of a day</em>
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
  </section>
{/if}

<style>
  /* Not a Card (ADR-0040): a Card is a surface for a thing of the app's own,
     and this block is a quotation from somewhere else. The dashed frame is the
     one thing here that is not in the shipped vocabulary, and it is the point —
     ADR-0041's amendment took the dashed edge OFF the NOVA badge, so reaching
     for it again is a live question rather than a reuse. */
  .band {
    margin-top: var(--space-m);
    border: 1px dashed var(--ink);
    background: var(--paper);
  }
  header {
    padding: var(--space-2xs) var(--space-xs);
    border-bottom: 1px dashed var(--ink);
  }
  .kicker {
    display: block;
    font-size: var(--step-n3);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  h3 {
    margin: var(--space-3xs) 0 0;
    font-size: var(--step-n1);
    font-weight: 700;
    line-height: 1.2;
  }
  .prov {
    margin: var(--space-3xs) 0 0;
    font-size: var(--step-n3);
    color: var(--text-muted);
    font-family: var(--font-mono);
  }
  .change {
    border: 0;
    background: none;
    padding: 0 0 0 0.35em;
    font: inherit;
    color: var(--text-primary);
    text-decoration: underline;
    cursor: pointer;
    /* Declared so the tap-floor spec has nothing to say about prototype chrome. */
    min-height: var(--tap-min);
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
    border-top: 1px solid var(--border);
  }
  /* A stay-under limit filled from a reference food is the sharp edge of
     "fills silence only": the beans' jar prints no sodium, and the reference
     food is an unsalted dried pulse. Marked, so it can be argued about. */
  .row.limit dt::after {
    content: " · limit";
    color: var(--rda-over);
    font-weight: 700;
  }
  dt {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
  dd {
    margin: 0;
    font-size: var(--step-n2);
    font-weight: 700;
    font-family: var(--font-mono);
    white-space: nowrap;
  }
  dd em {
    font-style: normal;
    font-weight: 400;
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin-left: 0.4em;
  }
</style>
