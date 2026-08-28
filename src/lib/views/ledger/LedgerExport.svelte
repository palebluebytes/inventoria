<script lang="ts">
  // The ledger's way out, inside the Database Ledger section that already holds
  // the raw view and the wipe (ADR-0064). The size is on screen before anything
  // is written, because this file often runs to hundreds of megabytes and a
  // save dialog is a poor place to find that out.
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import { dbClient } from "../../db/db.client";
  import type { LedgerSummary } from "../../db/db.core";
  import {
    describeBytes,
    ExportTooLargeError,
    EXPORT_FALLBACK_CEILING_BYTES,
    writeLedgerExport,
  } from "../../db/ledger-export";
  import {
    canStreamToFile,
    chooseExportTarget,
    estimateStoredBytes,
    exportFilename,
  } from "./export-target";

  let { dbReady }: { dbReady: boolean } = $props();

  let summary = $state<LedgerSummary | null>(null);
  let estimateBytes = $state<number | null>(null);
  let outcome = $state<"idle" | "running" | "done" | "refused" | "failed">(
    "idle"
  );
  let message = $state("");
  let rowsWritten = $state(0);

  // Read once the worker is up. Both are snapshots rather than stores: the
  // figures describe the moment before an export, and nothing here should churn
  // as the ledger grows underneath it.
  $effect(() => {
    if (!dbReady) return;
    dbClient
      .ledgerSummary()
      .then((read) => (summary = read))
      .catch((err) => console.error("Failed to read the ledger summary", err));
    estimateStoredBytes().then((bytes) => (estimateBytes = bytes));
  });

  let sizeLine = $derived.by(() => {
    if (!summary) return "Reading the ledger.";
    const datoms = `${summary.row_count.toLocaleString()} datoms, superseded facts included`;
    if (estimateBytes === null) {
      return `${datoms}. This browser will not estimate the size.`;
    }
    return `${datoms}. This site is using about ${describeBytes(estimateBytes)} of storage in total, which is the ledger plus everything else cached for it.`;
  });

  // Said before the export rather than discovered during it. The estimate above
  // covers the whole origin, so it cannot decide whether this ledger fits; the
  // ceiling is enforced on the bytes actually written, and this line is what
  // warns that there is one.
  let capLine = $derived(
    canStreamToFile()
      ? ""
      : `This browser cannot write a file as it goes, so the export is assembled in memory and stops at ${describeBytes(EXPORT_FALLBACK_CEILING_BYTES)}.`
  );

  async function runExport() {
    if (!summary) return;
    outcome = "running";
    message = "";
    rowsWritten = 0;
    const exported_at = Date.now();

    try {
      const sink = await chooseExportTarget(
        exportFilename(exported_at),
        EXPORT_FALLBACK_CEILING_BYTES
      );
      // The user dismissed the save dialog. Not a failure, so nothing is said.
      if (!sink) {
        outcome = "idle";
        return;
      }

      const result = await writeLedgerExport(
        (after, budgetBytes) => dbClient.ledgerPage(after, budgetBytes),
        sink,
        {
          summary,
          exported_at,
          onProgress: (written) => (rowsWritten = written),
        }
      );

      outcome = "done";
      message =
        result.rowsWritten === result.envelope.row_count
          ? `Wrote ${result.rowsWritten.toLocaleString()} datoms to ${exportFilename(exported_at)}.`
          : `Wrote ${result.rowsWritten.toLocaleString()} datoms, but the file says ${result.envelope.row_count.toLocaleString()}. The ledger was appended to while it was being written, so export again for a file whose header matches it.`;
      // The figure on screen was read before the write. Refresh it without
      // awaiting: the export has already succeeded, and a failed re-read must
      // not turn a written file into a reported failure.
      dbClient
        .ledgerSummary()
        .then((read) => (summary = read))
        .catch((err) =>
          console.error("Failed to re-read the ledger summary", err)
        );
    } catch (err) {
      if (err instanceof ExportTooLargeError) {
        outcome = "refused";
        message = err.message;
      } else {
        outcome = "failed";
        message = err instanceof Error ? err.message : String(err);
        console.error("Ledger export failed", err);
      }
    }
  }
</script>

<section class="ledger-export">
  <h3>Export</h3>
  <p class="lead">
    Every datom this device holds, written to a file you choose. One JSON object
    per line, the raw log rather than the current state, photos and all.
  </p>
  <p class="figure">{sizeLine}</p>
  {#if capLine}
    <p class="figure">{capLine}</p>
  {/if}

  <div class="actions-row">
    <Button
      id="export-ledger-btn"
      variant="secondary"
      onclick={runExport}
      disabled={!dbReady || !summary || outcome === "running"}
      loading={outcome === "running"}
    >
      Export Ledger
    </Button>
    {#if outcome === "running"}
      <span class="progress">{rowsWritten.toLocaleString()} datoms written</span
      >
    {/if}
  </div>

  {#if outcome === "done" || outcome === "refused" || outcome === "failed"}
    <div class="result">
      <Alert
        variant={outcome === "done"
          ? "success"
          : outcome === "refused"
            ? "warning"
            : "error"}>{message}</Alert
      >
    </div>
  {/if}
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
  .lead,
  .figure {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  .figure {
    font-size: var(--step-n2);
    font-style: italic;
  }
  .actions-row {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }
  .progress {
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .result {
    margin-top: var(--space-s);
  }
</style>
