/**
 * Whether the browser has agreed to keep this origin's storage, and how much of
 * it is in use (ADR-0065).
 *
 * The ledger lives in OPFS, which is best-effort by default: the browser is free
 * to evict it when the device runs short of disk, and nothing asks the user
 * first. `navigator.storage.persist()` is the one call that takes it out of that
 * bucket, so the app makes it once, early, and reports what it was told.
 *
 * Nothing here is the ledger. The answer is a property of the browser profile
 * rather than a fact about the person using the app, so it is never written as a
 * datom: it would be wrong on the next device to read it, and the ledger cannot
 * take it back.
 */

/**
 * What the browser says about this origin's storage.
 *
 * `persisted` and `best-effort` are the Storage standard's own two buckets.
 * `unknown` is this app's third case: no `StorageManager` here, so nothing was
 * asked and nothing may be claimed.
 */
export type PersistenceState = "persisted" | "best-effort" | "unknown";

/**
 * Asks the browser to keep this origin's storage, and answers what it decided.
 *
 * Memoised at module scope, which is what makes the request fire at most once
 * per session: every later caller, the Settings readout included, awaits the
 * same promise rather than asking again. `persisted()` is consulted first, so a
 * grant that is already in place is never re-requested.
 *
 * It never rejects. A browser that will not answer leaves the app in exactly the
 * state it was already in, which is not a failure worth propagating into a
 * screen.
 */
export function ensurePersistentStorage(): Promise<PersistenceState> {
  asked ??= askTheBrowser();
  return asked;
}

let asked: Promise<PersistenceState> | null = null;

async function askTheBrowser(): Promise<PersistenceState> {
  const manager = storageManager();
  // Half a StorageManager is a real browser: Safari shipped `estimate()` years
  // before `persist()`, and the DOM types declare all three as present.
  if (
    typeof manager?.persisted !== "function" ||
    typeof manager.persist !== "function"
  ) {
    return "unknown";
  }
  try {
    if (await manager.persisted()) return "persisted";
    return (await manager.persist()) ? "persisted" : "best-effort";
  } catch {
    // An insecure or privacy-locked context can throw instead of answering.
    // That is the same position as having no StorageManager at all: nothing was
    // decided, so nothing is claimed.
    return "unknown";
  }
}

/**
 * What the browser says this origin is using, and how much it is allowed. Both
 * figures are optional in the Storage standard, so either can be absent while
 * the other is present.
 */
export interface StorageEstimateReading {
  /** Bytes stored, or `null` where the browser gives no figure. */
  usageBytes: number | null;
  /** Bytes this origin may use, or `null` where the browser gives no figure. */
  quotaBytes: number | null;
}

/**
 * Roughly how much storage this origin holds, or `null` where the browser will
 * not say.
 *
 * It is origin-wide. The ledger, the bundled USDA corpus, the service worker's
 * precache and every other cached byte are one number here, and no part of it
 * can be attributed to the ledger alone. Anything that shows it says so, and
 * nothing decides whether a ledger fits by reading it.
 */
export async function readStorageEstimate(): Promise<StorageEstimateReading | null> {
  const manager = storageManager();
  if (typeof manager?.estimate !== "function") return null;
  try {
    const estimate = await manager.estimate();
    return {
      usageBytes: typeof estimate.usage === "number" ? estimate.usage : null,
      quotaBytes: typeof estimate.quota === "number" ? estimate.quota : null,
    };
  } catch {
    // A privacy-locked or insecure context refuses outright. No estimate is a
    // missing figure, not an error a screen has to handle.
    return null;
  }
}

/**
 * The `StorageManager` this browser offers, or `null` where there is none. The
 * Node unit runner has a `navigator` with no `storage` on it, and a
 * privacy-locked or insecure context can withhold it too, so presence is
 * checked rather than assumed.
 */
function storageManager(): StorageManager | null {
  if (typeof navigator === "undefined") return null;
  if (!("storage" in navigator) || !navigator.storage) return null;
  return navigator.storage;
}
