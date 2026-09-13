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
  applyCarriedDeletions,
  countDatoms,
  createLedgerSchema,
  execRows,
  heldCarriedDeletions,
  importLedgerRows,
  wipeFacetFromLedger,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import {
  carriedDeletionRow,
  carriedDeletionWarrant,
  CARRIED_DELETION_ATTRIBUTE,
  readCarriedDeletion,
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

const hold = (rows: LedgerRow[]) => importLedgerRows(db, rows);

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
  /** A peer's ledger holding everything, and the wipe arriving as one batch. */
  const deletion = (hlc_ms: number, prefixes: readonly string[] = FOOD) =>
    carriedDeletionRow({ hlc_ms, hlc_ctr: 0, device_id: "dev_a" }, prefixes);

  it("takes the rows the wiping device took, on arrival", () => {
    hold([row({ entity: "fdc:1" }), row({ entity: "habit:1" })]);

    const swept = applyCarriedDeletions(db, [deletion(5_000)]);
    hold([deletion(5_000)]);
    const settled = applyCarriedDeletions(db, [deletion(5_000)]);

    // The first call ran before the row was in the table, so nothing was held
    // to sweep yet; the batch is written first in the worker, which is what the
    // second pair reproduces.
    expect(swept.datomsDeleted).toBe(0);
    expect(settled).toEqual({ prefixes: FOOD, datomsDeleted: 1 });
    expect(entities()).toEqual(["deletion:5000_0_dev_a", "habit:1"]);
  });

  it("gives the same ledger applied twice", () => {
    hold([row(), deletion(5_000)]);

    applyCarriedDeletions(db, [deletion(5_000)]);
    const after = entities();
    const again = applyCarriedDeletions(db, [deletion(5_000)]);

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
      for (const arriving of order) {
        hold([arriving]);
        applyCarriedDeletions(db, [arriving]);
      }
      return entities();
    };

    const forwards = outcome([older, newer]);
    const backwards = outcome([newer, older]);

    expect(forwards).toEqual(backwards);
    expect(forwards).toEqual([
      "deletion:5000_0_dev_a",
      "deletion:7000_0_dev_a",
      "habit:late",
    ]);
  });

  // The hole this closes is at three devices: one that slept through the wipe
  // wakes later, syncs with the peer that already deleted, and re-supplies the
  // rows one hop out.
  it("applies to every arriving batch, not once", () => {
    hold([deletion(5_000)]);
    applyCarriedDeletions(db, [deletion(5_000)]);
    expect(entities()).toEqual(["deletion:5000_0_dev_a"]);

    // A third device, months later, hands back what the wipe took.
    const resupplied = [row({ entity: "fdc:1" }), row({ entity: "fdc:2" })];
    hold(resupplied);
    const swept = applyCarriedDeletions(db, resupplied);

    expect(swept.datomsDeleted).toBe(2);
    expect(entities()).toEqual(["deletion:5000_0_dev_a"]);
  });

  // "Physical delete, never a fold-time filter", so ADR-0079's "a wipe that
  // grows the file is a lie" survives on the peer as well as on the wiper.
  it("removes the rows from the table rather than hiding them", () => {
    hold([row(), deletion(5_000)]);
    expect(countDatoms(db)).toBe(2);

    applyCarriedDeletions(db, [deletion(5_000)]);

    expect(countDatoms(db)).toBe(1);
    expect(
      execRows(db, "SELECT * FROM datoms WHERE entity = 'fdc:1';")
    ).toEqual([]);
  });

  it("carries a prefix this build never minted, and deletes nothing under it", () => {
    const unknown = deletion(5_000, ["telepathy:", "fdc:"]);
    hold([row({ entity: "fdc:1" }), row({ entity: "habit:1" }), unknown]);

    const swept = applyCarriedDeletions(db, [unknown]);

    expect(swept.datomsDeleted).toBe(1);
    expect(entities()).toEqual(["deletion:5000_0_dev_a", "habit:1"]);
    // Carried verbatim: naming it is the notice's job, and a prefix it cannot
    // name is one nothing was deleted under.
    expect(swept.prefixes).toEqual(["telepathy:", "fdc:"]);
  });
});

describe("what a batch obliges, so a wipe is not a scan on every batch forever", () => {
  const deletion = readCarriedDeletion(
    carriedDeletionRow({ hlc_ms: 5_000, hlc_ctr: 0, device_id: "dev_a" }, FOOD)
  )!;

  it("obliges nothing when nothing is held", () => {
    expect(carriedDeletionWarrant([], [row()])).toEqual([]);
  });

  it("obliges nothing for a batch carrying nothing a deletion takes", () => {
    expect(
      carriedDeletionWarrant([deletion], [row({ entity: "habit:1" })])
    ).toEqual([]);
  });

  it("obliges a sweep for a row a held deletion takes", () => {
    expect(
      carriedDeletionWarrant([deletion], [row({ hlc_ms: 1_000 })])
    ).toEqual([deletion]);
  });

  // A row stamped after the act is not the peer re-supplying anything: it is
  // the future, which a wipe never takes.
  it("obliges nothing for a row stamped after the act", () => {
    expect(
      carriedDeletionWarrant([deletion], [row({ hlc_ms: 9_000 })])
    ).toEqual([]);
  });

  // A deletion arriving now may take rows that arrived in any earlier batch —
  // including earlier batches of this same import — so everything held is swept.
  it("obliges every held deletion when the batch carries one", () => {
    const second = readCarriedDeletion(
      carriedDeletionRow({ hlc_ms: 7_000, hlc_ctr: 0, device_id: "dev_b" }, [
        "habit:",
      ])
    )!;
    expect(
      carriedDeletionWarrant(
        [deletion, second],
        [
          carriedDeletionRow(
            { hlc_ms: 7_000, hlc_ctr: 0, device_id: "dev_b" },
            ["habit:"]
          ),
        ]
      )
    ).toEqual([deletion, second]);
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
    expect(applyCarriedDeletions(db, [row()]).datomsDeleted).toBe(0);
  });
});

describe("a user-chosen import is exempt (ADR-0096 §12)", () => {
  // The worker is the one place that knows which of the two a batch is, so the
  // exemption is pinned where the branch is. The message that carries it is
  // `db-client.test.ts`'s, and the two callers are named there.
  const WORKER = readCode("src/lib/db/db.worker.ts");

  it("applies carried deletions only where the batch is a convergence", () => {
    expect(WORKER).toMatch(
      /source === "convergence"\s*\?\s*applyCarriedDeletions\(db, rows\)\s*:\s*SWEPT_NOTHING/
    );
  });

  it("is the only caller, so nothing else can sweep a chosen file", () => {
    expect(WORKER.match(/applyCarriedDeletions\(/g)).toHaveLength(1);
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
