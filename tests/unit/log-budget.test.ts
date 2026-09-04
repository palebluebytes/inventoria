import { describe, expect, it } from "vitest";
import {
  LOG_BUDGET_BYTES,
  registeredChannels,
  SEVERITY,
  type LogChannel,
} from "../../src/lib/logs/log-facility";
import {
  QUERY_MAX_CHARS,
  type SearchLogEntry,
} from "../../src/lib/logs/search-log";
// A channel registers by import side effect (#221), so `registeredChannels`
// sees only what has been imported. Every module that declares one belongs in
// this list, and the roster assertion below is what says so out loud when one is
// missing.
import "../../src/lib/logs/search-log";

/**
 * ADR-0092 §8's invariant, as the unit test that record says it must be:
 *
 * > **Σ over channels of (cap × maximum record bytes) ≤ `LOG_BUDGET_BYTES`.**
 *
 * It matters beyond tidiness. `shedToBudget` takes from the largest channel
 * across the whole facility, and now that a channel names a Tracked Domain that
 * eviction crosses the boundary ADR-0080 §5 drew — the root's records evicting
 * Rations', silently, on a device where Rations is the only thing installed.
 * Proving the caps bound the total proves the shedding never runs.
 *
 * **It builds the record rather than reading a declared number.** ADR-0092 §8
 * refuses a `maxRecordBytes` field on the declaration, because a number an
 * author writes down is a claim about a shape and this arc established three
 * times over that such claims are wrong by factors of two to four. A builder
 * typed as the channel's own entry stops compiling when the type moves.
 *
 * ## What this does not price, which is where it will next be wrong
 *
 * The worst case is **hand-written**, so a field nobody thought of is a field it
 * does not price. That is ADR-0092 §8's own admission, and this arc has two
 * concrete instances of it standing right now, both in `search`:
 *
 * - **`mid_phrase` has no cardinality bound.** ADR-0092 §7 bounds every string
 *   in the record and no array but the fire sequence. The bounded query holds at
 *   most 24 tokens, so the flags can hold at least that many hits, and at 24
 *   hits of a 16-character key one record is 1,874 B and `search` alone is
 *   **366 KiB** — 143% of the whole budget. §8.1's own figure is recovered by
 *   **five hits at nine characters**, which the record does not state, and that
 *   is what {@link MID_PHRASE_HITS} and {@link MID_PHRASE_KEY_CHARS} below make
 *   visible rather than implicit.
 * - **`{ q, n }` is priced as the exception and is not always one.** §7 calls it
 *   the fallback for a paste or a mid-string edit. It is also every fire after
 *   the correction in a `resolved_after_correction` session, because the record's
 *   query is the empty one and the fires that answered it are prefixes of
 *   something else. Ten fires in that shape are 1,011 B with no flags at all —
 *   **197.5 KiB**, 77% of the budget for one channel.
 *
 * Neither is solved here: both are shape decisions belonging to ADR-0092 §7, and
 * a test that quietly bounded them would be the declared-number this record
 * refuses, written somewhere worse.
 *
 * ## One note on units
 *
 * The budget is `TextEncoder` bytes and browsers charge `localStorage` in
 * **UTF-16 code units**, so 256 KiB here costs about **512 KiB** of a roughly
 * 5 MB origin. The strings below are ASCII, as §8.1's measurement was; a query
 * in a non-Latin script costs up to three bytes per character rather than one,
 * which is a third dimension this figure does not carry.
 */

const encoder = new TextEncoder();

/** What this file has to know about one channel to weigh it. */
interface ChannelBudget {
  /**
   * The dearest record the channel's own entry type admits, under the model the
   * header states. Typed as that entry, which is the whole mechanism: a
   * sixteenth field does not slip past this, it stops it compiling.
   */
  worstCase: () => unknown;
  /**
   * The per-record figure ADR-0092 §8.1 tabulates for it, in bytes.
   *
   * Asserted as a **ceiling** rather than an equality: the shape may get cheaper
   * without anybody rewriting a record, and may not get dearer without one. It
   * is the guard against the code and §8.1's table drifting apart, which is a
   * different failure from busting the budget and shows up long before it.
   */
  tabulated: number;
}

// ── `search` (ADR-0053, ADR-0092 §5.1) ──────────────────────────────────────

/**
 * How many mid-phrase vocabulary keys one record is priced with.
 *
 * Recovered from §8.1's 785 B rather than derived from a bound, because there is
 * no bound to derive it from. See the header.
 */
const MID_PHRASE_HITS = 5;
/** The key length that recovers the same figure. */
const MID_PHRASE_KEY_CHARS = 9;
/** §7's retention within a session: the first three fires and the last seven. */
const FIRES_KEPT = 10;

/**
 * The dearest `search` record §8.1's model admits: the query at its cap, an
 * outcome carrying a correction at the same cap, the truncation flag raised,
 * every retained fire at full prefix length, and the flags at the figure above.
 *
 * Typed as {@link SearchLogEntry}, which is the whole mechanism: a sixteenth
 * field does not slip past this, it stops it compiling.
 */
