/**
 * The version vector, against the real sqlite-wasm build (ADR-0075 §6).
 *
 * It is tested against the engine rather than a fake because the two claims
 * that matter are SQL's: that the greatest `(hlc_ms, hlc_ctr)` per device comes
 * off **one row**, and that "above this vector" is a per-device comparison
 * rather than a scalar one. A mock would agree with whatever the query said.
 *
 * The refutation the record turns on is written out as a test of its own: a row
 * stamped **below** this device's greatest stamp still crosses, because it came
 * from a device the peer has never heard of. That is the bug a scalar watermark
 * would make invisible and permanent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createLedgerSchema,
  cursorOf,
  importLedgerRows,
  readLedgerPage,
  readLedgerVersionVector,
  type LedgerCursor,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import {
  EMPTY_VERSION_VECTOR,
  readVersionVector,
  VersionVectorRefusedError,
  type VersionVector,
} from "../../src/lib/db/version-vector";

let db: LedgerDb;

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as any)();
  db = new sqlite3.oo1.DB();
  createLedgerSchema(db);
});

/** One row, stamped by hand: these tests are about stamps, not about writes. */
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

const hold = (rows: LedgerRow[]) => importLedgerRows(db, rows);

/** Every row a holder of `vector` lacks, walked the way a sync sends them. */
function rowsAbove(vector: VersionVector, budgetBytes = 64 * 1024) {
  const all: LedgerRow[] = [];
  let after: LedgerCursor | null = null;
  for (let guard = 0; guard < 1_000; guard++) {
    const page = readLedgerPage(db, after, budgetBytes, { above: vector });
    if (page.length === 0) return all;
    all.push(...page);
    after = cursorOf(page[page.length - 1]);
  }
  throw new Error("the walk above a vector did not terminate");
}

describe("the vector is a read of the ledger", () => {
  it("is empty for an empty ledger, which is what a first sync sends", () => {
    expect(readLedgerVersionVector(db)).toEqual({});
  });

  it("names the greatest stamp this device holds from each device", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 0 }),
      row({ attribute: "a/2", hlc_ms: 3_000, hlc_ctr: 0 }),
      row({ attribute: "b/1", hlc_ms: 2_000, hlc_ctr: 7, device_id: "dev_b" }),
    ]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: { hlc_ms: 3_000, hlc_ctr: 0 },
      dev_b: { hlc_ms: 2_000, hlc_ctr: 7 },
    });
  });

  it("takes both halves of the stamp off one row", () => {
    // `MAX(hlc_ms), MAX(hlc_ctr)` would report (3000, 9) here, and the peer
    // would be told to withhold a row nobody holds.
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 9 }),
      row({ attribute: "a/2", hlc_ms: 3_000, hlc_ctr: 0 }),
    ]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: { hlc_ms: 3_000, hlc_ctr: 0 },
    });
  });

  it("breaks a same-millisecond tie on the counter", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 4 }),
      row({ attribute: "a/2", hlc_ms: 1_000, hlc_ctr: 11 }),
    ]);
    expect(readLedgerVersionVector(db)).toEqual({
      device_a: { hlc_ms: 1_000, hlc_ctr: 11 },
    });
  });
});

