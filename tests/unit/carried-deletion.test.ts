/**
 * A Facet-scoped wipe carries a deletion the peer applies (ADR-0096 §12, §13).
 *
 * Against the real sqlite-wasm Node build, like every other claim about what one
 * SQL predicate matches: the whole subject here is which rows a `DELETE` takes
 * and which it leaves, and a fake would be asserting the fake.
 *
 * The claims the ticket turns on are all reachable from here — that a wipe emits
 * one `deletion:` entity per act carrying the frozen prefix list, that it takes
 * rows stamped at or before it and nothing after, that applying it twice or out
 * of order gives the same ledger, that it is applied to **every** arriving batch
 * rather than once, that the rows physically go, and that a prefix this build
 * has never heard of is carried without error and deletes nothing.
 *
 * What is not here is the exemption and the notice: which batches are a
 * convergence is `db.worker.ts`'s and is pinned in `db-client.test.ts` and
 * below, and the sentence the peer reads is
 * `carried-deletion-notice.test.ts`'s.
 */
import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  countDatoms,
  createLedgerSchema,
  execRows,
  heldCarriedDeletions,
  importConvergedRows,
  importLedgerRows,
  wipeFacetFromLedger,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import {
  carriedDeletionRow,
  CARRIED_DELETION_ATTRIBUTE,
  readCarriedDeletion,
  siftArrivingRows,
} from "../../src/lib/db/carried-deletion";
import { entityPrefixesOf } from "../../src/lib/facets/registry";
import { readCode } from "./support/source";

let db: LedgerDb;

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as any)();
  db = new sqlite3.oo1.DB();
  createLedgerSchema(db);
});

/** One row, stamped by hand: every claim here is about stamps and prefixes. */
const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  entity: "fdc:1",
  attribute: "twin/name",
  value: '"Oats"',
  time: 1_000,
  hlc_ms: 1_000,
  hlc_ctr: 0,
  device_id: "dev_a",
  ...over,
});

/** Rows already here, by the exempt path: this is what a chosen file does. */
const hold = (rows: LedgerRow[]) => importLedgerRows(db, rows);

/** One batch a convergence brought, by the path a peer's payload takes. */
const arrive = (rows: LedgerRow[]) => importConvergedRows(db, rows).swept;

const entities = (): string[] =>
  execRows<{ entity: string }>(
    db,
    "SELECT DISTINCT entity FROM datoms ORDER BY entity;"
  ).map((r) => r.entity);

const FOOD = entityPrefixesOf("food");

// ---------------------------------------------------------------------------

describe("a wipe writes down the set it took", () => {
  it("emits one entity per act, keyed by the act's own stamp", () => {
    hold([row(), row({ entity: "habit:1" })]);

    const taken = wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 3,
      device_id: "dev_a",
    });

    expect(taken).toBe(1);
    expect(entities()).toEqual(["deletion:5000_3_dev_a", "habit:1"]);
  });

  it("carries the prefix list itself, frozen, and nothing else", () => {
    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });

    const written = execRows<LedgerRow>(
      db,
      "SELECT entity, attribute, value, time, hlc_ms, hlc_ctr, device_id FROM datoms;"
    );
    expect(written).toHaveLength(1);
    expect(written[0].attribute).toBe(CARRIED_DELETION_ATTRIBUTE);
    // The registry's list at the instant of the act, in its own order. Never the
    // Facet and never the domain: a re-derivation would be evaluated against
    // whatever registry the *peer* is running.
    expect(JSON.parse(written[0].value)).toEqual(FOOD);
  });

  // Two wipes are two facts with two stamps. One entity under "a later fact
  // wins" would keep only the newer list, stranding rows under any prefix that
  // retired between builds.
  it("writes a second act beside the first rather than over it", () => {
    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });
    wipeFacetFromLedger(db, ["habit:"], {
      hlc_ms: 6_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });

    const held = heldCarriedDeletions(db);
    expect(held.map((d) => d.prefixes)).toEqual([FOOD, ["habit:"]]);
  });

  // `deletion:` is owned by the Jar domain, which no Facet declares, so it is
  // absent from every Facet's derived prefix set as arithmetic. A wipe that
  // deleted its own record of itself would be the one fatal move.
  it("does not take its own record, or a record of an earlier act", () => {
    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });
    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 6_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });

    expect(entities()).toEqual([
      "deletion:5000_0_dev_a",
      "deletion:6000_0_dev_a",
    ]);
  });

  it("rolls the whole act back rather than deleting without recording", () => {
    hold([row()]);
    const broken = {
      exec: (arg: unknown) => (typeof arg === "string" ? db.exec(arg) : null),
      prepare: () => {
        throw new Error("disk went away");
      },
    } as unknown as LedgerDb;

    expect(() =>
      wipeFacetFromLedger(broken, FOOD, {
        hlc_ms: 5_000,
        hlc_ctr: 0,
        device_id: "dev_a",
      })
    ).toThrow("disk went away");
    expect(entities()).toEqual(["fdc:1"]);
  });
});

