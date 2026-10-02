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
import {
  faultStatusOf,
  LABEL_BASES,
  LABEL_KEYS,
  LABEL_MODEL,
  LABEL_PROMPT,
  MODEL_FAULT,
  readLabelAnswer,
  answerBodyOf,
} from "../../worker/src/model-label";
import { recordingModel, refusingModel } from "./support/model-binding";

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

/**
 * The label task (ADR-0115 §5.3, §5.4), and the finding that shapes it: the
 * vendor's own error codes are not trustworthy, so the **message** is the
 * discriminant and the contract names the set rather than the mechanism.
 */
describe("a thrown failure becomes one of our statuses", () => {
  const status = (message: string) => faultStatusOf(new Error(message));

  // #509 measured `4006` carrying the exact message Cloudflare publishes under
  // `3036`, and neither code appears in its own documentation. A Worker
  // matching the documented code would call exhaustion "try again in a moment"
  // all day.
  it("reads an exhausted allocation off its message, whichever code rides with it", () => {
    expect(
      status("You have used up your daily free allocation of 10,000 neurons.")
    ).toBe(MODEL_FAULT.exhausted);
    expect(status("AiError: 4006: something")).toBe(MODEL_FAULT.exhausted);
    expect(status("AiError: 3036: something")).toBe(MODEL_FAULT.exhausted);
  });

  it("reads the operator's faults as refused", () => {
    expect(status("User has not agreed to Llama3.2 model terms")).toBe(
      MODEL_FAULT.refused
    );
    expect(status("5016")).toBe(MODEL_FAULT.refused);
    expect(status("Unauthorized")).toBe(MODEL_FAULT.refused);
  });

  // It clears in seconds, so "try again in a moment" is the true thing to say.
  // Calling it "not today" would be the worse of the two errors.
  it("reads a tripped rate limit as unreachable rather than as exhausted", () => {
    expect(status('{"message":"Rate limited","code":2003}')).toBe(
      MODEL_FAULT.unreachable
    );
  });

  // The contract's couldn't-tell member, by design: it misreads only a
  // genuinely exhausted day, and fails toward retry.
  it("falls through to unreachable for anything it cannot classify", () => {
    expect(status("Capacity temporarily unavailable")).toBe(
      MODEL_FAULT.unreachable
    );
    expect(faultStatusOf("a bare string")).toBe(MODEL_FAULT.unreachable);
    expect(faultStatusOf(undefined)).toBe(MODEL_FAULT.unreachable);
  });
});

describe("the prompt is the safety mechanism, so it is pinned", () => {
  // #482's ablation: with this sentence removed the same model fabricated all
  // twelve micronutrients as `0` on the same image, 2/2 runs against 0/9.
  it("carries the guard sentence, and the zero clause beside it", () => {
    expect(LABEL_PROMPT).toContain("OMIT THE KEY ENTIRELY");
    expect(LABEL_PROMPT).toMatch(/Never write 0 for a row that is not printed/);
    expect(LABEL_PROMPT).toMatch(/If the label prints a row as 0, write 0/);
  });

  it("names a closed basis enum, or the answer comes back with a space in it", () => {
    for (const basis of LABEL_BASES)
      expect(LABEL_PROMPT).toContain(`"${basis}"`);
  });

  // Asking the model to convert would be a computed number reaching a panel.
  it("asks for salt as printed and forbids the conversion", () => {
    expect(LABEL_PROMPT).toMatch(/Do not convert salt to sodium/);
  });

  it("asks for exactly the twelve keys, and never the barcode", () => {
    expect(LABEL_KEYS).toHaveLength(12);
    for (const key of LABEL_KEYS) expect(LABEL_PROMPT).toContain(`"${key}"`);
    expect(LABEL_PROMPT).not.toMatch(/barcode|ean|gtin/i);
    expect(LABEL_PROMPT).not.toContain("energy_kj");
  });

  // The four micros are named for the unit their label prints, which kills a
  // 1000x trap the prototype's prompt carried and never exercised.
  it("names the micros in the unit the label prints", () => {
    expect(LABEL_KEYS).toContain("vitamin_d_ug");
    expect(LABEL_KEYS).not.toContain("vitamin_d_mg");
  });

  it("tells the model a comma is a decimal separator", () => {
    expect(LABEL_PROMPT).toContain("13,808");
  });

  // The frame that prints no panel at all is what separated the four candidate
  // models fastest, so the prompt says what to do with one.
  it("says what an empty frame answers", () => {
    expect(LABEL_PROMPT).toMatch(/no nutrition panel at all/);
  });
});

