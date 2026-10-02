/**
 * The label task: the prompt, the model, the schema and the reading
 * (ADR-0115 §5.1, §5.2, §5.3).
 *
 * **The prompt is the safety mechanism, and it lives here rather than on the
 * wire.** #482's ablation measured it: strip the guard sentence and the same
 * model fabricated all twelve micronutrients as `0` on the same image, 2/2 runs
 * against 0/9 with it. *Absent is never zero* is therefore **prompt-carried,
 * not model-carried** — a property of a sentence — and a property that lives in
 * a sentence cannot live on the wire, where the operator key is the only thing
 * between it and an arbitrary string. The cost, accepted: a prompt fix or a
 * model swap is a Worker deploy.
 *
 * **The key list *is* the fabrication surface.** That is the ablation's other
 * half: the rows you ask for are what the fabrication attached itself to the
 * moment the guard came off. So the twelve below are not a subset for tidiness;
 * asking for the prototype's twenty-one would be asking for nine rows nothing
 * has ever validated, defended by a sentence.
 */
import { MODEL_CALL_OPTIONS, type ModelBinding } from "./model";

/**
 * The model, chosen by measurement (#482): **154 of 154** printed rows across 18
 * runs, zero fabrications, zero malformed output and nothing to correct, in
 * 3.0–4.3 s at 76 neurons for one image and 133 for two.
 *
 * The three it beat are worth remembering, because each failed differently:
 * `llama-3.2-11b-vision-instruct` answered prose rather than JSON in 6 runs of
 * 9 and invented micronutrients **by re-labelling the macro rows**;
 * `moondream3.1` scored 29.5%; Mistral Small 3.1 fabricates nothing but
 * **silently omits printed rows**, well-formed and at `finish_reason: stop`,
 * which is why sparseness can never be an error condition here.
 *
 * It is also the only shape that carries more than one image: the chat
 * `messages` + `image_url` form. The other two candidates take exactly one
 * `image` field, so N photographs were unreachable for them by construction.
 */
export const LABEL_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/**
 * The twelve keys the model is asked for, each named for the unit its label
 * prints them in.
 *
 * **The four micros end `_ug`, and that is a fix rather than a preference.** The
 * prototype asked for `vitamin_d_mg` and said *"in milligrams as printed"* of
 * rows every label prints in µg — self-contradictory, and the same 1000× shape
 * as the olive oil's `13,808 g` trap, which the prototype never exercised
 * because no sampled label prints a micronutrient at all.
 *
 * **`energy_kj` is not here.** `NutritionInfo` has no kJ field, so the model
 * returned a key with nowhere to go on every run. It could have been defended
 * as an anchor, since EU panels print kJ first and kcal second, but every sample
 * returned a correct `energy_kcal` beside it — so there is no evidence the
 * anchor does work, and an unused key is a key that can be invented.
 *
 * **No barcode.** A rotated one defeated this model 3/3 at `426578483808`
 * (twelve digits), the two-photograph case produced a fifteen-digit number, and
 * nobody proofreads thirteen digits. The app has a real scanner.
 */
export const LABEL_KEYS = [
  "energy_kcal",
  "fat_g",
  "saturated_fat_g",
  "carbohydrate_g",
  "sugar_g",
  "fiber_g",
  "protein_g",
  "salt_g",
  "vitamin_d_ug",
  "calcium_mg",
  "iron_mg",
  "potassium_mg",
] as const;

/** What a basis may be. A closed enum **in the prompt text**, or you get `"per 100ml"` with a space. */
export const LABEL_BASES = ["per_100g", "per_100ml", "per_serving"] as const;

