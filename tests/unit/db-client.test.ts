import { describe, it, expect, beforeEach, vi } from "vitest";

// Fake Worker capturing posted messages and letting tests drive responses, so
// the RPC layer can be tested without instantiating the real SQLite worker.
// Declared via vi.hoisted because the vi.mock factory below is hoisted too.
const { FakeWorker, getWorker, resetWorker } = vi.hoisted(() => {
  let inst: any = null;
  class FakeWorker {
    onmessage: ((e: any) => void) | null = null;
    posted: any[] = [];
    terminated = false;
    constructor() {
      inst = this;
    }
    postMessage(msg: any) {
      this.posted.push(msg);
    }
    terminate() {
      this.terminated = true;
    }
    respond(id: string, body: any) {
      this.onmessage?.({ data: { id, ...body } });
    }
    broadcast(attributes: string[]) {
      this.onmessage?.({
        data: { type: "broadcast_invalidation", payload: { attributes } },
      });
    }
    get lastId(): string {
      return this.posted[this.posted.length - 1].id;
    }
  }
  return {
    FakeWorker,
    getWorker: () => inst as InstanceType<typeof FakeWorker>,
    resetWorker: () => {
      inst = null;
    },
  };
});

vi.mock("../../src/lib/db/db.worker?worker", () => ({ default: FakeWorker }));

import { DBClient } from "../../src/lib/db/db.client";

async function makeInitialized(): Promise<DBClient> {
  const c = new DBClient();
  const p = c.init();
  getWorker().respond(getWorker().lastId, { status: "ok" });
  await p;
  return c;
}

