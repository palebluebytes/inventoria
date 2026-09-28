/**
 * The client half of the model route: one ask, and one reading of the answer
 * (ADR-0115 §5).
 *
 * **Named for the wire rather than for the feature**, because the route is
 * task-agnostic and a second consumer rides the same path. What is specific to
 * the label read is the prompt, which lives on the Worker, and the normaliser,
 * which lives in `ai-autofill.ts`. This module knows a task name, a list of
 * base64 photographs and five statuses.
 *
 * **It is the module that reaches `fetch`, and that is why it is not
 * `ai-autofill.ts`.** A pure normaliser can be tested against the eight
 * committed sample labels with no network; a module that fetches cannot. It is
 * the same seam argument `scripts/log-egress-check.mjs` makes one layer over,
 * where no module under `src/lib/logs/` may reach an egress API.
 *
 * **The wire is restated here, not imported from `worker/src/model.ts`.**
 * `scripts/worker-closure-check.mjs` pins what the Worker may compile in and the
 * pin runs one way, so importing the route's module here would open the reverse
 * direction and put edge code in the app's graph. `model-route.test.ts` asserts
 * the restatements equal the Worker's — one shape, not two, enforced by a gate
 * rather than by a comment. This is the third time that trade has been taken,
 * after `relay-wire.ts` and `deposit-store.ts`, and ADR-0115 §5.2 rules it
 * settled house pattern rather than a fresh argument.
 *
 * **Every status is our own**, never the vendor's. The Worker maps whatever
 * Cloudflare said onto the five below and the contract names the set rather than
 * the mechanism, because the codes themselves are not trustworthy: `2003` and
 * `4006` each appear zero times in Cloudflare's own complete documentation
 * dumps, and `4006` carries the exact message published under `3036`.
 */
import { getSecret } from "../stores/secrets";

/** Where the model route listens, on the app's own origin (ADR-0115 §2). */
export const MODEL_PATH = "/api/model";

/**
 * The questions the route will answer, restated from `worker/src/model.ts` and
 * held equal by a test. One member today.
 */
export const MODEL_TASKS = ["label"] as const;

export type ModelTask = (typeof MODEL_TASKS)[number];

/**
 * The **cost** ceiling (ADR-0115 §5.1), restated and held equal.
 *
 * Nothing bounded the capture array before this: `labelPhotos` sits behind a
 * `multiple` file input with no cap anywhere. Above it the client **refuses and
 * says so** rather than silently sending the first four, because the disclosure
 * the user reads interpolates the count, and a count that is not the count sent
 * makes the disclosure false.
 */
export const MAX_IMAGES = 4;

/**
 * The **transport** ceiling (ADR-0115 §5.1), a different control from the one
 * above, restated and held equal.
 */
export const MAX_REQUEST_BYTES = 6 * 1024 * 1024;

// Which model was asked is **not** this module's to say, and it is deliberately
// not re-exported through here. The Worker owns the model id, so the wire never
// carries one; the app's own closed set lives in `src/lib/logs/model-log.ts`
// beside the field that records it, which is where `log-egress-check.mjs`'s
// seam needs the vocabulary to sit. A caller recording a session reads it from
// there, which is the direction every other food-to-log import already runs.

/**
 * What the route answers on success: a flat reading the model was asked to
 * emit, validated Worker-side and nothing more.
 *
 * **This is not `AIAutofillResult`.** The Worker owns a wire shape and the
 * client normalises it into a panel proposal — `13,808 g` into `13.808`, salt
 * into sodium, a basis the app has no type for into a refusal. Normalising a
 * label reading into a panel is exactly the *"pure module full of nutrition
 * arithmetic"* the closure check's own header disqualifies from the edge, so it
 * stays in `ai-autofill.ts` and the Worker never learns what a `Basis` is.
 *
 * **`basis` is carried through unresolved**, values the app has no type for
 * included: the normaliser refuses those, and a Worker that guessed would
 * relabel every row at once.
 */
export interface LabelReading {
  name: string | null;
  brand: string | null;
  basis: string | null;
  /** Only the keys the label printed. Absent is absent; `0` means printed zero. */
  nutrition: Record<string, number | null>;
}

/**
 * The route could not be reached, or could not answer: transport, a `5xx`, a
 * timeout, and **any `429` the Worker could not classify**.
 *
 * That last member is the contract's *couldn't tell* by design (§5.4). It
 * misreads only a genuinely exhausted day, and fails toward retry rather than
 * toward giving up.
 */
