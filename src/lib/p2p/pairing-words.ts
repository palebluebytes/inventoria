/**
 * What the person pairing two of their own devices is told when the act ends
 * (ADR-0096 §8, ADR-0074 §6).
 *
 * The third module on `ending-words.ts`'s shape, beside the sender's and the
 * recipient's. The shape is shared because the argument for it is the same
 * argument: one line, with the technical cause behind a "show why", read by
 * somebody standing in front of the other device. What is said is different,
 * because this person owns **both** ends — there is no second person to be
 * tactful about, and nothing here has to avoid making a decline visible.
 *
 * **Three parallel maps rather than one shared one**, deliberately. Two of
 * these endings happen to be worded alike today, and folding them together
 * would make the *next* rewording of one surface silently reword the other two.
 * The three ends of these acts are meant to be able to diverge; what is shared
 * is the shape they print in, which is the thing that must not.
 *
 * **"No route" and "somebody took the room" are one line, and deliberately.**
 * A browser cannot tell an unreachable Relay from a room already holding two
 * sockets (ADR-0072 §11.1's refused third arrives as a socket that would not
 * open), so the line names both rather than guessing at one — and it must be
 * loud either way, because the second is exactly §8's photograph-and-race:
 * *one device says paired and the other says pairing failed*, and a surface
 * that quietly retried would erase the only signal that attack gives off.
 *
 * **"Paired" is said once and only once.** A pairing is not complete until its
 * first sync completes (§2), so the good ending below is reachable only from
 * the far side of that sync and from nowhere else.
 *
 * **The room's five endings are worded twice**, because the same ending means
 * different things before and during the transfer. Five minutes running out
 * with nobody in the room is *nobody read this code*; five minutes running out
 * half way through a large ledger is a transfer that stopped, and the rows that
 * did cross are real data a later attempt skips — ADR-0096 §8's **repeated
 * pairing is a resume, not a retry**. One map would have to be wrong in one of
 * those two places, and the wrong one would tell somebody their data was lost.
 */

import { endingCause, type EndingWords } from "./ending-words";
import { PairingRefusedError } from "./pairing-act";
import { RoomFailedError, type RoomFailure } from "./relay-room";
import { RoomCodeSpentError } from "./room-code";
import { SealRefusedError } from "./sealed-frame";

/** How a pairing act ended. */
export type PairingEnding =
  | "paired"
  | RoomFailure
  | "seal"
  | "unreadable"
  | "spent"
  | "unknown";

/** One ending, in the words the pairing section prints. */
export interface PairingWords extends EndingWords {
  ending: PairingEnding;
  /** Whether drawing or reading another code could plausibly work. */
  retry: boolean;
}

/** The one ending that is not a failure, and the only place "paired" is said. */
export const DEVICES_PAIRED: PairingWords = {
  ending: "paired",
  line: "These two devices are paired.",
  detail: "Each one now holds everything the other had.",
  cause: null,
  retry: false,
};

/**
 * How far the act got. It decides which of the two maps below is read, and it
 * is the surface's to state rather than something an error carries: a socket
 * that went away reports the same failure whichever side of the transfer it
 * happened on.
 */
export type PairingReach = "code" | "sync";

type FailureWords = Pick<PairingWords, "line" | "detail" | "retry">;

/** Ended before the two devices had swapped anything. */
const WHILE_WAITING: Record<RoomFailure, FailureWords> = {
  unavailable: {
    line: "That did not reach the other device.",
    detail:
      "Either nothing here could reach Inventoria, or another device took this code's room first. Nothing was paired.",
    retry: true,
  },
  expired: {
    line: "Nobody read this code in five minutes.",
    detail: "Nothing crossed. A new code starts the five minutes again.",
    retry: true,
  },
  cancelled: {
    line: "You called this off.",
    detail: "Nothing crossed, and this code is spent.",
    retry: true,
  },
  refused: {
    line: "Something answered before the code was handed over.",
    detail: "Nothing was paired, and this code is spent.",
    retry: true,
  },
  closed: {
    line: "That did not finish.",
    detail: "Nothing crossed. Another code opens another room.",
    retry: true,
  },
};

/**
 * Ended part way through the transfer.
 *
 * Every one of these says the same two things, because they are the two facts
 * that matter and neither is obvious: **nothing is paired**, and **what crossed
 * is kept**. Rows already imported are real data, correctly stamped, so pairing
 * again picks up where this left off rather than starting over. That pair is
 * one sentence in one place, so a reworded half cannot land on four of these
 * endings and miss the fifth.
 */
const KEPT =
  "Nothing is paired. What already crossed is kept, so pairing again picks up from there.";

const WHILE_SYNCING: Record<RoomFailure, FailureWords> = {
  unavailable: {
    line: "That connection dropped part way through.",
    detail: KEPT,
    retry: true,
  },
  expired: {
    line: "This ran out of time part way through.",
    detail: `Five minutes is all a code gets. ${KEPT}`,
    retry: true,
  },
  cancelled: {
    line: "You stopped this part way through.",
    detail: KEPT,
    retry: true,
  },
  refused: {
    line: "The other device would not go on.",
    detail: KEPT,
    retry: true,
  },
  closed: { line: "That did not finish.", detail: KEPT, retry: true },
};

/**
 * Reads whatever escaped a pairing act into the words for it.
 *
 * Everything that is not an ending this module knows lands on the unknown line
 * rather than on the nearest known one, for the reason `send-words.ts` gives:
 * calling something else "no route to them" would be a guess printed as a fact.
 */
export function pairingEndingWords(
  error: unknown,
  reach: PairingReach = "code"
): PairingWords {
  const cause = endingCause(error);

  if (error instanceof RoomFailedError) {
    const words = reach === "sync" ? WHILE_SYNCING : WHILE_WAITING;
    return { ending: error.failure, cause, ...words[error.failure] };
  }

  if (error instanceof SealRefusedError) {
    return {
      ending: "seal",
      line: "That did not come from this code.",
      detail: "Something else answered in that room, and nothing was paired.",
      cause,
      // The mirror of `send-words.ts`'s: whoever answered under the wrong key
      // is still in that room, and a new code says nothing about who reads it
      // next. The way on is to look at what the other device is showing.
      retry: false,
    };
  }

  if (error instanceof PairingRefusedError) {
    return {
      ending: "unreadable",
      line: "The other device sent something Inventoria could not read.",
      detail: "Nothing was paired. Both devices need the same version.",
      cause,
      retry: false,
    };
  }

  if (error instanceof RoomCodeSpentError) {
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
    line: "These devices could not be paired.",
    detail: "Nothing was paired.",
    cause,
    retry: true,
  };
}
