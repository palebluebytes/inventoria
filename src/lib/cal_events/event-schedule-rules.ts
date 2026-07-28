import type { ScheduleRule, DayOfWeek } from "../recurrence/rules";

// The add-event form lets a one-off event opt into a recurrence. Turning the
// form's controls into a `ScheduleRule` — and deriving the monthly anchors the
// UI shows ("on day 5", "on the 1st Fri") from the chosen start date — is pure
// data-shaping, lifted out of the component here so it can be reasoned about and
// unit-tested without driving the sheet.

export type RecurType =
  | "none"
  | "specific_days"
  | "weekly"
  | "monthly"
  | "yearly";

// index 0 = Sunday, matching Date.getUTCDay()
const DOW_NAMES: DayOfWeek[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

export interface MonthlyAnchors {
  /** Day of the month of the start date (1–31). */
  dayOfMonth: number;
  /** Month of the year of the start date (1–12). */
  monthOfYear: number;
  /** Weekday of the start date. */
  relativeDay: DayOfWeek;
  /** Which occurrence of that weekday the start date is; -1 = last. */
  relativeWeek: -1 | 1 | 2 | 3 | 4;
}

/**
 * Derive the monthly/yearly recurrence anchors from a `YYYY-MM-DD` start date:
 * its day-of-month and month-of-year (for the "fixed" modes), and its weekday
 * plus which occurrence of that weekday it is within the month (for the
 * "relative" mode, e.g. "the 1st Friday" or "the last Friday").
 */
export function monthlyAnchors(startDateStr: string): MonthlyAnchors {
  const start = new Date(startDateStr + "T00:00:00Z");
  const dayOfMonth = start.getUTCDate();
  const monthOfYear = start.getUTCMonth() + 1;
  const relativeDay = DOW_NAMES[start.getUTCDay()];

  const dow = start.getUTCDay();
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)
  ).getUTCDate();
  // Walk back from the last day of the month to the last matching weekday.
  let last = lastDay;
  while (
    new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), last)
    ).getUTCDay() !== dow
  ) {
    last--;
  }
  const relativeWeek: -1 | 1 | 2 | 3 | 4 =
    dayOfMonth === last ? -1 : (Math.ceil(dayOfMonth / 7) as 1 | 2 | 3 | 4);

  return { dayOfMonth, monthOfYear, relativeDay, relativeWeek };
}

export interface EventScheduleInput {
  recurType: RecurType;
  selectedDays: Set<DayOfWeek> | DayOfWeek[];
  monthlyMode: "fixed" | "relative";
  /** `YYYY-MM-DD` — anchors the monthly/yearly modes. */
  startDateStr: string;
  /** `YYYY-MM-DD` or empty for open-ended. */
  until?: string;
  timed: boolean;
  hasEnd: boolean;
  /** Ordered time-of-day slots; slot 0 is the start time. */
  timeSlots: string[];
}

/**
 * Map the add-event form's recurrence controls to a `ScheduleRule`, or
 * `undefined` for a one-off. A timed, endless (no block end) event with more
 * than one time slot carries those slots as per-occurrence `targets`.
 */
export function buildEventScheduleRules(
  input: EventScheduleInput
): ScheduleRule | undefined {
  const until = input.until || undefined;
  const days = Array.from(input.selectedDays);

  let targets: { id: string; time_hint?: string }[] | undefined = undefined;
  if (input.timed && !input.hasEnd && input.timeSlots.length > 1) {
    targets = input.timeSlots.map((t, i) => ({
      id: `slot_${i}`,
      time_hint: t,
    }));
  }

  const anchors = monthlyAnchors(input.startDateStr);

  switch (input.recurType) {
    case "none":
      return undefined;
    case "specific_days":
      if (days.length === 7) {
        return { type: "daily_multiple", count: 1, targets, until };
      }
      return { type: "weekly_days", days, targets, until };
    case "weekly":
      return { type: "weekly_flexible", count: 1, targets, until };
    case "monthly":
      if (input.monthlyMode === "fixed") {
        return {
          type: "monthly_fixed",
          day_of_month: anchors.dayOfMonth,
          targets,
          until,
        };
      }
      return {
        type: "monthly_relative",
        week: anchors.relativeWeek,
        day: anchors.relativeDay,
        targets,
        until,
      };
    case "yearly":
      return {
        type: "yearly_fixed",
        month: anchors.monthOfYear,
        day_of_month: anchors.dayOfMonth,
        targets,
        until,
      };
    default:
      return undefined;
  }
}
