import { stemOf, wordsOf } from "../food/reference-food-ranking";
import {
  appendToChannel,
  capturedAt,
  defineChannel,
  SEVERITY,
  type SeverityNumber,
} from "./log-facility";

/**
 * The search channel (ADR-0053): what one visit to the reference-food search
 * leaves behind. The bar it feeds is read off an export, not in the app — see
 * the note at the foot of this module.
 *
 * Three open questions want the same fact and none of them can get it. #142 asks
 * whether anyone types a vocabulary synonym INSIDE a longer phrase; its sweep
 * measured what such a tier could reach and says in its own §6 that it cannot
 * measure usage. #123 wants to know which foods users actually miss. And
 * ADR-0049's Consequences concede that its shipped fallback's 425 keys are
 * "reach, not usage". One local record answers all three.
 *
 * **This is not telemetry.** Nothing is transmitted, nothing is aggregated
 * off-device, and nothing leaves except through the hand-export ADR-0054 §4
 * governs. It is a record on the device of the person who typed it, kept beside
 * an eating history that is far more sensitive and kept without a toggle for the
 * same reason: on a local-first app a local record is state, and the disclosure
 * is the export.
 *
 * Four things about the shape are easy to get wrong and are asserted in
 * `search-log.test.ts`:
 *
 * - **One entry per session, never one per search.** The search fires on a
 *   120 ms debounce from three characters up, so `raw aubergine` produces about
 *   eleven searches, ten of them keystroke states (§2).
 * - **Every settled session leaves one, not only the empty ones** (ADR-0053's
 *   Amendment of 2026-09-03). A search that found its food used to leave no
 *   trace at all, so §7's counts had no denominator and no rate was measurable.
 * - **Only a genuine no-food is `nothing`.** `searchUsdaFoods` throws
 *   `NoReferenceFoodError` when nothing matched and a plain `Error` for a fault;
 *   a log that folded both into one outcome would count an offline corpus fetch
 *   as a vocabulary miss (§3). That distinction is the CALLER's to keep — this
 *   module is only ever told what happened. A fault leaves no fire and no
 *   outcome, so a session of nothing but faults records nothing.
 * - **What ADR-0053 §7's bar counts is an allow-list**, and
 *   {@link isSettledEmptySession} is where that is held. Written the other way
 *   round — settled and not `rescued_by_vocabulary` — a fourth outcome walks
 *   straight into the denominator.
 */

// ---------------------------------------------------------------------------
// What one session leaves behind
// ---------------------------------------------------------------------------

/**
 * Which subset a flagged vocabulary key belongs to: keys whose expansions are
 * all single tokens, and keys carrying at least one multi-token expansion.
 *
 * Both are flagged. The sweep's §7.3 excluded the second bucket on the grounds
 * that a multi-token value is "a phrase substitution, which is a different and
 * larger mechanism", which conflates the arity of the key with the arity of the
 * value — replacing `chilli` with `chili pepper` is one substitution. Recording
 * which bucket a key falls in is what lets the evidence be read at either
 * boundary without a second collection window (ADR-0053 §4).
 */
export type VocabularyBucket = "single_token_value" | "multi_token_value";

/**
 * One vocabulary key an empty query contained, and its subset.
 *
 * `bucket` is a **code, not a discriminant** (#215 §5): it decides nothing about
 * what other fields this record has, so it is narrow where it is written — the
 * literal union above — and wide where it is stored. A record naming a bucket
 * this build has not heard of is still a record of a key that was hit, and
 * costing the whole entry for it would be `parse` acting as a deletion
 * authority over a field it does not need to understand.
 */
export interface VocabularyKeyHit {
  key: string;
  bucket: string;
}

/** What the Vocabulary map had to say about one empty query. */
export interface SearchVocabularyFlags {
  /**
   * The single-token keys the query carried as one token among several — the
   * population #142's unbuilt per-token tier would act on. Empty for a query
   * that IS a key, because that one expands today.
   */
  mid_phrase: VocabularyKeyHit[];
  /** The Search index `schema_version` these flags were computed against. */
  schema_version: number;
}