export class ModelUnreachableError extends Error {}

/** Today's allowance is spent. It clears on its own, and not at a time we may promise. */
export class ModelExhaustedError extends Error {}

/**
 * The answer could not be read as a panel.
 *
 * **Schema-invalid, never sparse.** A reading carrying eight of twenty-one rows
 * is the *correct* answer — every sampled label prints the eight EU-mandatory
 * rows and zero micronutrients — and sparseness is not detectable from a
 * response anyway: #482 measured a well-formed, complete-looking panel that
 * silently omitted four printed rows at `finish_reason: stop`.
 *
 * It has **two sources**: the Worker's own validation, and the normaliser
 * refusing a `basis` it cannot express. One outcome, one line on screen, two
 * places it arises.
 */
export class ModelUnusableError extends Error {}

/**
 * The operator's to fix and the user's to read about: this device's key is
 * wrong or unset, or the account changed underneath the app.
 *
 * `401` and `403` both land here. They are distinct upstream and neither is
 * actionable by the person holding the phone, so they collapse on screen and
 * stay one class.
 */
export class ModelRefusedError extends Error {}

/**
 * What was asked of the route, built in one place.
 *
 * Restated from `worker/src/model.ts:modelRequestBody` and held equal by a test.
 * The shape is the whole of §3.1's closed list: a task and photographs, and not
 * the prompt, which lives on the far side because *absent is never zero* is a
 * property of a sentence rather than of a model.
 */
export function modelRequestBody(
  task: ModelTask,
  images: string[]
): { task: ModelTask; images: string[] } {
  return { task, images };
}

/**
 * How many bytes a request would weigh on the wire.
 *
 * Measured over the built body rather than over the images alone, so the
 * client's refusal and the Worker's `413` are answering the same question.
 */
export function modelRequestBytes(task: ModelTask, images: string[]): number {
  return new TextEncoder().encode(
    JSON.stringify(modelRequestBody(task, images))
  ).length;
}

/**
 * Whether this many photographs may be sent, and why not when they may not.
 *
 * Exported because the control that draws the disclosure needs the answer
 * *before* the tap, not after it: the copy names a count, so a request the route
 * would refuse must never be offered with that count on the button.
 */
export function modelRequestRefusal(
  task: ModelTask,
  images: string[]
): string | null {
  if (images.length === 0) return "There are no photos to read.";
  if (images.length > MAX_IMAGES)
    return `At most ${MAX_IMAGES} photos can be read at once.`;
  if (modelRequestBytes(task, images) > MAX_REQUEST_BYTES)
    return "Those photos are too large to send together.";
  return null;
}

/**
 * Ask the model one question.
 *
 * **One ask and one reading of the answer**, so a status is classified in
 * exactly one place on this side — #204's lesson, which is that the log and the
 * screen cannot come to disagree about what happened when one function decides.
 *
 * The key is read at call time rather than captured, because it may be pasted
 * into Settings between one tap and the next, and an unset one is a `401` the
 * route answers without spending anything.
 */
export async function askModel(
  task: ModelTask,
  images: string[]
): Promise<LabelReading> {
  const refusal = modelRequestRefusal(task, images);
  if (refusal !== null) throw new ModelUnusableError(refusal);

  let response: Response;
  try {
    response = await fetch(MODEL_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getSecret("model_route_key")}`,
      },
      body: JSON.stringify(modelRequestBody(task, images)),
    });
  } catch {
    // A transport-level rejection: offline, DNS, a connection reset. Nothing
    // was asked, which reads to the user exactly as an unreachable route does.
    throw new ModelUnreachableError("The model route could not be reached");
  }

  if (response.ok) {
    try {
      return (await response.json()) as LabelReading;
    } catch {
      // A `200` whose body is not JSON is the route answering something this
      // client cannot read, which is the same ending as a schema failure.
      throw new ModelUnusableError("The answer could not be read");
    }
  }

  // `413` is the client's own ceiling arriving from the far side, which means
  // the two restatements have drifted. It reads as unusable rather than as a
  // network fault, because nothing about waiting will help.
  if (response.status === 413)
    throw new ModelUnusableError("The request was over a ceiling");
  if (response.status === 422)
    throw new ModelUnusableError("The answer was not a panel");
  if (response.status === 429)
    throw new ModelExhaustedError("Today's allowance is used up");
  if (response.status === 401 || response.status === 403)
    throw new ModelRefusedError("The model route refused this device");
  throw new ModelUnreachableError("The model route did not answer");
}