describe("it takes rows stamped at or before it, and nothing after", () => {
  it("leaves a row stamped after the act standing, on both sides", () => {
    hold([
      row({ entity: "fdc:before", hlc_ms: 1_000 }),
      row({ entity: "fdc:same", hlc_ms: 5_000, hlc_ctr: 0 }),
      row({ entity: "fdc:after", hlc_ms: 9_000 }),
    ]);

    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });

    // The bound is inclusive on the counter: a row stamped in the same tick as
    // the act is one the act saw.
    expect(entities()).toEqual(["deletion:5000_0_dev_a", "fdc:after"]);
  });

  it("separates two rows of the same millisecond by their counter", () => {
    hold([
      row({ entity: "fdc:a", hlc_ms: 5_000, hlc_ctr: 1 }),
      row({ entity: "fdc:b", hlc_ms: 5_000, hlc_ctr: 2 }),
      row({ entity: "fdc:c", hlc_ms: 5_000, hlc_ctr: 3 }),
    ]);

    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 2,
      device_id: "dev_a",
    });

    expect(entities()).toEqual(["deletion:5000_2_dev_a", "fdc:c"]);
  });
});

describe("a peer applies it, and the outcome does not depend on order", () => {
  /** The wipe as it crosses: one datom in a batch a convergence brought. */
  const deletion = (hlc_ms: number, prefixes: readonly string[] = FOOD) =>
    carriedDeletionRow({ hlc_ms, hlc_ctr: 0, device_id: "dev_a" }, prefixes);

  it("takes what it covers that is already here, the moment it arrives", () => {
    hold([row({ entity: "fdc:1" }), row({ entity: "habit:1" })]);

    const swept = arrive([deletion(5_000)]);

    expect(swept).toEqual({ prefixes: ["fdc:"], datomsDeleted: 1, refused: 0 });
    expect(entities()).toEqual(["deletion:5000_0_dev_a", "habit:1"]);
  });

  // A wipe carries its Facet's whole prefix set, and this peer had meals under
  // one of them. Naming the other four would claim rows that were never here.
  it("names only the prefixes rows actually went under", () => {
    hold([
      row({ entity: "fdc:1" }),
      row({ entity: "event:consume_1" }),
      row({ entity: "recipe:1" }),
    ]);

    expect(arrive([deletion(5_000, ["fdc:", "recipe:", "gtin:"])])).toEqual({
      prefixes: ["fdc:", "recipe:"],
      datomsDeleted: 2,
      refused: 0,
    });
  });

  it("gives the same ledger when the same deletion arrives again", () => {
    hold([row()]);
    arrive([deletion(5_000)]);
    const after = entities();

    // A collection that could not settle is retried whole, so the peer sends
    // the deletion a second time. It is held by then, so it sweeps nothing.
    const again = arrive([deletion(5_000)]);

    expect(again.datomsDeleted).toBe(0);
    expect(entities()).toEqual(after);
  });

  it("gives the same ledger whichever of two deletions arrives first", () => {
    const older = deletion(5_000);
    const newer = deletion(7_000, ["habit:"]);
    const outcome = (order: LedgerRow[]) => {
      db.exec("DELETE FROM datoms;");
      hold([
        row({ entity: "fdc:1", hlc_ms: 1_000 }),
        row({ entity: "habit:1", hlc_ms: 1_000 }),
        row({ entity: "habit:late", hlc_ms: 9_000 }),
      ]);
      for (const arriving of order) arrive([arriving]);
      return entities();
    };

    expect(outcome([older, newer])).toEqual(outcome([newer, older]));
    expect(outcome([older, newer])).toEqual([
      "deletion:5000_0_dev_a",
      "deletion:7000_0_dev_a",
      "habit:late",
    ]);
  });

  // The hole this closes is at three devices: one that slept through the wipe
  // wakes later, syncs with the peer that already deleted, and re-supplies the
  // rows one hop out.
  it("refuses rows a device that slept through the wipe re-supplies", () => {
    arrive([deletion(5_000)]);
    expect(entities()).toEqual(["deletion:5000_0_dev_a"]);

    // A third device, months later, hands back what the wipe took.
    const swept = arrive([row({ entity: "fdc:1" }), row({ entity: "fdc:2" })]);

    expect(swept).toEqual({ prefixes: [], datomsDeleted: 0, refused: 2 });
    expect(entities()).toEqual(["deletion:5000_0_dev_a"]);
  });

  // "Refused" is silent: the person was told when the act arrived, and nothing
  // left the ledger this time.
  it("says nothing further about a batch that only re-supplied", () => {
    arrive([deletion(5_000)]);
    expect(arrive([row()]).datomsDeleted).toBe(0);
  });

  // "Physical delete, never a fold-time filter", so ADR-0079's "a wipe that
  // grows the file is a lie" survives on the peer as well as on the wiper.
  it("removes the rows from the table rather than hiding them", () => {
    hold([row()]);
    expect(countDatoms(db)).toBe(1);

    arrive([deletion(5_000)]);

    expect(countDatoms(db)).toBe(1);
    expect(
      execRows(db, "SELECT * FROM datoms WHERE entity = 'fdc:1';")
    ).toEqual([]);
  });

  it("carries a prefix this build never minted, and deletes nothing under it", () => {
    hold([row({ entity: "fdc:1" }), row({ entity: "habit:1" })]);

    const swept = arrive([deletion(5_000, ["telepathy:", "fdc:"])]);

    expect(swept.datomsDeleted).toBe(1);
    expect(entities()).toEqual(["deletion:5000_0_dev_a", "habit:1"]);
    // Named only where rows went, so the prefix nothing was deleted under is
    // carried into the ledger and out of the sentence.
    expect(swept.prefixes).toEqual(["fdc:"]);
  });

  it("rolls the batch back with the sweep, so no deletion is held unapplied", () => {
    hold([row()]);
    // The write lands and the sweep's `DELETE` does not, which is the one
    // ordering that could leave a deletion here that nothing will ever apply.
    let statements = 0;
    const brittle: LedgerDb = {
      exec: (arg: any) => (db.exec as any)(arg),
      prepare: (sql: string) => {
        if (++statements > 1) throw new Error("disk went away");
        return db.prepare(sql);
      },
    };

    expect(() => importConvergedRows(brittle, [deletion(5_000)])).toThrow(
      "disk went away"
    );
    // Neither half landed, so the peer's retry brings the deletion round again
    // as one this ledger has never held.
    expect(heldCarriedDeletions(db)).toEqual([]);
    expect(entities()).toEqual(["fdc:1"]);
  });
});

