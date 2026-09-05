import {
  appendToChannel,
  defineChannel,
  SEVERITY,
  type SeverityNumber,
} from "./log-facility";

/**
 * The scan channel (ADR-0071): what one barcode lookup against Open Food Facts
 * leaves behind.
 *
 * Two readers want it, and they want it for different lengths of time.
 * [#208](https://github.com/palebluebytes/inventoria/issues/208) wants a number
 * once — whether #204 actually closed the door that manufactures poisoned
 * `gtin:` twins, which is not knowable from the code because the `unreachable`
 * state *offers* a retry and does not compel one. The device's owner wants an
 * ongoing answer to "does the scan work", which is what
 * `views/logs/ScanReport.svelte` renders off the counters below.
 *
 * **This is not telemetry**, on the terms `search-log.ts` states and ADR-0092
 * §11 holds structurally: no transport, no aggregation, and the one way out is
 * a file the owner exports after reading it.
 *
 * Five things about the shape are easy to get wrong and are asserted in
 * `scan-log.test.ts`:
 *
 * - **One entry per scan session, never one per lookup — and never one per
 *   *field*.** ADR-0053 §2's unit, kept for a different reason: there the
 *   debounce made one phrase eleven searches, here the fact #208 needs is a
 *   **sequence** — an outcome, and then what the user did about it. A sequence
 *   split across two entries has to be rejoined by a key, the only key available
 *   is the barcode, and §4 forbids it.
 * - **No barcode, and nothing that stands in for one** (§4). Not the product
 *   name, not the brand, not the `gtin:` entity id. Restated by ADR-0092 as a
 *   `purpose` argument rather than a capture-time protection: `search` keeps its
 *   `query` because the vocabulary flags are computed from it and #123 reads it,
 *   and the barcode feeds **no reader at all**, since #208's reading is a counter
 *   reading. Every field below is one of three closed enums, a boolean and a
 *   clock, so there is nowhere for one to ride.
 * - **A local twin is not a scan session.** {@link ScanSession} opens when the
 *   OFF lookup starts, so a barcode the ledger already holds — which
 *   short-circuits before OFF is reached — records nothing. That is the right
 *   population for every rate this channel can be asked, because
 *   {@link ScanAttempt} and {@link ScanOutcome} are both facts about an ask that
 *   happened; it is the wrong one for "how often does somebody scan", which
 *   nothing here answers.
 * - **`settled` is derived, never carried.** The search channel had to resolve
 *   its own `settled` flag *before* the field it read was cleared, or every
 *   cleared session read as abandoned mid-word. Here there is no live state to
 *   race: a session settled iff it reached one of ADR-0071 §2's endings, and
 *   both endings are already recorded — a door, or the staging that follows
 *   `found` unconditionally. See {@link settledScan}.
 * - **An abandoned session is still recorded**, with `settled` false, and is
 *   excluded from the two counters #208 reads. It is what tells "the user gave
 *   up on an outage" from "the user hand-typed the pack anyway", which is the
 *   whole distinction that ticket turns on.
 */

// ---------------------------------------------------------------------------
// The vocabulary (ADR-0071 §3)
// ---------------------------------------------------------------------------

/**
 * How the lookup ended, in
 * [#204](https://github.com/palebluebytes/inventoria/issues/204)'s classes named
 * directly.
 *
 * **Never restated as a second list of HTTP statuses.** The point of that
 * taxonomy is that one function decides it — `serviceDidNotAnswer` in
 * `open-food-facts.ts` — and `scanOutcomeOf` in `food/off-retry.ts` reads the
 * error classes that function produces rather than the statuses behind them. A
 * second list here would be free to disagree with it.
 *
 * **`refused` is wider than its name and than ADR-0071 §3's gloss of it.** §3
 * calls it "the 400/403 class #204 deliberately kept out of failed-to-answer",
 * and it is also where a transport-level rejection lands — the offline scan,
 * where nothing was asked at all. Both reach the app by one route (a plain
 * `Error` that is neither of the two named classes) and the app shows one banner
 * for both, so splitting them here would be this channel inventing a distinction
 * the code it observes does not make. The cost is real and is named rather than
 * hidden: an offline scan is recorded at ERROR beside a 403, and ADR-0092 §5.2's
 * reason for putting `refused` there — "an outage is the network's and a 403 is
 * ours" — is the one thing that does not transfer. Widening §3's field set is an
 * amendment to that record, not a build-time call.
 */
export type ScanOutcome = "found" | "absent" | "unreachable" | "refused";

