import { stemOf, wordsOf } from "../food/reference-food-ranking";
import { loadSearchCorpus, type SearchCorpus } from "../food/usda-corpus";
import { appendToChannel, defineChannel, readChannel } from "./log-facility";

/**
 * The search channel (ADR-0053): what a reference-food search that found nothing
 * leaves behind, and the bar that reading feeds.
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
 * Two things about the shape are easy to get wrong and are asserted in
 * `search-log.test.ts`:
 *
 * - **One entry per session, never one per search.** The search fires on a
 *   120 ms debounce from three characters up, so `raw aubergine` produces about
 *   eleven searches, ten of them keystroke states (§2).
 * - **Only a genuine no-food is recorded.** `searchUsdaFoods` throws
 *   `NoReferenceFoodError` when nothing matched and a plain `Error` for a fault;
 *   a log that fired on both would count an offline corpus fetch as a vocabulary
 *   miss (§3). That distinction is the CALLER's to keep — this module is only
 *   ever told what happened.
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

/** One vocabulary key an empty query contained, and its subset. */
export interface VocabularyKeyHit {
  key: string;
  bucket: VocabularyBucket;
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
 * How a session that reached an empty result ended.
 *
 * A union rather than a string plus an optional field, so the correcting text
 * cannot go missing from the one outcome that has one — it is the half of the
 * entry that makes a saved retry observable rather than inferred.
 */
export type SearchOutcome =
  | { kind: "nothing" }
  | { kind: "rescued_by_vocabulary" }
  | { kind: "resolved_after_correction"; corrected_by: string };

/** One recorded search session (ADR-0053 §3). */
export interface SearchLogEntry {
  /** The final text that returned nothing — or that the vocabulary answered. */
  query: string;
  outcome: SearchOutcome;
  /** False when the session was abandoned mid-word, so it leaves the denominator. */
  settled: boolean;
  vocabulary: SearchVocabularyFlags;
  at: number;
}

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
      mid_phrase.push({
        key,
        bucket: expansions.every((phrase) => wordsOf(phrase).length === 1)
          ? "single_token_value"
          : "multi_token_value",
      });
    }
  }
  return { mid_phrase, schema_version };
}

/**
 * The same entries with their flags recomputed against the CURRENT map, leaving
 * the stored capture-time flags untouched.
 *
 * The vocabulary re-derives from the corpus on every filter change — #142 alone
 * was re-sized four times — and #134 and #137 are both open and both move the
 * corpus. Keeping both readings is what makes a session that would have been
 * flagged then and would not be now visible as a finding about churn rather than
 * invisible as a discrepancy (ADR-0053 §4).
 */
export function withCurrentVocabulary(
  entries: readonly SearchLogEntry[],
  vocabulary: Record<string, string[]>,
  schema_version: number
): SearchLogEntry[] {
  return entries.map((entry) => ({
    ...entry,
    vocabulary: flagVocabulary(entry.query, vocabulary, schema_version),
  }));
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
}

/** Opens a session. The field has just gone non-empty. */
export function beginSearchSession(): SearchSession {
  return {
    query: "",
    empty_query: null,
    corrected_by: null,
    rescued_query: null,
  };
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
  return { ...session, empty_query: query.trim(), corrected_by: null };
}

/**
 * A completed search found food. `rescued_by_vocabulary` says the typed query
 * retrieved nothing and ADR-0049's map answered in its place, which the search
 * reports because nothing downstream can tell.
 *
 * The FIRST answer after an empty query is the correction, because that is the
 * retry the user made; anything they typed afterwards is browsing.
 */
export function searchFoundFood(
  session: SearchSession,
  query: string,
  rescued_by_vocabulary: boolean
): SearchSession {
  const answered = query.trim();
  return {
    ...session,
    corrected_by:
      session.empty_query !== null && session.corrected_by === null
        ? answered
        : session.corrected_by,
    rescued_query: rescued_by_vocabulary ? answered : session.rescued_query,
  };
}

/** What a close needs beyond the session itself. */
export interface SearchSessionClose {
  at: number;
  vocabulary: Record<string, string[]>;
  schema_version: number;
}

/**
 * The one entry a finished session leaves, or `null` for a session that found
 * its food every time — which is most of them.
 *
 * An empty result the user SAW outranks a rescue earlier in the same session:
 * the rescue cost them nothing, and the empty is what forced a guess. Where the
 * empty was followed by an answer, the entry holds both halves, which is the
 * saved retry #142 is actually about.
 *
 * `settled` is the entry's own honesty about itself: the recorded query is stale
 * if the user typed past it without letting another search finish, so it says so
 * and ADR-0053 §7's denominator drops it.
 */
export function closeSearchSession(
  session: SearchSession,
  close: SearchSessionClose
): SearchLogEntry | null {
  const flagsFor = (query: string) => ({
    query,
    vocabulary: flagVocabulary(query, close.vocabulary, close.schema_version),
    at: close.at,
  });
  if (session.empty_query !== null)
    return {
      ...flagsFor(session.empty_query),
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
      ...flagsFor(session.rescued_query),
      outcome: { kind: "rescued_by_vocabulary" },
      settled: session.query === session.rescued_query,
    };
  return null;
}

