import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  countDatoms,
  createLedgerSchema,
  cursorOf,
  readLedgerPage,
  readLedgerSummary,
  type Datom,
  type LedgerCursor,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";
import { entityPrefixesOf } from "../../src/lib/facets/registry";

// The paged read is what carries the ledger out of the worker one bounded
// chunk at a time, so it is tested against the real sqlite-wasm build rather
// than a mock: the guarantees under test are the table's own ordering and its
// key uniqueness, and neither survives being faked.

let db: LedgerDb;
let clock: Hlc;
let wall: number;

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as any)();
  db = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  wall = 1_000;
  clock = createHlc("device_a", { wallClock: () => wall });
});

function append(datoms: Datom[]): void {
  appendDatoms(db, datoms, clock);
}

const datom = (over: Partial<Datom> = {}): Datom => ({
  entity: "habit:1",
  attribute: "habit/name",
  value: "Meditate",
  time: 1_000,
  ...over,
});

/** Walks every page the way an export does, and returns the rows in order. */
function readAll(
  budgetBytes: number,
  entityPrefixes?: readonly string[]
): LedgerRow[] {
  const all: LedgerRow[] = [];
  let after: LedgerCursor | null = null;
  for (let guard = 0; guard < 1_000; guard++) {
    const page = readLedgerPage(db, after, budgetBytes, entityPrefixes);
    if (page.length === 0) return all;
    all.push(...page);
    after = cursorOf(page[page.length - 1]);
  }
  throw new Error("paged read did not terminate");
}

describe("counting the ledger", () => {
  it("counts an empty ledger as no datoms", () => {
    expect(countDatoms(db)).toBe(0);
  });

  it("counts superseded facts alongside the ones that won", () => {
    append([datom({ value: "Meditate" })]);
    wall = 2_000;
    append([datom({ value: "Sit quietly" })]);
    expect(countDatoms(db)).toBe(2);
  });

  it("describes itself with the count and the device an envelope needs", () => {
    append([datom()]);
    expect(readLedgerSummary(db, "device_a")).toEqual({
      row_count: 1,
      device_id: "device_a",
    });
  });
});

describe("reading the ledger a page at a time", () => {
  it("returns nothing for an empty ledger", () => {
    expect(readLedgerPage(db, null, 1_024)).toEqual([]);
  });

  it("returns every column the table holds", () => {
    append([datom()]);
    const [row] = readLedgerPage(db, null, 1_024);
    expect(row).toEqual({
      entity: "habit:1",
      attribute: "habit/name",
      value: '"Meditate"',
      time: 1_000,
      hlc_ms: 1_000,
      hlc_ctr: 0,
      device_id: "device_a",
    });
  });

  it("carries superseded facts as well as current ones", () => {
    append([datom({ value: "Meditate" })]);
    wall = 2_000;
    append([datom({ value: "Sit quietly" })]);
    expect(readAll(1_024 * 1_024).map((r) => r.value)).toEqual([
      '"Meditate"',
      '"Sit quietly"',
    ]);
  });

  it("reaches every row across pages when the budget forces a split", () => {
    for (let i = 0; i < 20; i++) {
      wall = 1_000 + i;
      append([datom({ entity: `habit:${i}`, value: `Habit number ${i}` })]);
    }
    // A budget of a few dozen bytes fits one or two values, so the walk needs
    // many pages to finish and each cursor must resume exactly where the last
    // page stopped.
    const walked = readAll(24);
    expect(walked).toHaveLength(20);
    expect(new Set(walked.map((r) => r.entity)).size).toBe(20);
  });

  it("still moves a single value larger than the whole budget", () => {
    const huge = "x".repeat(5_000);
    append([datom({ value: huge })]);
    wall = 2_000;
    append([datom({ entity: "habit:2", value: "small" })]);
    const walked = readAll(16);
    expect(walked).toHaveLength(2);
    expect(walked[0].value).toHaveLength(huge.length + 2);
  });

  it("never repeats a row when two share an hlc stamp", () => {
    // The pre-ADR-0020 migration stamps every legacy row `hlc_ms = time,
    // hlc_ctr = 0`, so a migrated ledger holds rows whose HLC key collides.
    // The cursor is the primary key, which stays unique through that.
    db.exec({
      sql: "INSERT INTO datoms (entity, attribute, value, time, hlc_ms, hlc_ctr, device_id) VALUES (?, ?, ?, ?, ?, ?, ?);",
      bind: ["habit:1", "habit/name", '"A"', 5, 5, 0, "device_a"],
    });
    db.exec({
      sql: "INSERT INTO datoms (entity, attribute, value, time, hlc_ms, hlc_ctr, device_id) VALUES (?, ?, ?, ?, ?, ?, ?);",
      bind: ["habit:2", "habit/name", '"B"', 5, 5, 0, "device_a"],
    });
    expect(readAll(1).map((r) => r.entity)).toEqual(["habit:1", "habit:2"]);
  });
});

// A Facet-scoped export walks the same pages through the same cursor and sees
// only the rows the Facet owns (ADR-0079 §6). It is the export's half of the
// scoped wipe: the file has to be a copy of what the delete is about to take,
// or the pairing that makes the delete defensible is a coincidence.
describe("reading one Facet's rows a page at a time", () => {
  const jar = () => {
    append([
      datom({ entity: "fdc:171705", attribute: "twin/name", value: "Oats" }),
      datom({ entity: "gtin:5000", attribute: "twin/name", value: "Beans" }),
      datom({ entity: "habit:1", attribute: "habit/name", value: "Walk" }),
      datom({
        entity: "twin:manual_1",
        attribute: "twin/name",
        value: "Chair",
      }),
    ]);
  };

  it("returns only the rows under the prefixes it was given", () => {
    jar();
    expect(
      readAll(1_024, entityPrefixesOf("food")).map((r) => r.entity)
    ).toEqual(["fdc:171705", "gtin:5000"]);
  });

  it("reaches every scoped row across pages when the budget forces a split", () => {
    jar();
    // One row per page, so the cursor and the prefix filter have to hold
    // together across the resume rather than only on the first page.
    expect(readAll(1, entityPrefixesOf("food")).map((r) => r.entity)).toEqual([
      "fdc:171705",
      "gtin:5000",
    ]);
  });

  it("counts the same rows in the summary the envelope carries", () => {
    jar();
    expect(
      readLedgerSummary(db, "device_a", entityPrefixesOf("food")).row_count
    ).toBe(2);
    expect(readLedgerSummary(db, "device_a").row_count).toBe(4);
  });

  it("reads the whole ledger when it is given no prefixes at all", () => {
    jar();
    expect(readAll(1_024).length).toBe(4);
  });
});
