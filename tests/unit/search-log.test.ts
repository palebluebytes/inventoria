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

/** A search that answered on its own, with `n` results. */
const found = (n: number) => ({
  rescued_by_vocabulary: false,
  result_count: n,
});
/** A search the Vocabulary map answered in the typed word's place. */
const rescued = (n: number) => ({
  rescued_by_vocabulary: true,
  result_count: n,
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
  it("records a session that found its food, which used to leave no trace", () => {
    // The Amendment of 2026-09-03 strikes §2's "only if that session ever
    // reached an empty result": without the successes, §7's counts have no
    // denominator and no rate is measurable at all.
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "ban");
    session = typedIntoSession(session, "banana");
    session = searchFoundFood(session, "banana", found(3));

    expect(close(session)).toMatchObject({
      query: "banana",
      outcome: { kind: "found" },
      settled: true,
    });
  });

  it("records nothing for a session in which no search ever settled", () => {
    // Two characters typed and the sheet closed: the search never fires below
    // three, so there is no outcome, and a session with no outcome is not an
    // entry.
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "ba");
    expect(close(session)).toBeNull();
  });

  it("records the last query that returned nothing, once", () => {
    let session = beginSearchSession(false);
    for (const typed of ["wom", "womb", "wombok"]) {
      session = typedIntoSession(session, typed);
      session = searchFoundNothing(session, typed);
    }

    const entry = close(session);

    expect(entry).toEqual({
      query: "wombok",
      outcome: { kind: "nothing" },
      settled: true,
      query_truncated: false,
      vocabulary: { mid_phrase: [], schema_version: SCHEMA_VERSION },
      at: 1_700_000_000_000,
    });
  });

  it("holds both halves of a correction the user made themselves", () => {
    // The unit #142 is actually about: a retry saved, observed directly.
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "raw aubergine");
    session = searchFoundNothing(session, "raw aubergine");
    session = typedIntoSession(session, "aubergine");
    session = searchFoundFood(session, "aubergine", rescued(2));

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
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "raw aubergine");
    session = searchFoundNothing(session, "raw aubergine");
    session = searchFoundFood(session, "aubergine", rescued(2));
    session = searchFoundFood(session, "eggplant", found(4));

    expect(close(session)?.outcome).toEqual({
      kind: "resolved_after_correction",
      corrected_by: "aubergine",
    });
  });

  it("marks a session abandoned mid-word unsettled", () => {
    // The empty query is stale: the user typed on and closed the sheet before
    // the next search could settle, so it must not enter a denominator.
    let session = beginSearchSession(false);
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
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "wombok");
    session = searchFoundNothing(session, "wombok");

    expect(close(session)).toMatchObject({ settled: true });
  });

  it("records a vocabulary rescue under its own outcome", () => {
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "aubergine");
    session = searchFoundFood(session, "aubergine", rescued(2));

    expect(close(session)).toMatchObject({
      query: "aubergine",
      outcome: { kind: "rescued_by_vocabulary" },
      settled: true,
    });
  });

  it("prefers the empty the user actually saw over an earlier rescue", () => {
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "aubergine");
    session = searchFoundFood(session, "aubergine", rescued(2));
    session = typedIntoSession(session, "aubergine cake");
    session = searchFoundNothing(session, "aubergine cake");

    expect(close(session)).toMatchObject({
      query: "aubergine cake",
      outcome: { kind: "nothing" },
    });
  });
});

