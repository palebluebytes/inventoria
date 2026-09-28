import { describe, it, expect } from "vitest";
import {
  modelRequest,
  modelRequestBody,
  parseModelRequest,
  MODEL_CALL_OPTIONS,
  MODEL_GATEWAY_ID,
  MODEL_REQUEST_KEYS,
  MODEL_TASKS,
  MAX_IMAGES,
  MAX_REQUEST_BYTES,
} from "../../worker/src/model";
import { findForbiddenCalls } from "../../scripts/worker-closure-check.mjs";
import { refusingModel } from "./support/model-binding";

/**
 * The gate's decisions, and the closed list it is built to keep closed
 * (ADR-0115 §3.1, §4.2, §5.1).
 *
 * Every call here is handed a binding that **throws if it is used**, except the
 * one case that means to reach past the gate — because the claim these tests
 * exist to hold is that a caller without the operator's key costs zero neurons,
 * and that is a claim about what was *not* called.
 */

const KEY = "a-long-operator-secret-drawn-from-a-csprng";
const URL_ = "https://inventoria.example/api/model";

const question = (
  body: unknown,
  init: { key?: string | null; method?: string; contentLength?: number } = {}
) => {
  const headers: Record<string, string> = {};
  const offered = init.key === undefined ? KEY : init.key;
  if (offered !== null) headers.Authorization = `Bearer ${offered}`;
  if (init.contentLength !== undefined) {
    headers["Content-Length"] = String(init.contentLength);
  }
  return new Request(URL_, {
    method: init.method ?? "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

/** The route, holding the operator's secret. */
const ask = (request: Request) => modelRequest(request, refusingModel(), KEY);

/**
 * The route, holding whatever secret is named — including none. Separate from
 * `ask` on purpose: a default parameter would swallow an explicit `undefined`,
 * which is the exact state this distinguishes.
 */
const askConfigured = (request: Request, configured: string | undefined) =>
  modelRequest(request, refusingModel(), configured);

const labelQuestion = (images = ["AAAA"]) => ({ task: "label", images });

describe("the gate answers before the binding is touched", () => {
  it("refuses a request with no Authorization header, spending nothing", async () => {
    const refused = await ask(question(labelQuestion(), { key: null }));
    expect(refused.status).toBe(401);
  });

  it("refuses a wrong key", async () => {
    const refused = await ask(question(labelQuestion(), { key: "not-it" }));
    expect(refused.status).toBe(401);
  });

  it("refuses a key that is a prefix of the right one", async () => {
    const refused = await ask(
      question(labelQuestion(), { key: KEY.slice(0, 8) })
    );
    expect(refused.status).toBe(401);
  });

  it("refuses a key that extends the right one", async () => {
    const refused = await ask(question(labelQuestion(), { key: `${KEY}x` }));
    expect(refused.status).toBe(401);
  });

  // An unset secret is a real deployment state, and a route whose gate is
  // missing must not be reachable while it says so.
  it("refuses everything when the Worker holds no secret", async () => {
    expect(
      (await askConfigured(question(labelQuestion()), undefined)).status
    ).toBe(401);
    expect((await askConfigured(question(labelQuestion()), "")).status).toBe(
      401
    );
  });

  it("has one verb", async () => {
    const wrong = await ask(question(undefined, { method: "GET" }));
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get("Allow")).toBe("POST");
  });
});

describe("the body carries exactly two keys, and the test is what keeps it true", () => {
  it("builds a body with the closed list and nothing else", () => {
    const built = modelRequestBody("label", ["AAAA", "BBBB"]);
    expect(Object.keys(built).sort()).toEqual([...MODEL_REQUEST_KEYS].sort());
    expect(built).toEqual({ task: "label", images: ["AAAA", "BBBB"] });
  });

  it("names two keys and one task", () => {
    expect(MODEL_REQUEST_KEYS).toEqual(["task", "images"]);
    expect(MODEL_TASKS).toEqual(["label"]);
  });

  it("refuses a body carrying a key nobody agreed to", () => {
    const extra = parseModelRequest({
      task: "label",
      images: ["AAAA"],
      locale: "es-ES",
    });
    expect(extra.ok).toBe(false);
  });

  it("refuses a body missing one of the two", () => {
    expect(parseModelRequest({ images: ["AAAA"] }).ok).toBe(false);
    expect(parseModelRequest({ task: "label" }).ok).toBe(false);
  });

  it("refuses a task it does not have", () => {
    expect(parseModelRequest({ task: "plate", images: ["AAAA"] }).ok).toBe(
      false
    );
  });

  it("refuses images that are not strings, and a question with none", () => {
    expect(parseModelRequest({ task: "label", images: [7] }).ok).toBe(false);
    expect(parseModelRequest({ task: "label", images: [] }).ok).toBe(false);
  });

  it("takes a body that is exactly the closed list", () => {
    const parsed = parseModelRequest({ task: "label", images: ["AAAA"] });
    expect(parsed).toEqual({ ok: true, task: "label", images: ["AAAA"] });
  });

  it("refuses a body that is not an object at all", () => {
    expect(parseModelRequest(null).ok).toBe(false);
    expect(parseModelRequest(["AAAA"]).ok).toBe(false);
    expect(parseModelRequest("label").ok).toBe(false);
  });
});

describe("the two ceilings control different things", () => {
  it("refuses more photographs than the cost ceiling allows", async () => {
    const tooMany = await ask(
      question(labelQuestion(Array(MAX_IMAGES + 1).fill("AAAA")))
    );
    expect(tooMany.status).toBe(413);
  });

  it("takes exactly the cost ceiling", () => {
    const parsed = parseModelRequest({
      task: "label",
      images: Array(MAX_IMAGES).fill("AAAA"),
    });
    expect(parsed.ok).toBe(true);
  });

  // A declared Content-Length is a claim, so it only ever buys an early
  // refusal; the count that decides always happens while reading.
  it("refuses a body that declares itself past the transport ceiling", async () => {
    const huge = await ask(
      question(labelQuestion(), { contentLength: MAX_REQUEST_BYTES + 1 })
    );
    expect(huge.status).toBe(413);
  });

  it("refuses a body that turns out to be past it while reading", async () => {
    const oversized = await ask(
      question(labelQuestion(["A".repeat(MAX_REQUEST_BYTES + 16)]))
    );
    expect(oversized.status).toBe(413);
  });

  it("keeps the two ceilings apart", () => {
    expect(MAX_IMAGES).toBe(4);
    expect(MAX_REQUEST_BYTES).toBe(6 * 1024 * 1024);
  });
});

describe("a well-formed question reaches past the gate", () => {
  // The task itself is #542's. What this asserts today is that the gate and the
  // closed list are the only things between a correct caller and the model.
  it("answers neither 401 nor 400 nor 413 for the right key and shape", async () => {
    const through = await ask(question(labelQuestion()));
    expect([401, 400, 413]).not.toContain(through.status);
  });

  it("refuses a body that is not JSON at all", async () => {
    const broken = new Request(URL_, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}` },
      body: "not json",
    });
    expect((await ask(broken)).status).toBe(400);
  });
});

describe("every response carries the route's headers and no CORS", () => {
  it("answers no-store and admits no cross-origin caller", async () => {
    for (const response of [
      await ask(question(labelQuestion(), { key: null })),
      await ask(question(undefined, { method: "GET" })),
      await ask(question(labelQuestion())),
    ]) {
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
  });
});

/**
 * The docs describe `crypto.subtle.timingSafeEqual` as *"compare two buffers in
 * a way that is resistant to timing attacks"* and say **nothing** about what it
 * does when the two differ in length. That silence is why the route never hands
 * it two raw keys — so the property worth asserting is not that it returns the
 * right answer but that it is reached at all, and reached with two buffers that
 * are the same size by construction.
 *
 * Node has no such member, so the route's fixed-width fallback is what every
 * other test here runs through. This is the one that covers the workerd path.
 */
describe("the key comparison uses the runtime's primitive where there is one", () => {
  it("hands it two equal-length digests, and believes its answer", async () => {
    const subtle = crypto.subtle as unknown as {
      timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
    };
    const widths: number[] = [];
    subtle.timingSafeEqual = (a, b) => {
      widths.push(a.byteLength, b.byteLength);
      return false;
    };

    try {
      // The right key, and a primitive that says no: the route must believe the
      // primitive rather than reach its own conclusion beside it.
      const refused = await ask(question(labelQuestion()));
      expect(refused.status).toBe(401);
      expect(widths).toEqual([32, 32]);
    } finally {
      delete subtle.timingSafeEqual;
    }
  });
});

/**
 * #490 measured that the gateway's rate limit and its logging-off setting bind
 * **only calls that name the gateway** — the identical request without it
 * answered `200` while the gateway was fully rate-limited. So this constant is
 * the only thing standing between a refactor and a bare, unlimited, loggable
 * call, and the `[ai]` binding has no `gateway` field for a config gate to read.
 */
describe("the call options are where the gateway is pinned", () => {
  it("names the gateway that was created with logging off", () => {
    expect(MODEL_CALL_OPTIONS.gateway.id).toBe("inventoria-model-route");
    expect(MODEL_GATEWAY_ID).toBe("inventoria-model-route");
  });

  // `collect_logs` is the gateway *resource's* field name. On the binding it is
  // silently ignored, so a constant carrying it would pin a no-op whose test
  // passed green — which is exactly why the id stands alone here.
  it("carries the gateway and nothing that would be ignored", () => {
    expect(Object.keys(MODEL_CALL_OPTIONS)).toEqual(["gateway"]);
    expect(Object.keys(MODEL_CALL_OPTIONS.gateway)).toEqual(["id"]);
    expect(JSON.stringify(MODEL_CALL_OPTIONS)).not.toContain("collect_logs");
  });
});

/**
 * ADR-0115 §13: the model route must be provably amnesiac, so the matcher that
 * proves it is worth a test of its own — one that never matched would pass
 * every build silently.
 */
describe("the amnesia matcher finds what it is for", () => {
  it("finds a binding write", () => {
    expect(findForbiddenCalls("await env.STORE.put(key, bytes);")).toEqual([
      ".put( (a binding write)",
    ]);
    expect(findForbiddenCalls("await bucket.delete(key);")).toEqual([
      ".delete( (a binding write)",
    ]);
  });

  it("finds a second egress", () => {
    expect(findForbiddenCalls("const r = await fetch(url);")).toEqual([
      "fetch( (a second egress)",
    ]);
  });

  it("does not read a method named fetch on something else as a bare one", () => {
    expect(findForbiddenCalls("return stub.fetch(request);")).toEqual([]);
  });

  it("finds nothing in a module that keeps nothing", () => {
    expect(findForbiddenCalls("return respond(body, 200);")).toEqual([]);
  });
});
