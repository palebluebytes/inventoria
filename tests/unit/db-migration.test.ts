import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  ensureLedgerSchema,
  getOrCreateDeviceId,
  readHlcHighWater,
  execRows,
  type LedgerDb,
} from "../../src/lib/db/db.core";
import { createHlc } from "../../src/lib/db/hlc";

// The ADR-0020 migration rebuilds the user's real `datoms` table in place, so it
// runs against the actual sqlite-wasm Node build rather than a mock. These tests
// guard the one-shot backfill: no legacy fact may be lost or reinterpreted.

let db: LedgerDb;

// The pre-ADR-0020 schema: keyed and ordered by bare wall-clock `time`.
const LEGACY_SCHEMA = `
  CREATE TABLE datoms (
    entity TEXT NOT NULL,
    attribute TEXT NOT NULL,
    value TEXT NOT NULL,
    time INTEGER NOT NULL,
    PRIMARY KEY (entity, attribute, time)
  ) WITHOUT ROWID;
`;

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
  return execRows<Row>(
    db,
    "SELECT entity, attribute, value, time, hlc_ms, hlc_ctr, device_id FROM datoms ORDER BY hlc_ms, hlc_ctr, device_id;"
  );
}

function columnNames(): string[] {
  return execRows<{ name: string }>(db, "PRAGMA table_info(datoms);").map(
    (c) => c.name
  );
}

function seedLegacyLedger(): void {
  db.exec(LEGACY_SCHEMA);
  db.exec(`
    INSERT INTO datoms (entity, attribute, value, time) VALUES
      ('habit:1', 'habit/name', '"Meditate"', 1000),
      ('habit:1', 'habit/name', '"Meditate daily"', 2000),
      ('habit:2', 'habit/name', '"Run"', 1500);
  `);
}

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as any)();
  db = new sqlite3.oo1.DB();
});

describe("legacy → HLC schema migration (ADR-0020)", () => {
  it("backfills every legacy datom, mapping hlc_ms = time, hlc_ctr = 0, device_id = this device", () => {
    seedLegacyLedger();

    ensureLedgerSchema(db, "dev-x");

    // Every fact survives, in its original entity/attribute/value/time, now
    // carrying the HLC key. Nothing is dropped and no value is reinterpreted.
    expect(rows()).toEqual([
      {
        entity: "habit:1",
        attribute: "habit/name",
        value: '"Meditate"',
        time: 1000,
        hlc_ms: 1000,
        hlc_ctr: 0,
        device_id: "dev-x",
      },
      {
        entity: "habit:2",
        attribute: "habit/name",
        value: '"Run"',
        time: 1500,
        hlc_ms: 1500,
        hlc_ctr: 0,
        device_id: "dev-x",
      },
      {
        entity: "habit:1",
        attribute: "habit/name",
        value: '"Meditate daily"',
        time: 2000,
        hlc_ms: 2000,
        hlc_ctr: 0,
        device_id: "dev-x",
      },
    ]);
  });

  it("adds the HLC columns to the table", () => {
    seedLegacyLedger();
    ensureLedgerSchema(db, "dev-x");
    expect(columnNames()).toEqual(
      expect.arrayContaining(["hlc_ms", "hlc_ctr", "device_id"])
    );
  });

  it("is idempotent: a second ensure is a no-op that touches no data", () => {
    seedLegacyLedger();
    ensureLedgerSchema(db, "dev-x");
    const afterFirst = rows();

    ensureLedgerSchema(db, "dev-DIFFERENT");

    // No re-migration: rows are untouched and keep their original device id.
    expect(rows()).toEqual(afterFirst);
    expect(rows().every((r) => r.device_id === "dev-x")).toBe(true);
  });

  it("seeds the high-water mark from the migrated rows so the clock cannot reissue a stamp", () => {
    seedLegacyLedger();
    ensureLedgerSchema(db, "dev-x");
    expect(readHlcHighWater(db)).toEqual({ hlc_ms: 2000, hlc_ctr: 0 });
  });

  it("lets a post-migration append coexist with and order after legacy rows", () => {
    seedLegacyLedger();
    ensureLedgerSchema(db, "dev-x");

    // Seed exactly as the worker does, then stamp a new write at a later ms.
    const clock = createHlc("dev-x", {
      seed: readHlcHighWater(db),
      wallClock: () => 3000,
    });
    appendDatoms(
      db,
      [
        {
          entity: "habit:1",
          attribute: "habit/name",
          value: "Meditate more",
          time: 3000,
        },
      ],
      clock
    );

    const stored = rows();
    expect(stored).toHaveLength(4);
    // The append sorts last in HLC order and wins latest-wins for habit:1.
    expect(stored.at(-1)).toMatchObject({
      entity: "habit:1",
      value: '"Meditate more"',
      hlc_ms: 3000,
      hlc_ctr: 0,
    });
  });
});

describe("fresh ledger (no migration)", () => {
  it("creates the HLC schema directly when no datoms table exists", () => {
    ensureLedgerSchema(db, "dev-fresh");
    expect(columnNames()).toEqual(
      expect.arrayContaining(["hlc_ms", "hlc_ctr", "device_id"])
    );
    expect(rows()).toHaveLength(0);
  });
});

describe("getOrCreateDeviceId", () => {
  it("generates an id once, then returns the same id on every later call", () => {
    let calls = 0;
    const generate = () => `dev-${++calls}`;

    const first = getOrCreateDeviceId(db, generate);
    const second = getOrCreateDeviceId(db, generate);

    expect(first).toBe("dev-1");
    expect(second).toBe("dev-1"); // stable: the injected generator ran only once
    expect(calls).toBe(1);
  });
});
