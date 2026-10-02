import {
  appendToChannel,
  defineChannel,
  SEVERITY,
  type SeverityNumber,
} from "./log-facility";

/**
 * The model channel (ADR-0115 §11): what one ask of the model route leaves
 * behind.
 *
 * One reader wants it, and the whole channel exists for their question:
 * **is the label read any good against real labels?** #482 answered that for
 * four photographs in one kitchen; nothing else can answer it for the labels
 * this device actually meets. `corrected` is the instrument, and everything
 * else here is the context that makes a correction count mean anything.
 *
 * **This is not telemetry**, on the terms `search-log.ts` states and ADR-0092
 * §11 holds structurally: no transport, no aggregation, and the one way out is
 * a file the owner exports after reading it. That matters more here than on any
 * other channel, because this is the one feature that sends anything off the
 * device at all — so a channel *about* that feature that also sent something
 * would be the joke version of this app.
 *
 * Four things about the shape are easy to get wrong:
 *
 * - **`app` was the cheap option and is refused**, on one fact: it is
 *   deliberately `domain: null`, because boot and database errors belong to none
 *   of the six Tracked Domains. A food-path model failure belongs squarely to
 *   one, and sitting in `app` would put it outside Rations' export consent
 *   scoping (ADR-0080 §5). For the single feature in this app that sends data
 *   off the device, *separately withholdable at the export* is the right unit.
 * - **One entry per session, never one per call**, which is the **Scan
 *   session**'s argument transferred without a word changed: the fact worth
 *   having is a *sequence* — an outcome, and then what the user did about it —
 *   and a sequence split across two entries could only be rejoined by a key this
 *   channel does not carry.
 * - **"Not set up" is not an outcome and records nothing.** A device with no key
 *   opens the first-use sheet rather than asking anything, so there is no answer
 *   to classify — `scan`'s own precedent, where a barcode the ledger already
 *   holds is not a scan session.
 * - **A duration is refused by name**, so that nobody adds one quietly. It
 *   answers no question anyone has asked, and it measures the network as much as
 *   the model.
 *
 * **What must never appear here**: the prompt, any image or derivative of one,
 * any nutrition value returned, any name or brand read off the label, and any
 * provider-authored error text. Every field below is a closed enum, a small
 * count, a boolean or a clock, so there is nowhere for one to ride — `scan`'s
 * property, and for the same reason it was chosen there.
 */

// ---------------------------------------------------------------------------
// The vocabulary (ADR-0115 §9, §11)
// ---------------------------------------------------------------------------

/**
 * How the ask ended: §9's four user-visible states, plus success.
 *
 * **Declared here rather than beside the policy that decides it**, which is
 * `scan`'s arrangement and for its reason: the module that classifies a failure
 * reaches `fetch`, and `scripts/log-egress-check.mjs` holds that no module under
 * `src/lib/logs/` does. So the vocabulary lives on the log's side of the seam
 * and the policy imports it — the direction every other food-to-log import
 * already runs. `modelOutcomeOf` in `src/lib/food/` is what maps a thrown class
 * onto one of these, and the screen branches on the outcome it returns rather
 * than on a status, so the log and the screen cannot come to disagree about what
 * happened.
 *
 * **`unreachable` is wider than its name**, and deliberately: it is everything
 * that clears on its own *plus* an unclassifiable `429`. #509 measured that the
 * exhaustion code is `4006`, documented nowhere, carrying the exact message
 * Cloudflare publishes under `3036` — so the set fails toward *retry* rather
 * than toward *give up*, and a day genuinely exhausted may be recorded here
 * instead of as `exhausted`. Named rather than hidden: this channel cannot be
 * read as a census of the daily allocation.
 *
 * **`refused` collapses two things the user cannot act on** — a key this device
 * has wrong, and an account that changed underneath the app. They read the same
 * on screen (§9) and they stay one value here, because a channel inventing a
 * distinction the code it observes does not make is a distinction nobody can
 * act on either.
 */
export type ModelOutcome =
  | "ok"
  | "unreachable"
  | "exhausted"
  | "unusable"
  | "refused";

/** Every {@link ModelOutcome}, in the order a reading presents them. */
export const MODEL_OUTCOMES = [
  "ok",
  "unreachable",
  "exhausted",
  "unusable",
  "refused",
] as const;

/**
 * Which model was asked, **from the app's own closed set and never echoed out of
 * a response** (ADR-0115 §11).
 *
 * One member today. It is the vendor's id rather than a short code of our own,
 * because the question a reader brings to this field a year from now is *which
 * model produced these readings* and a local alias would need a second lookup
 * to answer it — but it is our list, so a response naming something else can
 * never write here.
 *
 * Restated rather than imported from `worker/src/model.ts`: that module is on
 * the far side of `scripts/worker-closure-check.mjs`'s boundary, and the two
 * being equal is `model-route.ts`'s equality test to hold, not this one's.
 */
export const MODEL_IDS = ["@cf/meta/llama-4-scout-17b-16e-instruct"] as const;

export type ModelId = (typeof MODEL_IDS)[number];