describe("the per-fire sequence (ADR-0092 §7)", () => {
  const fire = (session: SearchSession, typed: string, n: number) =>
    n === 0
      ? searchFoundNothing(typedIntoSession(session, typed), typed)
      : searchFoundFood(typedIntoSession(session, typed), typed, found(n));

  it("writes no sequence at all when the dial was below Noisy at the start", () => {
    // The include-or-omit decision is taken at session START. A post-hoc filter
    // would accumulate the array all session and then throw it away, paying the
    // whole cost the gate exists to avoid.
    let session = beginSearchSession(false);
    session = fire(session, "wombok", 0);
    expect(close(session)).not.toHaveProperty("sequence");
  });

  it("stores a fire as a prefix length, which reconstructs the query", () => {
    let session = beginSearchSession(true);
    session = fire(session, "wom", 0);
    session = fire(session, "wombok", 0);

    const entry = close(session);

    expect(entry?.sequence).toEqual({
      fires: [
        { l: 3, n: 0 },
        { l: 6, n: 0 },
      ],
      fires_dropped: 0,
    });
    // Lossless: the query is already in the record, so the text is never spent
    // twice.
    expect(entry?.query.slice(0, 3)).toBe("wom");
  });

  it("falls back to the text for a fire that is not a prefix", () => {
    // A paste, or an edit in the middle of the string. `banana` cannot be
    // reconstructed from `raw aubergine` by any length.
    let session = beginSearchSession(true);
    session = fire(session, "banana", 4);
    session = fire(session, "raw aubergine", 0);

    expect(close(session)?.sequence?.fires).toEqual([
      { q: "banana", n: 4 },
      { l: 13, n: 0 },
    ]);
  });

  it("keeps the first 3 and the last 7, and says how many it dropped", () => {
    let session = beginSearchSession(true);
    for (let i = 1; i <= 14; i++) session = fire(session, "q".repeat(i), i);

    const sequence = close(session)?.sequence;

    expect(sequence?.fires.map((f) => ("l" in f ? f.l : f.q))).toEqual([
      1, 2, 3, 8, 9, 10, 11, 12, 13, 14,
    ]);
    // Without this count a marathon session and an ordinary one look the same to
    // a person holding the file with no access to the rule that produced it.
    expect(sequence?.fires_dropped).toBe(4);
  });

  it("counts a result, so the fire that answered is visible against the one before", () => {
    // `raw aubergin` returning 0 while `raw aubergine` returns 3 is only visible
    // if both were recorded, and it is not derivable afterwards. `Noisy` records
    // every fire for exactly this.
    let session = beginSearchSession(true);
    session = fire(session, "raw aubergin", 0);
    session = fire(session, "raw aubergine", 3);

    expect(close(session)?.sequence?.fires.map((f) => f.n)).toEqual([0, 3]);
  });

  it("spends the text of a correcting fire, because the query is the empty one", () => {
    // The consequence to have in view when reading ADR-0092 §8.1: `{ q, n }` is
    // described there as the paste case, and it is also every fire after the
    // correction in the session type #142 is actually about — the record's query
    // is the EMPTY one, so the fire that answered it is a prefix of nothing the
    // reader can see. `log-budget.test.ts` carries what that costs.
    let session = beginSearchSession(true);
    session = fire(session, "raw aubergine", 0);
    session = fire(session, "aubergine", 3);

    expect(close(session)?.sequence?.fires).toEqual([
      { l: 13, n: 0 },
      { q: "aubergine", n: 3 },
    ]);
  });
});

