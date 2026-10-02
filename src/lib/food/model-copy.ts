import type { ModelOutcome } from "../logs/model-log";

/**
 * What the app says about its one readable egress (ADR-0115 §3.2, §9).
 *
 * Here rather than in the component for `off-retry.ts`'s reason — that module
 * holds `OFF_UNREACHABLE_COPY` beside the classifier that chooses it, because a
 * sentence that decides what a user believes is worth a test and a diff of its
 * own. These are the sentences that decide whether somebody understands that a
 * photograph of their kitchen left the device.
 *
 * **The house voice has a shape**, visible in both existing network lines:
 * *name the cause, deny the wrong inference, hand over the recovery*. Here the
 * wrong inference is always the same — the user will assume their photo was bad
 * — and the recovery is always the same, because all four are read while
 * standing in a form that already works. That repeated last clause **is** the
 * stance, said on screen: AI autofill is a bonus that is allowed to be absent,
 * never a dependency.
 */

/**
 * The control's own line, with the count interpolated.
 *
 * **The count is what makes the closed list legible rather than asserted.** It
 * is also why the client refuses a set over the ceiling instead of trimming it:
 * a count that is not the count sent makes this sentence false.
 *
 * *"Nothing else leaves this phone"* is **literally** true rather than nearly
 * true, and only because §5.1 put the prompt on the Worker — the request is
 * photographs and a task name, and the task name is a word we chose.
 */
export function sendDisclosure(photos: number): string {
  return photos === 1
    ? "Sends this photo to Cloudflare. Nothing else leaves this phone."
    : `Sends these ${photos} photos to Cloudflare. Nothing else leaves this phone.`;
}

/** What the control says in each of its two states (§8). */
export const READ_LABEL_LABEL = "Read label with AI";
export const TAKE_PHOTO_LABEL = "Photograph the label";

/**
 * The take-a-photo proposition, which is a different offer from the send.
 *
 * On a phone **every scan door arrives photo-less**, so this is the common case
 * and not an edge: ADR-0034 §5's claim that the barcode/label doors arrive with
 * photographs is half-shipped, true only of the desktop-upload variants.
 */
export const TAKE_PHOTO_HINT =
  "Take a photo of the nutrition panel and AI can read it for you.";

/**
 * The four lines a failure draws, keyed on the outcome rather than on a status
 * so that the screen and the log cannot come to disagree.
 *
 * `ok` is here for completeness of the map and never drawn.
 *
 * **The exhausted line promises no reset time.** #480 wrote *"it resets at
 * midnight UTC"* from the documented allocation; #509 then measured 2,449
 * neurons spent since 00:00 UTC refused as *used up your daily free
 * allocation*, with 8,938 spent the previous UTC day — a rolling window, not a
 * calendar day. A line that named a time would be wrong most evenings.
 *
 * **And it never suggests an upgrade**, because on Workers Free there is no
 * overage path to suggest.
 */
export const MODEL_FAILURE_COPY: Record<ModelOutcome, string> = {
  ok: "",
  unreachable:
    "Couldn't reach the model — it's busy or unreachable, and your photo is fine. Try again in a moment, or fill the panel in below.",
  exhausted:
    "Today's allowance for reading labels is used up. Fill the panel in below — nothing else here needs it.",
  unusable:
    "The model answered, but not with a panel it could read off this photo. Try another shot, or fill it in below.",
  refused:
    "This device can't use the label reader — its key is missing or no longer works. Check it under the gear, or fill the panel in below.",
};

/**
 * Whether a failed outcome offers another attempt.
 *
 * **`exhausted` gets no Try again, because it would be a lie.** Everything else
 * clears on its own or clears on a different photograph, and one button puts
 * the next wait somewhere the user chose it.
 *
 * There is no automatic retry anywhere: the barcode path's is copied *from* and
 * refused on three specifics — a model call is seconds rather than the 400 ms an
 * OFF hiccup costs, every attempt spends against a hard daily stop with no
 * overage, and an immediate retry is exactly what re-trips the gateway's
 * 20-per-60-second limit.
 */
export function offersRetry(outcome: ModelOutcome): boolean {
  return outcome !== "exhausted" && outcome !== "ok";
}

/**
 * The first-use sheet, once per device, before the first send.
 *
 * **The last of the three paragraphs is the one to defend in review.** It is duller and
 * longer than a reassurance would be, and it is the only version the evidence
 * permits: Cloudflare document no training, and say **nothing quotable about
 * retention** — no duration anywhere — so the app can say *it isn't trained on*
 * and may not say *it isn't kept*. Workers AI is also `✘ Not compatible` with
 * Regional Services, so there is no way to keep inference in Europe and no
 * honest sentence that implies there is.
 *
 * The closing line is what a device with no key reads, since pressing the
 * control with none opens this sheet rather than a disabled button (§9.2).
 */
export const MODEL_EGRESS_SHEET = {
  title: "Reading a label with AI",
  heading: "This is the one thing Inventoria sends off your phone.",
  paragraphs: [
    "Everything else stays on this device. To read a label, your photos of it go to Cloudflare, who run the model. Nothing else goes with them — not your meals, not your other foods, not your diary.",
    "What comes back is a filled-in form. You check it and correct it; nothing is saved until you do.",
    "Cloudflare say they don't use what you send to train any model. They don't say how long they keep it. We've turned off every log we can reach, and the model may run on a machine anywhere in the world — Cloudflare don't offer a way to keep it in Europe.",
  ],
  /** Shown in place of the send when this device holds no key. */
  noKey:
    "Reading a label this way needs a key — add one under the gear. Everything on this form works without it.",
  decline: "Not now",
  accept: "Send the photos",
} as const;
