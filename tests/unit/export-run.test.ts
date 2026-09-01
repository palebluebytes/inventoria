/**
 * One run of the Ledger export, from the save dialog to the sentence that
 * reports it (ADR-0064, ADR-0072 §14).
 *
 * The run lives outside both screens that ask for it — the Database Ledger
 * section and the failure surface of a Meal send — because "it produces the
 * same file" has to be a fact about one piece of code rather than a promise
 * about two.
 */
import { describe, it, expect } from "vitest";
import type { LedgerRow, LedgerSummary } from "../../src/lib/db/db.core";
import {
  ExportTooLargeError,
  type ExportSink,
  type LedgerPageReader,
} from "../../src/lib/db/ledger-export";
import { runLedgerExport } from "../../src/lib/views/ledger/export-run";

const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  entity: "habit:1",
  attribute: "habit/name",
  value: '"Meditate"',
  time: 1_000,
  hlc_ms: 1_000,
  hlc_ctr: 0,
  device_id: "device_a",
  ...over,
});

const summaryOf = (row_count: number): LedgerSummary => ({
  row_count,
  device_id: "device_a",
});

/** Every row in one page, which is all these tests need of the walk. */
const onePage = (rows: LedgerRow[]): LedgerPageReader => {
  let served = false;
  return async () => {
    if (served) return [];
    served = true;
    return rows;
  };
};

/** A sink that keeps what it was handed, and the chooser that hands it over. */
function recordingTarget() {
  const chunks: string[] = [];
  const asked: { filename: string; ceilingBytes: number }[] = [];
  let closed = false;
  const sink: ExportSink = {
    async write(chunk) {
      chunks.push(chunk);
    },
    async close() {
      closed = true;
    },
    async abort() {},
  };
  return {
    asked,
    text: () => chunks.join(""),
    closed: () => closed,
    chooseTarget: async (filename: string, ceilingBytes: number) => {
      asked.push({ filename, ceilingBytes });
      return sink;
    },
  };
}

/** 2026-08-14, as the day the filename and the envelope both carry. */
const EXPORTED_AT = Date.UTC(2026, 7, 14, 9, 30);

describe("runLedgerExport", () => {
  it("writes the Ledger export, reports its walk, and names the file", async () => {
    const target = recordingTarget();
    const seen: number[] = [];
    const outcome = await runLedgerExport({
      summary: summaryOf(2),
      exported_at: EXPORTED_AT,
      readPage: onePage([row(), row({ entity: "habit:2" })]),
      chooseTarget: target.chooseTarget,
      onProgress: (written) => seen.push(written),
    });

    expect(outcome.kind).toBe("written");
    // The artifact is `ledger-export.ts`'s and is pinned there; what this layer
    // owes is that the run reaches it at all, closes the file, and says so.
    expect(target.text().startsWith('{"artifact":"inventoria-ledger"')).toBe(
      true
    );
    expect(target.closed()).toBe(true);
    expect(seen).toEqual([2]);
    if (outcome.kind !== "written") return;
    expect(outcome.message).toContain("inventoria-ledger-2026-08-14.ndjson");
    expect(outcome.message).toContain("2");
  });

  it("opens the dialog on the day it was asked for, under the buffered ceiling", async () => {
    const target = recordingTarget();
    await runLedgerExport({
      summary: summaryOf(1),
      exported_at: EXPORTED_AT,
      readPage: onePage([row()]),
      chooseTarget: target.chooseTarget,
    });
    expect(target.asked).toEqual([
      {
        filename: "inventoria-ledger-2026-08-14.ndjson",
        ceilingBytes: 64 * 1024 * 1024,
      },
    ]);
  });

  it("reads a dismissed save dialog as neither a write nor a failure", async () => {
    const outcome = await runLedgerExport({
      summary: summaryOf(1),
      exported_at: EXPORTED_AT,
      readPage: onePage([row()]),
      chooseTarget: async () => null,
    });
    expect(outcome.kind).toBe("dismissed");
  });

  it("says so when the ledger grew while the file was being written", async () => {
    const target = recordingTarget();
    // The count was read before the click; two more datoms landed after it.
    const outcome = await runLedgerExport({
      summary: summaryOf(1),
      exported_at: EXPORTED_AT,
      readPage: onePage([
        row(),
        row({ entity: "habit:2" }),
        row({ entity: "habit:3" }),
      ]),
      chooseTarget: target.chooseTarget,
    });
    expect(outcome.kind).toBe("written");
    if (outcome.kind !== "written") return;
    expect(outcome.message).toContain("3");
    expect(outcome.message).toContain("1");
    expect(outcome.message).toMatch(/appended to/);
  });

  it("keeps the ceiling's own sentence rather than restating it", async () => {
    const refusal = new ExportTooLargeError(80 * 1024 * 1024, 64 * 1024 * 1024);
    const outcome = await runLedgerExport({
      summary: summaryOf(1),
      exported_at: EXPORTED_AT,
      readPage: onePage([row()]),
      chooseTarget: async () => {
        throw refusal;
      },
    });
    expect(outcome.kind).toBe("refused");
    if (outcome.kind !== "refused") return;
    expect(outcome.message).toBe(refusal.message);
  });

  it("hands back whatever else went wrong, message and error both", async () => {
    const broken = new Error("the worker went away");
    const outcome = await runLedgerExport({
      summary: summaryOf(1),
      exported_at: EXPORTED_AT,
      readPage: async () => {
        throw broken;
      },
      chooseTarget: recordingTarget().chooseTarget,
    });
    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(outcome.message).toBe("the worker went away");
    expect(outcome.error).toBe(broken);
  });

  it("takes a thrown non-error without inventing a message", async () => {
    const outcome = await runLedgerExport({
      summary: summaryOf(1),
      exported_at: EXPORTED_AT,
      readPage: async () => {
        throw "boom";
      },
      chooseTarget: recordingTarget().chooseTarget,
    });
    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(outcome.message).toBe("boom");
  });
});