describe("what crosses is what the peer lacks", () => {
  it("sends the whole ledger to a peer holding nothing", () => {
    hold([row({ attribute: "a/1" }), row({ attribute: "a/2" })]);
    expect(rowsAbove(EMPTY_VERSION_VECTOR)).toHaveLength(2);
  });

  it("sends nothing to a peer whose vector matches this ledger's", () => {
    hold([row({ attribute: "a/1" }), row({ attribute: "a/2", hlc_ms: 2_000 })]);
    expect(rowsAbove(readLedgerVersionVector(db))).toEqual([]);
  });

  it("sends only what is past the peer's stamp for that device", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000 }),
      row({ attribute: "a/2", hlc_ms: 2_000 }),
      row({ attribute: "a/3", hlc_ms: 3_000 }),
    ]);
    const sent = rowsAbove({ device_a: { hlc_ms: 1_000, hlc_ctr: 0 } });
    expect(sent.map((r) => r.hlc_ms)).toEqual([2_000, 3_000]);
  });

  it("sends the counter's successors at the same millisecond", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 1_000, hlc_ctr: 0 }),
      row({ attribute: "a/2", hlc_ms: 1_000, hlc_ctr: 1 }),
    ]);
    const sent = rowsAbove({ device_a: { hlc_ms: 1_000, hlc_ctr: 0 } });
    expect(sent.map((r) => r.hlc_ctr)).toEqual([1]);
  });

  // The refutation of the scalar watermark, stated as a row rather than as an
  // argument: this row is below the greatest stamp in the ledger and still has
  // to cross, because the peer has never heard of the device that minted it.
  it("sends a row stamped below this ledger's maximum, from a device the peer lacks", () => {
    hold([
      row({ attribute: "a/1", hlc_ms: 9_000 }),
      row({ attribute: "b/1", hlc_ms: 40, device_id: "dev_b" }),
    ]);
    const sent = rowsAbove({ device_a: { hlc_ms: 9_000, hlc_ctr: 0 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ device_id: "dev_b", hlc_ms: 40 });
  });

  it("narrows with a Facet's prefixes at the same time", () => {
    hold([
      row({ entity: "habit:1", attribute: "a/1" }),
      row({ entity: "fdc:1", attribute: "a/1" }),
    ]);
    const page = readLedgerPage(db, null, 64 * 1024, {
      above: EMPTY_VERSION_VECTOR,
      entityPrefixes: ["fdc:"],
    });
    expect(page.map((r) => r.entity)).toEqual(["fdc:1"]);
  });

  it("keeps paging under the byte budget, so a photo crosses on its own", () => {
    hold([
      row({ attribute: "a/1", value: JSON.stringify("x".repeat(4_000)) }),
      row({ attribute: "a/2", value: JSON.stringify("y".repeat(4_000)) }),
    ]);
    const page = readLedgerPage(db, null, 4_100, {
      above: EMPTY_VERSION_VECTOR,
    });
    expect(page).toHaveLength(1);
    expect(rowsAbove(EMPTY_VERSION_VECTOR, 4_100)).toHaveLength(2);
  });
});

describe("a vector that arrived from somewhere else is checked", () => {
  it("reads the shape a peer sends", () => {
    expect(readVersionVector({ dev_b: { hlc_ms: 2, hlc_ctr: 1 } })).toEqual({
      dev_b: { hlc_ms: 2, hlc_ctr: 1 },
    });
  });

  it("reads an empty object as the empty vector", () => {
    expect(readVersionVector({})).toEqual({});
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a number", 7],
  ])("refuses %s, which is not a vector at all", (_what, raw) => {
    expect(() => readVersionVector(raw)).toThrow(VersionVectorRefusedError);
  });

  it.each([
    ["half a stamp", { dev_b: { hlc_ms: 2 } }],
    ["a stamp that is not whole", { dev_b: { hlc_ms: 2.5, hlc_ctr: 0 } }],
    ["a negative stamp", { dev_b: { hlc_ms: -1, hlc_ctr: 0 } }],
    ["a stamp that is text", { dev_b: { hlc_ms: "2", hlc_ctr: 0 } }],
    ["no stamp at all", { dev_b: null }],
  ])("refuses %s rather than syncing off it", (_what, raw) => {
    expect(() => readVersionVector(raw)).toThrow(VersionVectorRefusedError);
  });

  it("names the device whose entry is broken, and never what it said", () => {
    try {
      readVersionVector({ dev_b: { hlc_ms: "tomorrow", hlc_ctr: 0 } });
      expect.unreachable("a broken entry was accepted");
    } catch (refusal) {
      expect(String(refusal)).toContain("dev_b");
      expect(String(refusal)).not.toContain("tomorrow");
    }
  });
});