/**
 * How a session ended.
 *
 * A union rather than a string plus an optional field, so the correcting text
 * cannot go missing from the one outcome that has one — it is the half of the
 * entry that makes a saved retry observable rather than inferred.
 *
 * **`found` is the member ADR-0053's Amendment of 2026-09-03 adds**, and it is
 * what gives §7's counts a denominator: before it, a session that found its food
 * left nothing behind, so the empty sessions were a numerator over a population
 * nobody could see. It carries no text of its own — the query is already the
 * entry's — because a successful search is only interesting as a count.
 */
export type SearchOutcome =
  | { kind: "nothing" }
  | { kind: "rescued_by_vocabulary" }
  | { kind: "found" }
  | { kind: "resolved_after_correction"; corrected_by: string };

/**
 * One debounced search on the way to the final query, as ADR-0092 §7 stores it.
 *
 * **`{ l, n }` is the normal form**: the prefix length and the result count. It
 * is lossless, because the query is already in the record and the reader
 * reconstructs `query.slice(0, l)`. `{ q, n }` is the fallback for a fire that
 * is NOT a prefix of the final query — a paste, or an edit in the middle of the
 * string — and it is the only shape that has to spend the text again.
 *
 * The sequence used to be the query text twenty times over, which is what made
 * §8's invariant impossible to state: at `{ q, n }` throughout, a forty-character
 * query costs 306 KiB at cap 200, or 120% of the whole facility's budget.
 */
export type SearchFire = { l: number; n: number } | { q: string; n: number };

/**
 * The fires of one session, kept **inside the one session record** so that one
 * record stays one session — which is what keeps ADR-0053 §2's unit, the entry
 * count, the redaction and the export all meaning what they mean.
 *
 * `fires_dropped` is not a sibling field on the entry, and that is deliberate:
 * the two must arrive together or a reader takes a truncated sequence for a
 * complete one, which is exactly the confusion the count exists to prevent. It
 * is the same argument {@link SearchOutcome} is a union for. ADR-0092 §7 names
 * the integer and does not place it, so the wrapper costs thirteen bytes and
 * makes the pairing something the type holds rather than something `parse` has
 * to remember.
 */
export interface SearchFireSequence {
  /** The retained fires, oldest first: the first 3 and the last 7 (§7). */
  fires: SearchFire[];
  /**
   * How many fires the rule above dropped from the middle — four bytes at zero,
   * and the only thing that tells a marathon session from an ordinary one. The
   * reader is a person holding a JSON file with no access to the rule that
   * produced it.
   */
  fires_dropped: number;
}

/** One recorded search session (ADR-0053 §3). */
export interface SearchLogEntry {
  /**
   * The final text the session settled on, bounded at
   * {@link QUERY_MAX_CHARS} characters **at capture**.
   */
  query: string;
  outcome: SearchOutcome;
  /** False when the session was abandoned mid-word, so it leaves the denominator. */
  settled: boolean;
  /**
   * True when any query text in this record was shortened to fit §7's bound —
   * {@link query}, an outcome's `corrected_by`, or a fire's `q`.
   *
   * **One flag for all of them**, rather than one per string: what a reader
   * needs is to stop taking the strings in this record as literal, and which of
   * three fields was cut changes nothing they would do about it. It is present
   * on every record, false included, because a flag that appears only when it
   * fires is a flag the reader has to know to look for.
   */
  query_truncated: boolean;
  vocabulary: SearchVocabularyFlags;
  at: number;
  /**
   * ADR-0092 §7's per-fire sequence, present **only** when the dial sat at
   * `Noisy` when the session opened (ADR-0092 §5.1).
   *
   * Decided at session start rather than filtered at the end: a post-hoc filter
   * would accumulate the array all session and then throw it away, paying the
   * whole cost the gate exists to avoid.
   */
  sequence?: SearchFireSequence;
}

// ---------------------------------------------------------------------------
// The bounds (ADR-0092 §7)
// ---------------------------------------------------------------------------

/**
 * What a recorded query is bounded to, in characters, **at capture and never on
 * the input**.
 *
 * `FoodStager` has no `maxlength` and must not gain one: a user types whatever
 * they like and the search answers it; what is bounded is what gets recorded.
 * Without this a 2,000-character paste is a 50 KB record and §8's invariant
 * cannot be stated at all. 48 is nearly twice the longest realistic food phrase.
 */
export const QUERY_MAX_CHARS = 48;

