/**
 * The client half of the Store's route: three verbs at an address the client
 * supplies (ADR-0096 §1 and §16).
 *
 * **The client never names the provider**, which §16 makes a rule rather than a
 * tidiness. So this module speaks the route `worker/src/store.ts` answers and
 * knows nothing about what is behind it: R2 is named nowhere above
 * `wrangler.toml` and that file, and a pivot is a repoint of {@link STORE_PATH}
 * rather than a migration.
 *
 * **Two statuses are outcomes rather than failures**, and they are the two the
 * design turns on:
 *
 *   - **404 on a collection is normal.** The collector advances on collecting
 *     and the depositor on receiving the acknowledgement, so between those two
 *     moments the depositor rewrites at the old index while the collector finds
 *     nothing at the new one. §5's amendment states it plainly because an
 *     implementer will otherwise read it as a bug and repair it with the scan
 *     window §4 boasts of not needing.
 *   - **412 on a deposit is the orphan design.** The rewrite is conditional on
 *     the etag this device's own `PUT` returned; if the peer has collected, the
 *     etag is gone, the write is refused and **the object is not recreated**.
 *     It is a refusal, not an error, and it may never advance the index —
 *     absence is not an acknowledgement.
 *
 * Everything else is a failure this device cannot act on, and it arrives as a
 * {@link StoreUnreachableError}. A wake that cannot reach the store simply did
 * not converge; nothing is shown, because steady state shows nothing
 * (ADR-0075 §11).
 */

/** Where the Store listens, on the app's own origin (ADR-0072 §9). */
export const STORE_PATH = "/api/store";

/** How an address is named to it. The address is client-derived (§4). */
export const STORE_KEY_PARAM = "key";

/**
 * §1's ceiling, and it bounds **a deposit** rather than a lane or an account.
 *
 * **Restated here rather than imported from `worker/src/store.ts`**, for
 * `relay-wire.ts`'s reason exactly: `scripts/worker-closure-check.mjs` pins
 * what the Worker may compile in and the pin runs one way, so importing the
 * route's module here would open the reverse direction and put edge code in
 * the app's graph. `deposit-store.test.ts` asserts the two numbers are equal —
 * one number, not two, enforced by a gate rather than by a comment.
 */
export const DEPOSIT_CEILING_BYTES = 16 * 1024 * 1024;

/**
 * One deposit as it was found, which is its bytes and nothing else.
 *
 * **Not its etag**, though the route returns one: a collector deletes
 * unconditionally, because it has just read what was there and the address is
 * one only its peer writes to. Carrying an etag nothing reads would be a field
 * that has to be checked at the boundary to buy nothing.
 */
export interface HeldDeposit {
  readonly bytes: Uint8Array;
}

/**
 * The store could not be reached, or answered something this protocol has no
 * reading for.
 *
 * One error for both, because a wake does the same thing with either: it stops
 * touching that lane and tries again on the next open. Distinguishing them
 * would be distinguishing two ways of not having converged.
 */
export class StoreUnreachableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "StoreUnreachableError";
  }
}

/**
 * Just enough of the store for a wake, in the vocabulary of the act rather than
 * of the verb: a lane is **collected** and a lane is **deposited** into.
 *
 * **There is no `list`, here as at the route** (ADR-0096 §16). One listing
 * returns the whole series of addresses, exact lengths and write times, which
 * is the loudest surface in the design — so enumerating has to be a deliberate
 * edit to this interface rather than a call somebody can reach for.
 */
export interface Store {
  /** A `GET`. `null` when nothing is deposited there, which is normal. */
  collect(address: string): Promise<HeldDeposit | null>;
  /**
   * A `PUT`, conditional whenever `ifMatch` is given, which is every rewrite
   * at an index this device has already written at.
   *
   * Returns the etag the next rewrite matches on, or `null` when the write was
   * **refused** — the object had been collected, and it is not recreated.
   */
  deposit(
    address: string,
    sealed: Uint8Array,
    ifMatch: string | null
  ): Promise<string | null>;
  /** A `DELETE`, which the collector sends only after the final chunk verifies. */
  discard(address: string): Promise<void>;
}

/** What this module needs of `fetch`, so a test can hand it the real route. */
export type StoreFetch = (request: Request) => Promise<Response>;

/**
 * An etag as HTTP formats one, back as the bare value `If-Match` wants.
 *
 * **An absent one is a store this protocol cannot use**, not an empty string.
 * The etag a `PUT` returns is the only thing the next rewrite can be
 * conditional on, so a response without one leaves this device unable to
 * supersede its own object — and an empty string written into the record would
 * be a Paired Device row that fails its own guard on the next read, losing the
 * pairing to a missing header.
 */
function bareEtag(response: Response): string {
  const header = response.headers.get("ETag");
  if (header === null || header === "") {
    throw new StoreUnreachableError(
      "the store answered a deposit with no etag, so nothing can supersede it."
    );
  }
  return header.replace(/^(?:W\/)?"(.*)"$/, "$1");
}

/**
 * The store over one `fetch`, at one origin.
 *
 * The origin is a parameter with the app's own as its default, for the reason
 * every pure module in this folder takes its clock and its randomness: a test
 * drives the real route without a page around it. Nothing in the app passes
 * one.
 */
export function storeOverFetch(call: StoreFetch, origin?: string): Store {
  const routeTo = (address: string): string => {
    const url = new URL(STORE_PATH, origin ?? location.href);
    url.searchParams.set(STORE_KEY_PARAM, address);
    return url.toString();
  };

  const answer = async (request: Request): Promise<Response> => {
    try {
      return await call(request);
    } catch (unreachable) {
      throw new StoreUnreachableError(
        unreachable instanceof Error ? unreachable.message : String(unreachable)
      );
    }
  };

  const unread = (verb: string, response: Response): StoreUnreachableError =>
    new StoreUnreachableError(
      `the store answered ${response.status} to a ${verb}.`
    );

  return {
    async collect(address) {
      const response = await answer(new Request(routeTo(address)));
      // The collector finding nothing is the normal outcome, not an error.
      if (response.status === 404) return null;
      if (!response.ok) throw unread("collection", response);
      return { bytes: new Uint8Array(await response.arrayBuffer()) };
    },

    async deposit(address, sealed, ifMatch) {
      const response = await answer(
        new Request(routeTo(address), {
          method: "PUT",
          // A fresh copy, because `fetch` will not take a view onto a
          // `SharedArrayBuffer` and this app runs cross-origin isolated.
          body: sealed.slice(),
          headers:
            ifMatch === null ? undefined : { "If-Match": `"${ifMatch}"` },
        })
      );
      // §5: the etag is gone because the peer collected, so the write is
      // refused and the object is **not** recreated. The caller may not read
      // this as an acknowledgement.
      if (response.status === 412) return null;
      if (!response.ok) throw unread("deposit", response);
      return bareEtag(response);
    },

    async discard(address) {
      const response = await answer(
        new Request(routeTo(address), { method: "DELETE" })
      );
      if (!response.ok) throw unread("discard", response);
    },
  };
}

/** The store as the app reaches it: this origin, the platform's `fetch`. */
export const appStore: Store = storeOverFetch((request) => fetch(request));
