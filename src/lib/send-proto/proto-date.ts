/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/send-proto/README.md`.
 *
 * How a date is written on a send or receive screen.
 *
 * Deliberately NOT `dayLabel` from `food/past-meals`, which writes "Today" and
 * "Tuesday". That phrasing is right where the app is talking to you about your
 * own week — a picker you scroll to find last Tuesday's dinner. It is wrong the
 * moment a second person is looking at the screen, because "Tuesday" is
 * ambiguous across two devices and "Today" is a claim about whose day.
 *
 * One format constant and one function, so a later preference — a locale, a
 * short/long switch, a per-device setting — changes the format here and reaches
 * every screen without any of them being edited.
 */

/** The formats this understands. Add a case to {@link formatDate} to add one. */
export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

/** What the prototype writes today. The single edit point. */
export const DATE_FORMAT: DateFormat = "DD/MM/YYYY";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(d: Date, fmt: DateFormat = DATE_FORMAT): string {
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = String(d.getFullYear());
  switch (fmt) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    default:
      return `${day}/${month}/${year}`;
  }
}