/** One recorded model session (ADR-0115 §11). */
export interface ModelLogEntry {
  outcome: ModelOutcome;
  model: ModelId;
  /** How many photographs went, bounded at four by the request's own ceiling. */
  images: number;
  /** Whether the form reached the Ledger afterwards. */
  saved: boolean;
  /**
   * How many proposed rows the user **touched** before saving, absent unless the
   * read succeeded.
   *
   * Touched, not changed: `writeRow` clears a row's `unverified` flag on the
   * input event, so a row opened and left identical counts. That is the
   * instrument this repo already has, and naming it honestly here is what stops
   * a later reader treating it as an error rate.
   */
  corrected?: number;
  at: number;
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/**
 * A model session in progress: it opens when the user taps the control that
 * sends their photographs, and settles when the answer is applied, refused, or
 * the form is saved without one.
 *
 * Held as data and advanced by pure functions rather than by a running object,
 * so "one entry per session" is a fold over what happened rather than a
 * component's lifecycle — `scan-log.ts`'s arrangement, for its reasons.
 *
 * `model` and `images` are known at the moment of the tap, which is the moment
 * the session opens, so neither is ever null.
 */
export interface ModelSession {
  /** What the ask answered, or `null` while it is still in flight. */
  outcome: ModelOutcome | null;
  model: ModelId;
  images: number;
  saved: boolean;
  corrected: number | null;
}

/** Opens a session. The photographs are about to leave. */
export function beginModelSession(
  model: ModelId,
  images: number
): ModelSession {
  return { outcome: null, model, images, saved: false, corrected: null };
}

/** The ask answered, one way or the other. */
export function modelAnswered(
  session: ModelSession,
  outcome: ModelOutcome
): ModelSession {
  return { ...session, outcome };
}

/**
 * The form reached the Ledger.
 *
 * **True after a failed read too**, which is the point of carrying it: it is
 * what tells *gave up* from *typed the pack in anyway*, the #208-analogue one
 * channel along. `corrected` arrives with it because it is only knowable at the
 * save, and is ignored where the read did not succeed — a count of rows touched
 * on a form the model never filled is a count of the user typing.
 */
export function modelSaved(
  session: ModelSession,
  corrected: number
): ModelSession {
  return { ...session, saved: true, corrected };
}

/**
 * The one entry a finished session leaves, or `null` for a session with nothing
 * to say.
 *
 * `null` is the session whose ask never answered — the form abandoned while the
 * spinner ran. An entry states what the ask did, so an ask that did not report
 * leaves none, which is `closeScanSession`'s rule exactly.
 *
 * **`corrected` is written only where the outcome is `ok`**, and is omitted
 * rather than zeroed otherwise. A `0` there would be a count, and the honest
 * statement is that there was nothing to correct.
 */
export function closeModelSession(
  session: ModelSession,
  at: number
): ModelLogEntry | null {
  const { outcome, model, images, saved, corrected } = session;
  if (outcome === null) return null;
  const entry: ModelLogEntry = { outcome, model, images, saved, at };
  if (outcome === "ok" && corrected !== null) entry.corrected = corrected;
  return entry;
}

// ---------------------------------------------------------------------------
// The level (ADR-0092 §5.2's table, one channel along)
// ---------------------------------------------------------------------------

/**
 * What level a finished session is recorded at, mirroring `scanSessionLevel`
 * one for one.
 *
 * | Session                            | Level        |
 * | ---------------------------------- | ------------ |
 * | `refused`                          | **ERROR 17** |
 * | `unreachable`, `exhausted`, `unusable` | **WARN 13**  |
 * | `ok`                               | **INFO 9**   |
 *
 * `refused` sits at ERROR on ADR-0092 §5.2's own words — *an outage is the
 * network's and a 403 is ours*. It is the one state here that is nobody's to
 * wait out: the key is wrong, or the account changed.
 *
 * `exhausted` is a WARN rather than an ERROR even though the user can do nothing
 * about it today either, because it is **the plan working as designed** rather
 * than anything broken, and it clears on its own.
 *
 * This channel has **no DEBUG field at all**, so `Noisy` writes for it exactly
 * what `Normal` writes. The natural candidate would be a duration, and §11
 * refuses one by name.
 */
export function modelSessionLevel(entry: ModelLogEntry): SeverityNumber {
  if (entry.outcome === "refused") return SEVERITY.ERROR;
  if (entry.outcome === "ok") return SEVERITY.INFO;
  return SEVERITY.WARN;
}

// ---------------------------------------------------------------------------
// The counters (ADR-0092 §9)
// ---------------------------------------------------------------------------

/** The counter every session that reached the Ledger adds to. */
const SAVED_COUNTER = "saved";

/**
 * Every counter this channel keeps: one per outcome, and one for the saves.
 * Nothing else (ADR-0115 §11).
 *
 * **Prefixed by the field they total**, `scan`'s rule and for its reason: a bare
 * `ok` beside a bare `saved` are two numbers somebody will read the wrong way
 * round in an exported file.
 *
 * **There is no counter over `corrected`**, and that is deliberate. A running
 * total of rows touched divided by a count of sessions is an average nobody
 * asked for, and ADR-0092 §9 admits only totals of what the entries already say
 * while they last. The correction figures are read off the entries, by a person,
 * in a review — which is the only reading this channel was built for.
 *
 * Written out as one literal array rather than composed from {@link
 * MODEL_OUTCOMES}, because ADR-0092 §2 needs the counter names as a literal
 * type: that is what bounds the stored key space and what makes {@link
 * tallyModelSession} fail to compile if it ever names something undeclared.
 */
const MODEL_COUNTERS = [
  "outcome_ok",
  "outcome_unreachable",
  "outcome_exhausted",
  "outcome_unusable",
  "outcome_refused",
  SAVED_COUNTER,
] as const;

/** One counter's name, as the declaration bounds it. */
export type ModelCounter = (typeof MODEL_COUNTERS)[number];

/**
 * What one entry adds to the counters.
 *
 * The outcome name is a template literal over the entry's own enum, so the
 * compiler — not a reviewer — is what holds it inside {@link MODEL_COUNTERS}:
 * adding a sixth outcome without a counter for it stops this file compiling.
 */
function tallyModelSession(entry: ModelLogEntry): readonly ModelCounter[] {
  const counters: ModelCounter[] = [`outcome_${entry.outcome}`];
  if (entry.saved) counters.push(SAVED_COUNTER);
  return counters;
}

// ---------------------------------------------------------------------------
// The channel
// ---------------------------------------------------------------------------

function isMember<T extends string>(
  values: readonly T[],
  raw: unknown
): raw is T {
  return typeof raw === "string" && (values as readonly string[]).includes(raw);
}

/**
 * Reads one stored record.
 *
 * Every field but `corrected` is required, and every enum is checked against its
 * declaration: there is nothing a reader can usefully do with a session missing
 * its outcome or its model. `corrected` is optional because its absence is
 * meaningful — it says the read did not succeed, or the form was never saved.
 *
 * An unreadable record is kept, disclosed as a count, and removed only by the
 * cap or `Clear` — `parse` is not a deletion authority (ADR-0092 §3.1).
 */
function parseModelLogEntry(raw: unknown): ModelLogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { outcome, model, images, saved, corrected, at } = raw as {
    outcome?: unknown;
    model?: unknown;
    images?: unknown;
    saved?: unknown;
    corrected?: unknown;
    at?: unknown;
  };
  if (!isMember(MODEL_OUTCOMES, outcome)) return null;
  if (!isMember(MODEL_IDS, model)) return null;
  if (typeof images !== "number" || typeof saved !== "boolean") return null;
  if (typeof at !== "number") return null;
  if (corrected !== undefined && typeof corrected !== "number") return null;
  const entry: ModelLogEntry = { outcome, model, images, saved, at };
  if (typeof corrected === "number") entry.corrected = corrected;
  return entry;
}