describe("a user-chosen file is exempt, and stays exempt", () => {
  const deletion = (hlc_ms: number) =>
    carriedDeletionRow({ hlc_ms, hlc_ctr: 0, device_id: "dev_a" }, FOOD);

  // "Wipe, then import is already the sanctioned way to make a file the only
  // truth" (ADR-0096 §12), so the wipe's own deletion is in the ledger when the
  // chosen file lands beneath it.
  it("keeps a restored backup that a held deletion covers", () => {
    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });

    hold([row({ entity: "fdc:1", hlc_ms: 1_000 })]);

    expect(entities()).toContain("fdc:1");
  });

  // The half the first draft of this got wrong: a whole-table sweep on a later
  // batch would have undone the restore on whatever a peer happened to send
  // next. ADR-0096's Consequences say the import exemption keeps the food
  // *locally*, permanently.
  it("still keeps it however many later batches arrive from a peer", () => {
    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });
    hold([row({ entity: "fdc:1", hlc_ms: 1_000 })]);

    arrive([row({ entity: "habit:1", hlc_ms: 2_000 })]);
    // The wipe's own deletion coming back round the loop from the peer that
    // collected it. Held already, so it sweeps nothing.
    arrive([deletion(5_000)]);
    arrive([row({ entity: "habit:2", hlc_ms: 3_000 })]);

    expect(entities()).toContain("fdc:1");
  });

  // The exemption is not a shield against the future. A *second* wipe, made
  // after the restore in stamp order, takes it — which is "it takes rows
  // stamped at or before it" doing exactly what it says, and is the same answer
  // the wiping device gave itself.
  it("does not shield it from a later wipe on another device", () => {
    hold([row({ entity: "fdc:1", hlc_ms: 1_000 })]);

    arrive([deletion(6_000)]);

    expect(entities()).not.toContain("fdc:1");
  });

  it("keeps it even where a peer re-supplies the very same row", () => {
    wipeFacetFromLedger(db, FOOD, {
      hlc_ms: 5_000,
      hlc_ctr: 0,
      device_id: "dev_a",
    });
    hold([row({ entity: "fdc:1", hlc_ms: 1_000 })]);

    // Refused rather than deleted by key, which is the whole reason the
    // arriving half refuses: the copy already here is the user's restore.
    expect(arrive([row({ entity: "fdc:1", hlc_ms: 1_000 })]).refused).toBe(1);
    expect(entities()).toContain("fdc:1");
  });
});