/** How many of a session's opening fires it keeps (ADR-0092 §7). */
const FIRES_KEPT_FIRST = 3;
/**
 * How many of its closing fires it keeps. The sequence's job is how the query
 * started and what it was doing when it settled; the middle is the least
 * informative part of it.
 */
const FIRES_KEPT_LAST = 7;

// ---------------------------------------------------------------------------
// The flags
// ---------------------------------------------------------------------------

/**
 * What the Vocabulary map says about one query. Pure, and the only reader of the
 * map on this side.
 *
 * **Stem-matched, never prefix-matched.** The shipped whole-phrase tier
 * prefix-matches so that `aubergin` reaches `aubergine` mid-keystroke; a
 * mid-phrase prefix substitution is a mechanism nobody has proposed, and an
 * instrument must not quietly build a case for one (ADR-0053 §4).
 *
 * **Single-token keys only.** A multi-token key needs a windowed match, which is
 * the genuinely different mechanism.
 *
 * The query is read with `wordsOf`/`stemOf`, the app's one tokeniser, for the
 * reason #136 established: a key compared against tokens some other function
 * produced is a key that silently stops matching.
 */
export function flagVocabulary(
  query: string,
  vocabulary: Record<string, string[]>,
  schema_version: number
): SearchVocabularyFlags {
  const typed = wordsOf(query);
  const mid_phrase: VocabularyKeyHit[] = [];
  // One token is the whole query, and a query that IS a key expands already.
  if (typed.length > 1) {
    const stems = new Set(typed.map(stemOf));
    for (const [key, expansions] of Object.entries(vocabulary)) {
      const keyWords = wordsOf(key);
      if (keyWords.length !== 1) continue;
      if (!stems.has(stemOf(keyWords[0]))) continue;
      // Typed to the union at the write boundary, which is where the narrowing
      // belongs — the field it lands in is a plain string.
      const bucket: VocabularyBucket = expansions.every(
        (phrase) => wordsOf(phrase).length === 1
      )
        ? "single_token_value"
        : "multi_token_value";
      mid_phrase.push({ key, bucket });
    }
  }
  return { mid_phrase, schema_version };
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/**
 * A search session in progress: it begins when the food search field first goes
 * non-empty and ends when the user abandons it, clears it, or stages a food.
 *
 * Held as data and advanced by the pure functions below rather than by a running
 * object, so "one entry per session" is asserted as a fold over what happened
 * rather than through a component's lifecycle.
 */
export interface SearchSession {
  /** The trimmed text the field holds now. */
  query: string;
  /** The last query a completed search found no food for. */
  empty_query: string | null;
  /** The first query that answered after {@link empty_query}. */
  corrected_by: string | null;
  /** The last query the Vocabulary map answered in the typed word's place. */
  rescued_query: string | null;
  /** The last query a completed search answered outright. */
  found_query: string | null;
  /**
   * The fires so far as they happened, or **`null` when the dial sat below
   * DEBUG at session start** — which is not the same as an empty array, and the
   * difference is the whole point of deciding at the start (ADR-0092 §7).
   *
   * Held as text and encoded to {@link SearchFire} at close, because a fire is
   * `{ l, n }` relative to a final query the session does not know yet.
   */
  fires: SearchFireRecord[] | null;
  /** How many fires the retention rule has already dropped from the middle. */
  fires_dropped: number;
}

/** One fire as it happened, before the close knows what to encode it against. */
export interface SearchFireRecord {
  query: string;
  /** How many reference foods it returned. Zero is the empty result. */
  n: number;
}

/**
 * Opens a session. The field has just gone non-empty.
 *
 * `captureFires` is read from the dial here and nowhere else, and it is a
 * parameter so the impurity has a seam: the whole of the session's advance below
 * is pure, exactly as {@link recordSearchSession} keeps the clock and the corpus
 * at its own edge.
 */
export function beginSearchSession(
  captureFires: boolean = capturedAt(SEVERITY.DEBUG)
): SearchSession {
  return {
    query: "",
    empty_query: null,
    corrected_by: null,
    rescued_query: null,
    found_query: null,
    fires: captureFires ? [] : null,
    fires_dropped: 0,
  };
}

/**
 * Adds one settled search to the sequence, applying §7's retention as it goes.
 *
 * **Eagerly rather than at close**, because a session is a live object in a
 * component: a marathon session that accumulated every fire and trimmed at the
 * end would hold the whole timeline in memory to throw most of it away, which is
 * the same cost the start-time gate exists to avoid.
 */
function withFire(
  session: SearchSession,
  query: string,
  n: number
): SearchSession {
  if (session.fires === null) return session;
  const fires = [...session.fires, { query: query.trim(), n }];
  if (fires.length <= FIRES_KEPT_FIRST + FIRES_KEPT_LAST)
    return { ...session, fires };
  // The oldest of the tail is what goes: the opening three are kept whole.
  fires.splice(FIRES_KEPT_FIRST, 1);
  return { ...session, fires, fires_dropped: session.fires_dropped + 1 };
}

/**
 * The field's text changed. Only non-empty text is ever typed in: clearing the
 * field ENDS the session, and the state it ends in has to be the state it had
 * when the user gave up on it, or every cleared session would read as abandoned
 * mid-word.
 */
export function typedIntoSession(
  session: SearchSession,
  text: string
): SearchSession {
  return { ...session, query: text.trim() };
}

/**
 * A completed search found no reference food. Called ONLY for
 * `NoReferenceFoodError` — a fault is not an empty result (ADR-0053 §3).
 *
 * A later empty query replaces an earlier one and clears the correction with it:
 * the entry holds the last text that returned nothing, and a correction that
 * preceded it corrected something else.
 */
export function searchFoundNothing(
  session: SearchSession,
  query: string
): SearchSession {
  return {
    ...withFire(session, query, 0),
    empty_query: query.trim(),
    corrected_by: null,
  };
}

/** What a search that answered reports back to the session. */
export interface SearchAnswer {
  /**
   * The typed query retrieved nothing and ADR-0049's map answered in its place.
   * The search reports it because nothing downstream can tell.
   */
  rescued_by_vocabulary: boolean;
  /** How many reference foods came back — the fire's `n` (ADR-0092 §7). */
  result_count: number;
}

/**
 * A completed search found food.
 *
 * The FIRST answer after an empty query is the correction, because that is the
 * retry the user made; anything they typed afterwards is browsing. The LAST
 * answer is what a session with no empty at all is recorded under, because that
 * is where the user stopped.
 */
export function searchFoundFood(
  session: SearchSession,
  query: string,
  found: SearchAnswer
): SearchSession {
  const answered = query.trim();
  return {
    ...withFire(session, query, found.result_count),
    corrected_by:
      session.empty_query !== null && session.corrected_by === null
        ? answered
        : session.corrected_by,
    rescued_query: found.rescued_by_vocabulary
      ? answered
      : session.rescued_query,
    found_query: answered,
  };
}

/**
 * The Vocabulary map a session is flagged against, and the corpus version that
 * map came from — the whole of what {@link recordSearchSession} needs of the
 * corpus, named here rather than imported as `SearchCorpus`.
 *
 * **Named rather than imported because a type-only import is still an edge the
 * compiler resolves.** `import type { SearchCorpus }` would put
 * `usda-corpus.ts` — and the `fetch` it owns — back inside this directory's
 * import closure, for a shape two fields wide
 * (`scripts/log-egress-check.mjs`). The real corpus satisfies it structurally,
 * so nothing is asserted at the boundary.
 *
 * It is not called a *fact*, deliberately: `CONTEXT.md` gives that word to a
 * datom, and ADR-0092 §3 puts these records in `localStorage` precisely because
 * they are not one.
 *
 * {@link SearchSessionClose} extends it rather than the other way about, so the
 * dependency runs the way it reads: everything the corpus contributes is
 * something a close needs, while a future close field that comes from somewhere
 * else does not silently become something every caller's corpus must supply.
 */
export interface VocabularyAtCapture {
  vocabulary: Record<string, string[]>;
  schema_version: number;
}

/** What a close needs beyond the session itself: the above, plus the clock. */
export interface SearchSessionClose extends VocabularyAtCapture {
  at: number;
}

/**
 * A value bounded to §7's cap, and whether the bound bit.
 *
 * One contract for all three things the bound is applied to — the query, an
 * outcome's correcting text, and a fire — because the `truncated` half is what
 * `query_truncated` is folded from and a second ad-hoc shape is a half of that
 * fold nobody wired up.
 */
interface Bounded<T> {
  value: T;
  truncated: boolean;
}

/**
 * `text` at {@link QUERY_MAX_CHARS} characters, saying so when it had to cut.
 *
 * The cut never splits a surrogate pair. A lone half is a replacement character
 * in the file somebody reads and six escaped bytes in the budget, which is the
 * wrong way to spend the last character of a bound that exists for both.
 */
function boundQuery(text: string): Bounded<string> {
  if (text.length <= QUERY_MAX_CHARS) return { value: text, truncated: false };
  const last = text.charCodeAt(QUERY_MAX_CHARS - 1);
  const cut =
    last >= 0xd800 && last <= 0xdbff ? QUERY_MAX_CHARS - 1 : QUERY_MAX_CHARS;
  return { value: text.slice(0, cut), truncated: true };
}

/** Which query a finished session is recorded under, and how it ended. */
interface SettledSession {
  /** The final text, before §7's bound is applied to it. */
  query: string;
  outcome: SearchOutcome;
  settled: boolean;
}

/**
 * The one query a session is recorded under, in the order the outcomes outrank
 * each other, or `null` for a session in which no search ever settled.
 *
 * **An empty result the user SAW outranks a rescue, and a rescue outranks a
 * plain success.** The rescue cost them nothing and the empty is what forced a
 * guess; and a rescue is the only usage number ADR-0049's shipped fallback has
 * ever had, so a later ordinary answer must not bury it.
 *
 * `null` is a session in which nothing completed — three characters typed and
 * the sheet closed, or nothing but faults. That is not a settled session, so it
 * is not an entry, and it is what keeps {@link recordSearchSession} from
 * reaching for the corpus on a visit that searched nothing.
 */
function settledSessionOf(session: SearchSession): SettledSession | null {
  if (session.empty_query !== null)
    return {
      query: session.empty_query,
      outcome:
        session.corrected_by !== null
          ? {
              kind: "resolved_after_correction",
              corrected_by: session.corrected_by,
            }
          : { kind: "nothing" },
      settled:
        session.corrected_by !== null || session.query === session.empty_query,
    };
  if (session.rescued_query !== null)
    return {
      query: session.rescued_query,
      outcome: { kind: "rescued_by_vocabulary" },
      settled: session.query === session.rescued_query,
    };
  if (session.found_query !== null)
    return {
      query: session.found_query,
      outcome: { kind: "found" },
      settled: session.query === session.found_query,
    };
  return null;
}

/** The outcome with its own text bounded — which only one member has. */
function boundOutcome(outcome: SearchOutcome): Bounded<SearchOutcome> {
  if (outcome.kind !== "resolved_after_correction")
    return { value: outcome, truncated: false };
  const bounded = boundQuery(outcome.corrected_by);
  return {
    value: { kind: outcome.kind, corrected_by: bounded.value },
    truncated: bounded.truncated,
  };
}

/**
 * The session's fires as ADR-0092 §7 stores them, against the query the record
 * actually carries.
 *
 * The comparison is against the **bounded** query rather than the typed one, so
 * that `query.slice(0, l)` reconstructs a fire exactly from what is in the file.
 * A fire that outgrew the bound therefore reads as a prefix of the bound rather
 * than of anything the reader cannot see.
 */
function encodeFires(
  session: SearchSession,
  recorded: string
): Bounded<SearchFireSequence | null> {
  if (session.fires === null) return { value: null, truncated: false };
  let truncated = false;
  const fires = session.fires.map(({ query, n }): SearchFire => {
    const bounded = boundQuery(query);
    truncated ||= bounded.truncated;
    return recorded.startsWith(bounded.value)
      ? { l: bounded.value.length, n }
      : { q: bounded.value, n };
  });
  return {
    value: { fires, fires_dropped: session.fires_dropped },
    truncated,
  };
}

/**
 * The one entry a finished session leaves, or `null` for a session in which no
 * search ever settled.
 *
 * Where an empty was followed by an answer, the entry holds both halves, which
 * is the saved retry #142 is actually about.
 *
 * `settled` is the entry's own honesty about itself: the recorded query is stale
 * if the user typed past it without letting another search finish, so it says so
 * and ADR-0053 §7's denominator drops it.
 *
 * **The vocabulary flags are computed over the BOUNDED query**, not the typed
 * one. Flagging the full text would put keys in the record that are not in any
 * token of the query beside them, and — the reason it matters more than tidiness
 * — it would leave `mid_phrase` bounded by a paste rather than by §7, which is
 * what §8's invariant has to be computable against.
 */
export function closeSearchSession(
  session: SearchSession,
  close: SearchSessionClose
): SearchLogEntry | null {
  const settled = settledSessionOf(session);
  if (settled === null) return null;
  const query = boundQuery(settled.query);
  const outcome = boundOutcome(settled.outcome);
  const fires = encodeFires(session, query.value);
  return {
    query: query.value,
    outcome: outcome.value,
    settled: settled.settled,
    query_truncated: query.truncated || outcome.truncated || fires.truncated,
    vocabulary: flagVocabulary(
      query.value,
      close.vocabulary,
      close.schema_version
    ),
    at: close.at,
    ...(fires.value === null ? {} : { sequence: fires.value }),
  };
}

// ---------------------------------------------------------------------------
// The channel
// ---------------------------------------------------------------------------

const OUTCOME_KINDS = [
  "nothing",
  "rescued_by_vocabulary",
  "found",
  "resolved_after_correction",
] as const;

function parseOutcome(raw: unknown): SearchOutcome | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { kind, corrected_by } = raw as {
    kind?: unknown;
    corrected_by?: unknown;
  };
  if (typeof kind !== "string") return null;
  if (!(OUTCOME_KINDS as readonly string[]).includes(kind)) return null;
  if (kind === "resolved_after_correction")
    return typeof corrected_by === "string" ? { kind, corrected_by } : null;
  return { kind: kind as "nothing" | "rescued_by_vocabulary" | "found" };
}

