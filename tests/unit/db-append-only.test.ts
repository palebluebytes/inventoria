import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  createLedgerSchema,
  execRows,
  resetLedgerSchema,
  vacuumLedger,
  type Datom,
  type LedgerDb,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";

// These tests run the real sqlite-wasm Node build (no Worker/OPFS) against the
// shared ledger core, so they assert the actual append-only SQL invariant
// rather than the mocked RPC layer covered by db-client.test.ts.

let db: LedgerDb;
let clock: Hlc;
let wall: number;

interface Row {
  entity: string;
  attribute: string;
  value: string;
  time: number;
  hlc_ms: number;
  hlc_ctr: number;
  device_id: string;
}

function rows(): Row[] {
  const out: any[] = [];
  (db as any).exec({
    sql: "SELECT entity, attribute, value, time, hlc_ms, hlc_ctr, device_id FROM datoms ORDER BY hlc_ms, hlc_ctr, device_id;",
    rowMode: "object",
    callback: (r: any) => out.push(r),
  });
  return out;
}

const datom = (over: Partial<Datom> = {}): Datom => ({
  entity: "habit/1",
  attribute: "habit/name",
  value: "Meditate",
  time: 1000,
  ...over,
});

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as any)();
  db = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  // A controllable wall clock so same-millisecond writes are deterministic.
  wall = 1000;
  clock = createHlc("dev-a", { wallClock: () => wall });
});

describe("ledger append-only invariant", () => {
  it("appends datoms and makes them queryable", () => {
    const touched = appendDatoms(
      db,
      [datom(), datom({ attribute: "habit/category", value: "wellbeing" })],
      clock
    );
    expect(touched.sort()).toEqual(["habit/category", "habit/name"]);
    expect(rows()).toHaveLength(2);
  });

  it("stamps each datom with a monotonic HLC and a device id", () => {
    appendDatoms(db, [datom({ value: "A" }), datom({ value: "B" })], clock);
    const stamped = rows();
    expect(stamped.map((r) => [r.hlc_ms, r.hlc_ctr])).toEqual([
      [1000, 0],
      [1000, 1],
    ]);
    expect(stamped.every((r) => r.device_id === "dev-a")).toBe(true);
  });

  it("lets two same-(entity, attribute, time) writes coexist via distinct HLC stamps", () => {
    // Same wall millisecond and identical domain time: the old wall-clock PK
    // would collide and reject one; the HLC counter keeps both (ADR-0020).
    appendDatoms(db, [datom({ value: "Meditate" })], clock);
    appendDatoms(db, [datom({ value: "Later" })], clock);

    const stored = rows();
    expect(stored).toHaveLength(2);
    // Folded in HLC order, the later stamp wins.
    expect(stored.map((r) => JSON.parse(r.value))).toEqual([
      "Meditate",
      "Later",
    ]);
  });

  it("keeps history: same entity+attribute at a later time coexists", () => {
    appendDatoms(db, [datom({ time: 1000, value: "Meditate" })], clock);
    wall = 2000;
    appendDatoms(db, [datom({ time: 2000, value: "Meditate daily" })], clock);

    expect(rows().map((r) => JSON.parse(r.value))).toEqual([
      "Meditate",
      "Meditate daily",
    ]);
    expect(rows().map((r) => r.hlc_ms)).toEqual([1000, 2000]);
  });

  it("rolls the whole batch back when one datom is malformed", () => {
    appendDatoms(db, [datom({ value: "Fresh" })], clock);

    expect(() =>
      appendDatoms(
        db,
        [
          datom({ value: "Valid" }), // fine on its own
          { entity: "", attribute: "x", value: 1, time: 5 }, // malformed -> abort batch
        ],
        clock
      )
    ).toThrow(/Invalid datom structure/);

    // Only the first, separate append survives; the failed batch wrote nothing.
    expect(rows().map((r) => JSON.parse(r.value))).toEqual(["Fresh"]);
  });

  it("rejects a malformed datom and writes nothing", () => {
    expect(() =>
      appendDatoms(
        db,
        [datom(), { entity: "", attribute: "x", value: 1, time: 5 }],
        clock
      )
    ).toThrow(/Invalid datom structure/);
    expect(rows()).toHaveLength(0);
  });

  it("resetLedgerSchema clears all rows", () => {
    wall = 1000;
    appendDatoms(db, [datom()], clock);
    wall = 2000;
    appendDatoms(db, [datom({ time: 2000 })], clock);
    expect(rows()).toHaveLength(2);

    resetLedgerSchema(db);
    expect(rows()).toHaveLength(0);
  });
});

// A single-value PRAGMA read, through the ledger core's own row reader. Both
// `page_count` and `freelist_count` come back as a one-column row named after
// the pragma, which is why the value is taken positionally.
function pragma(name: string): number {
  const [row] = execRows<Record<string, number>>(db, `PRAGMA ${name};`);
  return Number(Object.values(row)[0]);
}

describe("a wipe reclaims the pages it freed", () => {
  // #290: `resetLedgerSchema` alone returns pages to the freelist and never
  // shrinks the database, so the storage figure beside the Wipe Database button
  // does not move. ADR-0079 §4 binds a wipe to reclaiming space; this is the
  // step that keeps it, measured against the real engine the app ships rather
  // than against the mocked RPC layer.
  it("frees nothing until vacuumed, then collapses to the empty schema", () => {
    const empty = pragma("page_count");

    // Photos are the heaviest thing the ledger holds (ADR-0066), so the filler
    // is sized like one rather than like a name: the defect is invisible at a
    // few pages.
    const filler = "x".repeat(4096);
    appendDatoms(
      db,
      Array.from({ length: 500 }, (_, i) =>
        datom({ entity: `habit/${i}`, value: filler })
      ),
      clock
    );
    const grown = pragma("page_count");
    expect(grown).toBeGreaterThan(empty);

    resetLedgerSchema(db);
    expect(rows()).toHaveLength(0);
    // The rows are gone and the space is not: this is the bug, asserted so a
    // future `PRAGMA auto_vacuum` cannot quietly make the vacuum below a no-op
    // that still passes.
    expect(pragma("page_count")).toBe(grown);
    expect(pragma("freelist_count")).toBeGreaterThan(0);

    vacuumLedger(db);
    expect(pragma("page_count")).toBe(empty);
    expect(pragma("freelist_count")).toBe(0);
  });

  it("is safe on an already-empty ledger", () => {
    const empty = pragma("page_count");
    vacuumLedger(db);
    expect(pragma("page_count")).toBe(empty);
    expect(rows()).toHaveLength(0);
  });
});
