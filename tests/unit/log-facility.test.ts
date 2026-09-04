import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { findEgressCalls } from "../../scripts/log-egress-check.mjs";
import type { TrackedDomainId } from "../../src/lib/facets/registry";

/** One of this repo's own modules, read as text for a claim about its source. */
const readCode = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

/**
 * The local log facility (ADR-0092): channels, levels, the dial, the caps, the
 * shared byte budget, redaction, and the reviewed export. Everything here is
 * asserted against the real `localStorage` read/write path, through a fake store
 * the Node runner can carry — the same arrangement `secrets.test.ts` uses, for
 * the same reason: the guarded accessors ARE the behaviour being tested.
 */

interface FakeLocalStorage {
  store: Map<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function makeFakeLocalStorage(
  onSet?: (key: string, value: string) => void
): FakeLocalStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      onSet?.(k, v);
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

// The registry is module state, so every test takes a fresh copy of the module
// and declares its channels into it.
async function loadFacility() {
  vi.resetModules();
  return import("../../src/lib/logs/log-facility");
}

type Facility = Awaited<ReturnType<typeof loadFacility>>;

interface Note {
  text: string;
}

const parseNote = (raw: unknown): Note | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const text = (raw as { text?: unknown }).text;
  return typeof text === "string" ? { text } : null;
};

function declareNotes(
  facility: Facility,
  name: string,
  cap = 3,
  domain: TrackedDomainId | null = "food",
  version = 1
) {
  return facility.defineChannel({
    name,
    domain,
    purpose: "the tests below; they decide whether the facility works.",
    cap,
    version,
    parse: parseNote,
  });
}

/**
 * A channel that counts what it records. Its `tally` takes its entry
 * contextually and returns only declared names, which is the shape §12's two
 * guards exist to hold.
 */
function declareTallied(facility: Facility, name: string, cap = 3) {
  return facility.defineChannel({
    name,
    domain: "food",
    purpose: "the tests below; they decide whether the counters work.",
    cap,
    version: 1,
    parse: parseNote,
    counters: ["kept", "lost"],
    tally: (entry) => (entry.text === "lost" ? ["lost"] : ["kept"]),
  });
}

/** One record as it is actually stored: the facility's envelope round an entry. */
const stored = (entry: unknown, v = 1, lvl = 9) => ({ v, lvl, entry });

/** INFO, which every dial position captures. Levels have their own block below. */
const INFO = 9 as const;

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("declaring a channel", () => {
  it("registers it, so the review surface finds it without being told", async () => {
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    expect(facility.registeredChannels()).toEqual([channel]);
  });

  it("refuses a channel whose purpose says nothing (ADR-0092 §2)", async () => {
    // The type catches `""` and a runtime-assembled `string`; it cannot see
    // through a space, which is why this one throw survives.
    const facility = await loadFacility();
    expect(() =>
      facility.defineChannel({
        name: "unstated",
        domain: "food",
        purpose: "   ",
        cap: 10,
        version: 1,
        parse: parseNote,
      })
    ).toThrow(/purpose/i);
  });

  it("refuses a second channel under the same name", async () => {
    const facility = await loadFacility();
    declareNotes(facility, "notes");
    expect(() => declareNotes(facility, "notes")).toThrow(/notes/);
  });

  it("refuses a cap that retains nothing", async () => {
    const facility = await loadFacility();
    expect(() => declareNotes(facility, "notes", 0)).toThrow(/cap/i);
  });
});

describe("storage", () => {
  it("writes one namespaced localStorage key per channel", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    facility.appendToChannel(channel, { text: "one" }, INFO);

    expect([...ls.store.keys()]).toEqual(["inventoria_log_notes"]);
    expect(facility.readChannel(channel)).toEqual([{ text: "one" }]);
  });

  it("keeps arrival order, oldest first", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    facility.appendToChannel(channel, { text: "one" }, INFO);
    facility.appendToChannel(channel, { text: "two" }, INFO);

    expect(facility.readChannel(channel)).toEqual([
      { text: "one" },
      { text: "two" },
    ]);
  });

  it("drops the oldest entry once the channel is at its cap", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes", 2);

    facility.appendToChannel(channel, { text: "one" }, INFO);
    facility.appendToChannel(channel, { text: "two" }, INFO);
    facility.appendToChannel(channel, { text: "three" }, INFO);

    expect(facility.readChannel(channel)).toEqual([
      { text: "two" },
      { text: "three" },
    ]);
  });

  it("drops a stored record the channel cannot read", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([stored({ text: "kept" }), stored({ wrong: true })])
    );

    expect(facility.readChannel(channel)).toEqual([{ text: "kept" }]);
  });

  it("reads empty when the stored value is not a JSON array", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set("inventoria_log_notes", "{ not json");

    expect(facility.readChannel(channel)).toEqual([]);
  });
});

