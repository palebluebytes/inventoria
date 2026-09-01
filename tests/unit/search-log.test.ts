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
