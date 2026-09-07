/**
 * The Store: the route through which a client puts, gets and deletes one
 * sealed object at an address it supplies (ADR-0096 §1).
 *
 * It is the whole provider surface. ADR-0096 §16 makes that a rule rather than
 * a tidiness — _the client never names the provider_ — so the app speaks this
 * protocol, R2 is named nowhere above `wrangler.toml` and this module, and a
 * pivot is a repoint of the route rather than a migration.
 *
 * **What this file holds up, and what it cannot.** §1's bar has five clauses
 * and five different mechanisms, and this route is exactly one of them: _none
 * larger than 16 MiB_. The 30 days are the bucket's lifecycle rule, the one
 * object per lane is supersede-in-place plus object versioning being off, the
 * unenumerable address is a chain the server has never seen, and the delete on
 * collection is the collector's. `docs/how-to-operate-the-store.md` carries the
 * three that live on the account, and `scripts/worker-config-check.mjs` carries
 * the two that live in `wrangler.toml`.
 *
 * **The route reads nothing and learns nothing.** The body is AEAD ciphertext
 * under a key that reaches this Worker by no path (§4), and the address is a
 * ratchet output the server has never seen. So every refusal below is a
 * **shape** refusal, in the relay's sense: a length, a character set, a verb.
 * There is no authentication and there is nothing to authenticate against —
 * §16 makes that argument in full, and the answer is that the surface is _an
 * anonymous blob of at most 16 MiB, gone in 30 days, at a key you must already
 * hold, with no listing and no directory of any kind._
 */
import {
  readCapped,
  BodyTooLargeError,
  securityHeaders,
} from "../../src/lib/ingestion/proxy-policy";

/**
 * Just enough of an object store to hold one deposit per address.
 *
 * **There is no `list`, and its absence is the enforcement rather than a
 * tidy-up**, the way `RelayRoomState` has no `get` and no `put`. One `list()`
 * returns the whole series of addresses, exact byte lengths and write times at
 * any later moment (§15), which is the loudest surface in the design and the
 * reason §16 refuses bulk export even as a way to leave. Enumerating again has
 * to be a deliberate edit to this interface.
 *
 * It is named here rather than imported from `@cloudflare/workers-types` for
 * `relay.ts`'s reason: `tsconfig.tests.json` checks this same file against Node
 * and the DOM, and the two global sets redeclare each other's `Request` and
 * `Response`. Naming the three members the route actually touches keeps one
 * file honest under both projects, and it is also the seam the unit tests come
 * in through.
 */
export interface StoreBucket {
  get(key: string): Promise<StoreObjectBody | null>;
  /**
   * `onlyIf` is the one genuinely load-bearing property a provider must have
   * (§16.1). A refused write returns `null` rather than throwing, which is R2's
   * own contract and is what lets §5's orphan design be a status code.
   */
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { onlyIf?: { etagMatches: string } }
  ): Promise<StoreObject | null>;
  delete(key: string): Promise<void>;
}

/** What a write hands back: the etag the next conditional rewrite matches on. */
export interface StoreObject {
  readonly etag: string;
}

/** A read, which is the etag and the sealed bytes. */
export interface StoreObjectBody extends StoreObject {
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * §1's ceiling, and it bounds **a deposit** rather than a lane or an account.
 *
 * It declines nothing: a depositor whose outstanding delta is larger deposits
 * its oldest 16 MiB, the collector acknowledges that index, and the next wake
 * carries the next 16 MiB. **A backlog empties one ceiling per round trip
 * instead of jamming**, which is why ADR-0075 §13 — _a rule that refuses your
 * own data is a rule against convergence_ — survives verbatim.
 *
 * Twice a whole year's sealed ledger (8.89 MB/yr), and far under the Workers
 * 100 MB request-body cap, so this route is never the binding constraint.
 */
export const DEPOSIT_CEILING_BYTES = 16 * 1024 * 1024;

/**
 * The shape an address may take, and it is a shape rule only.
 *
 * The server cannot tell a derived address from an invented one (§16) and must
 * not try: the conforming construction is an HKDF output the operator has never
 * seen, and a route that checked for one would be checking something it cannot
 * know. What it can insist on is that the namespace stays **flat** — §16's _no
 * listing and no directory of any kind_ — and bounded well inside R2's
 * documented 1,024-byte key limit.
 */
const ADDRESS_SHAPE = /^[A-Za-z0-9_-]{1,256}$/;

/** The three verbs the store has. §16's list, and it is closed. */
const VERBS = "GET, PUT, DELETE";

/**
 * **Every** response this route gives, refusals included, so that no branch can
 * quietly ship without the headers below.
 *
 * `Cache-Control: no-store` on all of them, deliberately: a deposit is sealed
 * but it is still one lane's outstanding delta, and an intermediary holding a
 * copy would outlive both the collector's delete and the bucket's expiry — two
 * of §1's five mechanisms, defeated by a cache neither of them can reach.
 *
 * `securityHeaders` is the proxy's own set, shared rather than retyped: the
 * store has no more business being framed or leaking a referrer than a scraped
 * page does. There are no CORS headers, for the matching reason the relay has
 * none: app, link and socket are one origin (ADR-0072 §9), so a cross-origin
 * caller is not a case this route has.
 */
function respond(
  body: BodyInit | null,
  status: number,
  extra: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: { ...securityHeaders, "Cache-Control": "no-store", ...extra },
  });
}

