/**
 * The shape both ends of a Meal send print when one ends (ADR-0074 §6).
 *
 * **One line, with the technical cause behind a "show why".** Three wordings
 * were built and compared — one line, four groups, and every ending in its own
 * words — and one line won, because both of these screens are read by somebody
 * standing in front of the other person. What they need is that it did not
 * work, not which of ADR-0073 §8's seven clauses fired. The cause is kept
 * rather than dropped, because the person who eventually reports a real fault
 * is the same person, one disclosure later.
 *
 * The two ends say different things and share this shape: `send-words.ts` is
 * what the sender is told, `receive-words.ts` is what the recipient is. Neither
 * ever tells the other's story — there is no accept signal on the wire and
 * there must not be one (ADR-0072 §7).
 */

/** One ending, in the words a surface prints. */
export interface EndingWords {
  /** The one line, in the app's voice. One sentence, and no diagnostics. */
  line: string;
  /** What it means for the meal, under the line. */
  detail: string;
  /** The technical reading, behind the "show why". Null when nothing is wrong. */
  cause: string | null;
}

/** The technical reading, from whatever was actually thrown. */
export const endingCause = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
