import { describe, it, expect } from "vitest";
import {
  byFrecency,
  frecencyOf,
  FRECENCY_DECAY,
  FRECENCY_HISTORY,
  FRECENCY_THRESHOLD,
  NEVER_LOGGED,
} from "../../src/lib/food/frecency";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

// #165's ordering key, modelled on `prescient.el`: recency then decayed
// frequency, never a blended score. Derived from the ledger rather than stored,
// so every case here is a history in and two keys out.

let seq = 0;
const log = (
  target: string,
  time: number,
  extra: Partial<ConsumptionEvent> = {}
): ConsumptionEvent => ({
  id: `e${seq++}`,
  time,
  target,
  ...extra,
});

describe("frecencyOf", () => {
  it("is silent about a food nobody logged", () => {
    const frecency = frecencyOf([]);
    expect(frecency.size).toBe(0);
    expect(frecency.get("fdc:1") ?? NEVER_LOGGED).toEqual({
      recent: 0,
      frequent: 0,
    });
  });

  it("ranks the most recently logged food highest on recency", () => {
    const frecency = frecencyOf([
      log("fdc:1", 100),
      log("fdc:2", 200),
      log("fdc:3", 300),
    ]);
    expect(frecency.get("fdc:3")!.recent).toBe(FRECENCY_HISTORY);
    expect(frecency.get("fdc:2")!.recent).toBe(FRECENCY_HISTORY - 1);
    expect(frecency.get("fdc:1")!.recent).toBe(FRECENCY_HISTORY - 2);
  });

  it("counts the ring in DISTINCT foods, so one food eaten daily crowds nobody out", () => {
    // Ninety-nine logs of one food, then one log of another. Counted in logs the
    // second food would fall out of a hundred-slot ring; counted in distinct
    // foods it is simply the second food.
    const events = [
      ...Array.from({ length: 99 }, (_, i) => log("fdc:oats", i + 1)),
      log("fdc:pear", 200),
    ];
    const frecency = frecencyOf(events);
    expect(frecency.get("fdc:pear")!.recent).toBe(FRECENCY_HISTORY);
    expect(frecency.get("fdc:oats")!.recent).toBe(FRECENCY_HISTORY - 1);
  });

  it("drops out of the ring past FRECENCY_HISTORY distinct foods", () => {
    const events = Array.from({ length: FRECENCY_HISTORY + 5 }, (_, i) =>
      log(`fdc:${i}`, i + 1)
    );
    const frecency = frecencyOf(events);
    // Newest first: index 0 is the newest food, index FRECENCY_HISTORY the
    // first one past the ring.
    const newest = `fdc:${FRECENCY_HISTORY + 4}`;
    const beyond = `fdc:${4}`;
    expect(frecency.get(newest)!.recent).toBe(FRECENCY_HISTORY);
    expect(frecency.get(beyond)!.recent).toBe(0);
    // Still carries a frequency: falling out of the ring stops it discriminating
    // on recency and hands the question to the other key, which is the whole
    // reason the ring is bounded.
    expect(frecency.get(beyond)!.frequent).toBeGreaterThan(0);
  });

  it("weights a log by the number of logs that followed it", () => {
    // prescient multiplies every stored frequency by the decay on each new
    // selection, so a log k selections old is worth decay ** k. Derived from a
    // history, the same weight falls out of the log's own age.
    const frecency = frecencyOf([
      log("fdc:old", 100),
      log("fdc:mid", 200),
      log("fdc:new", 300),
    ]);
    expect(frecency.get("fdc:new")!.frequent).toBeCloseTo(1, 10);
    expect(frecency.get("fdc:mid")!.frequent).toBeCloseTo(FRECENCY_DECAY, 10);
    expect(frecency.get("fdc:old")!.frequent).toBeCloseTo(
      FRECENCY_DECAY ** 2,
      10
    );
  });

  it("sums a food's logs, so forty breakfasts outweigh one", () => {
    const banana = Array.from({ length: 40 }, (_, i) =>
      log("fdc:banana", i + 1)
    );
    const frecency = frecencyOf([...banana, log("fdc:sardines", 100)]);
    // The sardines are newer and win recency outright...
    expect(frecency.get("fdc:sardines")!.recent).toBeGreaterThan(
      frecency.get("fdc:banana")!.recent
    );
    // ...and lose frequency by a mile, which is the key #165 exists to add.
    expect(frecency.get("fdc:banana")!.frequent).toBeGreaterThan(
      frecency.get("fdc:sardines")!.frequent * 30
    );
  });

  it("forgets a food whose weight has decayed below the threshold", () => {
    // One log, then enough later logs to decay it under FRECENCY_THRESHOLD.
    const horizon = Math.ceil(
      Math.log(FRECENCY_THRESHOLD) / Math.log(FRECENCY_DECAY)
    );
    const events = [
      log("fdc:once", 1),
      ...Array.from({ length: horizon + 10 }, (_, i) =>
        log(`fdc:x${i}`, i + 2)
      ),
    ];
    const frecency = frecencyOf(events);
    expect(frecency.get("fdc:once")!.frequent).toBe(0);
    expect(frecency.get("fdc:once")!.recent).toBe(0);
  });

  it("does not count a retracted log", () => {
    const frecency = frecencyOf([
      log("fdc:kept", 100),
      log("fdc:undone", 200, { status: "retracted" }),
    ]);
    expect(frecency.has("fdc:undone")).toBe(false);
    // And the retraction does not shift what remains: the kept log is still the
    // newest thing that happened.
    expect(frecency.get("fdc:kept")!.recent).toBe(FRECENCY_HISTORY);
    expect(frecency.get("fdc:kept")!.frequent).toBeCloseTo(1, 10);
  });

  it("ignores an event that names no food", () => {
    const frecency = frecencyOf([
      log("fdc:1", 100),
      { id: "manual", time: 200, calories: 300 } as ConsumptionEvent,
    ]);
    expect(frecency.size).toBe(1);
  });
});