/**
 * Reads the fire sequence back. Strict in both directions, because the two
 * halves are what make a truncated sequence legible: a `fires` with no
 * `fires_dropped` beside it is a sequence that lies about being complete, and a
 * fire carrying neither `l` nor `q` is a result count attached to nothing.
 */
function parseFireSequence(raw: unknown): SearchFireSequence | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { fires, fires_dropped } = raw as {
    fires?: unknown;
    fires_dropped?: unknown;
  };
  if (!Array.isArray(fires) || typeof fires_dropped !== "number") return null;
  const parsed: SearchFire[] = [];
  for (const fire of fires) {
    if (typeof fire !== "object" || fire === null) return null;
    const { l, q, n } = fire as { l?: unknown; q?: unknown; n?: unknown };
    if (typeof n !== "number") return null;
    if (typeof l === "number") parsed.push({ l, n });
    else if (typeof q === "string") parsed.push({ q, n });
    else return null;
  }
  return { fires: parsed, fires_dropped };
}

function parseFlags(raw: unknown): SearchVocabularyFlags | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { mid_phrase, schema_version } = raw as {
    mid_phrase?: unknown;
    schema_version?: unknown;
  };
  if (!Array.isArray(mid_phrase) || typeof schema_version !== "number")
    return null;
  const hits: VocabularyKeyHit[] = [];
  for (const hit of mid_phrase) {
    if (typeof hit !== "object" || hit === null) return null;
    const { key, bucket } = hit as { key?: unknown; bucket?: unknown };
    if (typeof key !== "string") return null;
    if (typeof bucket !== "string") return null;
    hits.push({ key, bucket });
  }
  return { mid_phrase: hits, schema_version };
}

