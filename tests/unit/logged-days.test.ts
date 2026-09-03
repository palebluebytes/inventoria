import { describe, it, expect, afterEach } from "vitest";
import { CalendarDate } from "@internationalized/date";
import {
  loggedDayKeys,
  toCalendarDate,
  fromCalendarDate,
  isLoggedDay,
} from "../../src/lib/food/logged-days";
import { dayKeyOf } from "../../src/lib/food/past-meals";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

/**
 * The bridge between the ledger's instants and the month calendar's calendar
 * fields (#344).
 *
 * Everything here is about one hazard: an ISO round-trip. `Date#toISOString`
 * and `parseDate` both speak UTC, and the day a person says they ate on is
 * local — so a conversion that goes through an ISO string moves a late-evening
 * meal onto a day the person never ate on. Every test below that fixes a zone
 * does it because the claim is only visible from a zone whose UTC date has
 * turned over and whose local one has not.
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

/** A logged food, cut down to the two fields a day mark reads. */
const ate = (time: Date): ConsumptionEvent => ({
  id: `event:consume_${time.getTime()}`,
  time: time.getTime(),
});

describe("the days that have food on them", () => {
  it("buckets every logged event by the local day it fell on", () => {
    const first = new Date(2026, 8, 1, 8, 15);
    const second = new Date(2026, 8, 1, 19, 40);
    const third = new Date(2026, 8, 4, 12, 0);

    const keys = loggedDayKeys([ate(first), ate(second), ate(third)]);

    // Two days, not three events: the mark is about the day, and two meals on
    // one day are one marked day.
    expect(keys).toEqual(new Set([dayKeyOf(first), dayKeyOf(third)]));
  });

  it("is empty for a history with nothing in it", () => {
    expect(loggedDayKeys([])).toEqual(new Set());
  });

  it("keeps a late-evening meal on the day it was eaten", () => {
    // Honolulu is UTC-10, so 20:30 on the 3rd is already the 4th in UTC. A key
    // taken off `toISOString()` would mark a day this person has not reached.
    inZone("Pacific/Honolulu", () => {
      const supper = new Date(2026, 8, 3, 20, 30);
      expect(supper.toISOString().slice(0, 10)).toBe("2026-09-04");

      const keys = loggedDayKeys([ate(supper)]);
      expect(keys).toEqual(new Set([dayKeyOf(new Date(2026, 8, 3))]));
      expect(keys.has(dayKeyOf(new Date(2026, 8, 4)))).toBe(false);
    });
  });
});

describe("the two date types the calendar has to speak", () => {
  it("reads a Date's own calendar fields, never its UTC ones", () => {
    inZone("Pacific/Honolulu", () => {
      // `CalendarDate` counts months from 1 and `Date` from 0, which is the
      // other half of why this conversion is written once and tested.
      expect(toCalendarDate(new Date(2026, 8, 3, 20, 30))).toEqual(
        new CalendarDate(2026, 9, 3)
      );
    });
  });

  it("lands on local midnight of the day it was handed", () => {
    inZone("Pacific/Kiritimati", () => {
      // +14, so UTC midnight on the 3rd is the 2nd here. A `new Date("2026-09-03")`
      // would parse as UTC and read back as a different day.
      const day = fromCalendarDate(new CalendarDate(2026, 9, 3));
      expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([
        2026, 8, 3,
      ]);
      expect([day.getHours(), day.getMinutes()]).toEqual([0, 0]);
    });
  });

  it("round-trips a late evening back to its own day", () => {
    inZone("Pacific/Honolulu", () => {
      const supper = new Date(2026, 8, 3, 20, 30);
      expect(dayKeyOf(fromCalendarDate(toCalendarDate(supper)))).toBe(
        dayKeyOf(supper)
      );
    });
  });
});

describe("a calendar cell asks whether its day has food on it", () => {
  it("agrees with the keys the fold produced, across the conversion", () => {
    inZone("Pacific/Honolulu", () => {
      const supper = new Date(2026, 8, 3, 20, 30);
      const keys = loggedDayKeys([ate(supper)]);

      expect(isLoggedDay(keys, new CalendarDate(2026, 9, 3))).toBe(true);
      // The UTC day the ISO round-trip would have marked instead.
      expect(isLoggedDay(keys, new CalendarDate(2026, 9, 4))).toBe(false);
    });
  });

  it("says no on a day nothing was logged", () => {
    const keys = loggedDayKeys([ate(new Date(2026, 8, 1, 8, 15))]);
    expect(isLoggedDay(keys, new CalendarDate(2026, 9, 2))).toBe(false);
  });
});
