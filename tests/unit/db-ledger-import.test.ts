import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  countDatoms,
  createLedgerSchema,
  cursorOf,
  importLedgerRows,
  readLedgerPage,
  readLedgerSummary,
  type Datom,
  type LedgerCursor,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";
import {
  writeLedgerExport,
  type ExportSink,
} from "../../src/lib/db/ledger-export";
import { importLedger } from "../../src/lib/db/ledger-import";

// The import is the one write path that keeps a stamp it did not issue, and the
// dedupe it relies on is the table's own primary key. Neither survives being
// faked, so this runs against the real sqlite-wasm build.

let sqlite3: any;
let db: LedgerDb;
let clock: Hlc;
let wall: number;

beforeEach(async () => {
  sqlite3 = await (sqlite3InitModule as any)();
  db = freshDb();
  wall = 1_000;
  clock = createHlc("device_a", { wallClock: () => wall });
});

function freshDb(): LedgerDb {
  const made = new sqlite3.oo1.DB() as LedgerDb;
  createLedgerSchema(made);
  return made;
}

const datom = (over: Partial<Datom> = {}): Datom => ({
  entity: "habit:1",
  attribute: "habit/name",
  value: "Meditate",
  time: 1_000,
  ...over,
});

/** Every row of `from`, in primary-key order, the way an export walks it. */
function readAll(from: LedgerDb): LedgerRow[] {
  const all: LedgerRow[] = [];
  let after: LedgerCursor | null = null;
  for (let guard = 0; guard < 1_000; guard++) {
    const page = readLedgerPage(from, after, 64 * 1024);
    if (page.length === 0) return all;
    all.push(...page);
    after = cursorOf(page[page.length - 1]);
  }
  throw new Error("paged read did not terminate");
}

describe("appending rows that arrived with their own stamps", () => {
  it("keeps the clock stamp the row came with, rather than issuing a new one", () => {
    const rows = [
      {
        entity: "habit:9",
        attribute: "habit/name",
        value: '"Stretch"',
        time: 40,
        hlc_ms: 55,
        hlc_ctr: 3,
        device_id: "device_b",
      },
    ];

    const outcome = importLedgerRows(db, rows);

    expect(outcome.rowsAdded).toBe(1);
    expect(readAll(db)).toEqual(rows);
  });

  it("reports the greatest stamp it saw, so the local clock can catch up", () => {
    const outcome = importLedgerRows(db, [
      {
        entity: "habit:9",
        attribute: "a",
        value: "1",
        time: 1,
        hlc_ms: 10,
        hlc_ctr: 9,
        device_id: "device_b",
      },
      {
        entity: "habit:9",
        attribute: "b",
        value: "1",
        time: 1,
        hlc_ms: 90,
        hlc_ctr: 0,
        device_id: "device_b",
      },
    ]);

    expect(outcome.highWater).toEqual({ hlc_ms: 90, hlc_ctr: 0 });
  });

  it("adds nothing the second time, because the key is the whole stamp", () => {
    const rows = readAllAfterAppend([datom(), datom({ value: "Walk" })]);

    expect(importLedgerRows(db, rows).rowsAdded).toBe(2);
    expect(importLedgerRows(db, rows).rowsAdded).toBe(0);
    expect(countDatoms(db)).toBe(2);
  });

  it("leaves every fact the ledger already held alone", () => {
    appendDatoms(db, [datom({ entity: "habit:local" })], clock);

    importLedgerRows(db, [
      {
        entity: "habit:9",
        attribute: "habit/name",
        value: '"Stretch"',
        time: 40,
        hlc_ms: 55,
        hlc_ctr: 3,
        device_id: "device_b",
      },
    ]);

    expect(readAll(db).map((r) => r.entity)).toEqual([
      "habit:9",
      "habit:local",
    ]);
  });

  it("rolls the whole batch back when one row is not a datom", () => {
    const good = {
      entity: "habit:9",
      attribute: "habit/name",
      value: '"Stretch"',
      time: 40,
      hlc_ms: 55,
      hlc_ctr: 3,
      device_id: "device_b",
    };
    const bad = { ...good, entity: "", attribute: "habit/other" };

    expect(() => importLedgerRows(db, [good, bad])).toThrow();
    expect(countDatoms(db)).toBe(0);
  });

  it("refuses a stamp the reader would have refused, so the two agree", () => {
    const bent = {
      entity: "habit:9",
      attribute: "habit/name",
      value: '"Stretch"',
      time: 40,
      hlc_ms: -1,
      hlc_ctr: 0,
      device_id: "device_b",
    };

    expect(() => importLedgerRows(db, [bent])).toThrow();
    expect(countDatoms(db)).toBe(0);
  });

  it("writes nothing and reports nothing for an empty batch", () => {
    expect(importLedgerRows(db, [])).toEqual({ rowsAdded: 0, highWater: null });
  });
});

/** Appends `datoms` through the normal path and reads the stamped rows back. */
function readAllAfterAppend(datoms: Datom[]): LedgerRow[] {
  const staging = freshDb();
  appendDatoms(
    staging,
    datoms,
    createHlc("device_b", { wallClock: () => 500 })
  );
  return readAll(staging);
}

describe("a ledger exported and read back", () => {
  it("arrives in an empty ledger as the ledger it left", async () => {
    appendDatoms(
      db,
      [
        datom(),
        datom({ attribute: "habit/cadence", value: { days: [1, 2] } }),
        datom({
          entity: "food:1",
          attribute: "food/label_photo",
          // A value with a newline and a quote in it: the line grammar has to
          // survive both, or the file stops being one datom per line.
          value: 'data:image/jpeg;base64,AAAA\n"still one line"',
        }),
      ],
      clock
    );

    const file = await exportToString(db);
    const landed = freshDb();
    const result = await importLedger(
      () => oneChunk(file),
      async (rows) => importLedgerRows(landed, rows).rowsAdded
    );

    expect(result.rowsAdded).toBe(3);
    expect(result.rowsAlreadyPresent).toBe(0);
    expect(readAll(landed)).toEqual(readAll(db));
  });

  it("changes nothing when the same file is imported a second time", async () => {
    appendDatoms(db, [datom(), datom({ value: "Walk", time: 2_000 })], clock);
    const file = await exportToString(db);
    const landed = freshDb();
    const write = async (rows: LedgerRow[]) =>
      importLedgerRows(landed, rows).rowsAdded;

    await importLedger(() => oneChunk(file), write);
    const again = await importLedger(() => oneChunk(file), write);

    expect(again.rowsAdded).toBe(0);
    expect(again.rowsAlreadyPresent).toBe(2);
    expect(readAll(landed)).toEqual(readAll(db));
  });
});

async function* oneChunk(text: string) {
  yield text;
}

/** Runs the real export over `from` and returns the file it would have written. */
async function exportToString(from: LedgerDb): Promise<string> {
  const chunks: string[] = [];
  const sink: ExportSink = {
    async write(chunk) {
      chunks.push(chunk);
    },
    async close() {},
    async abort() {},
  };
  await writeLedgerExport(
    async (after, budgetBytes) => readLedgerPage(from, after, budgetBytes),
    sink,
    {
      summary: readLedgerSummary(from, "device_a"),
      exported_at: 1_700_000,
    }
  );
  return chunks.join("");
}