/**
 * Reads one stored record. Stored JSON outlives the shape that wrote it — a
 * downgrade, a hand edit, a half-finished write — and an unreadable record is
 * dropped rather than shown to a user who is about to decide whether to hand the
 * file over.
 */
function parseSearchLogEntry(raw: unknown): SearchLogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { query, outcome, settled, query_truncated, vocabulary, at, sequence } =
    raw as {
      query?: unknown;
      outcome?: unknown;
      settled?: unknown;
      query_truncated?: unknown;
      vocabulary?: unknown;
      at?: unknown;
      sequence?: unknown;
    };
  if (typeof query !== "string") return null;
  if (typeof settled !== "boolean" || typeof at !== "number") return null;
  if (typeof query_truncated !== "boolean") return null;
  const parsedOutcome = parseOutcome(outcome);
  const parsedFlags = parseFlags(vocabulary);
  if (!parsedOutcome || !parsedFlags) return null;
  // Absent is a record written below `Noisy`, which is the common case and not a
  // defect. Present-but-unreadable is a shape this build does not understand,
  // and the record is refused whole rather than shown without its sequence.
  const parsedSequence =
    sequence === undefined ? null : parseFireSequence(sequence);
  if (sequence !== undefined && parsedSequence === null) return null;
  return {
    query,
    outcome: parsedOutcome,
    settled,
    query_truncated,
    vocabulary: parsedFlags,
    at,
    ...(parsedSequence === null ? {} : { sequence: parsedSequence }),
  };
}

