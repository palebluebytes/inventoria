<script lang="ts">
  // The ledger's way out, inside the Database Ledger section that already holds
  // the raw view and the wipe (ADR-0064).
  //
  // The button is `LedgerExportButton`, and it carries the ledger read and the
  // ceiling warning with it. It is this screen's only caller: it was shared
  // with a Meal send's failure surface until ADR-0072's 2026-09-01 amendment
  // (#300) withdrew that inline export, and the separate file is kept because
  // the read and the warning are worth their own module either way.
  //
  // What is this section's is the count: the figure is on
  // screen before anything is written, because this file often runs to hundreds
  // of megabytes and a save dialog is a poor place to find that out.
  import type { LedgerSummary } from "../../db/db.core";
  import LedgerExportButton from "./LedgerExportButton.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // A snapshot rather than a store: the figure describes the moment before an
  // export, and nothing here should churn as the ledger grows underneath it.
  let summary = $state<LedgerSummary | null>(null);
</script>

<section class="ledger-export">
  <h3>Export</h3>
  <p class="lead">
    Every datom this device holds, written to a file you choose. One JSON object
    per line, the raw log rather than the current state, photos and all.
  </p>
  <!-- The count is the one figure that is about the ledger. How many bytes this
       origin holds is the Storage section's to report, because `estimate()`
       answers for the whole origin and this screen would be read as answering
       for the file it is about to write. -->
  {#if summary}
    <p class="figure">
      {summary.row_count.toLocaleString()} datoms, superseded facts included.
    </p>
  {/if}

  <LedgerExportButton
    id="export-ledger-btn"
    ready={dbReady}
    onSummary={(read) => (summary = read)}
  />
</section>

<style>
  .ledger-export {
    border-top: var(--edge);
    padding-top: var(--space-s);
    margin-top: var(--space-m);
  }
  h3 {
    font-size: var(--step-n1);
    font-weight: 800;
    text-transform: uppercase;
    color: var(--ink);
    margin: 0;
  }
  .lead {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  .figure {
    font-size: var(--step-n2);
    font-style: italic;
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
</style>
