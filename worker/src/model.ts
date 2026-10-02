/**
 * The model route: the one path by which anything readable leaves the device
 * (ADR-0115 §2).
 *
 * Every other outward path on this script carries something the far end cannot
 * read — a meal sealed against the relay, a deposit sealed against the store.
 * This one carries a photograph of somebody's kitchen, and the record counts it
 * as the app's **single** readable egress rather than treating it as a pattern
 * to extend. Read ADR-0115 §1 before adding a second.
 *
 * **What crosses, and nothing else**: the photographs in the capture array at
 * the moment of the tap, and the name of the task. Not the barcode, not a
 * locale, not a device id, and — the part that reverses the obvious design —
 * **not the prompt** (§3.1, §5.1). The prompt, the response schema and the
 * model id are constants on this side, because #482 measured that *absent is
 * never zero* is prompt-carried rather than model-carried: strip one sentence
 * and the same model fabricates twelve micronutrients as `0`. A safety property
 * that lives in a sentence cannot live on the wire, where the operator key is
 * the only thing between it and an arbitrary string.
 *
 * **The gate's reason is denial, not cost** (§4.1). This account is on Workers
 * Free, where the daily neuron allocation is a hard stop with no overage, so a
 * leaked key costs $0 by construction. What it can do is burn the allocation —
 * and the relay and the store are routes on *this same script*, so an ungated
 * model route is a denial vector against meal send and device convergence, not
 * merely against the label autofill. It buys **no disclosure**: this route is
 * amnesiac, reads nothing out of the jar, and runs with gateway logging off.
 * That named absence is what makes one shared secret proportionate.
 *
 * **What this file holds up, and what it cannot.** The gate, the closed request
 * shape and the two ceilings are here and are testable. The gateway's own
 * settings live on the account and are carried as commands with verifications
 * in `docs/how-to-operate-the-model-route.md`; the plan the $0 ceiling rests on
 * is invisible to every gate in this repo (§4.4).
 */
import {
  readCapped,
  BodyTooLargeError,
  securityHeaders,
} from "../../src/lib/ingestion/proxy-policy";
import {
  faultStatusOf,
  MODEL_FAULT,
  MODEL_REQUEST_FAULT,
  readLabel,
  readLabelAnswer,
} from "./model-label";

/**
 * Just enough of the Workers AI binding for what this route does with it.
 *
 * Named here rather than imported from `@cloudflare/workers-types`, for
 * `StoreBucket`'s reason exactly: `tsconfig.tests.json` checks this same file
 * against Node and the DOM, and the two global sets redeclare each other's
 * `Request` and `Response`. Naming the one member the route touches keeps one
 * file honest under both projects, and it is also the seam the unit tests come
 * in through — a fake `Ai` whose `run` throws if called is how the `401` path
 * is proved to spend no neurons.
 */
export interface ModelBinding {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: ModelCallOptions
  ): Promise<unknown>;
}

/**
 * The per-call options object, which is the only place the gateway is named.
 *
 * **`collectLog` is deliberately not declared**, so naming it is a typecheck
 * failure rather than a judgement call at each call site. See
 * {@link MODEL_CALL_OPTIONS}: the per-call key is camelCase and singular, the
 * resource's field is `collect_logs`, and the binding ignores the wrong one in
 * silence. A key this type does not have cannot be spelled either way.
 */
export interface ModelCallOptions {
  gateway: { id: string };
}

/**
 * The gateway every call names, created and verified by #490 at
 * `collect_logs: false`, `cache_ttl: 0`, rate-limited 20 requests / 60 s
 * sliding.
 *
 * Not `default`: the name itself says it was chosen. AI Gateway creates a
 * `default` gateway with log collection **on** at the first authenticated
 * request, and Cloudflare's docs never say whether a bare `env.AI.run()` lands
 * in it — so the route names one rather than betting on the answer, which is
 * ADR-0072 §9's move applied to a new ambiguity.
 */
export const MODEL_GATEWAY_ID = "inventoria-model-route";