/**
 * Whether this entry is one of the **settled empty sessions** ADR-0053 §7's
 * denominator counts.
 *
 * **It is an allow-list, and it must stay one.** The old form was
 * `settled && outcome.kind !== "rescued_by_vocabulary"`, which was equivalent
 * only because the union had three members and no `found`. With every session
 * recorded, that form counts every successful search into the settled-empty
 * denominator, and #142 closes as a settled no on a population of successes —
 * silently, and in the direction of closing a question. ADR-0053's Amendment of
 * 2026-09-03 calls that a correction to the record before it is a correction to
 * any code, and `search-log.test.ts` pins it by adding a fifth outcome member
 * and asserting the population does not move.
 *
 * Nothing in the app folds the bar (ADR-0080 §6 deleted the readout), so this
 * function's one caller is {@link searchSessionLevel}. That is not a reason to
 * inline it: the level table's dial-proof property below is a claim about
 * exactly this set, and the set is what the trap is set on.
 */
export function isSettledEmptySession(entry: SearchLogEntry): boolean {
  return (
    entry.settled &&
    (entry.outcome.kind === "nothing" ||
      entry.outcome.kind === "resolved_after_correction")
  );
}

/**
 * What level a finished session is recorded at (ADR-0092 §5.1).
 *
 * | Session                               | Level      |
 * | ------------------------------------- | ---------- |
 * | `nothing` (settled empty)             | **WARN**   |
 * | `resolved_after_correction`           | **WARN**   |
 * | `rescued_by_vocabulary`               | **INFO**   |
 * | `found`                               | **INFO**   |
 * | abandoned mid-word (`settled: false`) | **INFO**   |
 *
 * An empty result is a WARN because **the app failed to answer**, not because
 * #142 wants to read it — the level is the severity of what happened, never the
 * importance of the record. A rescue cost the user nothing, a success cost them
 * nothing, and an abandoned session never reached a verdict, so none of the
 * three is a failure to report.
 *
 * The consequence worth stating out loud: both bar-eligible outcomes sit at
 * WARN, which makes ADR-0053 §7's bar **dial-proof by construction** — the three
 * positions do not differ over the population the bar counts, so it reads the
 * same at all three. That property is why this is written over
 * {@link isSettledEmptySession} rather than over a list of what is NOT WARN: the
 * two sets have to be the same set, and here they are the same expression.
 */