describe("best-effort writing", () => {
  it("reads empty and writes nothing with no localStorage at all", async () => {
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    expect(() =>
      facility.appendToChannel(channel, { text: "one" }, INFO)
    ).not.toThrow();
    expect(facility.readChannel(channel)).toEqual([]);
  });

  it("swallows a quota error rather than failing the caller", async () => {
    vi.stubGlobal(
      "localStorage",
      makeFakeLocalStorage(() => {
        throw new Error("QuotaExceededError");
      })
    );
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    expect(() =>
      facility.appendToChannel(channel, { text: "one" }, INFO)
    ).not.toThrow();
    expect(facility.readChannel(channel)).toEqual([]);
  });

  it("swallows a privacy-locked store that throws on read", async () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("SecurityError");
      },
      setItem() {
        throw new Error("SecurityError");
      },
      removeItem() {
        throw new Error("SecurityError");
      },
    });
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    expect(facility.readChannel(channel)).toEqual([]);
  });
});

describe("the shared byte budget", () => {
  it("sheds the largest channel's oldest entries until the total fits", async () => {
    const facility = await loadFacility();
    const shed = facility.shedToBudget(
      [
        { name: "big", entries: ["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"] },
        { name: "small", entries: ["d"] },
      ],
      40
    );
    // The big channel loses its oldest, never the small one — and it stops
    // shedding the moment the total is under budget.
    expect(shed).toEqual([
      { name: "big", entries: ["bbbbbbbbbb", "cccccccccc"] },
      { name: "small", entries: ["d"] },
    ]);
  });

  it("stops when every channel is empty rather than looping", async () => {
    const facility = await loadFacility();
    expect(facility.shedToBudget([{ name: "a", entries: [] }], 0)).toEqual([
      { name: "a", entries: [] },
    ]);
  });

  it("takes from the largest channel when a write puts the whole log over", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const big = declareNotes(facility, "big", 500);
    const small = declareNotes(facility, "small", 500);
    facility.appendToChannel(small, { text: "small" }, INFO);
    const bulky = "x".repeat(100_000);
    for (let i = 0; i < 4; i++)
      facility.appendToChannel(big, { text: `${i}${bulky}` }, INFO);

    // 4 × 100 KB is over the 256 KiB budget, so the big channel has shed and the
    // small one is untouched.
    const kept = facility.readChannel(big);
    expect(kept.length).toBeLessThan(4);
    expect(kept[0].text.startsWith("0")).toBe(false);
    expect(facility.readChannel(small)).toEqual([{ text: "small" }]);
  });
});

describe("redaction", () => {
  it("deletes one entry from the channel rather than hiding it", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    facility.appendToChannel(channel, { text: "keep" }, INFO);
    facility.appendToChannel(channel, { text: "redact me" }, INFO);

    facility.deleteChannelEntry(channel, 1);

    expect(facility.readChannel(channel)).toEqual([{ text: "keep" }]);
    // The text is gone from storage, not shadowed by a later record.
    expect(ls.store.get("inventoria_log_notes")).not.toContain("redact me");
  });

  it("keeps every record the channel cannot read (#219)", async () => {
    // Redaction used to write `readChannel`'s output back, so removing one row
    // removed every record the current code could not parse. A channel that
    // never ends (ADR-0071) is designed to outlive many entry shapes, and the
    // one screen that redacts is the one somebody reaches for just before
    // handing the file over.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([
        stored({ text: "older shape" }, 0),
        stored({ text: "keep" }),
        stored({ half: "written" }),
        stored({ text: "redact me" }),
      ])
    );

    facility.deleteChannelEntry(channel, 1);

    expect(facility.readChannel(channel)).toEqual([{ text: "keep" }]);
    const kept: unknown[] = JSON.parse(ls.store.get("inventoria_log_notes")!);
    expect(kept).toEqual([
      stored({ text: "older shape" }, 0),
      stored({ text: "keep" }),
      stored({ half: "written" }),
    ]);
  });

  it("removes the record the caller meant, counting only readable ones", async () => {
    // The index the review sheet holds is an index into `readChannel`'s order,
    // and the record to remove lives in the raw list — so the two have to be
    // mapped onto each other rather than one spliced as if it were the other.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([
        stored({ unreadable: 1 }),
        stored({ text: "zero" }),
        stored({ unreadable: 2 }),
        stored({ text: "one" }),
      ])
    );

    facility.deleteChannelEntry(channel, 0);

    expect(facility.readChannel(channel)).toEqual([{ text: "one" }]);
  });

  it("leaves an out-of-range index alone", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([stored({ unreadable: 1 }), stored({ text: "only" })])
    );

    facility.deleteChannelEntry(channel, -1);
    facility.deleteChannelEntry(channel, 1);

    const kept: unknown[] = JSON.parse(ls.store.get("inventoria_log_notes")!);
    expect(kept).toEqual([stored({ unreadable: 1 }), stored({ text: "only" })]);
  });

  it("clears a whole channel", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    facility.appendToChannel(channel, { text: "one" }, INFO);

    facility.clearChannel(channel);

    expect(facility.readChannel(channel)).toEqual([]);
    expect(ls.store.has("inventoria_log_notes")).toBe(false);
  });
});