describe("byFrecency", () => {
  const targetOf = (row: { target: string }) => row.target;

  it("puts recency before frequency, as prescient does", () => {
    const frecency = frecencyOf([
      ...Array.from({ length: 40 }, (_, i) => log("fdc:banana", i + 1)),
      log("fdc:sardines", 100),
    ]);
    const rows = [{ target: "fdc:banana" }, { target: "fdc:sardines" }];
    expect(rows.sort(byFrecency(frecency, targetOf))[0].target).toBe(
      "fdc:sardines"
    );
  });

  it("hands the question to frequency once both are out of the ring", () => {
    // Both foods pushed past the ring by a hundred others, so recency ties at 0
    // and the forty breakfasts finally win.
    const events = [
      ...Array.from({ length: 40 }, (_, i) => log("fdc:banana", i + 1)),
      log("fdc:sardines", 50),
      ...Array.from({ length: FRECENCY_HISTORY }, (_, i) =>
        log(`fdc:other${i}`, 100 + i)
      ),
    ];
    const frecency = frecencyOf(events);
    expect(frecency.get("fdc:banana")!.recent).toBe(0);
    expect(frecency.get("fdc:sardines")!.recent).toBe(0);
    const rows = [{ target: "fdc:sardines" }, { target: "fdc:banana" }];
    expect(rows.sort(byFrecency(frecency, targetOf))[0].target).toBe(
      "fdc:banana"
    );
  });

  it("leaves an order untouched where nothing has been logged", () => {
    const rows = [
      { target: "fdc:1" },
      { target: "fdc:2" },
      { target: "fdc:3" },
    ];
    const order = rows.map((r) => r.target);
    expect(
      [...rows].sort(byFrecency(new Map(), targetOf)).map((r) => r.target)
    ).toEqual(order);
  });
});