export function searchSessionLevel(entry: SearchLogEntry): SeverityNumber {
  return isSettledEmptySession(entry) ? SEVERITY.WARN : SEVERITY.INFO;
}

/**
 * ADR-0053's record, as the first channel of the facility (ADR-0092 §1).
 *
 * The cap is ADR-0053 §7's 200 entries. It carries **no sensitivity marking**:
 * ADR-0092 §11 deleted the concept rather than replacing it, because a badge on
 * a channel is field classification wearing a different word, and the whole of
 * the protection is the reviewed export.
 */
export const SEARCH_CHANNEL = defineChannel({
  name: "search",
  // Food's, and the only registered channel in the app — the measurement
  // ADR-0080 made while deciding that the jar-wide Local Logs card is generic
  // machinery whose entire content belongs to Rations.
  domain: "food",
  purpose:
    "#142 and #123; decides whether a per-token vocabulary tier is built, at the bar in ADR-0053 §7.",
  cap: 200,
  // The shape below, as it stands. It moves when a reader written against the
  // previous version would misread a newer record — `ledger-export.ts`'s rule,
  // per channel because one number for the whole facility would have a change
  // here invalidate another channel's records.
  //
  // 1 → 2 is the first move the envelope has ever made, and it moves because a
  // version-1 reader misreads a version-2 record in the way that rule is written
  // for: `found` is an outcome it has no member for, and `settled && kind !==
  // "rescued_by_vocabulary"` — the form ADR-0053's Amendment corrects — would
  // count one as a settled empty session. Version-1 records are kept, read as
  // unreadable, disclosed as a count, and leave the ring by age.
  version: 2,
  // ADR-0053 §7's denominator, and the reason ADR-0092 §9 exists: the ring is a
  // recency window, so a rate taken over 200 retained entries is the rate of the
  // last 200 sessions wearing a lifetime label. One session per entry, which is
  // a running total of what the entries already record rather than a new fact.
  //
  // **It counts the sessions this channel RECORDS**, which is narrower than the
  // sessions that happened, and the gap is stated rather than left for whoever
  // folds the rate to discover. A visit in which no search ever settled — three
  // characters typed and the sheet closed, or nothing but faults — never reaches
  // the write, so it is in no numerator and no denominator either. That is the
  // right population for every rate this channel can be asked for, because
  // ADR-0053 §2's unit is a settled session; it is the wrong one for "how often
  // does somebody open the search", which nothing here answers.
  //
  // The numerator is deliberately NOT a counter beside it: ADR-0053 §4 requires
  // the vocabulary flags to be recomputed at read against the current map, and a
  // write-time tally would freeze them as of the write. So the mid-phrase count
  // is folded over an export, and taking that export before the ring turns over
  // is part of the fold.
  counters: ["sessions"] as const,
  tally: () => ["sessions"] as const,
  parse: parseSearchLogEntry,
});

