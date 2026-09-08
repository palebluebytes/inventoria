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
 * **"No route" and "somebody took the room" are one line, and deliberately.**
 * A browser cannot tell an unreachable Relay from a room already holding two
 * sockets (ADR-0072 §11.1's refused third arrives as a socket that would not
 * open), so the line names both rather than guessing at one — and it must be
 * loud either way, because the second is exactly §8's photograph-and-race:
 * *one device says paired and the other says pairing failed*, and a surface
 * that quietly retried would erase the only signal that attack gives off.
 *
 * **Nothing here says "paired".** A pairing is not complete until its first
 * sync completes (§2), so the good ending below is that the two devices met,
 * which is all that has happened.
 */

import { endingCause, type EndingWords } from "./ending-words";
import { PairingRefusedError } from "./pairing-act";
import { RoomFailedError, type RoomFailure } from "./relay-room";
import { RoomCodeSpentError } from "./room-code";
import { SealRefusedError } from "./sealed-frame";

/** How a pairing act ended. */
export type PairingEnding =
  | "met"
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

/** The one ending that is not a failure, and it is not "paired" either. */
export const DEVICES_MET: PairingWords = {
  ending: "met",
  line: "These two devices have met.",
  detail:
    "A pairing is not complete until the first sync, so nothing is paired yet.",
  cause: null,
  retry: false,
};

const FAILURE_WORDS: Record<
  RoomFailure,
  Pick<PairingWords, "line" | "detail" | "retry">
> = {
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
 * Reads whatever escaped a pairing act into the words for it.
 *
 * Everything that is not an ending this module knows lands on the unknown line
 * rather than on the nearest known one, for the reason `send-words.ts` gives:
 * calling something else "no route to them" would be a guess printed as a fact.
 */
export function pairingEndingWords(error: unknown): PairingWords {
  const cause = endingCause(error);

  if (error instanceof RoomFailedError) {
    return { ending: error.failure, cause, ...FAILURE_WORDS[error.failure] };
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
