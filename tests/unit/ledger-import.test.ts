import { describe, it, expect } from "vitest";
import {
  importLedger,
  LedgerImportRefusedError,
  linesOf,
  readDatomLine,
  readImportEnvelope,
} from "../../src/lib/db/ledger-import";
import {
  buildExportEnvelope,
  datomLine,
  envelopeLine,
} from "../../src/lib/db/ledger-export";
import type { LedgerRow } from "../../src/lib/db/db.core";

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

const goodEnvelope = envelopeLine(
  buildExportEnvelope({ row_count: 3, device_id: "device_a" }, 1_700_000)
);

describe("the envelope on line one", () => {
  it("reads back the envelope the export wrote", () => {
    expect(readImportEnvelope(goodEnvelope)).toEqual({
      artifact: "inventoria-ledger",
      schema_version: 1,
      exported_at: 1_700_000,
      device_id: "device_a",
      row_count: 3,
    });
  });

  it("refuses a file that is not an Inventoria ledger export", () => {
    expect(() => readImportEnvelope('{"artifact":"something-else"}')).toThrow(
      /not an Inventoria ledger export/
    );
  });

  it("refuses a schema version it does not recognise, naming both", () => {
    const future = JSON.stringify({
      artifact: "inventoria-ledger",
      schema_version: 2,
      exported_at: 1,
      device_id: "device_a",
      row_count: 0,
    });
    expect(() => readImportEnvelope(future)).toThrow(
      /file is version 2, and this app reads version 1/
    );
  });

  it("refuses a first line that is not JSON at all", () => {
    expect(() => readImportEnvelope("entity,attribute,value")).toThrow(
      LedgerImportRefusedError
    );
  });

  it("refuses an envelope missing the device it came from", () => {
    const headless = JSON.stringify({
      artifact: "inventoria-ledger",
      schema_version: 1,
      exported_at: 1,
      row_count: 0,
    });
    expect(() => readImportEnvelope(headless)).toThrow(
      /"device_id" is missing/
    );
  });
});

describe("a datom on its own line", () => {
  it("reads back the row the export wrote, value still unparsed", () => {
    const photo = row({
      attribute: "food/label_photo",
      value: JSON.stringify("data:image/jpeg;base64,AAAA"),
    });
    expect(readDatomLine(datomLine(photo), 2)).toEqual(photo);
  });

  it("refuses a row with no entity", () => {
    expect(() => readDatomLine(datomLine(row({ entity: "" })), 7)).toThrow(
      /Line 7: .*"entity"/
    );
  });

  it("refuses a row whose clock counter is not a whole number", () => {
    const bent = JSON.stringify({ ...row(), hlc_ctr: 1.5 });
    expect(() => readDatomLine(bent, 4)).toThrow(/"hlc_ctr"/);
  });

  it("refuses a row whose value is not the JSON text the ledger stores", () => {
    const bent = JSON.stringify({ ...row(), value: "{not json" });
    expect(() => readDatomLine(bent, 9)).toThrow(/"value"/);
  });

  it("refuses a line truncated part way through, as a cut file ends", () => {
    const cut = datomLine(row()).trimEnd().slice(0, 40);
    expect(() => readDatomLine(cut, 3)).toThrow(LedgerImportRefusedError);
  });
});

/** Feeds `pieces` through as separate stream chunks. */
async function* chunks(...pieces: string[]) {
  for (const piece of pieces) yield piece;
}

async function collect(
  source: AsyncIterable<{ text: string; lineNumber: number }>
): Promise<string[]> {
  const out: string[] = [];
  for await (const line of source) out.push(`${line.lineNumber}:${line.text}`);
  return out;
}

describe("splitting a stream into lines", () => {
  it("rejoins a line the stream cut in half", async () => {
    expect(await collect(linesOf(chunks('{"a":1', '}\n{"b":2}\n')))).toEqual([
      '1:{"a":1}',
      '2:{"b":2}',
    ]);
  });

  it("yields a last line the file did not end with a newline", async () => {
    expect(await collect(linesOf(chunks("one\ntwo")))).toEqual([
      "1:one",
      "2:two",
    ]);
  });

  it("passes over blank lines while still counting them", async () => {
    expect(await collect(linesOf(chunks("one\n\n  \ntwo\n")))).toEqual([
      "1:one",
      "4:two",
    ]);
  });

  it("drops the carriage return a file may have picked up", async () => {
    expect(await collect(linesOf(chunks("one\r\ntwo\r\n")))).toEqual([
      "1:one",
      "2:two",
    ]);
  });
});

