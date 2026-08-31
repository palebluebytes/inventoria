/**
 * What the recipient is told (ADR-0074 §6, ADR-0073 §10 and §11).
 *
 * The mirror of `send-words.ts`, on the shape both share — one line, with the
 * technical cause behind a "show why". This end says different things for the
 * same reason the two screens are different screens: the person reading this
 * one is being handed something, and the person reading the other one is
 * handing it over.
 *
 * **The seal keeps its own sentence here too**, and it is the sentence
 * `send-words.ts` calls its mirror: that end reads *the code you showed*, and
 * this end reads *the code you scanned*, because on this side the code was
 * scanned or opened rather than shown.
 *
 * **Nothing here ever tells the sender anything.** There is no accept signal on
 * the wire and there must not be one (ADR-0072 §7): whether the meal was kept
 * is the recipient's private decision about their own ledger, and reporting it
 * would make declining socially visible.
 */

import { endingCause, type EndingWords } from "./ending-words";
import type { AcceptedMeal } from "./meal-accept";
import { SendFailedError, type SendFailure } from "./meal-send";
import { MealPayloadRefusedError } from "./meal-reader";
import { SealRefusedError } from "./sealed-frame";
import { SendCodeSpentError } from "./send-code";

/**
 * How a receive ended: the meal landed, the meal was empty, one of the five
 * ways a session ends, or one of the three refusals this side can raise.
 */
export type ReceiveEnding =
  | "landed"
  | "nothing"
  | SendFailure
  | "seal"
  | "unreadable"
  | "spent"
  | "unknown";

/** One ending, in the words the receiving surface prints. */
export interface ReceiveWords extends EndingWords {
  ending: ReceiveEnding;
}

/**
 * A payload that arrived whole and carries no meal anyone can be given.
 *
 * ADR-0073 §8 refuses a payload whose lines do not carry a declared root, so
 * this is the narrower case that survives all seven: roots whose rows fold to
 * nothing a day can hold — a Consumption Event with no food to point at. It is
 * said rather than shown as an empty meal, because an empty panel with an
 * "add it" button under it is an offer to add nothing.
 */
export const MEAL_HAS_NOTHING: ReceiveWords = {
  ending: "nothing",
  line: "There is no meal in this.",
  detail: "It arrived whole and carries nothing that can go in your day.",
  cause: null,
};

const FAILURE_WORDS: Record<SendFailure, Omit<EndingWords, "cause">> = {
  unavailable: {
    line: "No route to their meal.",
    detail: "Nothing reached this device. Their code was never spent.",
  },
  expired: {
    line: "Nothing arrived in five minutes.",
    detail: "A code lives five minutes. Ask them for a new one.",
  },
  // Two endings the surface leaves on its way past rather than stops on: the
  // recipient leaving is what cancels a receive, and it is also what unmounts
  // the screen these words would have been printed on. They exist because the
  // map of endings is total, and a hole here surfaces as the "unknown" line the
  // day something else calls one off.
  cancelled: {
    line: "You left before it arrived.",
    detail: "Nothing was added to your day.",
  },
  refused: {
    line: "That did not finish.",
    detail: "Nothing was added to your day. Ask them for a new code.",
  },
  closed: {
    line: "That did not finish.",
    detail: "Nothing was added to your day. Ask them for a new code.",
  },
};

/**
 * Reads whatever escaped a receive into the words for it.
 *
 * Everything this module does not know lands on the unknown line rather than on
 * the nearest known one: guessing between "they are offline" and "their meal is
 * malformed" would print a guess as a fact, and the two are different news.
 */
export function receiveEndingWords(error: unknown): ReceiveWords {
  const cause = endingCause(error);

  if (error instanceof SendFailedError) {
    return { ending: error.failure, cause, ...FAILURE_WORDS[error.failure] };
  }

  if (error instanceof SealRefusedError) {
    return {
      ending: "seal",
      line: "This did not come from the code you scanned.",
      detail: "Somebody else answered, and nothing of theirs was kept.",
      cause,
    };
  }

  // Every one of ADR-0073 §8's seven refusals and §9's ceiling, in one line.
  // Which clause fired is behind the "show why": this is read by somebody
  // standing in front of the person who sent it.
  if (error instanceof MealPayloadRefusedError) {
    return {
      ending: "unreadable",
      line: "This is not a meal Inventoria can read.",
      detail: "Nothing was added to your day, and their code is spent.",
      cause,
    };
  }

  if (error instanceof SendCodeSpentError) {
    return {
      ending: "spent",
      line: "This code has already been used.",
      detail: "A code does one job, and this one has done it.",
      cause,
    };
  }

  return {
    ending: "unknown",
    line: "This meal did not arrive.",
    detail: "Nothing was added to your day.",
    cause,
  };
}

const foods = (count: number): string =>
  `${count} ${count === 1 ? "food" : "foods"}`;

/**
 * What one accept did, in the recipient's words (ADR-0073 §5, §6 and §11).
 *
 * `absorbed` is the one that needs a sentence of its own rather than a count:
 * a meal accepted twice lands once, because the event id is derived from the
 * payload's declared root, and somebody who taps twice needs to be told their
 * day is right rather than left wondering where the second copy went.
 *
 * `lost` is reported and never rounded away. It is a Consumption Event the
 * payload carried too little of to reproduce, and quietly landing a shorter
 * meal than arrived is the failure ADR-0073 §8.7 refuses on the wire.
 */
export function mealLandedWords(
  landed: AcceptedMeal,
  meal_type: string
): ReceiveWords {
  const detail =
    landed.lost > 0
      ? `${foods(landed.lost)} could not be reproduced and were left out.`
      : "It is yours now, on your own clock and in your own day.";

  if (landed.logged === 0 && landed.absorbed > 0) {
    return {
      ending: "landed",
      line: "You already had this meal.",
      detail: "It was accepted before, so nothing was added twice.",
      cause: null,
    };
  }

  return {
    ending: "landed",
    line: `${foods(landed.logged)} added to your ${meal_type}.`,
    detail,
    cause: null,
  };
}
