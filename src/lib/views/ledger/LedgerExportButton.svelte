<script lang="ts">
  // The Ledger's way out, as one control (ADR-0064).
  //
  // One screen offers it and does not own it: the Database Ledger section in
  // Settings. A Meal send's failure surface offered it too until ADR-0072's
  // 2026-09-01 amendment (#300) withdrew that inline export. Sharing the
  // control rather than the intention is what makes "it produces the same file
  // `Settings → Export Ledger` does" a fact, and that stays worth having.
  //
  // It owns the ledger read as well as the click, because the two are one
  // thing: the count goes into the export envelope and it has to be taken
  // BEFORE the click, since the save dialog needs the user gesture that click
  // carries and an awaited read in front of it would spend that gesture. A
  // screen that wants the figure for itself takes it back through `onSummary`.
  //
  // What is written is `db/ledger-export.ts`'s and how a run ends is
  // `export-run.ts`'s. This is the button, what it says while it is not ready,
  // the count while it walks, and the sentence afterwards.
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import { dbClient } from "../../db/db.client";
  import type { LedgerSummary } from "../../db/db.core";
  import {
    EXPORT_FALLBACK_CEILING_BYTES,
    type LedgerExportScope,
  } from "../../db/ledger-export";
  import { describeBytes } from "../../storage/describe-bytes";
  import { canStreamToFile, chooseExportTarget } from "./export-target";
  import { runLedgerExport, type LedgerExportOutcome } from "./export-run";

  let {
    /** Whether the worker is up, so the ledger can be read. */
    ready = true,
    id = undefined,
    size = "md",
    /** For a screen that prints the count itself. Called on every fresh read. */
    onSummary,
    /**
     * One Facet's rows instead of the whole ledger (ADR-0079 §6). It narrows
     * the count, the walk and the filename together, so the figure the button
     * shows, the figure the envelope carries and the rows in the file are one
     * predicate applied three times rather than three that can disagree.
     *
     * The file is the same artifact in the same grammar, so the ordinary Import
     * restores it — which is what makes this a safety control beside a delete
     * and not a keepsake.
     */
    scope,
    /** What the button says. A scoped export is not "the Ledger". */
    label = "Export Ledger",
  }: {
    ready?: boolean;
    id?: string;
    size?: "sm" | "md";
    onSummary?: (summary: LedgerSummary) => void;
    scope?: LedgerExportScope;
    label?: string;
  } = $props();

  let summary = $state<LedgerSummary | null>(null);
  let unreadable = $state(false);
  let running = $state(false);
  let rowsWritten = $state(0);
  /** Every outcome the screen has something to say about, which is all but one. */
  type ReportedOutcome = Exclude<LedgerExportOutcome, { kind: "dismissed" }>;
  let outcome = $state<ReportedOutcome | null>(null);

  $effect(() => {
    if (ready) readSummary();
  });

  function readSummary() {
    dbClient
      .ledgerSummary(scope?.entity_prefixes)
      .then((read) => {
        summary = read;
        unreadable = false;
        onSummary?.(read);
      })
      .catch((err) => {
        // A count nobody could read is a button that would be dead with no
        // explanation, so the state is kept and said rather than swallowed.
        unreadable = true;
        console.error("Failed to read the ledger summary", err);
      });
  }

  // Said before the export rather than discovered during it: the ceiling is
  // enforced on the bytes actually written, and a save dialog is a poor place
  // to find out there is one. It travels with the button so that every screen
  // offering the export warns about it, rather than the one that remembered to.
  let capLine = $derived(
    canStreamToFile()
      ? ""
      : `This browser cannot write a file as it goes, so the export is assembled in memory and stops at ${describeBytes(EXPORT_FALLBACK_CEILING_BYTES)}.`
  );

  // Why the button is closed, when it is. Silent once there is a ledger to
  // export, because a control that works needs no caption.
  let holdLine = $derived(
    summary
      ? ""
      : unreadable
        ? "The ledger could not be read, so there is nothing to export yet."
        : "Reading the ledger."
  );

  async function runExport() {
    if (!summary) return;
    running = true;
    outcome = null;
    rowsWritten = 0;
    try {
      // `chooseExportTarget` opens the save dialog and is reached from this
      // click with nothing awaited in front of it.
      const ended = await runLedgerExport({
        summary,
        exported_at: Date.now(),
        scope,
        readPage: (after, budgetBytes) =>
          dbClient.ledgerPage(after, budgetBytes, scope?.entity_prefixes),
        chooseTarget: chooseExportTarget,
        onProgress: (written) => (rowsWritten = written),
      });
      if (ended.kind === "failed") {
        console.error("Ledger export failed", ended.error);
      }
      // Dismissing the save dialog is an answer, not an ending, so the screen
      // goes back to how it was rather than reporting the user to themselves.
      outcome = ended.kind === "dismissed" ? null : ended;
      // The count that went into the envelope was read before the click, so a
      // finished export is the moment to take it again.
      if (ended.kind === "written") readSummary();
    } finally {
      running = false;
    }
  }
</script>

{#if capLine}
  <p class="figure">{capLine}</p>
{/if}

<div class="actions-row">
  <Button
    {id}
    {size}
    variant="secondary"
    onclick={runExport}
    disabled={!summary || running}
    loading={running}
  >
    {label}
  </Button>
  {#if running}
    <span class="progress">{rowsWritten.toLocaleString()} datoms written</span>
  {:else if holdLine}
    <span class="hold">{holdLine}</span>
  {/if}
</div>

{#if outcome}
  <div class="result">
    <Alert
      variant={outcome.kind === "written"
        ? "success"
        : outcome.kind === "refused"
          ? "warning"
          : "error"}>{outcome.message}</Alert
    >
  </div>
{/if}

<style>
  .figure {
    margin: var(--space-2xs) 0 0;
    font-size: var(--step-n2);
    font-style: italic;
    color: var(--text-secondary);
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
  .hold {
    font-size: var(--step-n2);
    font-style: italic;
    color: var(--text-muted);
  }
  .result {
    margin-top: var(--space-s);
  }
</style>