describe("what an arriving batch is held to", () => {
  const deletion = readCarriedDeletion(
    carriedDeletionRow({ hlc_ms: 5_000, hlc_ctr: 0, device_id: "dev_a" }, FOOD)
  )!;

  it("keeps everything when nothing is held", () => {
    expect(siftArrivingRows([], [row()])).toEqual({
      keep: [row()],
      refused: 0,
    });
  });

  it("keeps a row no held deletion covers", () => {
    expect(
      siftArrivingRows([deletion], [row({ entity: "habit:1" })]).refused
    ).toBe(0);
  });

  it("refuses a row a held deletion covers", () => {
    expect(siftArrivingRows([deletion], [row({ hlc_ms: 1_000 })])).toEqual({
      keep: [],
      refused: 1,
    });
  });

  // A row stamped after the act is not the peer re-supplying anything: it is
  // the future, which a wipe never takes.
  it("keeps a row stamped after the act", () => {
    expect(siftArrivingRows([deletion], [row({ hlc_ms: 9_000 })]).refused).toBe(
      0
    );
  });

  // The deletion in the batch is not yet held, so it is written and then takes
  // the table; refusing it here would be the wipe deleting its own record.
  it("keeps the deletion the batch itself carries", () => {
    const arriving = carriedDeletionRow(
      { hlc_ms: 7_000, hlc_ctr: 0, device_id: "dev_b" },
      ["habit:"]
    );
    expect(siftArrivingRows([deletion], [arriving]).keep).toEqual([arriving]);
  });
});

describe("a malformed record is ignored rather than thrown on", () => {
  // It is in an append-only table forever, so a throw would wedge every
  // convergence this device ever attempts.
  it.each([
    ['"not a list"', "a value that is not a list"],
    ["[1,2]", "a list that is not of strings"],
    ["{", "a value that will not parse"],
  ])("drops %s (%s)", (value) => {
    hold([
      row({
        entity: "deletion:5000_0_dev_a",
        attribute: CARRIED_DELETION_ATTRIBUTE,
        value,
      }),
      row(),
    ]);

    expect(heldCarriedDeletions(db)).toEqual([]);
    expect(arrive([row()]).datomsDeleted).toBe(0);
  });
});

describe("a user-chosen import is exempt (ADR-0096 §12)", () => {
  // The worker is the one place that knows which of the two a batch is, so the
  // exemption is pinned where the branch is. The message that carries it is
  // `db-client.test.ts`'s, and the two callers are named there.
  const WORKER = readCode("src/lib/db/db.worker.ts");

  it("takes the converging write path only where the batch is a convergence", () => {
    expect(WORKER).toMatch(
      /source === "convergence"\s*\?\s*importConvergedRows\(db, rows\)\s*:\s*\{ outcome: importLedgerRows\(db, rows\), swept: SWEPT_NOTHING \}/
    );
  });

  it("is the only caller, so nothing else can hold a chosen file to one", () => {
    expect(WORKER.match(/importConvergedRows\(/g)).toHaveLength(1);
  });

  it("names a convergence at both p2p write seams and an import at the file", () => {
    expect(readCode("src/lib/p2p/wake-errand.ts")).toMatch(
      /ledgerImport\(rows, final, "convergence"\)/
    );
    expect(readCode("src/lib/p2p/sync-ledger.ts")).toMatch(
      /ledgerImport\(rows, final, "convergence"\)/
    );
    expect(readCode("src/lib/views/ledger/LedgerImport.svelte")).toMatch(
      /ledgerImport\(rows, final, "import"\)/
    );
  });
});