/** ADR-0115 §11's record, as the facility's fourth channel. */
export const MODEL_CHANNEL = defineChannel({
  name: "model",
  // Food's: the label read is a food act, and this is the domain whose Facet —
  // Rations — governs the channel's export and takes it in a Facet-scoped wipe
  // (ADR-0092 §13). It is also the whole reason `app` was refused.
  domain: "food",
  purpose:
    "this device's owner; whether reading a label from a photo works on the labels in this kitchen, and what was corrected when it did.",
  // **Set by measurement, not by ADR-0115 §11's inherited figure.** That section
  // says "about a third of the 42.9 KiB of headroom ADR-0092 §8.1 already
  // prices" at a cap of 100, inheriting both numbers from #480 — and both are
  // wrong. ADR-0092's Amendment of 2026-09-05 corrected the headroom to **15.6
  // KiB**, saying in terms that a fourth channel is now "a decision about the
  // caps rather than an addition to them"; and this record is dearer than the
  // ~130 B that section assumed, because the model id is 38 characters. At 100
  // this channel would sit within a rounding error of the whole remaining
  // budget. 50 sessions is still weeks of real use at a handful of label reads
  // a day, and `log-budget.test.ts` weighs what this actually costs.
  cap: 50,
  // The shape above, as it stands. It moves under `ledger-export.ts`'s rule —
  // when a reader written against the previous version would misread a newer
  // record — per channel, so a change here never invalidates `scan`'s.
  version: 1,
  counters: MODEL_COUNTERS,
  tally: tallyModelSession,
  parse: parseModelLogEntry,
});

/**
 * Records a finished session, if it has anything to say.
 *
 * Synchronous and silent, `recordScanSession`'s shape: there is nothing to await
 * and the level is computed from the entry the close just built.
 *
 * `at` is the caller's, per `CODING_STANDARDS.md` §6, with the clock defaulted
 * at this edge so that everything above it is pure.
 */
export function recordModelSession(
  session: ModelSession,
  at: number = Date.now()
): void {
  const entry = closeModelSession(session, at);
  if (entry === null) return;
  appendToChannel(MODEL_CHANNEL, entry, modelSessionLevel(entry));
}