/**
 * **This constant is the only protection in this repo that can be lost by a
 * refactor, and losing it is silent.**
 *
 * #490 established by control experiment that the gateway's rate limit and its
 * logging-off setting bind **only calls that name the gateway**: the identical
 * request with the gateway omitted answered `200` while the gateway was fully
 * rate-limited. So dropping this from a call escapes both protections at once
 * and nothing on the account notices. It is not belt-and-braces; it is the
 * whole belt. Its unit test is the only place either can be pinned here, since
 * the `[ai]` binding accepts no `gateway` field and `worker-config-check.mjs`
 * has nothing to read.
 *
 * **`collectLog` is deliberately absent rather than `false`**, and
 * {@link ModelCallOptions} does not declare it, so it cannot come back. The
 * gateway's own `collect_logs: false` carries it, and the per-call key is
 * camelCase and singular — `collect_logs` here is the *resource's* field name,
 * is silently ignored on the binding, and would have pinned a no-op whose test
 * passed green. Spelling it correctly would be redundant; spelling it wrongly is
 * the trap #490 caught. Naming only the id makes both impossible.
 */
export const MODEL_CALL_OPTIONS: ModelCallOptions = {
  gateway: { id: MODEL_GATEWAY_ID },
};

/**
 * The questions this route will answer. A closed enum this side owns, with one
 * member today (ADR-0115 §2, §12).
 *
 * `task` is the generality that pays: the Worker needs the switch the moment it
 * owns two prompts, and it costs one string field. A polymorphic payload is the
 * generality that does not pay and was refused.
 */
export const MODEL_TASKS = ["label"] as const;

export type ModelTask = (typeof MODEL_TASKS)[number];

/**
 * §3.1's closed list, as the only two keys a request body may carry.
 *
 * The pinned test over this is what stops a later field arriving quietly: the
 * disclosure the user reads says *nothing else leaves this phone*, and that
 * sentence is true because this array has two members and a test asserts the
 * body has exactly them.
 */
export const MODEL_REQUEST_KEYS = ["task", "images"] as const;

/**
 * The **cost** ceiling (§5.1). #482 measured 76 neurons for one image and 133
 * for two, so on Workers Free's hard daily stop the image count is what bounds
 * reads per day.
 *
 * Nothing bounded this before: `labelPhotos` sits behind a `multiple` file
 * input with no cap anywhere. Restated on the client and held equal by a test,
 * `DEPOSIT_CEILING_BYTES`'s pattern for the third time.
 */
export const MAX_IMAGES = 4;

/**
 * The **transport** ceiling (§5.1), a different control from the one above.
 *
 * A 1600 px q80 JPEG runs about 300 KB (ADR-0096 §15 sizes a sealed label-photo
 * deposit at 310,958 B), so roughly 410 KB of base64; four of them is about
 * 1.6 MB and this is deliberate headroom. Primary docs give no help here —
 * Workers AI's Limits page is rate limits only, the content array carries no
 * `maxItems`, `3006 Request too large` states no threshold, and AI Gateway's
 * documented 25 MB is a *cacheability* ceiling rather than an accept one. The
 * only real bound is the generic 100 MB Worker body cap, which is not a bound
 * worth discovering.
 */
export const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

/** The one verb this route has. */
const VERBS = "POST";

/**
 * The request body, built in one place so the closed list has one definition.
 *
 * The client restates this rather than importing it, and an equality test holds
 * the two in step — the pattern `relay-wire.ts` and `deposit-store.ts` have each
 * already won, refused a third time here for the same reason: a type that
 * crossed this boundary would drag app code to the edge to save a declaration.
 */
export function modelRequestBody(
  task: ModelTask,
  images: string[]
): { task: ModelTask; images: string[] } {
  return { task, images };
}

/** What reading a request body produced: a question to ask, or a refusal. */
export type ModelRequestParse =
  | { ok: true; task: ModelTask; images: string[] }
  | { ok: false; status: number; message: string };

const isTask = (value: unknown): value is ModelTask =>
  typeof value === "string" &&
  (MODEL_TASKS as readonly string[]).includes(value);

/**
 * Read a decoded body into a question, refusing anything that is not exactly
 * §3.1's two keys.
 *
 * Pure, so the closed list is provable without a network, a binding or a
 * runtime. **Unknown keys are refused rather than ignored**, which is the whole
 * point: a route that dropped an extra field would let one be added upstream
 * with nothing failing, and the user's disclosure would quietly stop being true.
 *
 * A malformed request is `400` and is **ours to fix, never the user's to read**.
 * It is unreachable from our own client, and the client's classifier falls
 * through to *refused* on it, which is where an operator-fixable fault belongs
 * (§5.4). Too many images is `413` instead, because that one is a ceiling and
 * the client restates it.
 */