describe("DBClient RPC layer", () => {
  beforeEach(() => {
    resetWorker();
  });

  it("rejects calls before initialization", async () => {
    const c = new DBClient();
    await expect(c.query("SELECT 1")).rejects.toThrow(/not initialized/i);
  });

  it("init posts an init message and resolves on ok", async () => {
    const c = new DBClient();
    const p = c.init();
    expect(getWorker()).not.toBeNull();
    expect(getWorker().posted[0].type).toBe("init");
    getWorker().respond(getWorker().posted[0].id, { status: "ok" });
    await expect(p).resolves.toBeUndefined();
  });

  it("is idempotent: a second init does not create a new worker", async () => {
    const c = await makeInitialized();
    const first = getWorker();
    await c.init();
    expect(getWorker()).toBe(first);
  });

  it("correlates query responses by id and resolves with data", async () => {
    const c = await makeInitialized();
    const rows = [{ a: 1 }];
    const p = c.query("SELECT 1");
    getWorker().respond(getWorker().lastId, {
      status: "ok",
      data: rows,
    });
    await expect(p).resolves.toEqual(rows);
  });

  it("rejects with the worker error when status is not ok", async () => {
    const c = await makeInitialized();
    const p = c.append([{ entity: "e", attribute: "a", value: 1, time: 1 }]);
    getWorker().respond(getWorker().lastId, {
      status: "error",
      error: "boom",
    });
    await expect(p).rejects.toThrow("boom");
  });

  it("ignores responses with unknown ids", async () => {
    const c = await makeInitialized();
    const p = c.query("SELECT 1");
    getWorker().respond("does-not-exist", { status: "ok", data: [] });
    getWorker().respond(getWorker().lastId, {
      status: "ok",
      data: [42],
    });
    await expect(p).resolves.toEqual([42]);
  });

  it("fires invalidation listeners on broadcast and supports cleanup", async () => {
    const c = await makeInitialized();
    const seen: string[][] = [];
    const off = c.onInvalidate((attrs) => seen.push(attrs));
    getWorker().broadcast(["food/calories"]);
    expect(seen).toEqual([["food/calories"]]);
    off();
    getWorker().broadcast(["x"]);
    expect(seen).toHaveLength(1);
  });

  it("does not resolve pending requests on a broadcast", async () => {
    const c = await makeInitialized();
    const p = c.query("SELECT 1");
    let resolved = false;
    p.then(() => (resolved = true));
    getWorker().broadcast(["a"]);
    await Promise.resolve();
    expect(resolved).toBe(false);
    getWorker().respond(getWorker().lastId, { status: "ok", data: [] });
    await expect(p).resolves.toEqual([]);
  });

  it("asks the worker for the ledger summary", async () => {
    const c = await makeInitialized();
    const p = c.ledgerSummary();
    expect(getWorker().posted[1].type).toBe("ledger_summary");
    getWorker().respond(getWorker().lastId, {
      status: "ok",
      data: { row_count: 3, device_id: "device_a" },
    });
    await expect(p).resolves.toEqual({ row_count: 3, device_id: "device_a" });
  });

  it("sends the cursor and the byte budget with a ledger page request", async () => {
    const c = await makeInitialized();
    const after = {
      entity: "habit:1",
      attribute: "habit/name",
      hlc_ms: 5,
      hlc_ctr: 0,
      device_id: "device_a",
    };
    const p = c.ledgerPage(after, 2048);
    expect(getWorker().posted[1]).toMatchObject({
      type: "ledger_page",
      payload: { after, budgetBytes: 2048 },
    });
    getWorker().respond(getWorker().lastId, { status: "ok", data: [] });
    await expect(p).resolves.toEqual([]);
  });

  // A Facet-scoped export walks the same pages narrowed to the rows the Facet
  // owns (ADR-0079 §6), and its count comes back off the same predicate.
  it("carries a Facet's prefixes into both the page walk and the summary", async () => {
    const c = await makeInitialized();
    const entityPrefixes = ["fdc:", "gtin:"];

    const page = c.ledgerPage(null, 2048, entityPrefixes);
    expect(getWorker().posted[1]).toMatchObject({
      type: "ledger_page",
      payload: { budgetBytes: 2048, entityPrefixes },
    });
    getWorker().respond(getWorker().lastId, { status: "ok", data: [] });
    await expect(page).resolves.toEqual([]);

    const summary = c.ledgerSummary(entityPrefixes);
    expect(getWorker().posted[2]).toMatchObject({
      type: "ledger_summary",
      payload: { entityPrefixes },
    });
    getWorker().respond(getWorker().lastId, {
      status: "ok",
      data: { row_count: 2, device_id: "device_a" },
    });
    await expect(summary).resolves.toEqual({
      row_count: 2,
      device_id: "device_a",
    });
  });

  it("sends an import batch and says whether it finishes the import", async () => {
    const c = await makeInitialized();
    const rows = [
      {
        entity: "habit:1",
        attribute: "habit/name",
        value: '"Meditate"',
        time: 1_000,
        hlc_ms: 1_000,
        hlc_ctr: 0,
        device_id: "device_a",
      },
    ];
    const p = c.ledgerImport(rows, true);
    expect(getWorker().posted[1]).toMatchObject({
      type: "ledger_import",
      payload: { rows, final: true },
    });
    getWorker().respond(getWorker().lastId, { status: "ok", data: 1 });
    await expect(p).resolves.toBe(1);
  });

  it("censuses the ledger by group in one message", async () => {
    const c = await makeInitialized();
    const groups = [{ id: "food", prefixes: ["fdc:"] }];
    const p = c.entityCensus(groups);
    expect(getWorker().posted[1]).toMatchObject({
      type: "entity_census",
      payload: { groups },
    });
    getWorker().respond(getWorker().lastId, {
      status: "ok",
      data: { total: 9, counts: { food: 4 } },
    });
    await expect(p).resolves.toEqual({ total: 9, counts: { food: 4 } });
  });

  // The third sanctioned deletion (ADR-0079 §1). The prefixes arrive derived
  // from the registry; the client assembles nothing.
  it("sends one Facet's prefixes to the wipe, and reports the rows that went", async () => {
    const c = await makeInitialized();
    const p = c.facetWipe(["fdc:", "gtin:"]);
    expect(getWorker().posted[1]).toMatchObject({
      type: "facet_wipe",
      payload: { entityPrefixes: ["fdc:", "gtin:"] },
    });
    getWorker().respond(getWorker().lastId, { status: "ok", data: 120 });
    await expect(p).resolves.toBe(120);
  });

  it("asks the worker to vacuum, separately from a clear", async () => {
    const c = await makeInitialized();
    const cleared = c.clear();
    expect(getWorker().posted[1]).toMatchObject({ type: "clear", payload: {} });
    getWorker().respond(getWorker().lastId, { status: "ok" });
    await expect(cleared).resolves.toBeUndefined();

    // Two messages, not one (#290): the Facet-scoped wipe reclaims after a
    // different delete, so the reclaim is never folded into this one.
    const p = c.vacuum();
    expect(getWorker().posted[2]).toMatchObject({
      type: "vacuum",
      payload: {},
    });
    getWorker().respond(getWorker().lastId, { status: "ok" });
    await expect(p).resolves.toBeUndefined();
  });

  it("rejects when the vacuum fails, rather than reporting a second shape", async () => {
    const c = await makeInitialized();
    const p = c.vacuum();
    getWorker().respond(getWorker().lastId, {
      status: "error",
      error: "database or disk is full",
    });
    await expect(p).rejects.toThrow("database or disk is full");
  });

  it("terminate clears the worker and rejects subsequent calls", async () => {
    const c = await makeInitialized();
    const inst = getWorker();
    c.terminate();
    expect(inst.terminated).toBe(true);
    await expect(c.query("SELECT 1")).rejects.toThrow(/not initialized/i);
  });
});
