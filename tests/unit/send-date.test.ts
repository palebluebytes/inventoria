/**
 * How a date is written on the way out of a meal (ADR-0074 §7).
 *
 * The rule under test is a *contrast*: `dayLabel` is right where the app talks
 * to you about your own week, and wrong the moment a second person is looking
 * at the screen. So the two are asserted against each other on the same day
 * rather than this one being asserted alone.
 */
import { describe, it, expect } from "vitest";
import {
  DATE_FORMAT,
  writeDate,
  type DateFormat,
} from "../../src/lib/p2p/send-date";
import { dayLabel } from "../../src/lib/food/past-meals";

describe("writeDate", () => {
  it("writes the date the format constant names", () => {
    expect(writeDate(new Date(2026, 0, 4))).toBe("04/01/2026");
  });

  it("pads a single-digit day and month, so every date is one width", () => {
    expect(writeDate(new Date(2026, 8, 7))).toBe("07/09/2026");
  });

  it("writes each format it understands", () => {
    const day = new Date(2026, 0, 4);
    const written: Record<DateFormat, string> = {
      "DD/MM/YYYY": "04/01/2026",
      "MM/DD/YYYY": "01/04/2026",
      "YYYY-MM-DD": "2026-01-04",
    };
    for (const [format, expected] of Object.entries(written)) {
      expect(writeDate(day, format as DateFormat)).toBe(expected);
    }
  });

  it("reads the local day, never UTC's", () => {
    // A date near midnight is the day the person logged the meal on, which is
    // the same day their own dashboard put it under.
    expect(writeDate(new Date(2026, 0, 4, 23, 30))).toBe("04/01/2026");
    expect(writeDate(new Date(2026, 0, 4, 0, 30))).toBe("04/01/2026");
  });

  it("names a day `dayLabel` would leave ambiguous across two devices", () => {
    const today = new Date(2026, 0, 6);
    const tuesday = new Date(2026, 0, 4);
    expect(dayLabel(tuesday, today)).toBe("Sunday");
    expect(writeDate(tuesday)).toBe("04/01/2026");
  });

  it("never says Today, which is a claim about whose day", () => {
    const today = new Date(2026, 0, 6);
    expect(dayLabel(today, today)).toBe("Today");
    expect(writeDate(today)).toBe("06/01/2026");
  });

  it("ships one format, so every send surface writes the same shape", () => {
    expect(DATE_FORMAT).toBe("DD/MM/YYYY");
  });
});