/** An etag as HTTP formats one. R2 hands back the bare value. */
const httpEtag = (etag: string) => ({ ETag: `"${etag}"` });

/**
 * What the depositor asked to match on, unquoted.
 *
 * `If-Match` is an HTTP entity tag and arrives quoted from anything that
 * formats one properly; `etagMatches` wants the bare value. Both are accepted
 * because the client half is not built yet and a route that only took one of
 * them would be a shape rule nobody wrote down. An absent header is an
 * unconditional write, which is the first deposit at a fresh chain index.
 */
function etagPrecondition(request: Request): string | undefined {
  const header = request.headers.get("If-Match");
  if (header === null) return undefined;
  return header.replace(/^(?:W\/)?"(.*)"$/, "$1");
}

/**
 * Read the sealed bytes, refusing anything past the ceiling.
 *
 * A declared `Content-Length` is a claim rather than a measurement — a chunked
 * body carries none at all, and a junk one reads as `NaN`, which compares false
 * and falls through — so it only ever buys an early refusal, and the count that
 * decides always happens while reading. Measured against workerd on 2026-09-07:
 * both arms answer 413 cleanly, the declared one without draining the upload.
 *
 * Buffering is deliberate over streaming straight into the bucket: a stream cut
 * off mid-put is a partial object to reason about, and 16 MiB is a quarter of
 * what a Worker may hold.
 */
async function readDeposit(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > DEPOSIT_CEILING_BYTES) return null;
  try {
    return await readCapped(request, DEPOSIT_CEILING_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return null;
    throw error;
  }
}

/**
 * Answer one request against the store.
 *
 * The address arrives already read off the query by the caller, the way the
 * relay's room does: the route above owns the URL and this module owns the
 * store.
 */
export async function storeRequest(
  request: Request,
  bucket: StoreBucket,
  key: string | null
): Promise<Response> {
  if (key === null) return respond("Missing deposit address", 400);
  if (!ADDRESS_SHAPE.test(key)) {
    return respond("Malformed deposit address", 400);
  }

  if (request.method === "GET") {
    const held = await bucket.get(key);
    if (!held) return respond("Nothing is deposited there", 404);
    return respond(await held.arrayBuffer(), 200, httpEtag(held.etag));
  }

  if (request.method === "PUT") {
    const sealed = await readDeposit(request);
    if (sealed === null) {
      return respond(
        `A deposit is at most ${DEPOSIT_CEILING_BYTES / 1024 / 1024} MiB`,
        413
      );
    }
    const etagMatches = etagPrecondition(request);
    const written = await bucket.put(
      key,
      sealed,
      etagMatches === undefined ? undefined : { onlyIf: { etagMatches } }
    );
    // §5: the write is refused and **the object is simply not recreated**.
    // That is the whole of the orphan design, and it is why a refusal here may
    // never advance the depositor's index — only a sealed acknowledgement does.
    if (written === null) {
      return respond("The deposit was superseded or collected", 412);
    }
    return respond(null, 204, httpEtag(written.etag));
  }

  if (request.method === "DELETE") {
    await bucket.delete(key);
    // Unconditional and unreported. A collector deletes after the final chunk
    // verifies, and whether anything was there is the collector's own business:
    // it just read it. Saying so here would only answer the one question an
    // address alone cannot otherwise answer.
    return respond(null, 204);
  }

  return respond(`The store has ${VERBS} and nothing else`, 405, {
    Allow: VERBS,
  });
}