/**
 * The prompt, pinned.
 *
 * Four sentences are load-bearing and a test holds each of them:
 *
 * 1. **The guard.** *Omit the key entirely* for a row the label does not print.
 *    This is the one the ablation measured; without it the model fills every key
 *    it was given with `0`.
 * 2. **The zero clause beside it.** A row printed *as* zero is `0`. Both
 *    directions matter, and the model got both right while disobeying the
 *    spelling — it answered `"fiber_g": null` for a row it could not see.
 * 3. **The closed basis enum**, written out. Without it the answer is
 *    `"per 100ml"`, with a space, which no consumer can read.
 * 4. **Salt as printed.** The panel stores sodium and the two differ by roughly
 *    2.5x, so a model asked to convert would be originating a number the user
 *    cannot check against the pack. The division is the client's.
 *
 * It asks for bare JSON. #482 got full schema conformance **from the prompt
 * alone**, with no JSON mode and no `response_format`, byte-identical across
 * repeats at `temperature: 0` — so adding one is a smaller question than it
 * looked, not a foregone one.
 */
export const LABEL_PROMPT = [
  "You are reading a nutrition label from one or more photographs of the same product.",
  "Answer with a single JSON object and nothing else. No prose, no code fence.",
  "",
  "The object has exactly these keys:",
  '  "name"   — the product name as printed, or null if it is not in frame.',
  '  "brand"  — the brand as printed, or null if it is not in frame.',
  `  "basis"  — exactly one of ${LABEL_BASES.map((b) => `"${b}"`).join(", ")}, or null if the panel does not say.`,
  '  "nutrition" — an object holding only the rows the label actually prints.',
  "",
  'Inside "nutrition", use only these keys, in the units their names give:',
  ...LABEL_KEYS.map((key) => `  "${key}"`),
  "",
  "RULES, in order of importance:",
  "1. If the label does not print a row, OMIT THE KEY ENTIRELY. Never write 0 for a row that is not printed. A missing row and a row printed as zero are different facts and must not be confused.",
  "2. If the label prints a row as 0, write 0. That is a measurement.",
  '3. Write salt exactly as the label prints it, in grams, under "salt_g". Do not convert salt to sodium.',
  '4. A comma is a decimal separator on these labels. "13,808 g" is 13.808 grams, not thirteen thousand.',
  "5. Do not calculate, correct or complete anything. Transcribe what is printed, even where it does not add up.",
  '6. If a photograph shows no nutrition panel at all, answer with an empty "nutrition" object.',
].join("\n");

/** What the route hands back on success, before the client normalises it. */
export interface LabelReading {
  name: string | null;
  brand: string | null;
  basis: string | null;
  nutrition: Record<string, number | null>;
}

/**
 * The statuses this task can produce, which are **ours** and never the
 * vendor's (ADR-0115 §5.4).
 */
/**
 * The statuses a **request** is refused with, before any model is asked.
 *
 * Separate from {@link MODEL_FAULT}, which is what a thrown *answer* becomes:
 * nothing here has spent a neuron. Named rather than written inline so the
 * client's restatement has something to be held equal to — the same trade
 * `MODEL_TASKS` and the two ceilings already take (ADR-0115 SS5.2).
 */
export const MODEL_REQUEST_FAULT = {
  /** Ours to fix, never the user's to read: the client built a bad question. */
  malformed: 400,
  /** This device's key is wrong or unset. `401`, because the caller may fix it. */
  badKey: 401,
  /** A ceiling the client restates and should have caught first. */
  overCeiling: 413,
} as const;

export const MODEL_FAULT = {
  /** Couldn't reach it: transport, a 5xx, a timeout, and any 429 we could not classify. */
  unreachable: 503,
  /** Not today: the daily allocation, when determinable. */
  exhausted: 429,
  /** Couldn't read the label: our own schema validation failed. */
  unusable: 422,
  /** Refused: the operator's to fix. */
  refused: 403,
} as const;

