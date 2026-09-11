/**
 * The one date the log's surfaces print, and the words around it.
 *
 * Two screens show the same date in the same format for the same reason, and
 * one was a copy of the other, comment included. The reason is what makes it
 * worth a module rather than a duplicated three-liner: a counter's epoch is the
 * half of the number that makes it honest (ADR-0092 §9, #214 §9), so **"since
 * 5 September", never "lifetime"** — after a `Clear` the totals start again, and
 * a word implying otherwise would be the screen lying about a number whose
 * epoch it can see.
 *
 * The locale is the reader's, unstated: these are dates a person reads on their
 * own device, not a format anything parses back.
 */
export function logDateLabel(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