describe("the recording switch", () => {
  it("makes an append a no-op while recording is off", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    facility.setChannelRecording(channel, false);
    facility.appendToChannel(channel, { text: "one" }, INFO);

    expect(facility.isChannelRecording(channel)).toBe(false);
    expect(facility.readChannel(channel)).toEqual([]);
  });

  it("records again when it is switched back on", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    facility.setChannelRecording(channel, false);
    facility.setChannelRecording(channel, true);
    facility.appendToChannel(channel, { text: "one" }, INFO);

    expect(facility.readChannel(channel)).toEqual([{ text: "one" }]);
  });

  it("keeps its own key out of the channel keyspace", async () => {
    // `inventoria_log_paused` would be the key of a channel named `paused`, and
    // the duplicate-name guard only sees channel against channel — so the two
    // would silently wipe each other.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const paused = declareNotes(facility, "paused");

    facility.setChannelRecording(paused, false);
    facility.setChannelRecording(paused, true);
    facility.appendToChannel(paused, { text: "one" }, INFO);

    expect(facility.readChannel(paused)).toEqual([{ text: "one" }]);
    expect([...ls.store.keys()]).toEqual(["inventoria_log_paused"]);
  });

  it("records by default", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    expect(facility.isChannelRecording(channel)).toBe(true);
  });
});

describe("levels and the dial (ADR-0092 §4, §5)", () => {
  it("names four anchors and nothing between them", async () => {
    const facility = await loadFacility();
    expect(facility.SEVERITY).toEqual({
      ERROR: 17,
      WARN: 13,
      INFO: 9,
      DEBUG: 5,
    });
  });

  it("offers three positions, the middle one by default", async () => {
    // ERROR is not a position: no dial setting hides a warning. `Normal` is the
    // default, so the boot narration and the per-fire sequence are never a
    // standing cost.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    expect(facility.DIAL_POSITIONS.map((p) => p.threshold)).toEqual([13, 9, 5]);
    expect(facility.dialPosition()).toBe(9);
  });

  it("stores the threshold, never one of three category names", async () => {
    // A position is a threshold on a continuous scale, so it includes everything
    // more severe for free and widening later moves a number.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();

    facility.setDialPosition(5);

    expect(ls.store.get("inventoria_logs_level")).toBe("5");
    expect(facility.dialPosition()).toBe(5);
  });

  it("keeps its key beside the pause, out of the channel keyspace", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    facility.setDialPosition(13);
    expect([...ls.store.keys()]).toEqual(["inventoria_logs_level"]);
  });

  it("reads a stored position that is not one of the three as the default", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    ls.store.set("inventoria_logs_level", "17");
    const facility = await loadFacility();
    expect(facility.dialPosition()).toBe(9);
  });

  it("resolves the threshold once and holds it", async () => {
    // `capturedAt` sits on the search's per-fire path, so a `localStorage` read
    // per keystroke is exactly what this avoids.
    let reads = 0;
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", {
      ...ls,
      getItem: (k: string) => {
        reads += 1;
        return ls.getItem(k);
      },
    });
    const facility = await loadFacility();

    for (let i = 0; i < 20; i++) facility.capturedAt(9);

    expect(reads).toBe(1);
  });

  it("captures everything at or above the position, and nothing below", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();

    facility.setDialPosition(13);
    expect(
      ([17, 13, 9, 5] as const).map((l) => facility.capturedAt(l))
    ).toEqual([true, true, false, false]);

    facility.setDialPosition(5);
    expect(
      ([17, 13, 9, 5] as const).map((l) => facility.capturedAt(l))
    ).toEqual([true, true, true, true]);
  });

  it("stamps the level on the envelope, where parse never sees it", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const seen: unknown[] = [];
    const channel = facility.defineChannel({
      name: "notes",
      domain: "food" as TrackedDomainId,
      purpose: "this test; it decides whether parse sees the level.",
      cap: 3,
      version: 1,
      parse: (raw: unknown) => {
        seen.push(raw);
        return parseNote(raw);
      },
    });

    facility.appendToChannel(channel, { text: "one" }, 17);
    facility.readChannel(channel);

    expect(JSON.parse(ls.store.get("inventoria_log_notes")!)).toEqual([
      { v: 1, lvl: 17, entry: { text: "one" } },
    ]);
    expect(seen).toEqual([{ text: "one" }]);
  });

  it("drops a write below the position, and keeps one at it", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    facility.setDialPosition(13);
    facility.appendToChannel(channel, { text: "info" }, 9);
    facility.appendToChannel(channel, { text: "warn" }, 13);

    expect(facility.readChannel(channel)).toEqual([{ text: "warn" }]);
  });

  it("reads a record written before the level existed, and invents none", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([{ v: 1, entry: { text: "no level" } }])
    );

    expect(facility.readChannel(channel)).toEqual([{ text: "no level" }]);
    // Nothing rewrote it, and nothing treated its absence as a reason to shed it.
    expect(JSON.parse(ls.store.get("inventoria_log_notes")!)).toEqual([
      { v: 1, entry: { text: "no level" } },
    ]);
  });

  it("sheds by age whatever the levels are (§6)", async () => {
    // The cap reads no level, refuses no record and reserves no slot: a log is
    // read as a sequence, and shedding by level deletes the context round the
    // record it saves.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes", 2);

    facility.setDialPosition(5);
    facility.appendToChannel(channel, { text: "old error" }, 17);
    facility.appendToChannel(channel, { text: "debug" }, 5);
    facility.appendToChannel(channel, { text: "info" }, 9);

    expect(facility.readChannel(channel)).toEqual([
      { text: "debug" },
      { text: "info" },
    ]);
  });

  it("is not an off switch, and the pause is not a dial", async () => {
    // Orthogonal: the dial says how much detail, the pause says whether this
    // stream at all. Neither position can silence a channel, and no pause
    // changes what another channel captures.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const paused = declareNotes(facility, "paused-one");
    const loud = declareNotes(facility, "loud");

    facility.setDialPosition(5);
    facility.setChannelRecording(paused, false);
    facility.appendToChannel(paused, { text: "hushed" }, 17);
    facility.appendToChannel(loud, { text: "trace" }, 5);

    expect(facility.readChannel(paused)).toEqual([]);
    expect(facility.readChannel(loud)).toEqual([{ text: "trace" }]);
  });
});

