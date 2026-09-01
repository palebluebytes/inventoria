/**
 * One run of the Ledger export: the save dialog, the walk, and the sentence
 * that reports how it went (ADR-0064).
 *
 * It sits outside every screen that offers the export because there are now
 * two of them — the Database Ledger section in Settings, and the failure
 * surface of a Meal send that could not reach the Relay (ADR-0072 §14). "The
 * button produces the same file `Settings → Export Ledger` does" is a claim
 * about one piece of code rather than a promise about two, and this module is
 * that one piece.
 *
 * Both seams are injected — {@link LedgerPageReader} for where rows come from,
 * {@link ExportTargetChooser} for where the file goes — so the outcome and its
 * wording are testable without a Worker or a picker. What is *written* is
 * `db/ledger-export.ts`'s and stays there; this is only the run around it.
 */

import type { LedgerSummary } from "../../db/db.core";
import {
  ExportTooLargeError,
  EXPORT_FALLBACK_CEILING_BYTES,
  writeLedgerExport,
  type ExportSink,
  type LedgerPageReader,
} from "../../db/ledger-export";
import { exportFilename } from "./export-target";

/**
 * Opens somewhere to write, or answers `null` for a dialog the user dismissed.
 * `chooseExportTarget` is the one the app passes; a test passes its own.
 */
export type ExportTargetChooser = (
  filename: string,
  ceilingBytes: number
) => Promise<ExportSink | null>;

/**
 * How a run ended, in the words the screen prints.
 *
 * `dismissed` is deliberately not a failure and carries no message: cancelling
 * a save dialog is an answer, and a screen that said something about it would
 * be reporting the user's own decision back to them.
 */
export type LedgerExportOutcome =
  | { kind: "dismissed" }
  | { kind: "written"; message: string }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string; error: unknown };

export interface LedgerExportRun {
  /** The ledger as it was read *before* the click, which the envelope carries. */
  summary: LedgerSummary;
  /** Unix ms stamped into the envelope and into the filename. Never a clock read here. */
  exported_at: number;
  readPage: LedgerPageReader;
  chooseTarget: ExportTargetChooser;
  onProgress?: (rowsWritten: number) => void;
}

export async function runLedgerExport(
  run: LedgerExportRun
): Promise<LedgerExportOutcome> {
  const filename = exportFilename(run.exported_at);

  try {
    const sink = await run.chooseTarget(
      filename,
      EXPORT_FALLBACK_CEILING_BYTES
    );
    if (!sink) return { kind: "dismissed" };

    const result = await writeLedgerExport(run.readPage, sink, {
      summary: run.summary,
      exported_at: run.exported_at,
      onProgress: run.onProgress,
    });

    return {
      kind: "written",
      message:
        result.rowsWritten === result.envelope.row_count
          ? `Wrote ${result.rowsWritten.toLocaleString()} datoms to ${filename}.`
          : `Wrote ${result.rowsWritten.toLocaleString()} datoms, but the file says ${result.envelope.row_count.toLocaleString()}. The ledger was appended to while it was being written, so export again for a file whose header matches it.`,
    };
  } catch (error) {
    // The ceiling explains itself in two numbers (`ExportTooLargeError`), and
    // it is a refusal rather than a fault: nothing was written and nothing is
    // broken, so restating it here would only lose the numbers.
    if (error instanceof ExportTooLargeError) {
      return { kind: "refused", message: error.message };
    }
    return {
      kind: "failed",
      message: error instanceof Error ? error.message : String(error),
      error,
    };
  }
}
