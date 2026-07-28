import { describe, it, expect } from "vitest";
import {
  monthlyAnchors,
  buildEventScheduleRules,
  type EventScheduleInput,
} from "../../src/lib/cal_events/event-schedule-rules";

function input(over: Partial<EventScheduleInput> = {}): EventScheduleInput {
  return {
    recurType: "none",
    selectedDays: new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    monthlyMode: "fixed",
    startDateStr: "2026-06-05", // a Friday, 1st Friday of June 2026
    until: "",
    timed: true,
    hasEnd: false,
    timeSlots: ["08:00"],
    ...over,
  };
}

describe("monthlyAnchors", () => {
  it("derives day-of-month and month-of-year from the start date", () => {
    const a = monthlyAnchors("2026-06-05");
    expect(a.dayOfMonth).toBe(5);
    expect(a.monthOfYear).toBe(6);
  });

  it("derives the weekday name of the start date", () => {
    expect(monthlyAnchors("2026-06-05").relativeDay).toBe("fri"); // Fri
    expect(monthlyAnchors("2026-06-07").relativeDay).toBe("sun"); // Sun
  });

  it("computes the nth-weekday-of-month for the start date", () => {
    expect(monthlyAnchors("2026-06-05").relativeWeek).toBe(1); // 1st Friday
    expect(monthlyAnchors("2026-06-12").relativeWeek).toBe(2); // 2nd Friday
  });

  it("returns -1 when the start date is the last such weekday of the month", () => {
    // 2026-06-26 is the last Friday of June 2026
    expect(monthlyAnchors("2026-06-26").relativeWeek).toBe(-1);
  });
});

describe("buildEventScheduleRules", () => {
  it("returns undefined for a one-off (recurType none)", () => {
    expect(
      buildEventScheduleRules(input({ recurType: "none" }))
    ).toBeUndefined();
  });

  it("maps all seven selected days to a daily_multiple rule", () => {
    const r = buildEventScheduleRules(input({ recurType: "specific_days" }));
    expect(r).toMatchObject({ type: "daily_multiple", count: 1 });
  });

  it("maps a subset of days to a weekly_days rule preserving the selection", () => {
    const r = buildEventScheduleRules(
      input({
        recurType: "specific_days",
        selectedDays: new Set(["mon", "wed"]),
      })
    );
    expect(r?.type).toBe("weekly_days");
    expect(r && "days" in r && r.days).toEqual(["mon", "wed"]);
  });

  it("maps weekly to weekly_flexible", () => {
    expect(
      buildEventScheduleRules(input({ recurType: "weekly" }))
    ).toMatchObject({
      type: "weekly_flexible",
      count: 1,
    });
  });

  it("maps monthly fixed to monthly_fixed on the start day-of-month", () => {
    expect(
      buildEventScheduleRules(
        input({ recurType: "monthly", monthlyMode: "fixed" })
      )
    ).toMatchObject({ type: "monthly_fixed", day_of_month: 5 });
  });

  it("maps monthly relative to monthly_relative on the nth weekday", () => {
    expect(
      buildEventScheduleRules(
        input({ recurType: "monthly", monthlyMode: "relative" })
      )
    ).toMatchObject({ type: "monthly_relative", week: 1, day: "fri" });
  });

  it("maps yearly to yearly_fixed on the start month + day", () => {
    expect(
      buildEventScheduleRules(input({ recurType: "yearly" }))
    ).toMatchObject({
      type: "yearly_fixed",
      month: 6,
      day_of_month: 5,
    });
  });

  it("passes an until date through when present", () => {
    const r = buildEventScheduleRules(
      input({ recurType: "weekly", until: "2026-12-31" })
    );
    expect(r?.until).toBe("2026-12-31");
  });

  it("attaches slot targets for a timed, multi-slot, endless event", () => {
    const r = buildEventScheduleRules(
      input({
        recurType: "weekly",
        timed: true,
        hasEnd: false,
        timeSlots: ["08:00", "20:00"],
      })
    );
    expect(r?.targets).toEqual([
      { id: "slot_0", time_hint: "08:00" },
      { id: "slot_1", time_hint: "20:00" },
    ]);
  });

  it("omits targets when there is only a single time slot", () => {
    const r = buildEventScheduleRules(
      input({ recurType: "weekly", timeSlots: ["08:00"] })
    );
    expect(r?.targets).toBeUndefined();
  });

  it("omits targets for a block (hasEnd) event", () => {
    const r = buildEventScheduleRules(
      input({
        recurType: "weekly",
        hasEnd: true,
        timeSlots: ["08:00", "20:00"],
      })
    );
    expect(r?.targets).toBeUndefined();
  });
});