describe("the query is bounded at capture, never on the input (ADR-0092 §7)", () => {
  const long = "a".repeat(60);

  it("cuts the recorded query at 48 characters and announces it", () => {
    let session = beginSearchSession(false);
    session = typedIntoSession(session, long);
    session = searchFoundNothing(session, long);

    const entry = close(session);

    expect(entry?.query).toHaveLength(48);
    // A flag rather than a silent shortening, because a reader takes a string in
    // a log as literal.
    expect(entry?.query_truncated).toBe(true);
  });

  it("says so when only the correcting text was cut", () => {
    let session = beginSearchSession(false);
    session = typedIntoSession(session, "wombok");
    session = searchFoundNothing(session, "wombok");
    session = typedIntoSession(session, long);
    session = searchFoundFood(session, long, found(2));

    const entry = close(session);

    expect(entry?.query).toBe("wombok");
    expect(entry?.outcome).toEqual({
      kind: "resolved_after_correction",
      corrected_by: "a".repeat(48),
    });
    expect(entry?.query_truncated).toBe(true);
  });

  it("flags the bounded query, so a paste cannot grow mid_phrase", () => {
    // The bound is what makes ADR-0092 §8's invariant computable: flagging the
    // typed text would leave `mid_phrase` bounded by a paste instead, and would
    // put keys in the record that are in no token of the query beside them.
    const typed = `${"z ".repeat(24)}raw aubergine`;
    let session = beginSearchSession(false);
    session = typedIntoSession(session, typed);
    session = searchFoundNothing(session, typed);

    const entry = close(session);

    expect(entry?.query).toHaveLength(48);
    expect(entry?.vocabulary.mid_phrase).toEqual([]);
  });

  it("never splits a surrogate pair on the way out", () => {
    // A lone half is a replacement character in the file somebody reads, and six
    // escaped bytes in a budget the bound exists to hold.
    const typed = `${"a".repeat(47)}🍆🍆`;
    let session = beginSearchSession(false);
    session = typedIntoSession(session, typed);
    session = searchFoundNothing(session, typed);

    const entry = close(session);

    expect(entry?.query).toBe("a".repeat(47));
    expect([...(entry?.query ?? "")].every((c) => c === "a")).toBe(true);
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
    expect(SEARCH_CHANNEL.version).toBe(2);
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
          v: 2,
          lvl: 13,
          entry: {
            query: "raw aubergine",
            outcome: {
              kind: "resolved_after_correction",
              corrected_by: "aubergine",
            },
            settled: true,
            query_truncated: false,
            vocabulary: {
              mid_phrase: [{ key: "aubergine", bucket: "single_token_value" }],
              schema_version: 4,
            },
            at: 1700000000000,
            sequence: {
              fires: [
                { l: 3, n: 0 },
                { l: 13, n: 0 },
                { q: "aubergine", n: 2 },
              ],
              fires_dropped: 4,
            },
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
        query_truncated: false,
        vocabulary: {
          mid_phrase: [{ key: "aubergine", bucket: "single_token_value" }],
          schema_version: 4,
        },
        at: 1700000000000,
        sequence: {
          fires: [
            { l: 3, n: 0 },
            { l: 13, n: 0 },
            { q: "aubergine", n: 2 },
          ],
          fires_dropped: 4,
        },
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
      query_truncated: false,
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
        query_truncated: false,
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
      query_truncated: false,
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
    expect(searchSessionLevel({ ...base, outcome: { kind: "found" } })).toBe(9);
    expect(
      searchSessionLevel({
        ...base,
        settled: false,
        outcome: { kind: "nothing" },
      })
    ).toBe(9);
  });

  it("keeps a fifth outcome out of ADR-0053 §7's denominator", async () => {
    // The trap the Amendment of 2026-09-03 corrects. Written as `settled &&
    // kind !== "rescued_by_vocabulary"`, the population is a deny-list, so every
    // member added after it walks straight in — and #142 closes as a settled no
    // on a population of successes, silently. `found` is the fourth member and
    // is already asserted above; this adds a FIFTH the code has never heard of,
    // which is the only version of the assertion that survives the next one
    // being added.
    const { isSettledEmptySession, searchSessionLevel } = await loadSearchLog();
    const base = {
      query: "raw aubergine",
      settled: true,
      query_truncated: false,
      vocabulary: { mid_phrase: [], schema_version: 4 },
      at: 1,
    };
    const fifth = {
      ...base,
      // Not a member of `SearchOutcome`, deliberately: stored JSON outlives the
      // union, and the cast is the shape of the hazard rather than a shortcut.
      outcome: { kind: "abandoned_after_staging" },
    } as unknown as Parameters<typeof isSettledEmptySession>[0];

    expect(isSettledEmptySession(fifth)).toBe(false);
    expect(searchSessionLevel(fifth)).toBe(9);
    // And the two that ARE the denominator still are, so the assertion above is
    // not passing because the function refuses everything.
    expect(
      isSettledEmptySession({ ...base, outcome: { kind: "nothing" } })
    ).toBe(true);
    expect(
      isSettledEmptySession({
        ...base,
        outcome: { kind: "resolved_after_correction", corrected_by: "x" },
      })
    ).toBe(true);
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
    session = log.searchFoundFood(session, "aubergine", rescued(2));

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

  it("never reaches the corpus for a session in which nothing settled", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const load = vi.fn(corpusOf);

    // Two characters and then away: the search never fired, so there is nothing
    // to record and a user who never searched must not pay a fetch for an
    // artifact nothing needed.
    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "ba");
    await log.recordSearchSession(session, load);

    expect(load).not.toHaveBeenCalled();
  });

  it("counts every session it records, as §7's lifetime denominator", async () => {
    // The ring is a recency window, so a rate taken over the retained entries is
    // the rate of the last 200 sessions wearing a lifetime label (ADR-0092 §9).
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const facility = await import("../../src/lib/logs/log-facility");

    for (const [query, empty] of [
      ["wombok", true],
      ["banana", false],
      ["aubergine", false],
    ] as const) {
      let session = log.beginSearchSession();
      session = log.typedIntoSession(session, query);
      session = empty
        ? log.searchFoundNothing(session, query)
        : log.searchFoundFood(session, query, found(3));
      await log.recordSearchSession(session, corpusOf);
    }

    expect(facility.channelCounters(log.SEARCH_CHANNEL, 0)?.counts).toEqual({
      sessions: 3,
    });
  });

  it("keeps counting at a dial position that captures no record", async () => {
    // Turn the dial down and you keep the rate, you lose the detail: the write
    // tallies above the gate, because a counter is a fixed-width integer rather
    // than bytes and gating it would hole the one number that survives shedding.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const log = await loadSearchLog();
    const facility = await import("../../src/lib/logs/log-facility");
    facility.setDialPosition(13);

    let session = log.beginSearchSession();
    session = log.typedIntoSession(session, "banana");
    session = log.searchFoundFood(session, "banana", found(3));
    await log.recordSearchSession(session, corpusOf);

    expect(facility.readChannel(log.SEARCH_CHANNEL)).toEqual([]);
    expect(facility.channelCounters(log.SEARCH_CHANNEL, 0)?.counts).toEqual({
      sessions: 1,
    });
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
