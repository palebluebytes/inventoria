import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BUILD_AT_MID_PHRASE,
  CLOSE_AT_SETTLED_EMPTY,
  beginSearchSession,
  closeSearchSession,
  flagVocabulary,
  readVocabularyBar,
  searchFoundFood,
  searchFoundNothing,
  typedIntoSession,
  withCurrentVocabulary,
  type SearchLogEntry,
  type SearchSession,
} from "../../src/lib/logs/search-log";

/**
 * The search channel (ADR-0053), and the bar it feeds. Everything but the write
 * itself is pure: one entry per settled session, the mid-phrase flags, and the
 * two counts that decide #142.
 */

// A stand-in Vocabulary map with one key of each shape the flags distinguish:
// a single-token key with single-token values, one with a multi-token value,
// and a multi-token key the flags must ignore.
const vocabulary = {
  aubergine: ["eggplant"],
  chilli: ["chili pepper", "chile"],
  "flax seed": ["flaxseed"],
};

const SCHEMA_VERSION = 4;

const flags = (query: string) =>
  flagVocabulary(query, vocabulary, SCHEMA_VERSION);

const keysIn = (query: string) => flags(query).mid_phrase.map((m) => m.key);

const close = (session: SearchSession, at = 1_700_000_000_000) =>
  closeSearchSession(session, {
    at,
    vocabulary,
    schema_version: SCHEMA_VERSION,
  });

describe("the mid-phrase vocabulary flags (ADR-0053 §4)", () => {
  it("flags a key typed as one token among several", () => {
    expect(keysIn("raw aubergine")).toEqual(["aubergine"]);
  });

  it("does not flag a query that IS the key — that expands today", () => {
    expect(keysIn("aubergine")).toEqual([]);
  });

  it("matches by stem, so a plural still counts", () => {
    expect(keysIn("roasted aubergines")).toEqual(["aubergine"]);
  });

  it("never matches by prefix — nobody proposed that mechanism", () => {
    expect(keysIn("raw aubergin")).toEqual([]);
  });

  it("ignores a multi-token key, which needs a windowed match", () => {
    expect(keysIn("golden flax seed")).toEqual([]);
  });

  it("records which subset bucket the key falls in", () => {
    // The sweep's §7.3 excluded keys with multi-token values by conflating the
    // arity of the key with the arity of the value; both buckets are recorded
    // so the evidence reads at either boundary (ADR-0053 §4).
    expect(flags("raw aubergine").mid_phrase[0].bucket).toBe(
      "single_token_value"
    );
    expect(flags("green chilli sauce").mid_phrase[0].bucket).toBe(
      "multi_token_value"
    );
  });

  it("carries the index schema_version current at capture", () => {
    expect(flags("raw aubergine").schema_version).toBe(SCHEMA_VERSION);
  });
});

describe("one entry per session, never one per search (ADR-0053 §2)", () => {
  it("records nothing at all for a session that always found food", () => {
    let session = beginSearchSession();
    session = typedIntoSession(session, "ban");
    session = typedIntoSession(session, "banana");
    session = searchFoundFood(session, "banana", false);
    expect(close(session)).toBeNull();
  });

  it("records the last query that returned nothing, once", () => {
    let session = beginSearchSession();
    for (const typed of ["wom", "womb", "wombok"]) {
      session = typedIntoSession(session, typed);
      session = searchFoundNothing(session, typed);
    }

    const entry = close(session);

    expect(entry).toEqual({
      query: "wombok",
      outcome: { kind: "nothing" },
      settled: true,
      vocabulary: { mid_phrase: [], schema_version: SCHEMA_VERSION },
      at: 1_700_000_000_000,
    });
  });

  it("holds both halves of a correction the user made themselves", () => {
    // The unit #142 is actually about: a retry saved, observed directly.
    let session = beginSearchSession();
    session = typedIntoSession(session, "raw aubergine");
    session = searchFoundNothing(session, "raw aubergine");
    session = typedIntoSession(session, "aubergine");
    session = searchFoundFood(session, "aubergine", true);

    expect(close(session)).toMatchObject({
      query: "raw aubergine",
      outcome: {
        kind: "resolved_after_correction",
        corrected_by: "aubergine",
      },
      settled: true,
    });
  });

  it("keeps the FIRST query that answered as the correction", () => {
    let session = beginSearchSession();
    session = typedIntoSession(session, "raw aubergine");
    session = searchFoundNothing(session, "raw aubergine");
    session = searchFoundFood(session, "aubergine", true);
    session = searchFoundFood(session, "eggplant", false);

    expect(close(session)?.outcome).toEqual({
      kind: "resolved_after_correction",
      corrected_by: "aubergine",
    });
  });

  it("marks a session abandoned mid-word unsettled", () => {
    // The empty query is stale: the user typed on and closed the sheet before
    // the next search could settle, so it must not enter a denominator.
    let session = beginSearchSession();
    session = typedIntoSession(session, "aubergi");
    session = searchFoundNothing(session, "aubergi");
    session = typedIntoSession(session, "aubergine su");

    expect(close(session)).toMatchObject({
      query: "aubergi",
      settled: false,
    });
  });

  it("counts a cleared field as settled, because the user saw the answer", () => {
    // Clearing ENDS the session; the state it ends in is the state it had when
    // the user gave up on it, which is why the empty text is never typed in.
    let session = beginSearchSession();
    session = typedIntoSession(session, "wombok");
    session = searchFoundNothing(session, "wombok");

    expect(close(session)).toMatchObject({ settled: true });
  });

  it("records a vocabulary rescue under its own outcome", () => {
    let session = beginSearchSession();
    session = typedIntoSession(session, "aubergine");
    session = searchFoundFood(session, "aubergine", true);

    expect(close(session)).toMatchObject({
      query: "aubergine",
      outcome: { kind: "rescued_by_vocabulary" },
      settled: true,
    });
  });

  it("prefers the empty the user actually saw over an earlier rescue", () => {
    let session = beginSearchSession();
    session = typedIntoSession(session, "aubergine");
    session = searchFoundFood(session, "aubergine", true);
    session = typedIntoSession(session, "aubergine cake");
    session = searchFoundNothing(session, "aubergine cake");

    expect(close(session)).toMatchObject({
      query: "aubergine cake",
      outcome: { kind: "nothing" },
    });
  });
});

