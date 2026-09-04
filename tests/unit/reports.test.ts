import { describe, it, expect, afterEach } from "vitest";
import {
  PERIODS,
  MACROS,
  ATWATER,
  periodLabel,
  periodOf,
  eventsIn,
  energyByDay,
  dayEnergyLabel,
  energyShares,
  foodCounts,
} from "../../src/lib/food/reports";
import { dayKeyOf } from "../../src/lib/food/past-meals";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

/**
 * The three readings of the ledger, and the period they are read over (#346,
 * ADR-0091 §6).
 *
 * Everything here is the pure fold rather than the page that draws it, which is
 * where the decisions actually are: a report is derived on read and stored
 * nowhere, so what is testable about one is what it says about a set of
 * Consumption Events — never a row that was written down and could be stale.
 *
 * Two rules recur and are worth naming once. **An absent measurement is not a
 * zero** (ADR-0048): a day nobody ate on is not a day with 0 kcal on it, and a
 * macro no logged food froze is not 0 g of it. And **the period is rolling**,
 * so every assertion below fixes its own "today" rather than reading a clock —
 * which is also the seam that keeps these deterministic.
 */

const ORIGINAL_TZ = process.env.TZ;

/** Run `body` as if the device were in `tz`. Node re-reads `TZ` per `Date` op. */
function inZone(tz: string, body: () => void) {
  process.env.TZ = tz;
  try {
    body();
  } finally {
    process.env.TZ = ORIGINAL_TZ;
  }
}

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/**
 * What one logged food froze, as the projection surfaces it: the four headline
 * macros flat, each present only where `event/metrics` carried one. Omitting a
 * key here is how a test says "this food never reported that", which is a
 * different fact from reporting a zero.
 */
type Frozen = Partial<
  Pick<ConsumptionEvent, "calories" | "protein" | "fat" | "carbs">
>;

/** A logged food, cut down to the fields a report reads. */
function ate(
  time: Date,
  frozen: Frozen = {},
  foodName?: string
): ConsumptionEvent {
  return {
    id: `event:consume_${time.getTime()}_${foodName ?? ""}`,
    time: time.getTime(),
    ...frozen,
    foodName,
  };
}

