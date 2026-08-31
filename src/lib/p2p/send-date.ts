/**
 * How a date is written on the way out of a meal (ADR-0074 §7).
 *
 * Deliberately **not** `dayLabel` from `food/past-meals`, which writes "Today"
 * and "Tuesday". That phrasing is right where the app is talking to you about
 * your own week — the past-meal picker exists to help you find last Tuesday's
 * dinner — and wrong the moment a second person is looking at the screen,
 * because "Tuesday" names nothing across two devices and "Today" is a claim
 * about whose day. A send screen has both problems at once.
 *
 * **The ways in keep `dayLabel`; the way out writes a date.** One format
 * constant and one function, so a later preference — a locale, a short/long
 * switch, a per-device setting — changes the format here and reaches every send
 * surface without any of them being edited.
 */

/** The formats this understands. Add a case to {@link writeDate} to add one. */
export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

/** What the app writes today. The single edit point. */
export const DATE_FORMAT: DateFormat = "DD/MM/YYYY";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * One date, written.
 *
 * The parts are read off the local calendar rather than through
 * `toISOString`, because the day a meal belongs to is the day the sender's own
 * dashboard filed it under — a meal logged at half past eleven at night is not
 * tomorrow's.
 */
export function writeDate(
  date: Date,
  format: DateFormat = DATE_FORMAT
): string {
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear());
  // Every arm named rather than one behind a `default`, so adding a format to
  // the union is a compile error here rather than a silent fall-through to
  // whichever one happened to be last.
  switch (format) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
  }
}
