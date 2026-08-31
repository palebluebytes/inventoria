/**
 * What the sender is told when a send ends (ADR-0074 §6).
 *
 * **One line, with the technical cause behind a "show why".** Three wordings
 * were built and compared — one line, four groups, and every ending in its own
 * words — and one line won, because this screen is read by somebody standing in
 * front of the person they were sending to. What they need is that it did not
 * work, not which of ADR-0073 §8's seven clauses fired. The cause is kept
 * rather than dropped, because the person who eventually reports a real fault
 * is the same person, one disclosure later.
 *
 * **The seal keeps its own sentence.** "Someone else answered" is different
 * news from "this is malformed", and flattening the two would tell a person a
 * meal was rejected when what happened is that a stranger was in the room. The
 * sentence is the mirror of the receive surface's — that one reads *the code
 * you scanned*, and on this side the code was shown rather than scanned.
 *
 * **The sender is never told what became of the meal**, because there is no
 * accept signal on the wire and there must not be one (ADR-0072 §7): reporting
 * acceptance would make declining socially visible.
 */

import { SendFailedError, type SendFailure } from "./meal-send";
import { SealRefusedError } from "./sealed-frame";
import { SendCodeSpentError } from "./send-code";

/**
 * How a send ended: the five ways a session can, plus the seal refusing an
 * answer, a code that had already done its job, and whatever else escaped.
 */
export type SendEnding =
  | "delivered"
  | SendFailure
  | "seal"
  | "spent"
  | "unknown";

/** One ending, in the words the panel prints. */
export interface SendWords {
  ending: SendEnding;
  /** The one line, in the app's voice. One sentence, and no diagnostics. */
  line: string;
  /** What it means for the meal, under the line. */
  detail: string;
  /** The technical reading, behind the "show why". Null when nothing is wrong. */
  cause: string | null;
  /**
   * Whether drawing another code could plausibly work.
   *
   * False after a refusal on purpose: ADR-0072 §6 refuses a retry because the
   * payload was malformed or hostile, so sending the same meal again fails
   * identically and hides a real fault. A fresh code does not change that — the
   * rule is about the meal, not about the code's arithmetic.
   */
  retry: boolean;
}

/** The one ending that is not a failure. */
export const MEAL_DELIVERED: SendWords = {
  ending: "delivered",
  line: "They have it.",
  detail: "What they do with it is theirs. Inventoria will not tell you.",
  cause: null,
  retry: false,
};

/** The technical reading, from whatever was actually thrown. */
const causeOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const FAILURE_WORDS: Record<
  SendFailure,
  Pick<SendWords, "line" | "detail" | "retry">
> = {
  unavailable: {
    line: "No route to them.",
    detail: "Nothing left this device, and this code was never spent.",
    retry: true,
  },
  expired: {
    line: "Nobody took this in five minutes.",
    detail: "Nothing crossed. A new code starts the five minutes again.",
    retry: true,
  },
  // The panel closes on the way to this one — closing a live code is what
  // cancels it — so these words are the ending's rather than a screen's. They
  // exist because the map of endings is total, and a hole here would show up as
  // the "unknown" line the day something else calls off a send.
  cancelled: {
    line: "You called this off.",
    detail: "Nothing crossed, and this code is spent.",
    retry: true,
  },
  refused: {
    line: "They could not read it.",
    detail: "Nothing was added to their day, and this code is spent.",
    retry: false,
  },
  closed: {
    line: "That did not finish.",
    detail: "Nothing crossed. Another code opens another room.",
    retry: true,
  },
};

/**
 * Reads whatever escaped a send into the words for it.
 *
 * Everything that is not one of the endings this module knows lands on the
 * unknown line rather than on the nearest known one. Gathering the meal from
 * the ledger can fail too, and calling that "no route to them" would be a
 * guess printed as a fact.
 */
export function sendEndingWords(error: unknown): SendWords {
  const cause = causeOf(error);

  if (error instanceof SendFailedError) {
    return { ending: error.failure, cause, ...FAILURE_WORDS[error.failure] };
  }

  if (error instanceof SealRefusedError) {
    return {
      ending: "seal",
      line: "This did not come from the code you showed.",
      detail: "Something else answered, and the meal did not reach them.",
      cause,
      // Whoever answered under the wrong key is still in that room, and a new
      // code says nothing about who scans it next.
      retry: false,
    };
  }

  if (error instanceof SendCodeSpentError) {
    return {
      ending: "spent",
      line: "This code has already been used.",
      detail: "A code does one job, and this one has done it.",
      cause,
      retry: false,
    };
  }

  return {
    ending: "unknown",
    line: "This meal could not be sent.",
    detail: "Nothing left this device.",
    cause,
    retry: true,
  };
}