/**
 * Records a finished session, if it has anything to say.
 *
 * It used to return what ADR-0053 §7's bar read once the entry was in, because
 * a Settings readout drew that verdict. ADR-0080 §6 deleted the readout, and
 * with it the last reader of a bar computed in the app: the counts are derived
 * from the exported channel by the person who cares, whenever they care. So
 * this records and says nothing, and its one caller was already ignoring what
 * it said.
 *
 * Never throws and never blocks: the promise exists so a caller can ignore it,
 * not so it can wait.
 *
 * The early return matters, and it is narrower than it was: a session in which
 * no search ever settled — three characters typed and the sheet closed, or
 * nothing but faults — must not reach for the corpus, because a user who never
 * searched would pay a fetch for an artifact nothing needed. A session that DID
 * search has already loaded the corpus to answer, so the fetch below is a cache
 * read.
 *
 * **The loader is a required parameter and has no default**, which is what keeps
 * `src/lib/logs/` clear of `usda-corpus.ts` and therefore of the `fetch` that
 * module owns (`scripts/log-egress-check.mjs`). The laziness the paragraph above
 * argues for is unaffected — a function is passed, not a corpus — and the caller
 * that hands it over is the screen that already loaded the artifact to answer
 * the search. A log channel records what a domain hands it; reaching into that
 * domain's data layer for what it was not given is what put the ledger client
 * and the whole USDA loader inside this module's import closure.
 */
export async function recordSearchSession(
  session: SearchSession,
  load: () => Promise<VocabularyAtCapture>
): Promise<void> {
  if (
    session.empty_query === null &&
    session.rescued_query === null &&
    session.found_query === null
  )
    return;
  try {
    const corpus = await load();
    const entry = closeSearchSession(session, {
      // The clock is the impurity this edge owns; everything above it is pure.
      at: Date.now(),
      vocabulary: corpus.vocabulary,
      schema_version: corpus.schema_version,
    });
    if (!entry) return;
    appendToChannel(SEARCH_CHANNEL, entry, searchSessionLevel(entry));
  } catch {
    // The corpus is precached, so a failure here is a broken install — and a
    // broken install must not also break the search that just answered.
  }
}

// ---------------------------------------------------------------------------
// ADR-0053 §7's bar is not computed here, and that is deliberate
// ---------------------------------------------------------------------------
//
// ADR-0080 §6 deleted the Settings readout that was its only reader, so the
// counts are folded over an exported channel by the person who cares. The entry
// carries everything that fold needs — the query, whether the session settled,
// its outcome, and the vocabulary keys it was flagged against at capture time.
// The thresholds stay pinned in ADR-0053, which is where a change to one
// belongs.
