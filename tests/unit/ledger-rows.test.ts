/**
 * The read a Meal payload is built from: which rows it asks the worker for, and
 * which it never asks for at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.hoisted(() => vi.fn(async () => []));
vi.mock("../../src/lib/db/db.client", () => ({ dbClient: { query } }));

const { ledgerEntityRows } = await import("../../src/lib/p2p/ledger-rows");
const { OMITTED_ATTRIBUTES } = await import("../../src/lib/p2p/meal-payload");

const lastCall = () =>
  query.mock.calls[query.mock.calls.length - 1] as unknown as [
    string,
    unknown[],
  ];

describe("ledgerEntityRows", () => {
  beforeEach(() => query.mockClear());

  it("asks for every row of every entity in one read", async () => {
    await ledgerEntityRows(["event:consume_1", "fdc:123"]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = lastCall();
    expect(sql).toContain("FROM datoms");
    expect(params).toEqual(
      expect.arrayContaining(["event:consume_1", "fdc:123"])
    );
  });

  it("reads the whole row, so a datom crosses byte for byte", async () => {
    await ledgerEntityRows(["fdc:123"]);
    const [sql] = lastCall();
    for (const column of [
      "entity",
      "attribute",
      "value",
      "hlc_ms",
      "hlc_ctr",
      "device_id",
      "time",
    ]) {
      expect(sql).toContain(column);
    }
  });

  it("never fetches an attribute that never crosses", async () => {
    // A label photo dropped on the main thread is a label photo that already
    // crossed the worker boundary.
    await ledgerEntityRows(["food:custom_1"]);
    const [sql, params] = lastCall();
    expect(sql).toContain("attribute NOT IN");
    for (const attribute of OMITTED_ATTRIBUTES) {
      expect(params).toContain(attribute);
    }
  });

  it("reads only through bound parameters, never through built SQL", async () => {
    await ledgerEntityRows(["food:custom_'; DROP TABLE datoms; --"]);
    const [sql, params] = lastCall();
    expect(sql).not.toContain("DROP TABLE");
    expect(params).toContain("food:custom_'; DROP TABLE datoms; --");
  });

  it("asks nothing when the walk has nothing left to reach", async () => {
    expect(await ledgerEntityRows([])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
