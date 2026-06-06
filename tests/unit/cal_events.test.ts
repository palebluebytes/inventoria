import { describe, it, expect } from "vitest";
import {
  isActiveOnDate,
  projectSlotsForDate,
  type CalEventBlueprint,
} from "../../src/lib/cal_events/cal_events";

describe("Calendar Events Multi-Day Logic", () => {
  const baseBlueprint: CalEventBlueprint = {
    entity: "cal_event:test_01",
    title: "Multi-Day Conference",
    dtstart: "2026-06-06T19:00:00Z",
    dtend: "2026-06-09T15:00:00Z",
    description: "Testing 72 hour event",
    tracking: false,
    timed: true,
    time: Date.now(),
  };

  describe("isActiveOnDate", () => {
    it("is active on all days within the start and end range", () => {
      expect(isActiveOnDate(baseBlueprint, "2026-06-05")).toBe(false);
      expect(isActiveOnDate(baseBlueprint, "2026-06-06")).toBe(true);
      expect(isActiveOnDate(baseBlueprint, "2026-06-07")).toBe(true);
      expect(isActiveOnDate(baseBlueprint, "2026-06-08")).toBe(true);
      expect(isActiveOnDate(baseBlueprint, "2026-06-09")).toBe(true);
      expect(isActiveOnDate(baseBlueprint, "2026-06-10")).toBe(false);
    });

    it("is active only on start date if no dtend is specified", () => {
      const singleDay: CalEventBlueprint = {
        ...baseBlueprint,
        dtend: undefined,
      };
      expect(isActiveOnDate(singleDay, "2026-06-05")).toBe(false);
      expect(isActiveOnDate(singleDay, "2026-06-06")).toBe(true);
      expect(isActiveOnDate(singleDay, "2026-06-07")).toBe(false);
    });
  });

  describe("projectSlotsForDate", () => {
    it("projects slice times correctly on different days of a multi-day event", () => {
      // Day 1 (Start Day): Starts at 19:00, goes until end of day (23:59)
      const day1Slots = projectSlotsForDate(baseBlueprint, "2026-06-06");
      expect(day1Slots).toHaveLength(1);
      expect(day1Slots[0].scheduledTime).toBe("19:00");
      expect(day1Slots[0].dtendTime).toBe("23:59");
      expect(day1Slots[0].hasEnd).toBe(true);

      // Day 2 (Intermediate Day): Runs all day (00:00 to 23:59)
      const day2Slots = projectSlotsForDate(baseBlueprint, "2026-06-07");
      expect(day2Slots).toHaveLength(1);
      expect(day2Slots[0].scheduledTime).toBe("00:00");
      expect(day2Slots[0].dtendTime).toBe("23:59");
      expect(day2Slots[0].hasEnd).toBe(true);

      // Day 4 (End Day): Starts at 00:00, ends at 15:00
      const day4Slots = projectSlotsForDate(baseBlueprint, "2026-06-09");
      expect(day4Slots).toHaveLength(1);
      expect(day4Slots[0].scheduledTime).toBe("00:00");
      expect(day4Slots[0].dtendTime).toBe("15:00");
      expect(day4Slots[0].hasEnd).toBe(true);
    });

    it("projects simple slot for single-day event with dtend", () => {
      const singleDayWithEnd: CalEventBlueprint = {
        ...baseBlueprint,
        dtstart: "2026-06-06T10:00:00Z",
        dtend: "2026-06-06T12:00:00Z",
      };
      const slots = projectSlotsForDate(singleDayWithEnd, "2026-06-06");
      expect(slots).toHaveLength(1);
      expect(slots[0].scheduledTime).toBe("10:00");
      expect(slots[0].dtendTime).toBe("12:00");
      expect(slots[0].hasEnd).toBe(true);
    });
  });
});