/**
 * Which status a thrown failure becomes.
 *
 * **Matched on the message text, not on the code, and that is the finding that
 * makes this function worth reading.** `env.AI.run()` throws a bare `Error`
 * whose code is a *substring of the message*; the only error handling in
 * Cloudflare's primary docs is one worked example matching
 * `(e as Error).message.includes('2016')`, demonstrated for four codes and none
 * of ours. And the codes are not stable:
 *
 * - **`2003`** (a tripped gateway rate limit) returns **zero matches** across
 *   the complete Workers AI and AI Gateway documentation dumps. #490 measured it
 *   on the REST path and it is documented nowhere.
 * - **`4006`** is what #509 measured for an exhausted allocation, carrying the
 *   **exact message** Cloudflare publishes under **`3036`** — and `4006`
 *   appears zero times in 11,358 lines of `workers-ai/llms-full.txt`.
 *
 * So a Worker matching the documented `3036` would classify exhaustion as
 * *couldn't reach it* and tell the user to try again in a moment, all day. The
 * message is the stable discriminant; the codes are matched too, as a second
 * chance rather than as the mechanism.
 *
 * **A tripped rate limit is `unreachable`, not `exhausted`**, deliberately. It
 * clears in seconds and *try again in a moment* is the true thing to say;
 * calling it *not today* would be the worse error of the two.
 *
 * **The default is `unreachable`**, which is the contract's *couldn't tell*
 * member by design. It misreads only a genuinely exhausted day and fails toward
 * retry rather than toward giving up.
 *
 * **#541 has now measured the thrown shape, and it is not what the docs say.**
 * Against the live binding:
 *
 * ```
 * constructor  InferenceUpstreamError      (not a bare Error)
 * name         AiGatewayError | AiError    (which side faulted)
 * ownKeys      ["stack", "message", "name"]   — there is NO `.code`
 * message      "2003: Rate limited"
 * ```
 *
 * So **the code arrives as a `NNNN: ` prefix on the message**, which is why
 * matching the message rather than a property is not a workaround but the only
 * reading available. `name` additionally says *which side* faulted —
 * `AiGatewayError` for the gateway, `AiError` for the model, as a deprecated
 * model id demonstrated — and is deliberately **not** matched on: it is
 * undocumented, it does not change the mapping, and a second signal that agrees
 * with the first is a second thing to keep in step.
 *
 * `returnRawResponse: true` was measured too, and it is real: it answers a
 * `Response` rather than throwing — `200` on success, `429` on the limit, with
 * a structured body carrying `internalCode: 2003` as a **number**. It is not
 * taken, because it would also make the success path a raw `Response` and throw
 * away the parse {@link answerBodyOf} relies on. Recorded so nobody re-measures
 * it to find out.
 */
export function faultStatusOf(failure: unknown): number {
  const message =
    failure instanceof Error ? failure.message : String(failure ?? "");

  // The exhausted allocation, by its message first and its two codes second.
  if (
    /used up your daily free allocation/i.test(message) ||
    /\b(?:3036|4006)\b/.test(message)
  )
    return MODEL_FAULT.exhausted;

  // The operator's to fix: the model's terms are unaccepted, or the account
  // stopped answering for us.
  if (
    /model terms/i.test(message) ||
    /unauthori[sz]ed/i.test(message) ||
    /\b(?:5016|10000)\b/.test(message)
  )
    return MODEL_FAULT.refused;

  return MODEL_FAULT.unreachable;
}

/**
 * The JSON object inside a string answer.
 *
 * The prompt asks for bare JSON and #482 measured this model obeying, every
 * run — and #541 then found the binding parses it for us anyway, so this is
 * reached only on the paths that hand back a string. A fenced block is stripped
 * as tolerance rather than expectation: it is what the *naive* prompt produced,
 * so it is the shape a prompt regression arrives in, and reading through it
 * costs one regular expression.
 */