describe("counters (ADR-0092 §9)", () => {
  // A counter is a running total of a field the entries already record, a whole
  // number and nothing else, shed last and cleared only with the channel. The
  // three constraints ADR-0054's Amendment placed on them, carried into §9.
  //
  // Every append below names the instant it happened at, so the epoch these
  // assert is the one the caller gave rather than whatever the runner's clock
  // read: `appendToChannel`'s fourth argument is the facility's only clock seam.
  const MINTED = 1757062800000;
  const COUNTERS_KEY = "inventoria_log_notes_counters";

  it("totals the names a tally returns, under a key of its own", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");

    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);
    facility.appendToChannel(channel, { text: "lost" }, INFO, MINTED);
    facility.appendToChannel(channel, { text: "two" }, INFO, MINTED);

    expect(facility.channelCounters(channel, 0)).toEqual({
      counts: { kept: 2, lost: 1 },
      since: MINTED,
    });
    // Its own key, which is the whole of what makes the shed-last promise true.
    expect(ls.store.has(COUNTERS_KEY)).toBe(true);
    expect(ls.store.get("inventoria_log_notes")).not.toContain("kept");
  });

  it("counts every name the tally returns, so one entry may count twice", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = facility.defineChannel({
      name: "twice",
      domain: "food",
      purpose: "this test; it decides whether a tally is a list or a set.",
      cap: 3,
      version: 1,
      parse: parseNote,
      counters: ["kept"],
      tally: () => ["kept", "kept"],
    });

    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);

    expect(facility.channelCounters(channel, 0)?.counts).toEqual({ kept: 2 });
  });

  it("stands after every entry it counted has gone (the shed-last promise)", async () => {
    // `writeRecords` removes the entries key outright at zero records, so while
    // the two shared a key the promise was false in code rather than merely
    // fragile. This is the assertion that shape exists for.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");
    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);
    facility.appendToChannel(channel, { text: "two" }, INFO, MINTED);

    facility.deleteChannelEntry(channel, 0);
    facility.deleteChannelEntry(channel, 0);

    expect(ls.store.has("inventoria_log_notes")).toBe(false);
    // And the redaction did not decrement either (#214 §8): the count of a
    // redacted entry survives its redaction, and clearing the channel is what
    // removes it.
    expect(facility.channelCounters(channel, 0)?.counts).toEqual({
      kept: 2,
      lost: 0,
    });
  });

  it("survives the shared budget, which never weighs it", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes", 500);
    const bulky = "x".repeat(100_000);
    for (let i = 0; i < 4; i++)
      facility.appendToChannel(channel, { text: `${i}${bulky}` }, INFO, MINTED);

    expect(facility.readChannel(channel).length).toBeLessThan(4);
    expect(facility.channelCounters(channel, 0)?.counts).toEqual({
      kept: 4,
      lost: 0,
    });
  });

  it("increments even when the dial suppressed the record (§9)", async () => {
    // The dial is a budget device and a counter is not bytes. Gating counters
    // would let a global setting silently hole the one number that exists to
    // survive shedding: turn it down and you keep the rate, you lose the detail.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");
    facility.setDialPosition(facility.SEVERITY.WARN);

    facility.appendToChannel(
      channel,
      { text: "one" },
      facility.SEVERITY.DEBUG,
      MINTED
    );

    expect(facility.readChannel(channel)).toEqual([]);
    expect(facility.channelCounters(channel, 0)?.counts).toEqual({
      kept: 1,
      lost: 0,
    });
  });

  it("stops while the channel's recording is paused (§9)", async () => {
    // The smaller version of the same hole, accepted: pausing is an explicit,
    // visible, per-channel act, and a counter that kept running while the
    // channel reads "not recording" would make "stop recording" stop meaning
    // what it says.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");
    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);

    facility.setChannelRecording(channel, false);
    facility.appendToChannel(channel, { text: "two" }, INFO, MINTED);

    expect(facility.channelCounters(channel, 0)?.counts).toEqual({
      kept: 1,
      lost: 0,
    });
  });

  it("reads a counter that has never fired as zero, not as absent", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");

    expect(facility.channelCounters(channel, 1700000000000)).toEqual({
      counts: { kept: 0, lost: 0 },
      since: 1700000000000,
    });
  });

  it("holds nothing at all for a channel that declares none", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "plain");
    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);

    expect(facility.channelCounters(channel, MINTED)).toBeNull();
  });

  it("keeps the names the declaration carries, and only whole numbers", async () => {
    // The cardinality bound is an invariant the projection holds rather than a
    // rule a reviewer applies: a name outside the declared set is not stored, a
    // value that is not a whole number is not a count, and a declared name the
    // store has nothing for reads zero.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");
    ls.store.set(
      COUNTERS_KEY,
      JSON.stringify({
        counts: { kept: 7, lost: 1.5, gone: 99 },
        since: 1600000000000,
      })
    );

    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);

    expect(facility.channelCounters(channel, 0)).toEqual({
      counts: { kept: 8, lost: 0 },
      since: 1600000000000,
    });
    expect(ls.store.get(COUNTERS_KEY)).not.toContain("gone");
  });

  it("keeps totals whose stamp it cannot read, and stamps them afresh", async () => {
    // The two halves fail for different reasons and one of them is recoverable:
    // totals without a readable epoch are still totals, and re-stamping them
    // understates the window rather than overstating the rate. Only a blob that
    // is no counter set at all starts from zero.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");
    ls.store.set(COUNTERS_KEY, JSON.stringify({ counts: { kept: 7 } }));

    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);

    expect(facility.channelCounters(channel, 0)).toEqual({
      counts: { kept: 8, lost: 0 },
      since: MINTED,
    });
  });

  it("leaves the counters alone when a tally throws, and records anyway", async () => {
    // A channel's own tally is the one piece of caller code this facility runs
    // on the write path, and §3's rule is that no feature fails because a log
    // could not be written.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = facility.defineChannel({
      name: "broken",
      domain: "food",
      purpose: "this test; it decides whether a broken tally breaks a search.",
      cap: 3,
      version: 1,
      parse: parseNote,
      counters: ["kept"],
      tally: (): readonly "kept"[] => {
        throw new Error("the channel's own bug");
      },
    });

    expect(() =>
      facility.appendToChannel(channel, { text: "one" }, INFO, MINTED)
    ).not.toThrow();
    expect(facility.readChannel(channel)).toEqual([{ text: "one" }]);
    expect(ls.store.has("inventoria_log_broken_counters")).toBe(false);
  });

  it("writes the counter key only when a count moves or the set is new", async () => {
    // Otherwise a tally contributing nothing rewrites the same bytes on every
    // event. The set is still minted by the FIRST append rather than the first
    // hit, because a window that starts when counting started can only
    // understate a rate, where one that starts at the first hit overstates it.
    const writes: string[] = [];
    vi.stubGlobal(
      "localStorage",
      makeFakeLocalStorage((key) => void writes.push(key))
    );
    const facility = await loadFacility();
    const channel = facility.defineChannel({
      name: "quiet",
      domain: "food",
      purpose: "this test; it decides when the counter key is rewritten.",
      cap: 3,
      version: 1,
      parse: parseNote,
      counters: ["never"],
      tally: () => [],
    });

    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);
    facility.appendToChannel(channel, { text: "two" }, INFO, MINTED + 1000);

    expect(writes.filter((k) => k === "inventoria_log_quiet_counters")).toEqual(
      ["inventoria_log_quiet_counters"]
    );
    expect(facility.channelCounters(channel, 0)).toEqual({
      counts: { never: 0 },
      since: MINTED,
    });
  });

  it("keeps its epoch across every append, and takes a new one after a clear", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareTallied(facility, "notes");
    facility.appendToChannel(channel, { text: "one" }, INFO, MINTED);
    facility.appendToChannel(channel, { text: "two" }, INFO, MINTED + 86400000);

    expect(facility.channelCounters(channel, 0)?.since).toBe(MINTED);

    // Cleared only when the channel is, and the epoch is what makes the zeroes
    // honest afterwards.
    const CLEARED = MINTED + 172800000;
    facility.clearChannel(channel);
    facility.appendToChannel(channel, { text: "three" }, INFO, CLEARED);

    expect(facility.channelCounters(channel, 0)).toEqual({
      counts: { kept: 1, lost: 0 },
      since: CLEARED,
    });
  });

  it("carries the counters and their epoch into the export, beside the entries", async () => {
    // A number without its epoch is a dishonest label, and an exported file
    // outlives the screen that would have explained it.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const tallied = declareTallied(facility, "notes");
    const plain = declareNotes(facility, "plain");
    facility.appendToChannel(tallied, { text: "lost" }, INFO, MINTED);
    facility.appendToChannel(plain, { text: "one" }, INFO, MINTED);

    const payload = facility.buildLogExport([tallied, plain], 1700000000000);

    expect(payload.channels[0]).toMatchObject({
      name: "notes",
      entries: [{ text: "lost" }],
      counters: { kept: 0, lost: 1 },
      counters_since: MINTED,
    });
    // A channel that declares none carries neither field rather than an empty
    // object somebody has to interpret.
    expect(payload.channels[1]).not.toHaveProperty("counters");
    expect(payload.channels[1]).not.toHaveProperty("counters_since");
  });

  it("declares both halves or neither, and a tally names only what was declared", async () => {
    // The compile-time guards (§12), asserted where the type checker runs:
    // `pnpm check` typechecks `tests/`, so an expectation that stops erroring is
    // a failure here rather than a review comment nobody wrote.
    const facility = await loadFacility();
    facility.defineChannel({
      name: "no-counters",
      domain: "food",
      purpose: "this test; it decides whether a lone tally compiles.",
      cap: 3,
      version: 1,
      parse: parseNote,
      // @ts-expect-error a tally needs the counters it totals
      tally: () => ["kept"],
    });
    facility.defineChannel({
      name: "no-tally",
      domain: "food",
      purpose: "this test; it decides whether lone counters compile.",
      cap: 3,
      version: 1,
      parse: parseNote,
      // @ts-expect-error counters need the tally that fills them
      counters: ["kept"],
    });
    facility.defineChannel({
      name: "undeclared",
      domain: "food",
      purpose: "this test; it decides whether a tally may invent a name.",
      cap: 3,
      version: 1,
      parse: parseNote,
      counters: ["kept"],
      // @ts-expect-error "invented" is not one of the declared counters
      tally: () => ["invented"],
    });
    expect(facility.registeredChannels().map((c) => c.name)).toEqual([
      "no-counters",
      "no-tally",
      "undeclared",
    ]);
  });
});