describe("the bar the log feeds (ADR-0053 §7, as amended)", () => {
  const entry = (
    over: Partial<SearchLogEntry> & { mid_phrase?: boolean } = {}
  ): SearchLogEntry => ({
    query: "wombok",
    outcome: { kind: "nothing" },
    settled: true,
    vocabulary: {
      mid_phrase: over.mid_phrase
        ? [{ key: "aubergine", bucket: "single_token_value" as const }]
        : [],
      schema_version: SCHEMA_VERSION,
    },
    at: 0,
    ...over,
  });
  const many = (count: number, over?: Parameters<typeof entry>[0]) =>
    Array.from({ length: count }, () => entry(over));

  it("counts settled empty sessions, and the corrections among them", () => {
    const reading = readVocabularyBar([
      entry(),
      entry({
        outcome: { kind: "resolved_after_correction", corrected_by: "x" },
      }),
      entry({ settled: false }),
    ]);
    expect(reading.settled_empty).toBe(2);
  });

  it("excludes a rescued session — no guess was forced", () => {
    const reading = readVocabularyBar([
      entry({ outcome: { kind: "rescued_by_vocabulary" } }),
      entry(),
    ]);
    expect(reading.settled_empty).toBe(1);
  });

  it("stays undecided at five mid-phrase sessions and builds at six", () => {
    expect(readVocabularyBar(many(5, { mid_phrase: true })).verdict).toBe(
      "undecided"
    );
    expect(readVocabularyBar(many(6, { mid_phrase: true })).verdict).toBe(
      "build"
    );
    expect(BUILD_AT_MID_PHRASE).toBe(6);
  });

  it("stays undecided at 39 settled empty sessions and closes at 40", () => {
    expect(readVocabularyBar(many(39)).verdict).toBe("undecided");
    expect(readVocabularyBar(many(40)).verdict).toBe("close");
    expect(CLOSE_AT_SETTLED_EMPTY).toBe(40);
  });

  it("builds rather than closes when both counts are met", () => {
    const reading = readVocabularyBar([
      ...many(34),
      ...many(6, { mid_phrase: true }),
    ]);
    expect(reading).toEqual({
      settled_empty: 40,
      mid_phrase: 6,
      verdict: "build",
    });
  });

  it("counts mid-phrase only inside the denominator", () => {
    // An unsettled session and a rescued one are both outside it, so neither
    // can carry the build trigger over its line on its own.
    const reading = readVocabularyBar([
      entry({ mid_phrase: true, settled: false }),
      entry({ mid_phrase: true, outcome: { kind: "rescued_by_vocabulary" } }),
    ]);
    expect(reading).toEqual({
      settled_empty: 0,
      mid_phrase: 0,
      verdict: "undecided",
    });
  });

  it("re-reads the flags against the current map, keeping what was captured", () => {
    // The vocabulary re-derives on every corpus change (#134 and #137 are both
    // open and both move it), so a session that would have been flagged then
    // and would not be now is a finding about churn, not a discrepancy.
    const captured = entry({ query: "raw aubergine", mid_phrase: true });
    const [recomputed] = withCurrentVocabulary([captured], {}, 9);

    expect(recomputed.vocabulary).toEqual({
      mid_phrase: [],
      schema_version: 9,
    });
    expect(captured.vocabulary.mid_phrase).toHaveLength(1);
  });
});