describe("a period is rolling, and it is the question's own window", () => {
  it("offers the four the screen switches between, in the header's order", () => {
    expect([...PERIODS]).toEqual(["weekly", "monthly", "yearly", "custom"]);
    expect(PERIODS.map(periodLabel)).toEqual([
      "Weekly",
      "Monthly",
      "Yearly",
      "Custom",
    ]);
  });

  it("makes a week the seven days ending today, not the week so far", () => {
    // The whole of why the fixed periods are rolling: calendar-aligned, Monday
    // morning is a report on one day, and the question is how somebody has been
    // eating lately rather than what the calendar says.
    const today = new Date(2026, 8, 4, 14, 30); // Friday 4 September 2026
    const period = periodOf("weekly", today, {});

    expect(period).not.toBeNull();
    expect(new Date(period!.start)).toEqual(new Date(2026, 7, 29));
    // Exclusive: the end is the start of tomorrow, so no millisecond of today
    // is outside the window and none of tomorrow is inside it.
    expect(new Date(period!.end)).toEqual(new Date(2026, 8, 5));
  });

  it("counts a month and a year as the calendar does, not as 30 or 365 days", () => {
    const today = new Date(2026, 8, 4, 9, 0);
    // A month back from 4 September is 4 August, and the window opens the day
    // after so that it is a month long rather than a month and a day.
    expect(new Date(periodOf("monthly", today, {})!.start)).toEqual(
      new Date(2026, 7, 5)
    );
    expect(new Date(periodOf("yearly", today, {})!.start)).toEqual(
      new Date(2025, 8, 5)
    );
  });

  it("clamps a month back off a day the shorter month does not have", () => {
    // The defect the clamp exists for. `new Date(2026, 1, 31)` does not throw
    // and does not clamp — it **overflows** to 3 March — so stepping a month
    // back off 31 March by arithmetic alone lands three days after February and
    // the "monthly" window is 28 days with no February in it at all.
    const endOfMarch = new Date(2026, 2, 31, 9, 0);
    const month = periodOf("monthly", endOfMarch, {})!;

    // A month back is 28 February, and the window opens the day after it.
    expect(new Date(month.start)).toEqual(new Date(2026, 2, 1));
    expect(new Date(month.end)).toEqual(new Date(2026, 3, 1));

    // 31 May is the same shape against a 30-day April.
    const endOfMay = new Date(2026, 4, 31, 9, 0);
    expect(new Date(periodOf("monthly", endOfMay, {})!.start)).toEqual(
      new Date(2026, 4, 1)
    );
  });

  it("survives a leap day rather than landing on one that does not exist", () => {
    // 29 February 2028 has no anniversary in 2027. The step back clamps to
    // 28 February 2027 and the window opens the day after, so the year is a
    // whole one and reaches back past the leap day rather than stopping short
    // of it.
    const leap = new Date(2028, 1, 29, 12, 0);
    const year = periodOf("yearly", leap, {})!;
    expect(new Date(year.start)).toEqual(new Date(2027, 2, 1));
    expect(new Date(year.end)).toEqual(new Date(2028, 2, 1));

    // 366 days, because the window it covers contains the leap day itself.
    const DAY_MS = 24 * 60 * 60 * 1000;
    expect(Math.round((year.end - year.start) / DAY_MS)).toBe(366);
  });

  it("counts a plain week, month and year at their stated lengths", () => {
    // The three named lengths, asserted as lengths rather than as boundaries,
    // so a step-back that quietly lost a day would fail here even if both ends
    // still looked reasonable.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const today = new Date(2026, 8, 4, 9, 0);
    const lengthOf = (kind: "weekly" | "monthly" | "yearly") => {
      const period = periodOf(kind, today, {})!;
      return Math.round((period.end - period.start) / DAY_MS);
    };
    expect(lengthOf("weekly")).toBe(7);
    // 5 August to 4 September inclusive: August's own length, which is what a
    // month back from a September date is.
    expect(lengthOf("monthly")).toBe(31);
    expect(lengthOf("yearly")).toBe(365);
  });

  it("opens every window at a local midnight, in any zone", () => {
    // A period boundary that went through UTC would put a late-evening meal in
    // the wrong window — the same hazard `logged-days.ts` was written around,
    // one scale up.
    inZone("Pacific/Auckland", () => {
      const today = new Date(2026, 8, 4, 23, 45);
      const period = periodOf("weekly", today, {})!;
      const start = new Date(period.start);
      expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
      expect(start.getDate()).toBe(29);
    });
  });

  it("shows no report until a custom range has both of its ends", () => {
    // A half-chosen range is not a period (ADR-0091 §6). `null` rather than a
    // window that guesses the missing end, because a guess would draw a real
    // report of a period nobody asked for.
    const today = new Date(2026, 8, 4);
    expect(periodOf("custom", today, {})).toBeNull();
    expect(
      periodOf("custom", today, { start: new Date(2026, 8, 1) })
    ).toBeNull();
    expect(periodOf("custom", today, { end: new Date(2026, 8, 4) })).toBeNull();
  });

  it("takes a custom range whole, including the day it ends on", () => {
    const period = periodOf("custom", new Date(2026, 8, 4), {
      start: new Date(2026, 7, 1),
      end: new Date(2026, 7, 31),
    })!;
    expect(new Date(period.start)).toEqual(new Date(2026, 7, 1));
    expect(new Date(period.end)).toEqual(new Date(2026, 8, 1));
  });

  it("keeps a meal logged at either edge of the window", () => {
    const today = new Date(2026, 8, 4, 12, 0);
    const period = periodOf("weekly", today, {})!;
    const first = ate(new Date(2026, 7, 29, 0, 0, 0, 0));
    const last = ate(new Date(2026, 8, 4, 23, 59, 59, 999));
    const before = ate(new Date(2026, 7, 28, 23, 59, 59, 999));
    const after = ate(new Date(2026, 8, 5, 0, 0));

    expect(eventsIn([before, first, last, after], period)).toEqual([
      first,
      last,
    ]);
  });
});

