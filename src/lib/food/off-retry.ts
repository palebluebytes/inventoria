import {
  lookupBarcode,
  OffUnreachableError,
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
 * The clock {@link lookupBarcodeWithRetry} runs on, injected rather than reached
 * for (`CODING_STANDARDS.md` §6) so a test reads back the wait that was asked
 * for instead of serving it.
 */
export interface RetryClock {
  /** Waits `ms` before resolving. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds since an arbitrary epoch. Defaults to `Date.now`. */
  now?: () => number;
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
  { sleep = realSleep, now = () => Date.now() }: RetryClock = {}
): Promise<OffPayload> {
  const startedAt = now();
  try {
    return await lookupBarcode(barcode);
  } catch (failure) {
    if (!(failure instanceof OffUnreachableError)) throw failure;
    if (now() - startedAt + RETRY_BACKOFF_MS > RETRY_DEADLINE_MS) throw failure;
    await sleep(RETRY_BACKOFF_MS);
    return await lookupBarcode(barcode);
  }
}