describe("the export payload", () => {
  it("carries only the chosen channels, each with what the review showed", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const chosen = declareNotes(facility, "chosen");
    const other = declareNotes(facility, "other");
    facility.appendToChannel(chosen, { text: "mine" }, INFO);
    facility.appendToChannel(other, { text: "not mine" }, INFO);

    const payload = facility.buildLogExport([chosen], 1700000000000);

    expect(payload).toEqual({
      artifact: "inventoria-local-log",
      schema_version: 1,
      exported_at: 1700000000000,
      dial: 9,
      channels: [
        {
          name: "chosen",
          purpose: chosen.purpose,
          version: 1,
          unreadable: 0,
          entries: [{ text: "mine" }],
        },
      ],
    });
  });

  it("counts what it could not read, and carries none of it (#229)", async () => {
    // A count, never the contents: an older shape may hold exactly the free
    // text a current one excludes by construction. `version` is what makes the
    // count interpretable to whoever receives the file.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes", 3, "food", 2);
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([
        stored({ text: "last year's shape" }, 1),
        stored({ text: "current" }, 2),
      ])
    );

    const payload = facility.buildLogExport([channel], 1700000000000);

    expect(payload.channels[0]).toMatchObject({
      version: 2,
      unreadable: 1,
      entries: [{ text: "current" }],
    });
    expect(JSON.stringify(payload)).not.toContain("last year's shape");
  });

  it("discloses the dial it was built under, and filters nothing on it", async () => {
    // ADR-0092 §10 and §10.1, in one test because the second claim needs the
    // first: the position is what explains the gap between the complete rate
    // and the filtered detail, since counters run regardless of the dial and
    // entries do not. Without it a log taken at *Errors & warnings* reads as a
    // quiet app rather than a filtered one, and an exported file outlives the
    // screen that would have said which.
    //
    // The withdrawn `min_level` filter is the other half, asserted as absent: a
    // record captured at DEBUG is still in the file after the dial moves up to
    // WARN. Filtering here would keep `search`'s WARN records — the ones
    // carrying the typed text — and drop the INFO ones that do not.
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    facility.setDialPosition(facility.SEVERITY.DEBUG);
    facility.appendToChannel(
      channel,
      { text: "trace" },
      facility.SEVERITY.DEBUG
    );
    facility.appendToChannel(
      channel,
      { text: "failed" },
      facility.SEVERITY.ERROR
    );
    facility.setDialPosition(facility.SEVERITY.WARN);

    const payload = facility.buildLogExport([channel], 1700000000000);

    expect(payload.dial).toBe(13);
    expect(payload.channels[0].entries).toEqual([
      { text: "trace" },
      { text: "failed" },
    ]);
  });
});

