/**
 * What the sender is told when a send ends (ADR-0074 §6).
 *
 * The one-line-plus-disclosure shape, and why it is that shape, is in
 * `ending-words.ts`, which the receive surface's own words share. This module
 * is the sender's half of it.
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

import { endingCause, type EndingWords } from "./ending-words";
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

/** One ending, in the words the send panel prints. */
export interface SendWords extends EndingWords {
  ending: SendEnding;
  /**
   * Whether drawing another code could plausibly work.
   *
   * False after a refusal on purpose: ADR-0072 §6 refuses a retry because the
   * payload was malformed or hostile, so sending the same meal again fails
   * identically and hides a real fault. A fresh code does not change that — the
   * rule is about the meal, not about the code's arithmetic.
   */
  retry: boolean;
  /**
   * Whether this ending offers the Ledger export inline (ADR-0072 §14).
   *
   * **True on the two endings the record names, and nowhere else.** §14 is the
   * relay out of reach: nothing crossed, the code was never spent, and the
   * difference between a named step-down and a dead end is one button. ADR-0074
   * §10 adds the room that ran out its five minutes, which is where an Android
   * sender lands when an iOS recipient refuses — *"will time out at five
   * minutes and be offered the export, correctly"*.
   *
   * Everything else is false for a reason rather than by default. A refusal and
   * a wrong-key answer are about the meal and about who was in the room; a
   * spent code has already done its job; a send the sender called off did not
   * fail. `closed` is the nearest miss and still false: the Relay ending a room
   * under one of its own bounds (§11) is a shape being refused rather than the
   * route being out of reach, no record names it, and widening §14 by a third
   * ending is an argument to make in an ADR rather than in a boolean. An
   * ending nobody recognises may well be the ledger read that failed, so
   * offering a file of that same ledger would be a guess printed as an answer.
   *
   * This is the **sender's** surface only. ADR-0074 §10 refuses the same button
   * on the iOS receive surface, because a refusal that proposes a way round is
   * not a refusal, and the two rules must not be merged.
   */
  stepDown: boolean;
}

/** The one ending that is not a failure. */
export const MEAL_DELIVERED: SendWords = {
  ending: "delivered",
  line: "They have it.",
  detail: "What they do with it is theirs. Inventoria will not tell you.",
  cause: null,
  retry: false,
  stepDown: false,
};

const FAILURE_WORDS: Record<
  SendFailure,
  Pick<SendWords, "line" | "detail" | "retry" | "stepDown">
> = {
  unavailable: {
    line: "No route to them.",
    detail: "Nothing left this device, and this code was never spent.",
    retry: true,
    stepDown: true,
  },
  expired: {
    line: "Nobody took this in five minutes.",
    detail: "Nothing crossed. A new code starts the five minutes again.",
    retry: true,
    stepDown: true,
  },
  // The panel closes on the way to this one — closing a live code is what
  // cancels it — so these words are the ending's rather than a screen's. They
  // exist because the map of endings is total, and a hole here would show up as
  // the "unknown" line the day something else calls off a send.
  cancelled: {
    line: "You called this off.",
    detail: "Nothing crossed, and this code is spent.",
    retry: true,
    stepDown: false,
  },
  refused: {
    line: "They could not read it.",
    detail: "Nothing was added to their day, and this code is spent.",
    retry: false,
    stepDown: false,
  },
  closed: {
    line: "That did not finish.",
    detail: "Nothing crossed. Another code opens another room.",
    retry: true,
    stepDown: false,
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
  const cause = endingCause(error);

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
      stepDown: false,
    };
  }

  if (error instanceof SendCodeSpentError) {
    return {
      ending: "spent",
      line: "This code has already been used.",
      detail: "A code does one job, and this one has done it.",
      cause,
      retry: false,
      stepDown: false,
    };
  }

  return {
    ending: "unknown",
    line: "This meal could not be sent.",
    detail: "Nothing left this device.",
    cause,
    retry: true,
    stepDown: false,
  };
}
