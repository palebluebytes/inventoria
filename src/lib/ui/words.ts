/**
 * Sentence fragments the app writes in its own voice, rather than the
 * platform's.
 *
 * One helper so far, and it lives here because two unrelated screens reached
 * for the same shape independently: the Facet-scoped wipe's _what stays_ line
 * and the Paired devices section's stated roster. Two copies of a sentence's
 * punctuation drift, and the drift shows up as one screen saying "a, b, and c"
 * while its neighbour says "a, b and c".
 */

/**
 * `a`, `a and b`, `a, b and c` — the app's own voice, not `Intl`'s.
 *
 * `Intl.ListFormat` is deliberately not used: it draws the serial comma for
 * `en-US`, and the app's copy is written without one everywhere else.
 */
export function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
