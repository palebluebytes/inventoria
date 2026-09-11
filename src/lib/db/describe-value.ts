/**
 * What a value *is*, for an error message that may not say what it *said*.
 *
 * Every value the ledger carries is the user's — a meal, a note, a base64 label
 * photo — and on the scan path an entity id is `gtin:<barcode>`, the identifier
 * [ADR-0071](../../../docs/adr/0071-a-scan-session-is-recorded-locally-and-carries-no-barcode.md)
 * §4 forbids by name. Two throws in `db.core.ts` used to `JSON.stringify` the
 * whole thing into their message, and the import puts a failure's message
 * straight on screen, so a malformed row rendered a datom dump (#227).
 *
 * The rule this module exists to make applicable: **a description carries the
 * value's shape and never its content.** It is uniform rather than
 * field-by-field on purpose — "does this interpolation reach the value?" is a
 * question a reviewer can answer by looking, where "is this particular field
 * sensitive?" is a judgement that will eventually be made wrong. Everything
 * `describeValue` returns is bounded by a small constant, so it is also safe to
 * put in front of a person who is already looking at a failure.
 *
 * `describeMarker` is the one deliberate exception, and it is argued where it
 * is written: a format marker on line one of a file is a label rather than
 * content, and the readers refuse each other by naming it.
 */

/** The shape of `value`, in a phrase, with none of the value in it. */
export function describeValue(value: unknown): string {
  if (value === undefined) return "absent";
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return `text of ${count(value.length, "character")}`;
    case "number":
      return describeNumber(value);
    case "boolean":
      return "a boolean";
    case "bigint":
      return "a whole number too large for a number";
    case "symbol":
      return "a symbol";
    case "function":
      return "a function";
  }

  if (Array.isArray(value)) return `an array of ${count(value.length, "item")}`;
  return `an object with ${count(Object.keys(value).length, "field")}`;
}

/**
 * What is wrong with a number, rather than that it is one.
 *
 * "must be a whole number of at least zero, and is a number" says nothing the
 * requirement did not, so the branches here are the ways a number fails one:
 * the sign, the fraction, the exactness. Each is a property of the value rather
 * than the value, on the same footing as a string's length — except `zero`,
 * which is the value and is also the only number a truthiness check rejects, so
 * naming it tells a reader nothing the requirement beside it did not.
 */
function describeNumber(value: number): string {
  if (Number.isNaN(value)) return "not a number";
  if (!Number.isFinite(value)) return "an endless number";
  if (!Number.isInteger(value)) return "a number with a fraction";
  if (value < 0) return "a negative number";
  if (value === 0) return "zero";
  if (!Number.isSafeInteger(value))
    return "a whole number too large to be exact";
  return "a number";
}

/** `1 item` / `3 items`, because a message with `1 items` in it reads as a bug. */
function count(howMany: number, noun: string): string {
  return `${howMany} ${noun}${howMany === 1 ? "" : "s"}`;
}

/**
 * How long a format marker may be before it stops being quoted back (#227).
 * Generous: this app's own markers are 15 and 17 characters, and a marker long
 * enough to matter here is not a marker.
 */
export const MARKER_MAX_CHARS = 64;

/**
 * A format marker quoted back, or described when it is too long to be one.
 *
 * The one place naming a value beats naming its shape. Line one of an import is
 * a label saying which program wrote the file, and the readers use it to refuse
 * each other **by name** — a meal handed to the ledger import is told it is a
 * meal, and a file from another program is told what it says it is, which is
 * the difference between a refusal someone can act on and one they cannot. That
 * is worth keeping; an unbounded echo of a file the app has otherwise rejected
 * is not, so a marker that is not marker-sized falls back to its shape.
 */
export function describeMarker(value: unknown): string {
  return typeof value === "string" && value.length <= MARKER_MAX_CHARS
    ? JSON.stringify(value)
    : describeValue(value);
}