describe("reading the answer: schema-invalid, never sparse", () => {
  /**
   * The envelope #541 measured, which carries the answer **twice**: `response`
   * holding it parsed, and `choices[0].message.content` holding the same thing
   * as a string. The fixture was `{ response: JSON.stringify(object) }` — a
   * `response` holding a *string*, which is the one shape the measurement ruled
   * out and whose arm is now deleted. Every assertion below was riding it.
   */
  const answered = (object: unknown) => ({
    response: object,
    choices: [{ message: { content: JSON.stringify(object) } }],
  });

  /** Only what REST answers: the string, with no parsed `response` beside it. */
  const answeredByRest = (text: string) => ({
    choices: [{ message: { content: text } }],
  });

  /**
   * #541 measured the live envelope: fifteen top-level keys, with `response`
   * holding the model's JSON **already parsed** and `choices[0].message.content`
   * holding the same answer as a string. Both are asserted because both are
   * shapes that have been seen — and the object arm is the one that ships.
   */
  it("reads a panel out of the parsed `response` the binding returns", () => {
    const body = { name: null, brand: null, basis: "per_100g", nutrition: {} };
    expect(readLabelAnswer({ response: body })).toEqual(body);
  });

  it("reads it out of `choices` too, which is what REST answers", () => {
    const body = { name: null, brand: null, basis: "per_100g", nutrition: {} };
    expect(readLabelAnswer(answeredByRest(JSON.stringify(body)))).toEqual(body);
  });

  // Taking `response` as a string, which is what the binding page implies,
  // would have yielded null and a 422 on every read.
  it("does not mistake the parsed object for something it cannot read", () => {
    expect(answerBodyOf({ response: { basis: "per_100g" } })).toEqual({
      basis: "per_100g",
    });
  });

  // A fence can only arrive on the string arm: `response` is parsed by the
  // platform, and a fenced string does not parse into an object at all.
  it("reads through a code fence, which is what a prompt regression looks like", () => {
    const fenced = answeredByRest(
      '```json\n{"name":null,"brand":null,"basis":"per_100g","nutrition":{"fat_g":8}}\n```'
    );
    expect(readLabelAnswer(fenced)?.nutrition).toEqual({ fat_g: 8 });
  });

  it("takes a panel of eight rows, because eight is the correct answer", () => {
    const eight = {
      name: "x",
      brand: null,
      basis: "per_100g",
      nutrition: {
        energy_kcal: 250,
        fat_g: 8,
        saturated_fat_g: 2,
        carbohydrate_g: 30,
        sugar_g: 12,
        protein_g: 15,
        salt_g: 0.6,
        fiber_g: 3,
      },
    };
    expect(
      Object.keys(readLabelAnswer(answered(eight))!.nutrition)
    ).toHaveLength(8);
  });

  // The barcode-only frame: no panel anywhere, and an empty object is right.
  it("takes an empty panel from a frame with nothing on it", () => {
    const empty = { name: null, brand: null, basis: null, nutrition: {} };
    expect(readLabelAnswer(answered(empty))).toEqual(empty);
  });

  // Carried rather than dropped, so the client normalises both spellings of
  // absence in one place.
  it("carries an explicit null through", () => {
    const withNull = {
      name: null,
      brand: null,
      basis: "per_100ml",
      nutrition: { fiber_g: null },
    };
    expect(readLabelAnswer(answered(withNull))?.nutrition).toEqual({
      fiber_g: null,
    });
  });

  // A chatty model is not a failure; dropping the row is the same outcome as
  // never having asked for it.
  it("drops a key nobody asked for rather than refusing the answer", () => {
    const chatty = {
      name: null,
      brand: null,
      basis: "per_100g",
      nutrition: { fat_g: 8, zinc_mg: 4, energy_kj: 3701 },
    };
    expect(readLabelAnswer(answered(chatty))?.nutrition).toEqual({ fat_g: 8 });
  });

  // Unresolved, including what the app has no type for: a Worker that guessed
  // would relabel every row at once.
  it("carries a basis the app cannot express, rather than guessing", () => {
    const serving = {
      name: null,
      brand: null,
      basis: "per_serving",
      nutrition: {},
    };
    expect(readLabelAnswer(answered(serving))?.basis).toBe("per_serving");
  });

  /**
   * Asserted on the **string** arm, which is the one where these are not
   * vacuous. A `response` holding a string is no longer read at all, so
   * `{ response: "prose" }` would answer `null` for the wrong reason and prove
   * nothing about the schema.
   */
  it("refuses an answer it cannot read as a panel", () => {
    expect(readLabelAnswer(answeredByRest("I could not read that"))).toBeNull();
    expect(readLabelAnswer(answeredByRest("[1,2,3]"))).toBeNull();
    expect(readLabelAnswer(answeredByRest('{"name":"x"}'))).toBeNull();
    expect(readLabelAnswer({})).toBeNull();
    expect(readLabelAnswer(null)).toBeNull();
  });

  /**
   * The two arms #541 told us to delete, held deleted.
   *
   * Without this the next reader restores one as an obvious kindness and
   * nothing fails. The claim is narrow: these shapes are **not read**, which is
   * different from saying the binding will never send them.
   */
  it("does not read a `response` holding a string, nor a bare string", () => {
    const body = { name: null, brand: null, basis: "per_100g", nutrition: {} };
    expect(answerBodyOf({ response: JSON.stringify(body) })).toBeNull();
    expect(answerBodyOf(JSON.stringify(body))).toBeNull();
  });
});