describe("energy by day", () => {
  it("gives a row to every day that has food on it, oldest first", () => {
    const first = new Date(2026, 8, 1, 8, 0);
    const second = new Date(2026, 8, 1, 19, 0);
    const third = new Date(2026, 8, 3, 13, 0);

    const rows = energyByDay([
      ate(third, { calories: 700 }),
      ate(first, { calories: 400 }),
      ate(second, { calories: 250 }),
    ]);

    expect(rows.map((r) => r.dayKey)).toEqual([
      dayKeyOf(first),
      dayKeyOf(third),
    ]);
    expect(rows.map((r) => r.kcal)).toEqual([650, 700]);
  });

  it("leaves an untouched day out rather than plotting it as a zero", () => {
    // ADR-0048. 2 September is inside the window and has nothing on it; a bar
    // of height zero there would be the app claiming a measurement it never
    // took.
    const rows = energyByDay([
      ate(new Date(2026, 8, 1, 8, 0), { calories: 400 }),
      ate(new Date(2026, 8, 3, 8, 0), { calories: 400 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.date)).toEqual([
      new Date(2026, 8, 1),
      new Date(2026, 8, 3),
    ]);
  });

  it("dates a row by its own local midnight, not by the instant it was logged", () => {
    const rows = energyByDay([
      ate(new Date(2026, 8, 1, 23, 30), { calories: 90 }),
    ]);
    expect(rows[0].date).toEqual(new Date(2026, 8, 1));
  });

  it("says a day has food but no energy rather than saying it has none", () => {
    // The same rule one level down: an event that froze no calories at all
    // still puts food on the day, and the row exists with its reading absent.
    const rows = energyByDay([ate(new Date(2026, 8, 1, 8, 0), {})]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kcal).toBeUndefined();
  });

  it("sums only the events that froze an energy, never counting an absence as 0", () => {
    const day = new Date(2026, 8, 1, 8, 0);
    const rows = energyByDay([ate(day, { calories: 300 }), ate(day, {})]);
    expect(rows[0].kcal).toBe(300);
  });

  it("has nothing to say about a history with nothing in it", () => {
    expect(energyByDay([])).toEqual([]);
  });

  it("names a row the way the rest of the app names a date", () => {
    const today = new Date(2026, 8, 4);
    expect(dayEnergyLabel(new Date(2026, 8, 4), today)).toBe("Today");
    expect(dayEnergyLabel(new Date(2026, 8, 3), today)).toBe("Yesterday");
  });

  it("adds the year once a period is long enough to repeat a date", () => {
    // A yearly period covers two Augusts. Without the year they are the same
    // four characters, and two bars a year apart read as one day twice.
    const today = new Date(2026, 8, 4);
    expect(dayEnergyLabel(new Date(2026, 7, 11), today)).not.toMatch(/2026/);
    expect(dayEnergyLabel(new Date(2025, 7, 11), today)).toMatch(/2025$/);
  });
});

describe("where the energy came from", () => {
  it("prices each macro at its Atwater factor", () => {
    expect(ATWATER).toEqual({ protein: 4, fat: 9, carbs: 4 });
    expect([...MACROS]).toEqual(["protein", "fat", "carbs"]);
  });

  it("takes each macro's share of the energy the three of them carry", () => {
    // 100 g protein (400 kcal), 100 g fat (900 kcal), 100 g carbs (400 kcal):
    // 1700 kcal between them, so fat is the larger half of the plate even
    // though all three weigh the same.
    const shares = energyShares([
      ate(new Date(2026, 8, 1, 8, 0), {
        calories: 1700,
        protein: 100,
        fat: 100,
        carbs: 100,
      }),
    ]);

    expect(shares.map((s) => s.macro)).toEqual(["protein", "fat", "carbs"]);
    expect(shares.map((s) => s.grams)).toEqual([100, 100, 100]);
    expect(shares.map((s) => s.kcal)).toEqual([400, 900, 400]);
    const percents = shares.map((s) => Math.round(s.percent!));
    expect(percents).toEqual([24, 53, 24]);
  });

  it("takes the share against the three, never against the logged calories", () => {
    // A food's label energy and its Atwater sum disagree — alcohol, polyols and
    // the fibre gap (#122) all live in the difference. Dividing by the logged
    // calories would leave a remainder nothing accounts for and the three
    // shares would not read as a whole.
    const shares = energyShares([
      ate(new Date(2026, 8, 1, 8, 0), {
        calories: 5000,
        protein: 10,
        fat: 10,
        carbs: 10,
      }),
    ]);
    const total = shares.reduce((sum, s) => sum + (s.percent ?? 0), 0);
    expect(Math.round(total)).toBe(100);
  });

  it("sums across every event in the period", () => {
    const shares = energyShares([
      ate(new Date(2026, 8, 1, 8, 0), { protein: 20, fat: 5, carbs: 40 }),
      ate(new Date(2026, 8, 3, 8, 0), { protein: 10, fat: 5, carbs: 20 }),
    ]);
    expect(shares.map((s) => s.grams)).toEqual([30, 10, 60]);
  });

  it("leaves a macro nobody froze absent rather than reading it as 0 g", () => {
    // ADR-0048 again, and it matters here more than anywhere: a manual-entry
    // intent freezes calories only (ADR-0035 §7), so a period of those would
    // otherwise report a plate that was 0% everything.
    const shares = energyShares([
      ate(new Date(2026, 8, 1, 8, 0), { calories: 500 }),
    ]);
    for (const share of shares) {
      expect(share.grams).toBeUndefined();
      expect(share.kcal).toBeUndefined();
      expect(share.percent).toBeUndefined();
    }
  });

  it("still reports the macros that were frozen when one of them was not", () => {
    const shares = energyShares([
      ate(new Date(2026, 8, 1, 8, 0), { protein: 25, carbs: 75 }),
    ]);
    const [protein, fat, carbs] = shares;
    expect(protein.kcal).toBe(100);
    expect(fat.grams).toBeUndefined();
    expect(fat.percent).toBeUndefined();
    expect(carbs.kcal).toBe(300);
    expect(Math.round(protein.percent!)).toBe(25);
  });

  it("has no share to state where there is no energy to take one of", () => {
    // Not 0% three times: a share of nothing is not a number, and three zeroes
    // would draw three empty bars claiming a plate was measured.
    const shares = energyShares([]);
    expect(shares.map((s) => s.macro)).toEqual(["protein", "fat", "carbs"]);
    for (const share of shares) expect(share.percent).toBeUndefined();
  });
});

describe("what you eat most", () => {
  it("counts by name, so one food logged three ways is one answer", () => {
    // The whole point of counting by name rather than by target: the same
    // porridge reached through a search, a scan and a past meal is three food
    // twins with three ids (ADR-0051's fusion is the corpus', not the
    // ledger's), and a reader asking what they eat most means the food.
    const day = new Date(2026, 8, 1, 8, 0);
    const rows = foodCounts([
      { ...ate(day, {}, "Porridge"), target: "food:searched" },
      { ...ate(day, {}, "Porridge"), target: "food:scanned" },
      { ...ate(day, {}, "Porridge"), target: "food:from_past_meal" },
    ]);
    expect(rows).toEqual([{ name: "Porridge", count: 3 }]);
  });

  it("ranks by how often, and settles a tie by name", () => {
    const day = new Date(2026, 8, 1, 8, 0);
    const rows = foodCounts([
      ate(day, {}, "Banana"),
      ate(day, {}, "Porridge"),
      ate(day, {}, "Porridge"),
      ate(day, {}, "Apple"),
    ]);
    expect(rows).toEqual([
      { name: "Porridge", count: 2 },
      { name: "Apple", count: 1 },
      { name: "Banana", count: 1 },
    ]);
  });

  it("counts every logging, not every day it was logged on", () => {
    const rows = foodCounts([
      ate(new Date(2026, 8, 1, 8, 0), {}, "Coffee"),
      ate(new Date(2026, 8, 1, 15, 0), {}, "Coffee"),
      ate(new Date(2026, 8, 2, 8, 0), {}, "Coffee"),
    ]);
    expect(rows).toEqual([{ name: "Coffee", count: 3 }]);
  });

  it("leaves out a logging with no name, which is not a food anyone can read", () => {
    // An event whose target twin is missing has nothing to be counted under,
    // and two of them are not the same food as each other. Absent from the
    // reading rather than gathered into an "unknown" row that would rank.
    const day = new Date(2026, 8, 1, 8, 0);
    expect(
      foodCounts([ate(day, {}), ate(day, {}, ""), ate(day, {}, "Toast")])
    ).toEqual([{ name: "Toast", count: 1 }]);
  });

  it("has nothing to say about a period with nothing in it", () => {
    expect(foodCounts([])).toEqual([]);
  });
});
