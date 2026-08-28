<script lang="ts">
  // The ledger's way out, inside the Database Ledger section that already holds
  // the raw view and the wipe (ADR-0064). The size is on screen before anything
  // is written, because this file often runs to hundreds of megabytes and a
  // save dialog is a poor place to find that out.
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import { dbClient } from "../../db/db.client";
  import type { LedgerManifest } from "../../db/db.core";
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
  } from "../../db/ledger-export-target";

  let { dbReady }: { dbReady: boolean } = $props();

  let manifest = $state<LedgerManifest | null>(null);
  let estimate_bytes = $state<number | null>(null);
  let outcome = $state<"idle" | "running" | "done" | "refused" | "failed">(
    "idle"
  );
  let message = $state("");
  let rows_written = $state(0);

  // Read once the worker is up. Both are snapshots rather than stores: the
  // figures describe the moment before an export, and nothing here should churn
  // as the ledger grows underneath it.
  $effect(() => {
    if (!dbReady) return;
    dbClient
      .ledgerManifest()
      .then((read) => (manifest = read))
      .catch((err) => console.error("Failed to read the ledger manifest", err));
    estimateStoredBytes().then((bytes) => (estimate_bytes = bytes));
  });

  let size_line = $derived.by(() => {
    if (!manifest) return "Reading the ledger.";
    const datoms = `${manifest.row_count.toLocaleString()} datoms, superseded facts included`;
    if (estimate_bytes === null) {
      return `${datoms}. This browser will not estimate the size.`;
    }
    return `${datoms}. This site is using about ${describeBytes(estimate_bytes)} of storage in total, which is the ledger plus everything else cached for it.`;
  });

  async function runExport() {
    if (!manifest) return;
    outcome = "running";
    message = "";
    rows_written = 0;
    const exported_at = Date.now();

    try {
      // Refuse before the save dialog where the estimate already says the
      // in-memory fallback cannot hold it, rather than after buffering most of
      // a file. The sink enforces the same ceiling for the case where no
      // estimate was available.
      if (
        !canStreamToFile() &&
        estimate_bytes !== null &&
        estimate_bytes > EXPORT_FALLBACK_CEILING_BYTES
      ) {
        throw new ExportTooLargeError(
          estimate_bytes,
          EXPORT_FALLBACK_CEILING_BYTES
        );
      }

      const target = await chooseExportTarget(
        exportFilename(exported_at),
        EXPORT_FALLBACK_CEILING_BYTES
      );
      // The user dismissed the save dialog. Not a failure, so nothing is said.
      if (!target) {
        outcome = "idle";
        return;
      }

      const result = await writeLedgerExport(
        (after, budget_bytes) => dbClient.ledgerPage(after, budget_bytes),
        target.sink,
        {
          manifest,
          exported_at,
          onProgress: (written) => (rows_written = written),
        }
      );

      outcome = "done";
      message =
        result.rows_written === result.envelope.row_count
          ? `Wrote ${result.rows_written.toLocaleString()} datoms to ${exportFilename(exported_at)}.`
          : `Wrote ${result.rows_written.toLocaleString()} datoms, but the file says ${result.envelope.row_count.toLocaleString()}. The ledger was appended to while it was being written, so export again for a file whose header matches it.`;
      manifest = await dbClient.ledgerManifest();
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
  <p class="figure">{size_line}</p>

  <div class="actions-row">
    <Button
      id="export-ledger-btn"
      variant="secondary"
      onclick={runExport}
      disabled={!dbReady || !manifest || outcome === "running"}
      loading={outcome === "running"}
    >
      Export Ledger
    </Button>
    {#if outcome === "running"}
      <span class="progress"
        >{rows_written.toLocaleString()} datoms written</span
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
