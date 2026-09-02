import { describe, it, expect, vi } from "vitest";
import type { LedgerCursor, LedgerRow } from "../../src/lib/db/db.core";
import {
  buildExportEnvelope,
  bufferedSink,
  datomLine,
  envelopeLine,
  ExportTooLargeError,
  LEDGER_EXPORT_ARTIFACT,
  LEDGER_EXPORT_SCHEMA_VERSION,
  writeLedgerExport,
  type ExportSink,
  type LedgerPageReader,
} from "../../src/lib/db/ledger-export";

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

/** A sink that keeps what it was handed, so a test can read the whole file. */
function recordingSink(): ExportSink & {
  text(): string;
  closed: () => boolean;
  aborted: () => unknown;
} {
  const chunks: string[] = [];
  let closed = false;
  let aborted: unknown = undefined;
  return {
    async write(chunk) {
      chunks.push(chunk);
    },
    async close() {
      closed = true;
    },
    async abort(reason) {
      aborted = reason;
    },
    text: () => chunks.join(""),
    closed: () => closed,
    aborted: () => aborted,
  };
}

/** Serves `rows` a page at a time, the way the worker's paged read does. */
// Typed as the real seam even though it pages on a count rather than the byte
// budget: the budget is the caller's business, and a helper with a narrower
// signature cannot stand in for the reader `writeLedgerExport` actually calls.
function pagesOf(rows: LedgerRow[], per_page = 2): LedgerPageReader {
  const keyOf = (r: LedgerCursor) =>
    [r.entity, r.attribute, r.hlc_ms, r.hlc_ctr, r.device_id].join(" ");
  return async (after: LedgerCursor | null) => {
    const from = after
      ? rows.findIndex((r) => keyOf(r) === keyOf(after)) + 1
      : 0;
    return rows.slice(from, from + per_page);
  };
}

describe("the export envelope", () => {
  it("names the artifact, the schema, the moment, the device and the row count", () => {
    const envelope = buildExportEnvelope(
      { row_count: 12, device_id: "device_a" },
      1_700_000_000_000
    );
    expect(envelope).toEqual({
      artifact: LEDGER_EXPORT_ARTIFACT,
      schema_version: LEDGER_EXPORT_SCHEMA_VERSION,
      exported_at: 1_700_000_000_000,
      device_id: "device_a",
      row_count: 12,
    });
  });

  // A Facet-scoped export is the same artifact at the same version, carrying a
  // subset of the same rows (ADR-0079 §6). That is what lets the ordinary
  // Import restore it, which is the whole of what makes an export beside a
  // delete a safety control rather than a keepsake.
  it("keeps the artifact and the version when it holds one Facet's rows", () => {
    const envelope = buildExportEnvelope(
      { row_count: 12, device_id: "device_a" },
      1_700_000_000_000,
      { facet_id: "food", entity_prefixes: ["fdc:", "gtin:"] }
    );
    expect(envelope.artifact).toBe(LEDGER_EXPORT_ARTIFACT);
    expect(envelope.schema_version).toBe(LEDGER_EXPORT_SCHEMA_VERSION);
    expect(envelope.scope).toEqual({
      facet_id: "food",
      entity_prefixes: ["fdc:", "gtin:"],
    });
  });

  it("says nothing about a scope when it holds the whole ledger", () => {
    const envelope = buildExportEnvelope(
      { row_count: 12, device_id: "device_a" },
      1
    );
    expect("scope" in envelope).toBe(false);
  });

  it("is one line, so an importer can refuse on it before reading anything else", () => {
    const line = envelopeLine(
      buildExportEnvelope({ row_count: 0, device_id: "device_a" }, 1)
    );
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1)).not.toContain("\n");
    expect(JSON.parse(line)).toMatchObject({
      artifact: "inventoria-ledger",
      schema_version: 1,
    });
  });
});

describe("serialising a datom", () => {
  it("writes every column the table holds, and nothing else", () => {
    expect(JSON.parse(datomLine(row()))).toEqual({
      entity: "habit:1",
      attribute: "habit/name",
      value: '"Meditate"',
      time: 1_000,
      hlc_ms: 1_000,
      hlc_ctr: 0,
      device_id: "device_a",
    });
  });

  it("hands back the stored value unparsed, so a photo survives the trip", () => {
    const photo = JSON.stringify({
      image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ",
    });
    expect(JSON.parse(datomLine(row({ value: photo }))).value).toBe(photo);
  });

  it("stays on one line even when the value carries newlines", () => {
    const line = datomLine(row({ value: '"first\\nsecond"' }));
    expect(line.split("\n")).toHaveLength(2);
    expect(line.endsWith("\n")).toBe(true);
  });
});

