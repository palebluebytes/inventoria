import type { ScanAttempt, ScanOutcome } from "../logs/scan-log";
import {
  lookupBarcode,
  OffUnreachableError,
  ProductNotFoundError,
  type OffPayload,
} from "./open-food-facts";

/**
 * One more ask, for a barcode lookup Open Food Facts did not answer (#206).
 *
 * It lives beside `open-food-facts.ts` rather than inside it because that module
 * is one ask and one reading of the answer, and two things now depend on it
 * staying that shape: #204's status classification, and the parity lock in
 * `tests/unit/curated-drift.test.ts`, which holds `scripts/curated-drift.mjs`'s
 * hand-restated copy against exactly that one-status-in, one-meaning-out
 * function. A retry folded in there would turn one call into two asks and blur
 * what the lock compares.
 *
 * It is not in the Scan tab either: a policy with a clock in it is not
 * presentation (`CODING_STANDARDS.md` §2.2).
 */

/**
 * The pause before the one retry.
 *
 * Long enough that OFF's rate-limiter window and an edge node's bad second have
 * moved on, and short enough that a person waiting on a scan reads it as the
 * same wait rather than a second one — it sits well inside the ~1s a screen has
 * before a wait becomes something the user is thinking about, and the failed
 * first attempt has usually spent some of that already.
 */
const RETRY_BACKOFF_MS = 400;

/**
 * How long a lookup may already have run and still be worth asking again.
 *
 * A start gate, and only that: it decides whether a second attempt begins, never
 * how long one may take. Neither attempt carries a request timeout — that is
 * `lookupBarcode`'s shape and this does not change it — so what is bounded here
 * is the wait this module adds, not the request underneath.
 *
 * A first attempt that ate the window and then failed has already spent the
 * patience a scan has, so the honest move is #204's unreachable state and its
 * **Try again**, which puts the next wait somewhere the user chose it.
 */
const RETRY_DEADLINE_MS = 2000;

/** Real time passing. Replaced in tests so the suite pays no backoff. */
const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What {@link lookupBarcodeWithRetry} takes besides the barcode: the clock it
 * runs on, injected rather than reached for (`CODING_STANDARDS.md` §6) so a test
 * reads back the wait that was asked for instead of serving it, and the observer
 * that hears how many times it asked.
 *
 * It was `RetryClock`, and it is renamed rather than left carrying a name that
 * covers half of what it holds. Every field is still optional, so a caller that
 * wants none of it passes nothing.
 */
export interface RetryOptions {
  /** Waits `ms` before resolving. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds since an arbitrary epoch. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Told how many times this lookup asked, **exactly once**, before the call
   * returns or rethrows.
   *
   * An observer rather than a third member of the return type, because the
   * policy either hands back a payload or throws and neither path can carry a
   * fourth thing without changing what every existing caller reads. It exists
   * because `gate_skipped` is otherwise invisible to everybody: the deadline
   * declining a second ask looks exactly like a first ask that failed.
   *
   * Called from a `finally`, so a caller reading it can rely on having heard.
   */
  onAttempt?: (attempt: ScanAttempt) => void;
}

/**
 * What a barcode lookup ended as, in the log's vocabulary (ADR-0071 §3).
 *
 * **Read off #204's error classes and never off a status.** `lookupBarcode`
 * decides which class a response is, once, in `serviceDidNotAnswer`; a second
 * list of statuses here would be free to disagree with it, and #204's whole
 * point is that one function decides.
 *
 * The `else` is deliberately everything else, and it is the same `else` the
 * Scan tab's own banner takes: a 400, a 403, and a transport-level rejection
 * where nothing was asked at all. `ScanOutcome` documents what that costs.
 */
export function scanOutcomeOf(failure: unknown): ScanOutcome {
  if (failure instanceof ProductNotFoundError) return "absent";
  if (failure instanceof OffUnreachableError) return "unreachable";
  return "refused";
}

/**
 * `lookupBarcode`, asked a second time when Open Food Facts did not answer the
 * first (#206). This is what the Scan tab calls.
 *
 * **What is retried is exactly {@link OffUnreachableError}** — #204's reading of
 * "the service failed to answer", spelled as that class rather than restated as
 * a second list of statuses, so the two can never say different things. Those
 * failures (429, 5xx) clear on their own in seconds with no user action, which
 * is what makes another ask the honest response and makes the common case — OFF
 * hiccups, the retry lands — invisible.
 *
 * Everything else is asked once, and each for its own reason:
 *
 *  - `ProductNotFoundError` is a settled answer. Asking again cannot change it;
 *    it would only hold the missing-barcode capture form back by a backoff and
 *    spend OFF's rate limit on a question already answered.
 *  - A plain `Error` (a 400, a 403) is the class #204 deliberately kept OUT of
 *    "failed to answer", because we cannot name the fault and nothing suggests
 *    an identical second request answers differently.
 *  - A transport-level rejection is the offline scan, and #204 leaves it
 *    propagating untouched: nothing was asked, so there is no answer to re-ask
 *    for. Offline does not clear inside a backoff either, so retrying it would
 *    buy nothing but a slower banner.
 *
 * The second answer wins outright, whatever it is — a 404 on the retry opens the
 * missing door, because a settled answer settles it.
 */
export async function lookupBarcodeWithRetry(
  barcode: string,
  { sleep = realSleep, now = () => Date.now(), onAttempt }: RetryOptions = {}
): Promise<OffPayload> {
  const startedAt = now();
  // Held rather than returned, and reported from the `finally` below: the three
  // states are reached on three different paths — two of which throw — and a
  // variable is the only shape that reports on all of them exactly once without
  // the same call appearing three times.
  let attempt: ScanAttempt = "single";
  try {
    try {
      return await lookupBarcode(barcode);
    } catch (failure) {
      if (!(failure instanceof OffUnreachableError)) throw failure;
      if (now() - startedAt + RETRY_BACKOFF_MS > RETRY_DEADLINE_MS) {
        attempt = "gate_skipped";
        throw failure;
      }
      attempt = "retried";
      await sleep(RETRY_BACKOFF_MS);
      return await lookupBarcode(barcode);
    }
  } finally {
    onAttempt?.(attempt);
  }
}