export function parseModelRequest(body: unknown): ModelRequestParse {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      ok: false,
      status: MODEL_REQUEST_FAULT.malformed,
      message: "Malformed request",
    };
  }

  const keys = Object.keys(body);
  const expected: readonly string[] = MODEL_REQUEST_KEYS;
  const exact =
    keys.length === expected.length && expected.every((k) => keys.includes(k));
  if (!exact) {
    return {
      ok: false,
      status: MODEL_REQUEST_FAULT.malformed,
      message: `A question carries ${expected.join(" and ")}, and nothing else`,
    };
  }

  const { task, images } = body as { task: unknown; images: unknown };

  if (!isTask(task)) {
    return {
      ok: false,
      status: MODEL_REQUEST_FAULT.malformed,
      message: "Unknown task",
    };
  }
  if (!Array.isArray(images) || !images.every((i) => typeof i === "string")) {
    return {
      ok: false,
      status: MODEL_REQUEST_FAULT.malformed,
      message: "Images must be base64 strings",
    };
  }
  // **A data URL is not base64, and the difference was invisible for a release.**
  // The capture array holds `data:image/png;base64,...` because that is what
  // `FileReader` answers and what an `<img src>` needs, and the far side
  // re-attaches a preamble of its own — so an unprepared image arrived as
  // `data:image/jpeg;base64,data:image/png;base64,...` and every read failed.
  // Nothing caught it: every fixture on both sides was bare base64. The client
  // strips the prefix in `reencodeForEgress`; this is the gate that says so.
  if (images.some((i) => i.startsWith("data:"))) {
    return {
      ok: false,
      status: MODEL_REQUEST_FAULT.malformed,
      message: "Images carry base64, not a data URL",
    };
  }
  if (images.length === 0) {
    return {
      ok: false,
      status: MODEL_REQUEST_FAULT.malformed,
      message: "A question carries a photograph",
    };
  }
  if (images.length > MAX_IMAGES) {
    return {
      ok: false,
      status: MODEL_REQUEST_FAULT.overCeiling,
      message: `At most ${MAX_IMAGES} photographs`,
    };
  }

  return { ok: true, task, images };
}

/**
 * **Every** response this route gives, refusals included, so that no branch can
 * quietly ship without the headers below — `store.ts`'s `respond`, and its
 * reasoning transfers without a word changed.
 *
 * **No CORS headers at all.** A cross-origin caller is not a case this route
 * has. The shared `corsHeaders` record is deliberately untouched rather than
 * widened to admit a `POST` and an auth header: it is one record shared by
 * three routes, and only this one wants the change, so widening it would widen
 * the **scraper proxy** at the same time (§4.2).
 *
 * `Cache-Control: no-store` on all of them, because the body on the way in is a
 * photograph and the body on the way out is a reading of it, and an
 * intermediary holding either is exactly the record this route exists not to
 * leave.
 */
function respond(
  body: BodyInit | null,
  status: number,
  extra: Record<string, string> = {}
): Response {
  return new Response(body, {
    status,
    headers: {
      ...securityHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain",
      ...extra,
    },
  });
}

/**
 * What a refusal says on the wire.
 *
 * A text line, as the store's refusals are, and **not a JSON error envelope**:
 * nothing else in this repo has one, and `deposit-store.ts` already reads
 * outcomes off statuses. The client branches on the status and draws its own
 * words, so these are for whoever is reading a network tab — which is why none
 * of them repeats anything the vendor said.
 */
function faultLine(status: number): string {
  if (status === MODEL_FAULT.exhausted) return "Today's allowance is used up";
  if (status === MODEL_FAULT.refused) return "The model refused this account";
  if (status === MODEL_FAULT.unusable) return "The answer was not a panel";
  return "The model could not be reached";
}

/**
 * workerd's `crypto.subtle.timingSafeEqual`, reached through a named shape
 * rather than the global for `ModelBinding`'s reason: `tsconfig.tests.json`
 * types this file against the DOM's `SubtleCrypto`, which has no such member,
 * while `tsconfig.worker.json` types it against workerd's, which does.
 *
 * It is a documented, non-standard Cloudflare extension (*"compare two buffers
 * in a way that is resistant to timing attacks"*, read 2026-09-28), taking
 * `ArrayBuffer | TypedArray`. What the docs do **not** say is what it does when
 * the two differ in length — which is exactly why §1 below never hands it two
 * raw keys.
 */
interface TimingSafeSubtle {
  timingSafeEqual?(a: ArrayBufferView, b: ArrayBufferView): boolean;
}

