import { CalendarDate, type DateValue } from "@internationalized/date";
import type { ConsumptionEvent } from "./consumption-state";
import { dayKeyOf } from "./past-meals";

/**
 * Which local days have food on them, and the conversion the month calendar
 * needs to ask (#344, ADR-0091 §2).
 *
 * The rail's calendar is not a date picker with a decoration on it: what makes
 * a month grid worth the room a week strip already fills in less is that it
 * shows **where the history actually is**. That question is a fold over the
 * Consumption projection, so it is pure and lives here rather than in the
 * component that draws the marks.
 *
 * **Everything converts through local calendar fields, and nothing through an
 * ISO string.** `Date#toISOString`, `parseDate` and `new Date("2026-09-03")`
 * all speak UTC; the day a person says they ate on is local. Late one evening
 * the two disagree, and a mark landing on a day nobody ate on is worse than no
 * mark — it is the app misremembering. {@link dayKeyOf} already buckets by
 * `getFullYear`/`getMonth`/`getDate` for exactly this reason, and these
 * functions are what let a `DateValue` reach that same key without a hop
 * through a timezone on the way.
 */

/**
 * The set of {@link dayKeyOf} keys the history has food on.
 *
 * A `Set` rather than a list because the caller asks it one question per cell,
 * 42 of them per month, and because two meals on one day are one marked day.
 */
export function loggedDayKeys(events: ConsumptionEvent[]): Set<string> {
  return new Set(events.map((e) => dayKeyOf(e.time)));
}

/** A `Date`'s own calendar day, as the calendar's date type states it. */
export function toCalendarDate(date: Date): CalendarDate {
  // `CalendarDate` counts months from 1 and `Date` from 0.
  return new CalendarDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
}

/**
 * The local midnight of a calendar day, which is what the rest of the food
 * screen means by a selected date — `getDayBounds` and `dayKeyOf` both read a
 * `Date`'s local fields, so a day handed back in UTC would filter the wrong
 * events into the wrong day.
 */
export function fromCalendarDate(value: DateValue): Date {
  return new Date(value.year, value.month - 1, value.day);
}

/** Whether one calendar cell's day is one of the days with food on it. */
export function isLoggedDay(
  logged: ReadonlySet<string>,
  value: DateValue
): boolean {
  return logged.has(dayKeyOf(fromCalendarDate(value)));
}