/** Every {@link ScanOutcome}, in the order the report presents them. */
export const SCAN_OUTCOMES = [
  "found",
  "absent",
  "unreachable",
  "refused",
] as const;

/**
 * How many times the lookup asked, and why it stopped asking.
 *
 * `gate_skipped` is
 * [#206](https://github.com/palebluebytes/inventoria/issues/206)'s retry
 * deadline declining to start a second ask. This field is the only thing that
 * makes a transient failure the retry absorbed visible at all, since by design
 * the user never saw one.
 *
 * Declared here rather than in `food/off-retry.ts`, which is the module that
 * decides it: that module's import closure reaches `fetch`, and
 * `scripts/log-egress-check.mjs` holds that no module under `src/lib/logs/`
 * does. So the vocabulary lives on the log's side of the seam and the policy
 * imports it, which is the direction every other food-to-log import already
 * runs.
 */
export type ScanAttempt = "single" | "retried" | "gate_skipped";

/** Every {@link ScanAttempt}, in the order the report presents them. */
export const SCAN_ATTEMPTS = ["single", "retried", "gate_skipped"] as const;

/**
 * Which capture door the user opened after the outcome above, in this session,
 * or `none` for a session that opened no door.
 *
 * The three named doors are `FoodStager`'s `CaptureReason` less `edit`, which is
 * the fourth, non-scan door: it re-opens the form on a twin that was already
 * saved, so it belongs to no lookup.
 *
 * **The pair (outcome, door) is what #208 reads**, which is why they share one
 * entry: a capture opened after `unreachable` is the poisoned twin that ticket
 * is about, and one opened after `absent` is the missing-barcode door working
 * exactly as designed.
 */
export type ScanDoor = "missing" | "poor" | "unreadable" | "none";

/** Every {@link ScanDoor}, in the order the report presents them. */
export const SCAN_DOORS = ["missing", "poor", "unreadable", "none"] as const;