function worstSearchRecord(): SearchLogEntry {
  const query = "a".repeat(QUERY_MAX_CHARS);
  return {
    query,
    outcome: { kind: "resolved_after_correction", corrected_by: query },
    settled: true,
    query_truncated: true,
    vocabulary: {
      mid_phrase: Array.from({ length: MID_PHRASE_HITS }, () => ({
        key: "k".repeat(MID_PHRASE_KEY_CHARS),
        // The longer of the two codes.
        bucket: "multi_token_value",
      })),
      // Wider than the corpus is at, so the figure does not shrink when it moves.
      schema_version: 999,
    },
    at: 1_757_000_000_000,
    sequence: {
      fires: Array.from({ length: FIRES_KEPT }, () => ({
        l: QUERY_MAX_CHARS,
        // Four digits, which no search returns and every one fits inside.
        n: 9999,
      })),
      fires_dropped: 9999,
    },
  };
}

/**
 * One budget per channel, by channel name.
 *
 * A map rather than a field on the declaration (ADR-0092 §8), and **one entry
 * per channel rather than a map per fact**: two maps keyed the same way let a
 * channel be half-registered, which is a hole in exactly the guard below.
 */
const BUDGETS: Record<string, ChannelBudget> = {
  search: { worstCase: worstSearchRecord, tabulated: 785 },
};

/**
 * One channel's budget, or a failure that says what is missing.
 *
 * The throw is the point: without it an unpriced channel reads `undefined` and
 * every comparison against it passes vacuously, which is the sum quietly
 * covering fewer channels than exist.
 */
function budgetOf(channel: LogChannel<unknown>): ChannelBudget {
  const budget = BUDGETS[channel.name];
  if (budget === undefined)
    throw new Error(
      `Log channel "${channel.name}" has no worst-case record in this file, so ADR-0092 §8's sum does not cover it.`
    );
  return budget;
}

/**
 * One record at its widest, envelope and all: the envelope is the facility's and
 * rides on every record (ADR-0092 §3.1), so it is weighed too.
 *
 * `lvl` is ERROR because it is the widest of the four — two digits where DEBUG
 * and INFO are one.
 */
function worstRecord(channel: LogChannel<unknown>): unknown {
  return {
    v: channel.version,
    lvl: SEVERITY.ERROR,
    entry: budgetOf(channel).worstCase(),
  };
}

function recordBytes(channel: LogChannel<unknown>): number {
  return encoder.encode(JSON.stringify(worstRecord(channel))).length;
}

/**
 * What one channel's store weighs at its cap, the way `serialisedBytes` weighs
 * it: the whole array, with the commas between the records and the brackets
 * around them.
 */
function channelBytesAtCap(channel: LogChannel<unknown>): number {
  const record = worstRecord(channel);
  const records = Array.from({ length: channel.cap }, () => record);
  return encoder.encode(JSON.stringify(records)).length;
}

describe("the log facility's budget invariant (ADR-0092 §8)", () => {
  it("prices every registered channel, so a fourth cannot arrive unweighed", () => {
    // The failure this catches is a channel added with no worst case written for
    // it: the sum below would still pass, having quietly summed over fewer
    // channels than exist.
    const unpriced = registeredChannels()
      .filter((channel) => !(channel.name in BUDGETS))
      .map((channel) => channel.name);
    expect(unpriced).toEqual([]);
  });

  it("holds Σ (cap × maximum record bytes) under the shared budget", () => {
    const spent = registeredChannels().map((channel) => ({
      name: channel.name,
      bytes: channelBytesAtCap(channel),
    }));
    const total = spent.reduce((sum, channel) => sum + channel.bytes, 0);

    // Reported rather than only asserted: the split is what a person deciding
    // whether a fourth channel fits actually needs.
    const split = spent
      .map((c) => `${c.name}: ${(c.bytes / 1024).toFixed(1)} KiB`)
      .join(", ");
    expect(
      total,
      `Σ over channels is ${(total / 1024).toFixed(1)} KiB of ${
        LOG_BUDGET_BYTES / 1024
      } KiB — ${split}. Either a shape grew or a cap did; ADR-0092 §8.1's table moves with it.`
    ).toBeLessThanOrEqual(LOG_BUDGET_BYTES);
  });

  it("keeps each channel at or under the per-record figure §8.1 tabulates", () => {
    // A shape that outgrew the record it is documented by, caught before it
    // reaches the sum above — which is where it becomes a quota failure on
    // somebody's device instead.
    for (const channel of registeredChannels())
      expect(
        recordBytes(channel),
        `${channel.name} record`
      ).toBeLessThanOrEqual(budgetOf(channel).tabulated);
  });

  it("weighs the cap the channel actually declares", () => {
    // ADR-0053 §7's 200 is load-bearing for #142's bar, so it is not a number
    // this file may assume: it is read off the declaration, and the sum moves
    // with it.
    const search = registeredChannels().find((c) => c.name === "search");
    expect(search?.cap).toBe(200);
  });
});
