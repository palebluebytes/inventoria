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

  it("terminate clears the worker and rejects subsequent calls", async () => {
    const c = await makeInitialized();
    const inst = getWorker();
    c.terminate();
    expect(inst.terminated).toBe(true);
    await expect(c.query("SELECT 1")).rejects.toThrow(/not initialized/i);
  });
});