function jsonIn(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * The answer out of the binding's envelope — **already parsed, on the path that
 * ships**.
 *
 * Measured against the live binding for
 * [#541](https://github.com/palebluebytes/inventoria/issues/541), which is the
 * only way this was ever going to be known: the envelope carries **fifteen**
 * top-level keys and two of them hold the answer. `response` is the model's
 * JSON **already parsed into an object**, and `choices[0].message.content` is
 * the same answer as a raw string. `usage.neurons` read **74.70** for one
 * 1125x2000 photograph, which is #482's 76 confirmed on the binding rather than
 * on REST.
 *
 * **That is not what the documentation implies.** Workers AI's binding page
 * describes `response` for text generation, which reads as a string, and #482
 * ran over the OpenAI-compatible REST endpoint, which answers only `choices`.
 * A route written to either single shape alone would have been wrong: taking
 * `response` as a string yields `null` and a `422` on **every** read, and
 * taking `choices` alone throws away a parse the platform already did.
 *
 * So the order is **the object, then the raw choice** — two arms, because the
 * measurement found **both in the same envelope** and each is the only shape one
 * of the two paths offers.
 *
 * **Two further arms were deleted, which is #541's own instruction**: *"delete
 * the branch that does not happen."* A `response` holding a *string* is the
 * shape the binding page implies and the measurement contradicts outright, and
 * an envelope that is itself a string was never seen on either path. Both were
 * written before anything was measured, and keeping them would have left this
 * paragraph's closing claim false. If the binding ever does start answering a
 * string, every read becomes a `422` — loudly, on the first one, rather than
 * silently through a fallback nobody knew was carrying the route.
 */
export function answerBodyOf(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return null;

  const envelope = raw as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
  };
  // The path that ships: the binding parsed it for us.
  if (typeof envelope.response === "object" && envelope.response !== null)
    return envelope.response;
  // The same answer as a string, which is all the REST endpoint ever offers.
  const content = envelope.choices?.[0]?.message?.content;
  return typeof content === "string" ? jsonIn(content) : null;
}

/**
 * Read one answer into a {@link LabelReading}, or `null` if it cannot be read.
 *
 * **Schema-invalid, never sparse.** A reading carrying eight of twenty-one rows
 * is the *correct* answer — every sampled label prints the eight EU-mandatory
 * rows and zero micronutrients — and a frame with no panel on it answers with
 * an empty `nutrition` object, which is also correct. Only an answer this
 * function cannot read at all is a `422`.
 *
 * **A key nobody asked for is dropped, not refused.** The request is what bounds
 * the fabrication surface; a response carrying an extra row is a model being
 * chatty, and dropping it on the floor is the same outcome as never having
 * asked. Refusing it would be a validator crying wolf.
 *
 * **`basis` is carried through unresolved**, `per_serving` and `null` included.
 * The client refuses what it cannot express; a Worker that guessed would
 * relabel every row at once.
 */
export function readLabelAnswer(raw: unknown): LabelReading | null {
  const parsed = answerBodyOf(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;

  const { name, brand, basis, nutrition } = parsed as {
    name?: unknown;
    brand?: unknown;
    basis?: unknown;
    nutrition?: unknown;
  };

  if (
    typeof nutrition !== "object" ||
    nutrition === null ||
    Array.isArray(nutrition)
  )
    return null;

  const rows: Record<string, number | null> = {};
  for (const key of LABEL_KEYS) {
    const value = (nutrition as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (value === null) {
      // The model's other spelling of absence. Carried rather than dropped, so
      // the client normalises both spellings in one place.
      rows[key] = null;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) rows[key] = value;
  }

  return {
    name: typeof name === "string" ? name : null,
    brand: typeof brand === "string" ? brand : null,
    basis: typeof basis === "string" ? basis : null,
    nutrition: rows,
  };
}

/**
 * Ask the model to read a label.
 *
 * The chat shape, which is the only one that carries more than one photograph,
 * at `temperature: 0`, where this model is byte-identical across repeats.
 *
 * **Every call names the gateway**, through {@link MODEL_CALL_OPTIONS}. #490
 * measured that the rate limit and the logging-off setting bind only calls that
 * do, so a call built without it escapes both, invisibly.
 */
export async function readLabel(
  ai: ModelBinding,
  images: string[]
): Promise<unknown> {
  return ai.run(
    LABEL_MODEL,
    {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: LABEL_PROMPT },
            ...images.map((image) => ({
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${image}` },
            })),
          ],
        },
      ],
      temperature: 0,
      max_tokens: 1200,
    },
    MODEL_CALL_OPTIONS
  );
}
