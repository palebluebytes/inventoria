import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  appendDatoms,
  countDatoms,
  createLedgerSchema,
  cursorOf,
  readLedgerPage,
  readLedgerSummary,
  wipeFacetFromLedger,
  type Datom,
  type LedgerCursor,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";
import { entityPrefixesOf } from "../../src/lib/facets/registry";
import { WHOLE_JAR } from "../../src/lib/p2p/lane-scope";

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
    const page = readLedgerPage(db, after, budgetBytes, { entityPrefixes });
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
describe("walking the ledger oldest-first", () => {
  // The order a walk that may be **cut short** needs (ADR-0096 §1: a depositor
  // over the ceiling deposits its *oldest* 16 MiB). A prefix in primary-key
  // order is not downward-closed in stamp order, and the only thing that can
  // summarise a cut-short walk is a version vector — which describes nothing
  // else. A key-ordered prefix therefore claims a watermark the peer has not
  // reached, and every row below it is withheld permanently.

  /** Two rows whose key order and whose stamp order disagree. */
  function crossed(): void {
    // `event:occur_aaa` sorts first by primary key and is stamped later.
    wall = 900;
    append([datom({ entity: "event:occur_aaa", attribute: "event/kind" })]);
    wall = 100;
    clock = createHlc("device_b", { wallClock: () => wall });
    append([datom({ entity: "event:occur_bbb", attribute: "event/kind" })]);
  }

  const walk = (order: "key" | "stamp") => {
    const rows: LedgerRow[] = [];
    let after: LedgerCursor | null = null;
    for (let guard = 0; guard < 100; guard++) {
      const page = readLedgerPage(db, after, 1, { order });
      if (page.length === 0) return rows.map((r) => `${r.entity}@${r.hlc_ms}`);
      rows.push(...page);
      after = cursorOf(page[page.length - 1]);
    }
    throw new Error("paged read did not terminate");
  };

  it("walks by primary key by default, which puts the later stamp first", () => {
    crossed();
    expect(walk("key")).toEqual(["event:occur_aaa@900", "event:occur_bbb@100"]);
  });

  it("walks by stamp when asked, so every prefix is downward-closed", () => {
    crossed();
    expect(walk("stamp")).toEqual([
      "event:occur_bbb@100",
      "event:occur_aaa@900",
    ]);
  });

  it("reaches every row either way, and the same rows", () => {
    crossed();
    append([datom({ entity: "habit:9", attribute: "habit/name" })]);
    expect(walk("stamp").sort()).toEqual(walk("key").sort());
    expect(walk("stamp")).toHaveLength(countDatoms(db));
  });

  it("narrows by vector and orders by stamp together", () => {
    crossed();
    const above = { device_b: { calendar: { hlc_ms: 100, hlc_ctr: 0 } } };
    const page = readLedgerPage(db, null, 1024, { above, order: "stamp" });
    // `event:occur_bbb` is device_b's own row at exactly that mark, so it is held.
    expect(page.map((r) => r.entity)).toEqual(["event:occur_aaa"]);
  });
});

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

// A lane carries the rows of the Tracked Domains its two ends agreed on
// (ADR-0103 §1), and a **Carried deletion** crosses it only where the prefix
// list it froze is a subset of that lane's (§6). The second half is what §1's
// predicate cannot express on its own: a deletion's entity is `deletion:`, so
// its own prefix says nothing about what it deletes.
describe("reading the rows one lane carries", () => {
  const FOOD = entityPrefixesOf("food");

  /** Every row a lane carries, walked the way a deposit walks it. */
  function carried(laneScope: readonly string[]): string[] {
    const all: LedgerRow[] = [];
    let after: LedgerCursor | null = null;
    for (let guard = 0; guard < 1_000; guard++) {
      const page = readLedgerPage(db, after, 1_024, { laneScope });
      if (page.length === 0) {
        return all.map((row) => row.entity);
      }
      all.push(...page);
      after = cursorOf(page[page.length - 1]);
    }
    throw new Error("paged read did not terminate");
  }

  /** One food row, one habit row, and then a wipe of the food. */
  function wiped(prefixes: readonly string[] = FOOD): void {
    append([
      datom({ entity: "fdc:171705", attribute: "twin/name", value: "Oats" }),
      datom({ entity: "habit:1", attribute: "habit/name", value: "Walk" }),
    ]);
    wall = 2_000;
    wipeFacetFromLedger(db, prefixes, clock.now());
    wall = 3_000;
    append([
      datom({ entity: "gtin:5000", attribute: "twin/name", value: "Beans" }),
    ]);
  }

  const deletionIn = (entities: string[]): string[] =>
    entities.filter((entity) => entity.startsWith("deletion:"));

  it("carries its own domains' rows and no others", () => {
    wiped();
    expect(carried(["food"])).toContain("gtin:5000");
    expect(carried(["food"])).not.toContain("habit:1");
  });

  it("carries a deletion of nothing but its own domains", () => {
    wiped();
    // The whole of #415: a food lane, and the food wipe crossing it.
    expect(deletionIn(carried(["food"]))).toHaveLength(1);
  });

  it("leaves a deletion that reaches past it where it stands", () => {
    // A wipe that took Media as well as food. Deleting it down a food lane
    // would take rows the lane never promised to carry (§6).
    wiped([...FOOD, "isbn:"]);
    expect(deletionIn(carried(["food"]))).toEqual([]);
    expect(deletionIn(carried(["food", "media"]))).toHaveLength(1);
  });

  it("carries every deletion down a jar-wide lane", () => {
    wiped([...FOOD, "isbn:"]);
    expect(deletionIn(carried(WHOLE_JAR))).toHaveLength(1);
  });

  it("carries no deletion whose frozen list will not parse, and reads on", () => {
    wiped();
    db.exec({
      sql: "INSERT INTO datoms (entity, attribute, value, time, hlc_ms, hlc_ctr, device_id) VALUES (?, ?, ?, ?, ?, ?, ?);",
      bind: ["deletion:broken", "deletion/prefixes", "not json", 4, 4, 0, "d"],
    });
    // A page read that threw on it would wedge every sync this device ever
    // ran, because the row is in an append-only table forever.
    expect(carried(["food"])).toContain("gtin:5000");
    expect(carried(["food"])).not.toContain("deletion:broken");
    // Down a jar-wide lane it crosses on its entity prefix like any other row
    // of the Jar domain, which is what it did before this rule existed.
    expect(carried(WHOLE_JAR)).toContain("deletion:broken");
  });

  it("carries nothing at all for a lane that names no domain", () => {
    wiped();
    expect(carried([])).toEqual([]);
  });
});
