<script lang="ts">
  // The ledger's way back in (ADR-0067), directly under the export it reads, in
  // the Database Ledger card that already holds the raw view and the wipe.
  //
  // It merges. Facts the file does not carry stay where they are, so importing
  // a week-old backup does not eat this week. Making the file the only truth is
  // Wipe Database and then this, which stays two deliberate steps.
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import { dbClient } from "../../db/db.client";
  import {
    importLedger,
    LedgerImportRefusedError,
    type LedgerImportPhase,
  } from "../../db/ledger-import";
  import { fileChunks, LEDGER_IMPORT_ACCEPT } from "./import-source";

  let { dbReady }: { dbReady: boolean } = $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  let outcome = $state<
    "idle" | "checking" | "importing" | "done" | "refused" | "failed"
  >("idle");
  let message = $state("");
  let rowsSeen = $state(0);
  // Read in the catch, where `outcome` has already been overwritten.
  let failedWhileWriting = false;

  let busy = $derived(outcome === "checking" || outcome === "importing");

  // The file is read twice, so the screen says which pass it is on. A
  // hundred-megabyte export takes long enough that a single unchanging spinner
  // would read as a hang.
  let progressLine = $derived(
    outcome === "checking"
      ? `Checking the file: ${rowsSeen.toLocaleString()} datoms read`
      : `Importing: ${rowsSeen.toLocaleString()} datoms read`
  );

  async function runImport(file: File) {
    outcome = "checking";
    message = "";
    rowsSeen = 0;
    failedWhileWriting = false;

    try {
      const result = await importLedger(
        fileChunks(file),
        (rows, final) => dbClient.ledgerImport(rows, final),
        {
          onProgress: (phase: LedgerImportPhase, seen: number) => {
            outcome = phase;
            failedWhileWriting = phase === "importing";
            rowsSeen = seen;
          },
        }
      );

      const shortfall =
        result.rowsRead === result.envelope.row_count
          ? ""
          : ` The file's header expected ${result.envelope.row_count.toLocaleString()} datoms and the file held ${result.rowsRead.toLocaleString()}, which happens when the ledger was written to while it was being exported.`;
      outcome = "done";
      message =
        `Added ${result.rowsAdded.toLocaleString()} datoms. ` +
        `${result.rowsAlreadyPresent.toLocaleString()} were already here and were left alone, and nothing this ledger already held was removed.` +
        `${shortfall} API keys and the search log are not in the file, so they are not restored.`;
    } catch (err) {
      if (err instanceof LedgerImportRefusedError) {
        outcome = "refused";
        message = `${err.message} Nothing was imported.`;
      } else {
        // Only the writing pass can leave anything behind, and it is the phase
        // the screen is on when it fails. The count is exact rather than an
        // estimate: a batch commits whole or rolls back, and the progress figure
        // moves only once a batch has committed. Saying it matters, because
        // running the same file again finishes the job without duplicating any
        // of the rows that did land.
        const written =
          failedWhileWriting && rowsSeen > 0
            ? ` ${rowsSeen.toLocaleString()} datoms had already been written and are in the ledger. Importing the same file again finishes it, and adds nothing that is already here.`
            : " Nothing was written.";
        outcome = "failed";
        message = `${err instanceof Error ? err.message : String(err)}${written}`;
        console.error("Ledger import failed", err);
      }
    }
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Cleared so picking the same file twice fires again, which is exactly what
    // someone does after a refusal they have since fixed.
    input.value = "";
    if (file) runImport(file);
  }
</script>

<section class="ledger-import">
  <h3>Import</h3>
  <p class="lead">
    A file exported from this app, merged into the ledger already on this
    device. Every datom in the file is added; nothing already here is removed or
    changed, so importing an old backup does not take away what has happened
    since. Importing the same file twice adds nothing the second time.
  </p>
  <p class="figure">
    To make the file the only truth, wipe the database first and then import.
    Those stay two deliberate steps.
  </p>
  <p class="figure">
    API credentials and the search log are not in an export, because they live
    outside the ledger. An import does not bring them back.
  </p>
  <p class="figure">
    The file is read twice, once to check every line and once to write it, so a
    damaged file is refused before anything is written. If the writing itself is
    interrupted, importing the same file again finishes it.
  </p>

  <div class="actions-row">
    <input
      type="file"
      accept={LEDGER_IMPORT_ACCEPT}
      class="hidden-file-input"
      bind:this={fileInput}
      onchange={handleFileChange}
    />
    <Button
      id="import-ledger-btn"
      variant="secondary"
      onclick={() => fileInput?.click()}
      disabled={!dbReady || busy}
      loading={busy}
    >
      Import Ledger
    </Button>
    {#if busy}
      <span class="progress">{progressLine}</span>
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
  .ledger-import {
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
  .hidden-file-input {
    display: none;
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