describe("the route answers the task end to end", () => {
  const KEY2 = "a-long-operator-secret-drawn-from-a-csprng";
  const body = {
    name: "La Chinata",
    brand: null,
    basis: "per_100ml",
    nutrition: { energy_kcal: 899, fiber_g: null },
  };

  const post = (images = ["AAAA"]) =>
    new Request("https://inventoria.example/api/model", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY2}` },
      body: JSON.stringify({ task: "label", images }),
    });

  it("hands every photograph to the model and returns the reading", async () => {
    // The envelope the binding really returns: the answer parsed, with the
    // string beside it.
    const { binding, calls } = recordingModel({
      response: body,
      choices: [{ message: { content: JSON.stringify(body) } }],
    });
    const answer = await modelRequest(post(["AAAA", "BBBB"]), binding, KEY2);

    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual(body);
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(LABEL_MODEL);
    // Both photographs, as image parts beside one text part.
    const content = (
      calls[0].inputs as {
        messages: {
          content: { type: string; image_url?: { url: string } }[];
        }[];
      }
    ).messages[0].content;
    const images = content.filter((part) => part.type === "image_url");
    expect(images).toHaveLength(2);
    // **And the URL itself**, which this test counted and never read. The one
    // preamble is this side's, over the bare base64 the client sends: a second
    // one rode in front of it for a release and nothing here could see it.
    expect(images.map((part) => part.image_url?.url)).toEqual([
      "data:image/jpeg;base64,AAAA",
      "data:image/jpeg;base64,BBBB",
    ]);
  });

  it("answers 422 when the model did not answer with a panel", async () => {
    const { binding } = recordingModel({
      choices: [{ message: { content: "sorry, no" } }],
    });
    const answer = await modelRequest(post(), binding, KEY2);
    expect(answer.status).toBe(422);
  });

  it("answers our status when the binding throws", async () => {
    const throwing = {
      async run() {
        throw new Error(
          "You have used up your daily free allocation of 10,000 neurons."
        );
      },
    };
    const answer = await modelRequest(post(), throwing, KEY2);
    expect(answer.status).toBe(429);
    // The body says something of our own, never anything the vendor said.
    expect(await answer.text()).not.toMatch(/neurons/);
  });
});
