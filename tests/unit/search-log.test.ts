import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  beginSearchSession,
  closeSearchSession,
  flagVocabulary,
  searchFoundFood,
  searchFoundNothing,
  typedIntoSession,
  type SearchSession,
} from "../../src/lib/logs/search-log";

/**
 * The search channel (ADR-0053). Everything but the write itself is pure: one
 * entry per settled session, and the mid-phrase flags it is captured with.
 *
 * **The bar those flags feed is not asserted here, because it is not in the
 * app.** ADR-0080 §6 deleted the readout that computed it and the fold under
 * it; #142's verdict is now a fold over an exported file, run by the person who
 * cares. What is still asserted is that the entries carry everything that fold
 * needs.
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
  it("states the purpose ADR-0092 §2 requires, and ADR-0053's cap", async () => {
    const { SEARCH_CHANNEL } = await loadSearchLog();
    expect(SEARCH_CHANNEL.name).toBe("search");
    expect(SEARCH_CHANNEL.cap).toBe(200);
    expect(SEARCH_CHANNEL.purpose).toMatch(/#142/);
    expect(SEARCH_CHANNEL.purpose).toMatch(/#123/);
  });

  it("carries no sensitivity marking at all (ADR-0092 §11)", async () => {
    // Deleted rather than renamed: a badge on a channel is field classification
    // wearing a different word, and the reviewed export is the whole protection.
    const { SEARCH_CHANNEL } = await loadSearchLog();
    expect(SEARCH_CHANNEL).not.toHaveProperty("sensitivity");
  });

  it("declares the version its entry shape is at (#229)", async () => {
    const { SEARCH_CHANNEL } = await loadSearchLog();
    expect(SEARCH_CHANNEL.version).toBe(1);
  });

  it("parses a golden stored record, envelope and all (#229)", async () => {
    // The one thing that makes the stamp pay for itself: without a golden,
    // `version` never moves, because nothing notices the shape changed.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const log = await loadSearchLog();
    const facility = await import("../../src/lib/logs/log-facility");
    ls.store.set(
      "inventoria_log_search",
      JSON.stringify([
        {
          v: 1,
          lvl: 13,
          entry: {
            query: "raw aubergine",
            outcome: {
              kind: "resolved_after_correction",
              corrected_by: "aubergine",
            },
            settled: true,
            vocabulary: {
              mid_phrase: [{ key: "aubergine", bucket: "single_token_value" }],
              schema_version: 4,
            },
            at: 1700000000000,
          },
        },
      ])
    );

    expect(facility.readChannel(log.SEARCH_CHANNEL)).toEqual([
      {
        query: "raw aubergine",
        outcome: {
          kind: "resolved_after_correction",
          corrected_by: "aubergine",
        },
        settled: true,
        vocabulary: {
          mid_phrase: [{ key: "aubergine", bucket: "single_token_value" }],
          schema_version: 4,
        },
        at: 1700000000000,
      },
    ]);
  });

  it("keeps a record naming a bucket it has not heard of (#229 §5)", async () => {
    // `bucket` is a code and decides nothing about the rest of the record, so an
    // unfamiliar one must not cost the entry. `outcome.kind` is a discriminant —
    // it decides whether `corrected_by` exists — and stays strict.
    const { SEARCH_CHANNEL } = await loadSearchLog();
    const entry = {
      query: "raw aubergine",
      outcome: { kind: "nothing" },
      settled: true,
      vocabulary: {
        mid_phrase: [{ key: "aubergine", bucket: "a_bucket_from_next_year" }],
        schema_version: 4,
      },
      at: 1,
    };
    expect(SEARCH_CHANNEL.parse(entry)).not.toBeNull();
    expect(
      SEARCH_CHANNEL.parse({ ...entry, outcome: { kind: "a_new_outcome" } })
    ).toBeNull();
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

describe("what level a session is (ADR-0092 §5.1)", () => {
  it("puts both bar-eligible outcomes at WARN, and the rest at INFO", async () => {
    // An empty result is a WARN because the app failed to answer, not because
    // #142 wants to read it. A rescue cost the user nothing, and a session
    // abandoned mid-word never reached a verdict.
    const { searchSessionLevel } = await loadSearchLog();
    const base = {
      query: "raw aubergine",
      settled: true,
      vocabulary: { mid_phrase: [], schema_version: 4 },
      at: 1,
    };
    expect(searchSessionLevel({ ...base, outcome: { kind: "nothing" } })).toBe(
      13
    );
    expect(
      searchSessionLevel({
        ...base,
        outcome: { kind: "resolved_after_correction", corrected_by: "x" },
      })
    ).toBe(13);
    expect(
      searchSessionLevel({
        ...base,
        outcome: { kind: "rescued_by_vocabulary" },
      })
    ).toBe(9);
    expect(
      searchSessionLevel({
        ...base,
        settled: false,
        outcome: { kind: "nothing" },
      })
    ).toBe(9);
  });

  it("makes ADR-0053 §7's bar read the same at all three positions", async () => {
    // Both outcomes the bar counts are WARN, so the positions do not differ over
    // the population it counts. A consequence of the table rather than a
    // mechanism, and asserted rather than relied on silently.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const facility = await import("../../src/lib/logs/log-facility");

    for (const position of [13, 9, 5] as const) {
      facility.clearChannel(log.SEARCH_CHANNEL);
      facility.setDialPosition(position);
      let session = log.beginSearchSession();
      session = log.typedIntoSession(session, "wombok");
      session = log.searchFoundNothing(session, "wombok");
      await log.recordSearchSession(session, corpusOf);
      expect(facility.readChannel(log.SEARCH_CHANNEL)).toHaveLength(1);
    }
  });

  it("drops a rescue at Errors & warnings, and keeps it at Normal", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const facility = await import("../../src/lib/logs/log-facility");

    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "aubergine");
    session = log.searchFoundFood(session, "aubergine", true);

    facility.setDialPosition(13);
    await log.recordSearchSession(session, corpusOf);
    expect(facility.readChannel(log.SEARCH_CHANNEL)).toEqual([]);

    facility.setDialPosition(9);
    await log.recordSearchSession(session, corpusOf);
    expect(facility.readChannel(log.SEARCH_CHANNEL)).toHaveLength(1);
  });
});

describe("recording a finished session", () => {
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
    await log.recordSearchSession(session, load);

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
    ).resolves.toBeUndefined();

    expect(facility.readChannel(log.SEARCH_CHANNEL)).toEqual([]);
  });
});
