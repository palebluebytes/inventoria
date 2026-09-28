import { describe, it, expect, vi, beforeEach } from "vitest";
import { dbClient } from "../../src/lib/db/db.client";
import {
  changeLoggedFoodAmount,
  logFoodConsumption,
  type ConsumptionEvent,
} from "../../src/lib/stores/calorie.store";
import {
  computeConsumption,
  totalNutrition,
} from "../../src/lib/food/consumption-state";
import { compareHlc } from "../../src/lib/db/hlc";
import type { Datom, StoredDatom } from "../../src/lib/db/db.core";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import { asStored } from "./support/stored";

vi.mock("../../src/lib/db/db.client", () => {
  return {
    dbClient: {
      query: vi.fn(),
      append: vi.fn(),
      onInvalidate: vi.fn(() => () => {}),
    },
  };
});

/**
 * ADR-0111 §1: a correction appends onto the event it corrects. The writer half
 * of the #463 defect — two devices that each corrected the same event left two
 * live events, because only the original was retracted and neither replacement
 * carried a status of its own.
 *
 * These are writer-through-projection tests: the real store action writes, its
 * datoms are stamped as the device that wrote them, and the union is folded by
 * the real projection. Nothing about convergence is observable in one device's
 * datoms alone, which is why the per-site datom assertions live in
 * `calorie-store.test.ts` and these do not.
 */
const BANANA: NutritionInfo = {
  serving_size: "100 g",
  calories: 89,
  protein_content: 1.1,
  fat_content: 0.3,
  carbohydrate_content: 22.8,
};

/** Values are JSON-encoded at the ledger boundary; the projection parses back. */
const asLedger = (datoms: Datom[], device_id: string): StoredDatom[] =>
  asStored(
    datoms.map((d) => ({ ...d, value: JSON.stringify(d.value) })),
    device_id
  );

/**
 * Stamps one device's write at a chosen moment. Two devices correcting the same
 * event inside a millisecond of each other is the test harness's accident, not
 * the fixture's claim, and `asStored` would settle it on the device id.
 */
const writtenAt = (datoms: Datom[], time: number): Datom[] =>
  datoms.map((d) => ({ ...d, time }));

/** What the ledger reads back once both devices' streams have met (ADR-0020). */
const converged = (...streams: StoredDatom[][]): StoredDatom[] =>
  streams.flat().sort(compareHlc);

/** Captures what a store action appends, instead of sending it to a worker. */
function captureAppends(): Datom[] {
  const appended: Datom[] = [];
  vi.spyOn(dbClient, "append").mockImplementation(async (d: Datom[]) => {
    appended.push(...d.map((datom) => ({ ...datom })));
  });
  return appended;
}

describe("a correction appends onto the event it corrects (ADR-0111 §1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.spyOn(dbClient, "query").mockResolvedValue([
      { attribute: "nutrition/info", value: JSON.stringify(BANANA) },
    ] as never);
  });

  const day = new Date("2026-05-31T09:00:00");

  /** The banana both devices hold: one log, 100 g, 89 kcal. */
  async function logBanana(): Promise<{ id: string; datoms: Datom[] }> {
    const appended = captureAppends();
    const id = await logFoodConsumption(
      "fdc:banana",
      "100g",
      "lunch",
      89,
      1.1,
      0.3,
      22.8,
      day
    );
    return { id, datoms: appended };
  }

  /** One device correcting that banana to `grams`, with nothing else in sight. */
  async function correctTo(
    event: ConsumptionEvent,
    grams: number
  ): Promise<Datom[]> {
    const appended = captureAppends();
    await changeLoggedFoodAmount(event, grams, "g");
    return appended;
  }

  it("converges to one row at the later value when two devices correct it", async () => {
    // The measured #463 fixture: neither device has seen the other, which is
    // what a sleeping peer is (ADR-0096). Under retract-and-replace this folded
    // to two rows and 445 kcal where the truth is 267.
    const banana = await logBanana();
    const loggedAt = banana.datoms[0].time;
    const logged = computeConsumption(asLedger(banana.datoms, "phone"))[0];

    const phone = writtenAt(await correctTo(logged, 200), loggedAt + 10);
    const laptop = writtenAt(await correctTo(logged, 300), loggedAt + 11);

    const events = computeConsumption(
      converged(
        asLedger(banana.datoms, "phone"),
        asLedger(phone, "phone"),
        asLedger(laptop, "laptop")
      )
    );

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(banana.id);
    expect(events[0].quantity).toBe("300g");
    expect(totalNutrition(events).calories).toBe(267);
  });

  it("writes no status and no link, so nothing is left to claim", async () => {
    // ADR-0111 §4: a correction is 1 → 1 and has no successor to name.
    // `event/replaced_by` keeps one job, and it is Consolidate's.
    const banana = await logBanana();
    const logged = computeConsumption(asLedger(banana.datoms, "phone"))[0];

    const written = await correctTo(logged, 200);

    expect(written.map((d) => d.attribute)).not.toContain("event/status");
    expect(written.map((d) => d.attribute)).not.toContain("event/replaced_by");
    expect(new Set(written.map((d) => d.entity))).toEqual(new Set([banana.id]));
  });

  it("does not move the event's clock", async () => {
    // An event takes its FIRST datom's time, and a replacement used to mint a
    // fresh one stamped `now` — so correcting a 9am banana at 5pm restamped it
    // 5pm, and correcting one logged on a past day moved it to today.
    const banana = await logBanana();
    const loggedAt = banana.datoms[0].time;
    const logged = computeConsumption(asLedger(banana.datoms, "phone"))[0];

    const written = await correctTo(logged, 200);

    const events = computeConsumption(
      converged(asLedger(banana.datoms, "phone"), asLedger(written, "phone"))
    );

    expect(events[0].time).toBe(loggedAt);
    // The correction's own datoms landed later — it is a real later fact about
    // the same event, and the event's place in the day still is not its.
    expect(Math.min(...written.map((d) => d.time))).toBeGreaterThan(loggedAt);
  });

  it("rides one append, so no reader sees half a frozen set", async () => {
    // ADR-0111 §3: appending onto a live entity makes a new headline beside an
    // old breakdown representable for the first time, and the P2P payload
    // builder narrows per `(entity, attribute)` — exactly where a set split
    // across two appends would come apart.
    const banana = await logBanana();
    const logged = computeConsumption(asLedger(banana.datoms, "phone"))[0];

    // `spyOn` hands back the mock the log above already used, so the count has
    // to start here.
    const mockAppend = vi
      .spyOn(dbClient, "append")
      .mockResolvedValue(undefined);
    mockAppend.mockClear();

    await changeLoggedFoodAmount(logged, 200, "g");

    expect(mockAppend).toHaveBeenCalledTimes(1);
  });
});