describe("writing the whole ledger out", () => {
  it("writes a valid file holding only the envelope for an empty ledger", async () => {
    const sink = recordingSink();
    const result = await writeLedgerExport(pagesOf([]), sink, {
      summary: { row_count: 0, device_id: "device_a" },
      exported_at: 1_700_000_000_000,
    });
    expect(sink.text().split("\n").filter(Boolean)).toHaveLength(1);
    expect(result.rowsWritten).toBe(0);
    expect(sink.closed()).toBe(true);
  });

  it("writes exactly one line per datom after the envelope", async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ entity: `habit:${i}`, hlc_ms: 1_000 + i })
    );
    const sink = recordingSink();
    const result = await writeLedgerExport(pagesOf(rows), sink, {
      summary: { row_count: 5, device_id: "device_a" },
      exported_at: 1,
    });
    const lines = sink.text().split("\n").filter(Boolean);
    expect(lines).toHaveLength(6);
    expect(lines.slice(1).map((l) => JSON.parse(l).entity)).toEqual([
      "habit:0",
      "habit:1",
      "habit:2",
      "habit:3",
      "habit:4",
    ]);
    expect(result.rowsWritten).toBe(5);
  });

  it("resumes each page after the last row of the one before", async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({ entity: `habit:${i}`, hlc_ms: 1_000 + i })
    );
    const cursors: (LedgerCursor | null)[] = [];
    const readPage = pagesOf(rows);
    await writeLedgerExport(
      (after, budget) => {
        cursors.push(after);
        return readPage(after, budget);
      },
      recordingSink(),
      { summary: { row_count: 5, device_id: "device_a" }, exported_at: 1 }
    );
    expect(cursors[0]).toBeNull();
    expect(cursors[1]).toMatchObject({ entity: "habit:1", hlc_ms: 1_001 });
    expect(cursors[2]).toMatchObject({ entity: "habit:3", hlc_ms: 1_003 });
  });

  it("reports the count it wrote so a ledger that grew mid-write is visible", async () => {
    const rows = [row({ entity: "habit:0" }), row({ entity: "habit:1" })];
    const result = await writeLedgerExport(pagesOf(rows), recordingSink(), {
      summary: { row_count: 1, device_id: "device_a" },
      exported_at: 1,
    });
    expect(result.envelope.row_count).toBe(1);
    expect(result.rowsWritten).toBe(2);
  });

  it("aborts the sink and rethrows when a page cannot be read", async () => {
    const sink = recordingSink();
    const boom = new Error("the worker went away");
    await expect(
      writeLedgerExport(
        async () => {
          throw boom;
        },
        sink,
        { summary: { row_count: 1, device_id: "device_a" }, exported_at: 1 }
      )
    ).rejects.toThrow("the worker went away");
    expect(sink.aborted()).toBe(boom);
    expect(sink.closed()).toBe(false);
  });
});

describe("the in-memory fallback's size ceiling", () => {
  it("delivers the file once when it fits", async () => {
    const deliver = vi.fn();
    const sink = bufferedSink(1_024, deliver);
    await sink.write("one\n");
    await sink.write("two\n");
    await sink.close();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].join("")).toBe("one\ntwo\n");
  });

  it("refuses past the ceiling instead of assembling a file it cannot hold", async () => {
    const deliver = vi.fn();
    const sink = bufferedSink(8, deliver);
    await sink.write("12345678");
    await expect(sink.write("9")).rejects.toThrow(ExportTooLargeError);
    expect(deliver).not.toHaveBeenCalled();
  });

  it("says how big the file was and how big the ceiling is", async () => {
    const sink = bufferedSink(4, vi.fn());
    await expect(sink.write("abcde")).rejects.toThrow(/5 bytes.*4 bytes/s);
  });

  it("counts the utf-8 bytes a file carries, not its characters", async () => {
    const sink = bufferedSink(3, vi.fn());
    // Two characters, four bytes once encoded.
    await expect(sink.write("é€")).rejects.toThrow(ExportTooLargeError);
  });

  it("refuses to deliver a run that was aborted", async () => {
    const deliver = vi.fn();
    const sink = bufferedSink(1_024, deliver);
    await sink.write("half a file\n");
    await sink.abort(new Error("nope"));
    await sink.close();
    expect(deliver).not.toHaveBeenCalled();
  });
});