describe("the version envelope (#229)", () => {
  it("stamps the channel's version and hands parse the entry alone", async () => {
    // `parse` never sees `v`, which is the property #214 §4's facility-owned
    // diagnostic entry depends on: an entry shape keeps no dependency on the
    // envelope round it.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const seen: unknown[] = [];
    const channel = facility.defineChannel({
      name: "notes",
      domain: "food" as TrackedDomainId,
      purpose: "this test; it decides whether parse sees the envelope.",
      cap: 3,
      version: 7,
      parse: (raw: unknown) => {
        seen.push(raw);
        return parseNote(raw);
      },
    });

    facility.appendToChannel(channel, { text: "one" }, INFO);
    facility.readChannel(channel);

    expect(JSON.parse(ls.store.get("inventoria_log_notes")!)).toEqual([
      { v: 7, lvl: 9, entry: { text: "one" } },
    ]);
    expect(seen).toEqual([{ text: "one" }]);
  });

  it("skips a record at another version, and keeps it", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes", 10, "food", 2);
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([stored({ text: "v1" }, 1), { text: "no envelope" }])
    );

    facility.appendToChannel(channel, { text: "v2" }, INFO);
    facility.deleteChannelEntry(channel, 0);

    // The appended entry was the only readable one, so redacting index 0 took
    // it — and neither unreadable record moved.
    expect(facility.readChannel(channel)).toEqual([]);
    expect(JSON.parse(ls.store.get("inventoria_log_notes")!)).toEqual([
      stored({ text: "v1" }, 1),
      { text: "no envelope" },
    ]);
  });

  it("counts raw records, so a channel of unreadable ones can be cleared", async () => {
    // `channelEntryCount` feeds `disabled={entries === 0}`, so a parsed count
    // told the user a channel was empty, showed them nothing of it, and left
    // them no way to remove what was really there.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes", 10, "food", 2);
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([stored({ text: "v1" }, 1), stored({ text: "also" }, 1)])
    );

    expect(facility.channelEntryCount(channel)).toBe(2);
    expect(facility.readChannel(channel)).toEqual([]);
  });

  it("parses a golden stored record, envelope and all", async () => {
    // Without this the stamp never pays for itself, because `version` never
    // moves. It says nothing about older versions: #215 §6 leaves that optional,
    // so there is nothing to assert.
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([{ v: 1, entry: { text: "golden" } }])
    );

    expect(facility.readChannel(channel)).toEqual([{ text: "golden" }]);
  });

  it("walks the store once per read", async () => {
    let reads = 0;
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", {
      ...ls,
      getItem: (k: string) => {
        reads += 1;
        return ls.getItem(k);
      },
    });
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    ls.store.set(
      "inventoria_log_notes",
      JSON.stringify([stored({ text: "one" })])
    );

    reads = 0;
    const partition = facility.partitionChannel(channel);

    expect(partition).toEqual({ entries: [{ text: "one" }], unreadable: 0 });
    expect(reads).toBe(1);
  });
});

