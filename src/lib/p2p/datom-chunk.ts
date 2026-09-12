/**
 * One chunk of datoms as it crosses between your own devices, read to the bar
 * ADR-0075 §13 sets.
 *
 * Both routes carry the same grammar for the same reason. A live first sync
 * sends the ledger's own NDJSON a chunk at a time over a room
 * (`first-sync.ts`), and a Deposit seals the same lines into an object at an
 * address (`wake.ts`); the seal and the transport differ, and what is inside
 * does not. Reading it in one place is what stops the two drifting into two
 * standards for the same bytes.
 *
 * **The standard is a refusal, and it is not about trust.** A chunk whose seal
 * held and whose rows are malformed is a **bug**, not an attack — the seal is
 * what makes a paired device yours. It is refused anyway, because a bug that
 * writes to an append-only ledger is undeletable, and because the rows and the
 * vectors together are what decide which rows are withheld permanently.
 */

import type { LedgerRow } from "../db/db.core";
import { meaningfulLines, readDatomLine } from "../db/ledger-import";
import { PairingRefusedError } from "./pairing-act";

/**
 * Runs a read, turning anything it throws into the one refusal a surface has
 * words for.
 *
 * It covers the vectors and the envelopes as well as the rows, because those
 * are the other inputs deciding what crosses, and one standard over all of them
 * is the whole point.
 */
export function refusingChunk<T>(read: () => T): T {
  try {
    return read();
  } catch (broken) {
    throw new PairingRefusedError(
      broken instanceof Error ? broken.message : String(broken)
    );
  }
}

/** One chunk's datom lines, in the ledger's own grammar and nothing else. */
export function readDatomChunk(body: string): LedgerRow[] {
  return refusingChunk(() =>
    meaningfulLines(body).map((line) =>
      readDatomLine(line.text, line.lineNumber)
    )
  );
}