/** A file the export would have written, from the rows it would have held. */
function exported(rows: LedgerRow[]): string {
  const envelope = envelopeLine(
    buildExportEnvelope(
      { row_count: rows.length, device_id: "device_a" },
      1_700_000
    )
  );
  return envelope + rows.map(datomLine).join("");
}

/** Reads the whole file in one chunk, and counts how often it was opened. */
function fileOf(text: string) {
  const opened = { count: 0 };
  const open = () => {
    opened.count += 1;
    return chunks(text);
  };
  return { open, opened };
}

/** Collects the batches handed to the worker, reporting `alreadyHere` skips. */
function recordingWriter(alreadyHere = 0) {
  const batches: { rows: LedgerRow[]; final: boolean }[] = [];
  let skipsLeft = alreadyHere;
  return {
    batches,
    write: async (rows: LedgerRow[], final: boolean) => {
      batches.push({ rows, final });
      const skipped = Math.min(skipsLeft, rows.length);
      skipsLeft -= skipped;
      return rows.length - skipped;
    },
  };
}

describe("importing a file the export wrote", () => {
  const rows = [
    row(),
    row({ attribute: "habit/cadence", value: '"daily"', hlc_ctr: 1 }),
    row({ entity: "habit:2", hlc_ms: 2_000 }),
  ];

  it("hands every row to the worker and reports what was added", async () => {
    const file = fileOf(exported(rows));
    const writer = recordingWriter();

    const result = await importLedger(file.open, writer.write);

    expect(result.rowsRead).toBe(3);
    expect(result.rowsAdded).toBe(3);
    expect(result.rowsAlreadyPresent).toBe(0);
    expect(result.envelope.device_id).toBe("device_a");
    expect(writer.batches.flatMap((b) => b.rows)).toEqual(rows);
  });

  it("reports the rows the ledger already held, which is a second import", async () => {
    const file = fileOf(exported(rows));

    const result = await importLedger(file.open, recordingWriter(3).write);

    expect(result.rowsAdded).toBe(0);
    expect(result.rowsAlreadyPresent).toBe(3);
  });

  it("reads the file twice: once to check it, once to write it", async () => {
    const file = fileOf(exported(rows));
    await importLedger(file.open, recordingWriter().write);
    expect(file.opened.count).toBe(2);
  });

  it("writes nothing at all when a late line is malformed", async () => {
    const file = fileOf(`${exported(rows)}{"entity":"habit:3"}\n`);
    const writer = recordingWriter();

    await expect(importLedger(file.open, writer.write)).rejects.toThrow(
      /Line 5/
    );
    expect(writer.batches).toEqual([]);
  });

  it("refuses an empty file rather than reporting an import of nothing", async () => {
    const file = fileOf("");
    await expect(
      importLedger(file.open, recordingWriter().write)
    ).rejects.toThrow(LedgerImportRefusedError);
  });

  it("imports an export of a ledger that held no datoms", async () => {
    const file = fileOf(exported([]));
    const writer = recordingWriter();

    const result = await importLedger(file.open, writer.write);

    expect(result.rowsRead).toBe(0);
    expect(writer.batches).toEqual([{ rows: [], final: true }]);
  });

  it("splits the write into batches, and marks the last one as last", async () => {
    const file = fileOf(exported(rows));
    const writer = recordingWriter();

    await importLedger(file.open, writer.write, { batchBudgetBytes: 1 });

    expect(writer.batches.map((b) => b.rows.length)).toEqual([1, 1, 1, 0]);
    expect(writer.batches.map((b) => b.final)).toEqual([
      false,
      false,
      false,
      true,
    ]);
  });

  it("reports a header that undercounts its own file rather than refusing", async () => {
    const stale =
      envelopeLine(
        buildExportEnvelope({ row_count: 1, device_id: "device_a" }, 1_700_000)
      ) + rows.map(datomLine).join("");
    const result = await importLedger(
      fileOf(stale).open,
      recordingWriter().write
    );

    expect(result.rowsRead).toBe(3);
    expect(result.envelope.row_count).toBe(1);
  });
});