describe("who owns a channel (ADR-0080 §2)", () => {
  // A channel is carried by the Facet whose act writes it — clause (b) of
  // ADR-0080 §1 — and the owner it names is a Tracked Domain, because that is
  // the only owner ADR-0086 §1 leaves. A Facet's channels are then DERIVED from
  // the domains it already declares, so a Facet's card is not a second list.
  it("gives a Facet the channels of the domains it holds, and no others", async () => {
    const facility = await loadFacility();
    const groceries = declareNotes(facility, "groceries", 3, "food");
    const shelves = declareNotes(facility, "shelves", 3, "items");

    expect(facility.channelsOfFacet("food")).toEqual([groceries]);
    expect(facility.channelsOfFacet("root")).toEqual([groceries, shelves]);
  });

  it("gives a Facet nobody has heard of nothing at all", async () => {
    const facility = await loadFacility();
    declareNotes(facility, "groceries", 3, "food");
    expect(facility.channelsOfFacet("cellar")).toEqual([]);
  });

  it("gives a jar-wide channel to every Facet, the root included (ADR-0092 §13)", async () => {
    // `channelsOfFacet` builds a Set of domain id strings, so a `null` domain is
    // in NO Facet's set — the root's included, even though the root holds all
    // six. Tested as the four surfaces' single source: a channel missing here is
    // invisible in every card, absent from every export, untouched by every
    // wipe, and still spending the budget.
    const facility = await loadFacility();
    const groceries = declareNotes(facility, "groceries", 3, "food");
    const app = declareNotes(facility, "app", 3, null);

    expect(facility.channelsOfFacet("root")).toEqual([groceries, app]);
    expect(facility.channelsOfFacet("food")).toEqual([groceries, app]);
    expect(facility.channelsOfFacet("cellar")).toEqual([app]);
  });

  it("names the search channel's owner as the domain that writes it", async () => {
    // ADR-0080's measured fact: there is exactly one registered channel in the
    // app and it is food's. The whole of the jar-wide Local Logs card's current
    // content therefore belongs to Rations.
    vi.resetModules();
    const { SEARCH_CHANNEL } = await import("../../src/lib/logs/search-log");
    expect(SEARCH_CHANNEL.domain).toBe("food");
  });
});

