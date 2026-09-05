/**
 * Which store the ledger opened on, and what to say about it.
 *
 * A module of its own because it is read from both sides of the Worker
 * boundary — `db.worker.ts` decides it, `db.client.ts` records it — and because
 * the words belong beside the values rather than in whichever file happened to
 * need them first.
 *
 * The fact is worth carrying at all for ADR-0092 §5.3's reason: an in-memory
 * database means **nothing the user records survives the tab**, and that line
 * was the most consequential in the whole console census. It could not stay
 * where it was written. The Worker has no `localStorage`, so it has no way to
 * reach the log facility; the fact rides back on the init reply instead, and
 * the record is written on the main thread.
 */

/** Where the database is. `forced-memory` is the `?mem=1` escape hatch. */
export type StorageMode = "opfs" | "memory" | "forced-memory";

/**
 * Whether this mode is a degradation the user should be told about.
 *
 * ADR-0092 §5's rule is the severity of what happened, not the importance of
 * the record — so OPFS working is not a warning, and both memory modes are. The
 * forced one is deliberate and still loses the data, which is what the level
 * is about.
 */
export function storageModeIsDegraded(mode: StorageMode): boolean {
  return mode !== "opfs";
}

/**
 * What the log record says, in the words a person reading an exported file gets.
 *
 * The healthy case is stated affirmatively rather than left silent. At `Noisy`
 * somebody debugging *my food log vanished* is reading for exactly this, and the
 * absence of a warning is not evidence that the database persisted.
 */
export function storageModeMessage(mode: StorageMode): string {
  switch (mode) {
    case "opfs":
      return "database opened on OPFS; what you record persists";
    case "memory":
      return "OPFS is unsupported here, so the database opened in memory: nothing you record survives this tab";
    case "forced-memory":
      return "forced in-memory database (?mem=1): nothing you record survives this tab";
  }
}
