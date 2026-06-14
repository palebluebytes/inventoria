import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  createLedgerSchema,
  resetLedgerSchema,
  type Datom,
  type LedgerDb,
} from "../../src/lib/db/db.core";

// These tests run the real sqlite-wasm Node build (no Worker/OPFS) against the
// shared ledger core, so they assert the actual append-only SQL invariant
// rather than the mocked RPC layer covered by db-client.test.ts.

let db: LedgerDb;

function rows(): { entity: string; attribute: string; value: string; time: number }[] {
  const out: any[] = [];
  (db as any).exec({
    sql: "SELECT entity, attribute, value, time FROM datoms ORDER BY time;",
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
});

describe("ledger append-only invariant", () => {
  it("appends datoms and makes them queryable", () => {
    const touched = appendDatoms(db, [
      datom(),
      datom({ attribute: "habit/category", value: "wellbeing" }),
    ]);
    expect(touched.sort()).toEqual(["habit/category", "habit/name"]);
    expect(rows()).toHaveLength(2);
  });

  it("rejects a colliding (entity, attribute, time) instead of overwriting", () => {
    appendDatoms(db, [datom({ value: "Meditate" })]);

    expect(() => appendDatoms(db, [datom({ value: "Overwritten" })])).toThrow();

    // The original immutable datom must survive untouched.
    const stored = rows();
    expect(stored).toHaveLength(1);
    expect(stored[0].value).toBe(JSON.stringify("Meditate"));
  });

  it("rolls the whole batch back when one datom collides", () => {
    appendDatoms(db, [datom({ time: 1000 })]);

    expect(() =>
      appendDatoms(db, [
        datom({ time: 2000, value: "Fresh" }), // would be valid on its own
        datom({ time: 1000, value: "Collision" }), // collides -> abort batch
      ])
    ).toThrow();

    // Neither row from the failed batch should have been committed.
    expect(rows().map((r) => r.time)).toEqual([1000]);
  });

  it("keeps history: same entity+attribute at a different time coexists", () => {
    appendDatoms(db, [datom({ time: 1000, value: "Meditate" })]);
    appendDatoms(db, [datom({ time: 2000, value: "Meditate daily" })]);

    expect(rows().map((r) => r.value)).toEqual([
      JSON.stringify("Meditate"),
      JSON.stringify("Meditate daily"),
    ]);
  });

  it("rejects a malformed datom and writes nothing", () => {
    expect(() =>
      appendDatoms(db, [datom(), { entity: "", attribute: "x", value: 1, time: 5 }])
    ).toThrow(/Invalid datom structure/);
    expect(rows()).toHaveLength(0);
  });

  it("resetLedgerSchema clears all rows", () => {
    appendDatoms(db, [datom(), datom({ time: 2000 })]);
    expect(rows()).toHaveLength(2);

    resetLedgerSchema(db);
    expect(rows()).toHaveLength(0);
  });
});