/**
 * Is this the operator's key?
 *
 * **Both sides are hashed first, and the digests are what get compared.** A
 * naive `===` leaks the key's length and its common prefix through timing, and
 * handing raw keys to `timingSafeEqual` would lean on unequal-length behaviour
 * its own documentation does not state. Two SHA-256 digests are 32 bytes each
 * by construction, so the comparison is length-independent whichever primitive
 * runs it, and the digest-to-bytes lines are ones this repo has already written
 * twice (`index.ts:objectName`, `src/lib/p2p/meal-accept.ts`).
 *
 * `timingSafeEqual` is used where the runtime has it and a fixed-width XOR
 * accumulation stands in where it does not, which is how the unit suite reaches
 * this at all. Both run over the same 32 bytes and neither returns early.
 *
 * **This is the one function per-user keys would change**, and the whole of what
 * "not foreclosed" costs (§4.5): *is this key valid* becomes *which key is this*
 * with no caller touched. Anything more would be building for a second user who
 * does not exist.
 */
async function isOperatorKey(
  offered: string,
  configured: string
): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
    );
  const [a, b] = await Promise.all([digest(offered), digest(configured)]);

  const extension = (crypto.subtle as TimingSafeSubtle).timingSafeEqual;
  if (extension) return extension.call(crypto.subtle, a, b);

  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** The key the caller offered, or `null` when the header is absent or malformed. */
function offeredKey(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (header === null) return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match ? match[1] : null;
}

/**
 * Read the body, refusing anything past the transport ceiling.
 *
 * A declared `Content-Length` is a claim rather than a measurement — a chunked
 * body carries none, and a junk one reads as `NaN`, which compares false and
 * falls through — so it only ever buys an early refusal, and the count that
 * decides always happens while reading. `store.ts:readDeposit`'s shape, and its
 * measurement against workerd carries over.
 */
async function readQuestion(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) return null;
  try {
    return await readCapped(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return null;
    throw error;
  }
}

/**
 * Answer one question against the model.
 *
 * The order below is the load-bearing part: **the key is checked before the
 * body is read and long before the binding is touched**, so a caller without
 * one costs zero neurons and gets no signal about the ceilings either. The unit
 * test proves it with a fake `Ai` whose `run` throws if called.
 *
 * `401` rather than `403` for a bad key, because the caller may fix it by
 * setting the right one; the client collapses both onto *refused* on screen,
 * since either way it is the operator's to act on and the user cannot (§9).
 *
 * The secret arrives already read off the environment by the caller, the way
 * the store's address does: the route above owns `env`, and this module owns
 * the question.
 */
export async function modelRequest(
  request: Request,
  ai: ModelBinding,
  configuredKey: string | undefined
): Promise<Response> {
  if (request.method !== "POST") {
    return respond(`The model route has ${VERBS} and nothing else`, 405, {
      Allow: VERBS,
    });
  }

  // An unset secret refuses everything rather than opening the route. It is the
  // operator's to fix and is indistinguishable here from a wrong key, which is
  // the right way round: a route whose gate is missing must not be reachable
  // while it says so.
  const offered = offeredKey(request);
  if (
    configuredKey === undefined ||
    configuredKey === "" ||
    offered === null ||
    !(await isOperatorKey(offered, configuredKey))
  ) {
    return respond("Not this key", MODEL_REQUEST_FAULT.badKey);
  }

  const body = await readQuestion(request);
  if (body === null) {
    return respond(
      `A question is at most ${MAX_REQUEST_BYTES / 1024 / 1024} MiB`,
      MODEL_REQUEST_FAULT.overCeiling
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return respond("Malformed request", 400);
  }

  const parsed = parseModelRequest(decoded);
  if (!parsed.ok) return respond(parsed.message, parsed.status);

  // One `await` and one classification, so a fault is decided in exactly one
  // place (§5.4). The task owns the prompt, the schema and the model id; this
  // module owns the gate, the closed list and the statuses.
  let answer: unknown;
  try {
    answer = await readLabel(ai, parsed.images);
  } catch (failure) {
    const status = faultStatusOf(failure);
    return respond(faultLine(status), status);
  }

  const reading = readLabelAnswer(answer);
  if (reading === null) {
    return respond(faultLine(MODEL_FAULT.unusable), MODEL_FAULT.unusable);
  }

  return respond(JSON.stringify(reading), 200, {
    "Content-Type": "application/json",
  });
}