// The property itself is `scripts/log-egress-check.mjs`'s, because it is a
// claim about an import closure the compiler resolves and a test suite has no
// business spawning tsc. What this file used to assert instead — that
// `log-facility.ts`'s own text names none of five APIs — could not see the
// export at all: the egress was in `LogReviewSheet.svelte`, which imports the
// facility rather than the other way about, and `createObjectURL` was not on
// the list in any case (#223).
//
// What is left here is the gate's matcher, for the reason `relay.test.ts` tests
// the other one: a matcher that never matches would pass every build silently.
describe("the egress matcher the no-transport gate is built on", () => {
  it("finds a network call in a module that makes one", () => {
    expect(findEgressCalls("const res = await fetch(url);")).toEqual(["fetch"]);
  });

  it("finds every API on the list, in the order they appear", () => {
    expect(
      findEgressCalls(
        `new WebSocket(u); new EventSource(u); new XMLHttpRequest();
         navigator.sendBeacon(u, b); URL.createObjectURL(blob);
         window.showSaveFilePicker(); navigator.share({ files });`
      )
    ).toEqual([
      "WebSocket",
      "EventSource",
      "XMLHttpRequest",
      "sendBeacon",
      "URL.createObjectURL",
      "showSaveFilePicker",
      "navigator.share",
    ]);
  });

  it("does not read a comment as a call", () => {
    // Two real ones from this repo. The sibling gate reads raw text and says
    // that is the cheap direction to be wrong in, which is true of the relay's
    // four files and false here: this one scans a closure of modules whose
    // authors are not writing for it, and `usda-fdc.ts` says "no network
    // re-fetch (ADR-0016)" in prose.
    expect(
      findEgressCalls(`// today can be backfilled later with no network re-fetch
         /* a WebSocket would be a transport */
         <!-- and so would navigator.share -->
         const local = 1;`)
    ).toEqual([]);
  });

  it("finds none in the facility as it stands", () => {
    expect(findEgressCalls(readCode("src/lib/logs/log-facility.ts"))).toEqual(
      []
    );
  });

  it("finds the one the export vehicle is allowed", () => {
    // The gate fails on an egress module that names nothing, so this is the
    // case that keeps that arm honest rather than vacuous.
    expect(
      findEgressCalls(readCode("src/lib/views/logs/export-target.ts"))
    ).toEqual(["URL.createObjectURL"]);
  });
});

describe("the payload that leaves is the payload that was reviewed", () => {
  // The other half of the property #213 §5 settled on, and the half
  // `log-egress-check.mjs` deliberately does not hold: a gate over an import
  // closure can say where bytes may leave from, never that they are the bytes
  // on screen. One serialisation, rendered and handed over, is what makes the
  // reviewed value and the written value one value rather than two.
  const REVIEW = readCode("src/lib/views/logs/LogReviewSheet.svelte");

  it("serialises the payload exactly once", () => {
    expect(REVIEW.match(/JSON\.stringify\(payload/g)).toHaveLength(1);
  });

  it("renders that string and hands the same one to the vehicle", () => {
    expect(REVIEW).toContain('<pre class="payload">{payloadText}</pre>');
    expect(REVIEW).toContain("downloadLogExport(payloadText, exported_at)");
  });
});