/** One recorded scan session (ADR-0071 §3). */
export interface ScanLogEntry {
  outcome: ScanOutcome;
  attempt: ScanAttempt;
  door: ScanDoor;
  /** Whether the session reached one of ADR-0071 §2's three endings. */
  settled: boolean;
  at: number;
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/**
 * A scan session in progress: it opens when a barcode lookup starts and ends
 * when the user stages a food, opens a capture door, or leaves the scan without
 * doing either (ADR-0071 §2).
 *
 * Held as data and advanced by the pure functions below rather than by a running
 * object, so "one entry per session" is asserted as a fold over what happened
 * rather than through a component's lifecycle — `search-log.ts`'s arrangement,
 * for its reasons.
 *
 * **Both fields start `null` and only one of them can stay that way.** A session
 * whose lookup never answered — the sheet closed mid-fetch — is not a settled
 * anything and leaves no entry, exactly as a search visit that never completed a
 * search leaves none.
 */
export interface ScanSession {
  /** What the lookup answered, or `null` while it is still in flight. */
  outcome: ScanOutcome | null;
  /** What the retry policy reported, or `null` before it reported. */
  attempt: ScanAttempt | null;
  door: ScanDoor;
}

/** Opens a session. The lookup is about to be asked. */
export function beginScanSession(): ScanSession {
  return { outcome: null, attempt: null, door: "none" };
}

/**
 * The retry policy reported how many times it asked.
 *
 * It arrives from an observer rather than from the lookup's return value,
 * because the policy returns a payload or throws and neither path can carry a
 * third thing without changing what every existing caller reads.
 */
export function scanAttempted(
  session: ScanSession,
  attempt: ScanAttempt
): ScanSession {
  return { ...session, attempt };
}

/** The lookup answered, one way or the other. */
export function scanAnswered(
  session: ScanSession,
  outcome: ScanOutcome
): ScanSession {
  return { ...session, outcome };
}

/**
 * The user opened a capture door.
 *
 * The **last** door wins, which is the one the session ended on. Re-entering a
 * door already open is the same door, and a second different one would mean the
 * user backed out of the first — in which case what they finished on is what
 * this session did.
 */
export function scanOpenedDoor(
  session: ScanSession,
  door: ScanDoor
): ScanSession {
  return { ...session, door };
}

/**
 * Whether a session reached one of ADR-0071 §2's three endings — staging a food
 * or opening a capture door — as opposed to being left.
 *
 * **Derived rather than flagged, and that is the whole of the abandoned
 * ending.** A door is an ending by definition. `found` is the other one: the
 * scan stages the food it looked up, unconditionally and in the same statement
 * that reads the payload, so an answered lookup and a staged food are one event
 * and there is no state to keep in step. Everything else — the `unreachable`
 * banner the user walked away from, the fault they dismissed, the lookup that
 * never answered — reached no ending, and says so.
 *
 * Note what it does **not** claim: staging is the ending, not logging. A user
 * who stages a food and then closes the sheet without logging it settled the
 * scan; whether they ate it is the ledger's business and not this channel's.
 */
export function settledScan(outcome: ScanOutcome, door: ScanDoor): boolean {
  return door !== "none" || outcome === "found";
}

/**
 * The one entry a finished session leaves, or `null` for a session that has
 * nothing to say.
 *
 * `null` covers two cases and they are one rule — **an entry states what the
 * lookup did, so a lookup that did not report leaves none.** A session whose
 * `outcome` is still `null` never got an answer. A session with an outcome and
 * no `attempt` cannot arise through `lookupBarcodeWithRetry`, which reports in a
 * `finally` and so reports on every path; if one ever does, the honest answer is
 * no record rather than an invented `single`.
 */
export function closeScanSession(
  session: ScanSession,
  at: number
): ScanLogEntry | null {
  const { outcome, attempt, door } = session;
  if (outcome === null || attempt === null) return null;
  return { outcome, attempt, door, settled: settledScan(outcome, door), at };
}

// ---------------------------------------------------------------------------
// The level (ADR-0092 §5.2)
// ---------------------------------------------------------------------------

/**
 * What level a finished session is recorded at.
 *
 * | Session                      | Level        |
 * | ---------------------------- | ------------ |
 * | `refused`                    | **ERROR 17** |
 * | `unreachable`                | **WARN 13**  |
 * | `absent`                     | **WARN 13**  |
 * | `found`                      | **INFO 9**   |
 * | abandoned (`settled: false`) | **INFO 9**   |
 *
 * `absent` sits at WARN rather than INFO for consistency with an empty search:
 * the reference data does not have what the user asked for and they now have
 * manual work. `refused` sits above `unreachable` because an outage is the
 * network's and a 403 is ours.
 *
 * **The abandoned row wins over the outcome row, and that is a decision rather
 * than a reading of the table.** Taken from ADR-0092 §5.2 as written and from
 * `searchSessionLevel`, which resolves the same way — an abandoned search is
 * INFO whatever it found. The argument against it is real and is recorded here
 * rather than acted on: a `refused` the user then walked away from is still the
 * app failing at something they asked for, and at the *Errors & warnings* dial
 * position it is now not captured. What that costs is bounded, because the
 * counters run above the dial's gate (ADR-0092 §9): the **rate** of abandoned
 * failures survives at every position, and only the individual records go. If
 * that trade is wrong it is wrong in ADR-0092 §5.2, which is where the table
 * lives.
 *
 * This channel has **no DEBUG field at all**, so `Noisy` writes for it exactly
 * what `Normal` writes. The natural candidates would be the raw HTTP status or
 * the retry timing, and ADR-0092 added neither: ADR-0071 §3's field set is
 * closed.
 */
export function scanSessionLevel(entry: ScanLogEntry): SeverityNumber {
  if (!entry.settled) return SEVERITY.INFO;
  if (entry.outcome === "refused") return SEVERITY.ERROR;
  if (entry.outcome === "found") return SEVERITY.INFO;
  return SEVERITY.WARN;
}

// ---------------------------------------------------------------------------
// The counters (ADR-0071 §5, ADR-0092 §9)
// ---------------------------------------------------------------------------

/**
 * The counter every settled session adds to — ADR-0071 §5's "one for settled
 * sessions", and #208's denominator.
 */
const SETTLED_COUNTER = "settled";

/**
 * The one counter that is not a plain field tally: settled sessions whose
 * outcome was `unreachable` and whose door was not `none`.
 *
 * A pair of fields rather than one, which is why {@link LogChannel.tally} is
 * handed the whole entry. It is still a running total of what ADR-0071 §3
 * already records, so ADR-0092 §9's rule holds — no counter here measures
 * anything the entries did not say while they lasted.
 *
 * **This is the number #208 reads**, at the bar ADR-0071 §5 pinned before the
 * channel existed: #204 did *not* close the door at 5 or more of these, and it
 * *did* at 40 settled sessions with fewer than 5.
 */
const UNREACHABLE_THEN_DOOR_COUNTER = "unreachable_then_door";

/**
 * Every counter this channel keeps: one per value of each of the three enums,
 * one for settled sessions, and the pair above. Nothing else (ADR-0071 §5).
 *
 * **Prefixed by the field they total**, which is not decoration: `unreachable`
 * is an outcome and `unreadable` is a door, and two counters whose names differ
 * by one letter in the middle are two numbers somebody will read the wrong way
 * round on a screen or in an exported file.
 *
 * Written out as one literal array rather than composed from the three arrays
 * above, because ADR-0092 §2 needs the counter names as a literal type — that is
 * what bounds the stored key space and what makes {@link tally} below fail to
 * compile if it ever names something undeclared.
 */
const SCAN_COUNTERS = [
  "outcome_found",
  "outcome_absent",
  "outcome_unreachable",
  "outcome_refused",
  "attempt_single",
  "attempt_retried",
  "attempt_gate_skipped",
  "door_missing",
  "door_poor",
  "door_unreadable",
  "door_none",
  SETTLED_COUNTER,
  UNREACHABLE_THEN_DOOR_COUNTER,
] as const;

/** One counter's name, as the declaration bounds it. */
export type ScanCounter = (typeof SCAN_COUNTERS)[number];

/**
 * What one entry adds to the counters.
 *
 * The three prefixed names are template literals over the entry's own enums, so
 * the compiler — not a reviewer — is what holds them inside
 * {@link SCAN_COUNTERS}: adding a fifth outcome without a counter for it stops
 * this file compiling.
 *
 * **The two #208 reads are the only conditional ones**, and both require
 * `settled`. An abandoned session still counts its outcome, its attempt and its
 * door, because those things happened; it is excluded from the denominator and
 * from the pair, because it reached no ending and #208's question is about what
 * users *did*.
 */
function tallyScanSession(entry: ScanLogEntry): readonly ScanCounter[] {
  const counters: ScanCounter[] = [
    `outcome_${entry.outcome}`,
    `attempt_${entry.attempt}`,
    `door_${entry.door}`,
  ];
  if (!entry.settled) return counters;
  counters.push(SETTLED_COUNTER);
  if (entry.outcome === "unreachable" && entry.door !== "none")
    counters.push(UNREACHABLE_THEN_DOOR_COUNTER);
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
 * Reads one stored record. Every field is required and every enum is checked
 * against its declaration, because there is nothing here a reader can usefully
 * do with a partial session: a record missing its door is a session whose ending
 * is unknown, and counting it either way would be the parse inventing the fact
 * the entry exists to carry.
 *
 * An unreadable record is kept, disclosed as a count, and removed only by the
 * cap or `Clear` — `parse` is not a deletion authority (ADR-0092 §3.1).
 */
function parseScanLogEntry(raw: unknown): ScanLogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { outcome, attempt, door, settled, at } = raw as {
    outcome?: unknown;
    attempt?: unknown;
    door?: unknown;
    settled?: unknown;
    at?: unknown;
  };
  if (!isMember(SCAN_OUTCOMES, outcome)) return null;
  if (!isMember(SCAN_ATTEMPTS, attempt)) return null;
  if (!isMember(SCAN_DOORS, door)) return null;
  if (typeof settled !== "boolean" || typeof at !== "number") return null;
  return { outcome, attempt, door, settled, at };
}

/** ADR-0071's record, as the facility's second channel (ADR-0092 §1). */
export const SCAN_CHANNEL = defineChannel({
  name: "scan",
  // Food's: the barcode lookup is a food act, and this is the domain whose
  // Facet — Rations — governs the channel's export and takes it in a
  // Facet-scoped wipe (ADR-0092 §13).
  domain: "food",
  purpose:
    "#208, and this device's owner; how often a barcode reaches Open Food Facts and what was captured by hand when it did not.",
  // ADR-0092 §7's cap for this channel, priced in §8.1's table at 200 × 124 B.
  cap: 200,
  // The shape above, as it stands. It moves under `ledger-export.ts`'s rule —
  // when a reader written against the previous version would misread a newer
  // record — per channel, so a change to `search` never invalidates these.
  version: 1,
  counters: SCAN_COUNTERS,
  tally: tallyScanSession,
  parse: parseScanLogEntry,
});

/**
 * Records a finished session, if it has anything to say.
 *
 * Synchronous and silent, unlike `recordSearchSession`: there is no corpus to
 * read and therefore nothing to await, and the level is computed from the entry
 * the close just built.
 *
 * `at` is the caller's, per `CODING_STANDARDS.md` §6, with the clock defaulted
 * at this edge so that everything above it is pure.
 */
export function recordScanSession(
  session: ScanSession,
  at: number = Date.now()
): void {
  const entry = closeScanSession(session, at);
  if (entry === null) return;
  appendToChannel(SCAN_CHANNEL, entry, scanSessionLevel(entry));
}

// ---------------------------------------------------------------------------
// The reading (ADR-0071 §6)
// ---------------------------------------------------------------------------

/**
 * One counter as the view shows it: what it is called, what it holds, and what
 * share of the sessions it is.
 *
 * `share` is `null` rather than zero when nothing has been counted, because a
 * proportion of no sessions is not 0% — and a view that drew 0% over an empty
 * channel would be stating a rate it does not have, which is the failure
 * ADR-0092 §9's epoch exists to prevent one file along.
 */
export interface ScanShare {
  name: ScanCounter;
  /** What the view calls it. Prose, never the counter's own name. */
  label: string;
  count: number;
  /** `count / sessions`, or `null` before there are any sessions. */
  share: number | null;
}

/**
 * The counters folded into what ADR-0071 §6's view shows: counts, and the same
 * counts as proportions.
 *
 * **The denominator is the sum of the four outcome counters**, which is every
 * session this channel has recorded, settled or not. It is exact rather than
 * approximate: each session contributes to exactly one of them, so nothing is
 * double-counted and nothing is missed. `settled` is deliberately **not** the
 * denominator — a rate over settled sessions alone would hide exactly the
 * sessions somebody gave up on, which is the population #208 came for.
 *
 * Pure, over the counts a caller read, so the whole of the reading is testable
 * without a store or a screen.
 */
export interface ScanReport {
  /** Every session counted. The denominator every share below is taken over. */
  sessions: number;
  outcomes: ScanShare[];
  attempts: ScanShare[];
  doors: ScanShare[];
  /** Sessions that reached one of ADR-0071 §2's endings. */
  settled: ScanShare;
  /** #208's number: settled `unreachable` sessions that ended in a door. */
  unreachable_then_door: ScanShare;
}

/**
 * What each counter is called on screen.
 *
 * The prose lives beside the vocabulary rather than in the component, because it
 * is a statement about what the field means and this module is where every other
 * such statement already is. A second list in a Svelte file is a second place
 * for a name to drift from the enum it renders.
 *
 * **`unreachable` is worded as silence, not as a cause.** ADR-0071's
 * Consequences name the hazard: a run of them says the service did not answer
 * *this device*, and the channel records nothing that would tell an OFF outage
 * from a dead network or a captive portal. "Open Food Facts was down" is a
 * conclusion the view is not entitled to.
 */
const SCAN_LABELS: Record<ScanCounter, string> = {
  outcome_found: "Found in Open Food Facts",
  outcome_absent: "Not in Open Food Facts",
  outcome_unreachable: "No answer",
  outcome_refused: "Could not ask",
  attempt_single: "Asked once",
  attempt_retried: "Asked twice",
  attempt_gate_skipped: "Too slow to ask again",
  door_missing: "Typed in a missing product",
  door_poor: "Filled in a thin record",
  door_unreadable: "Typed in an unscannable label",
  door_none: "No form opened",
  settled: "Ended in a food or a form",
  unreachable_then_door: "Typed in after no answer",
};

function shareOf(
  counts: Record<string, number>,
  name: ScanCounter,
  sessions: number
): ScanShare {
  const count = counts[name] ?? 0;
  return {
    name,
    label: SCAN_LABELS[name],
    count,
    share: sessions === 0 ? null : count / sessions,
  };
}

/** The fold {@link ScanReport} describes. */
export function scanReport(counts: Record<string, number>): ScanReport {
  const sessions = SCAN_OUTCOMES.reduce(
    (total, outcome) => total + (counts[`outcome_${outcome}`] ?? 0),
    0
  );
  const share = (name: ScanCounter) => shareOf(counts, name, sessions);
  return {
    sessions,
    outcomes: SCAN_OUTCOMES.map((outcome) => share(`outcome_${outcome}`)),
    attempts: SCAN_ATTEMPTS.map((attempt) => share(`attempt_${attempt}`)),
    doors: SCAN_DOORS.map((door) => share(`door_${door}`)),
    settled: share(SETTLED_COUNTER),
    unreachable_then_door: share(UNREACHABLE_THEN_DOOR_COUNTER),
  };
}