// ── The channel, and the write ──────────────────────────────────────────────

interface FakeLocalStorage {
  store: Map<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function makeFakeLocalStorage(): FakeLocalStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

async function loadSearchLog() {
  vi.resetModules();
  return import("../../src/lib/logs/search-log");
}

const corpusOf = () =>
  Promise.resolve({
    foods: [],
    vocabulary,
    schema_version: SCHEMA_VERSION,
  });

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the search channel", () => {
  it("declares the reader ADR-0054 §2 requires, and ADR-0053's cap", async () => {
    const { SEARCH_CHANNEL } = await loadSearchLog();
    expect(SEARCH_CHANNEL.name).toBe("search");
    expect(SEARCH_CHANNEL.cap).toBe(200);
    expect(SEARCH_CHANNEL.sensitivity).toBe("personal");
    expect(SEARCH_CHANNEL.reader).toMatch(/#142/);
    expect(SEARCH_CHANNEL.reader).toMatch(/#123/);
  });

  it("refuses a stored record that is not an entry", async () => {
    const { SEARCH_CHANNEL } = await loadSearchLog();
    expect(SEARCH_CHANNEL.parse({ query: 42 })).toBeNull();
    expect(
      SEARCH_CHANNEL.parse({ query: "x", outcome: { kind: "no" } })
    ).toBeNull();
    expect(
      SEARCH_CHANNEL.parse({
        query: "wombok",
        outcome: { kind: "nothing" },
        settled: true,
        vocabulary: { mid_phrase: [], schema_version: 4 },
        at: 1,
      })
    ).not.toBeNull();
  });
});

describe("recording a finished session", () => {
  it("evaluates the bar on the write, so each trigger fires itself", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();

    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "raw aubergine");
    session = log.searchFoundNothing(session, "raw aubergine");

    // The reading comes back from the write itself rather than waiting for
    // someone to open Settings (ADR-0053 §7, as amended).
    expect(await log.recordSearchSession(session, corpusOf)).toEqual({
      settled_empty: 1,
      mid_phrase: 1,
      verdict: "undecided",
    });
  });

  it("re-reads the bar against the vocabulary as it stands now", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();

    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "raw aubergine");
    session = log.searchFoundNothing(session, "raw aubergine");
    await log.recordSearchSession(session, corpusOf);

    // Captured against a map that had the key; re-read against one that has
    // dropped it, which is the churn finding ADR-0053 §4 exists to surface.
    expect(log.readSearchChannelBar().mid_phrase).toBe(1);
    expect(
      await log.recomputeSearchChannelBar(() =>
        Promise.resolve({ foods: [], vocabulary: {}, schema_version: 9 })
      )
    ).toEqual({ settled_empty: 1, mid_phrase: 0, verdict: "undecided" });
  });

  it("appends one entry through the facility", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const facility = await import("../../src/lib/logs/log-facility");

    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "raw aubergine");
    session = log.searchFoundNothing(session, "raw aubergine");
    await log.recordSearchSession(session, corpusOf);

    const entries = facility.readChannel(log.SEARCH_CHANNEL);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      query: "raw aubergine",
      outcome: { kind: "nothing" },
      settled: true,
    });
    expect(entries[0].vocabulary.mid_phrase.map((m) => m.key)).toEqual([
      "aubergine",
    ]);
  });

  it("never reaches the corpus for a session with nothing to record", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const load = vi.fn(corpusOf);

    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "banana");
    session = log.searchFoundFood(session, "banana", false);
    expect(await log.recordSearchSession(session, load)).toBeNull();

    // A user who finds their food must not trigger a fetch of an artifact the
    // search never needed.
    expect(load).not.toHaveBeenCalled();
  });

  it("swallows a corpus that will not load", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const facility = await import("../../src/lib/logs/log-facility");

    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "wombok");
    session = log.searchFoundNothing(session, "wombok");
    await expect(
      log.recordSearchSession(session, () =>
        Promise.reject(
          new Error("Failed to load /usda/search-index.json (404).")
        )
      )
    ).resolves.toBeNull();

    expect(facility.readChannel(log.SEARCH_CHANNEL)).toEqual([]);
  });
});