// ---------------------------------------------------------------------------
// The channel
// ---------------------------------------------------------------------------

const OUTCOME_KINDS = [
  "nothing",
  "rescued_by_vocabulary",
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
  return { kind: kind as "nothing" | "rescued_by_vocabulary" };
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
    if (bucket !== "single_token_value" && bucket !== "multi_token_value")
      return null;
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
  const { query, outcome, settled, vocabulary, at } = raw as {
    query?: unknown;
    outcome?: unknown;
    settled?: unknown;
    vocabulary?: unknown;
    at?: unknown;
  };
  if (typeof query !== "string") return null;
  if (typeof settled !== "boolean" || typeof at !== "number") return null;
  const parsedOutcome = parseOutcome(outcome);
  const parsedFlags = parseFlags(vocabulary);
  if (!parsedOutcome || !parsedFlags) return null;
  return {
    query,
    outcome: parsedOutcome,
    settled,
    vocabulary: parsedFlags,
    at,
  };
}

/**
 * ADR-0053's record, as the first channel of the facility (ADR-0054 §1).
 *
 * `personal`, because a food search is a record of what someone was thinking
 * about eating, and for a health-adjacent app that can imply a condition, a
 * pregnancy or a disorder. The cap is §7's 200 entries.
 */
export const SEARCH_CHANNEL = defineChannel({
  name: "search",
  reader:
    "#142 and #123; decides whether a per-token vocabulary tier is built, at the bar in ADR-0053 §7.",
  cap: 200,
  sensitivity: "personal",
  parse: parseSearchLogEntry,
});

/**
 * Records a finished session, if it has anything to say. Never throws, never
 * blocks the caller, and returns a promise only so a test can await the write it
 * would otherwise have to guess at — no caller awaits one.
 *
 * The early return matters: a session that found its food every time must not
 * reach for the corpus, because a user who never searched would pay a fetch for
 * an artifact nothing needed.
 */
export async function recordSearchSession(
  session: SearchSession,
  load: () => Promise<SearchCorpus> = loadSearchCorpus
): Promise<void> {
  if (session.empty_query === null && session.rescued_query === null) return;
  try {
    const corpus = await load();
    const entry = closeSearchSession(session, {
      // The clock is the impurity this edge owns; everything above it is pure.
      at: Date.now(),
      vocabulary: corpus.vocabulary,
      schema_version: corpus.schema_version,
    });
    if (entry) appendToChannel(SEARCH_CHANNEL, entry);
  } catch {
    // The corpus is precached, so a failure here is a broken install — and a
    // broken install must not also break the search that just answered.
  }
}

// ---------------------------------------------------------------------------
// The bar (ADR-0053 §7, as amended)
// ---------------------------------------------------------------------------

/** #142 builds once this many mid-phrase sessions have been recorded. */
export const BUILD_AT_MID_PHRASE = 6;
/** #142 closes as a settled no at this many settled empty sessions. */
export const CLOSE_AT_SETTLED_EMPTY = 40;

/** What the channel currently says about #142. */
export interface VocabularyBarReading {
  /** The denominator: settled sessions whose empty result the user saw. */
  settled_empty: number;
  /** Those of them whose empty query carried a mid-phrase vocabulary key. */
  mid_phrase: number;
  verdict: "build" | "close" | "undecided";
}

/**
 * Reads the bar. Pure, and evaluated on every write, so each trigger fires
 * itself: there is no window and no review date, because the app is not yet in
 * use and a calendar with no start would send #142 back to the sweep's reach
 * number the moment the instrument was built.
 *
 * **A `rescued_by_vocabulary` session is excluded from the denominator.** The
 * fallback answered, the user never saw "No food found", so no guess was forced
 * and no retry was saved; those sessions price ADR-0049's shipped fallback
 * instead, which is a different question in the same channel.
 *
 * Moving either number is an amendment to ADR-0053, not an edit here.
 */
export function readVocabularyBar(
  entries: readonly SearchLogEntry[]
): VocabularyBarReading {
  const counted = entries.filter(
    (entry) => entry.settled && entry.outcome.kind !== "rescued_by_vocabulary"
  );
  const mid_phrase = counted.filter(
    (entry) => entry.vocabulary.mid_phrase.length > 0
  ).length;
  return {
    settled_empty: counted.length,
    mid_phrase,
    verdict:
      mid_phrase >= BUILD_AT_MID_PHRASE
        ? "build"
        : counted.length >= CLOSE_AT_SETTLED_EMPTY
          ? "close"
          : "undecided",
  };
}

/** The bar as the channel currently stands — what Settings shows. */
export function readSearchChannelBar(): VocabularyBarReading {
  return readVocabularyBar(readChannel(SEARCH_CHANNEL));
}
