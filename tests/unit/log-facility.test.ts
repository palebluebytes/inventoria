import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { TrackedDomainId } from "../../src/lib/facets/registry";

/**
 * The local log facility (ADR-0054): channels, their caps, the shared byte
 * budget, redaction, and the reviewed export. Everything here is asserted
 * against the real `localStorage` read/write path, through a fake store the Node
 * runner can carry — the same arrangement `secrets.test.ts` uses, for the same
 * reason: the guarded accessors ARE the behaviour being tested.
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
  domain: TrackedDomainId = "food"
) {
  return facility.defineChannel({
    name,
    domain,
    reader: "the tests below; decides whether the facility works.",
    cap,
    sensitivity: "technical",
    parse: parseNote,
  });
}

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

  it("refuses a channel whose reader names nobody (ADR-0054 §2)", async () => {
    const facility = await loadFacility();
    expect(() =>
      facility.defineChannel({
        name: "unread",
        domain: "food",
        reader: "   ",
        cap: 10,
        sensitivity: "technical",
        parse: parseNote,
      })
    ).toThrow(/reader/i);
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

    facility.appendToChannel(channel, { text: "one" });

    expect([...ls.store.keys()]).toEqual(["inventoria_log_notes"]);
    expect(facility.readChannel(channel)).toEqual([{ text: "one" }]);
  });

  it("keeps arrival order, oldest first", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    facility.appendToChannel(channel, { text: "one" });
    facility.appendToChannel(channel, { text: "two" });

    expect(facility.readChannel(channel)).toEqual([
      { text: "one" },
      { text: "two" },
    ]);
  });

  it("drops the oldest entry once the channel is at its cap", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes", 2);

    facility.appendToChannel(channel, { text: "one" });
    facility.appendToChannel(channel, { text: "two" });
    facility.appendToChannel(channel, { text: "three" });

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
      JSON.stringify([{ text: "kept" }, { wrong: true }])
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
      facility.appendToChannel(channel, { text: "one" })
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
      facility.appendToChannel(channel, { text: "one" })
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
    facility.appendToChannel(small, { text: "small" });
    const bulky = "x".repeat(100_000);
    for (let i = 0; i < 4; i++)
      facility.appendToChannel(big, { text: `${i}${bulky}` });

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
    facility.appendToChannel(channel, { text: "keep" });
    facility.appendToChannel(channel, { text: "redact me" });

    facility.deleteChannelEntry(channel, 1);

    expect(facility.readChannel(channel)).toEqual([{ text: "keep" }]);
    // The text is gone from storage, not shadowed by a later record.
    expect(ls.store.get("inventoria_log_notes")).not.toContain("redact me");
  });

  it("clears a whole channel", async () => {
    const ls = makeFakeLocalStorage();
    vi.stubGlobal("localStorage", ls);
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");
    facility.appendToChannel(channel, { text: "one" });

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
    facility.appendToChannel(channel, { text: "one" });

    expect(facility.isChannelRecording(channel)).toBe(false);
    expect(facility.readChannel(channel)).toEqual([]);
  });

  it("records again when it is switched back on", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const channel = declareNotes(facility, "notes");

    facility.setChannelRecording(channel, false);
    facility.setChannelRecording(channel, true);
    facility.appendToChannel(channel, { text: "one" });

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
    facility.appendToChannel(paused, { text: "one" });

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

describe("the export payload", () => {
  it("carries only the chosen channels, each with what the review showed", async () => {
    vi.stubGlobal("localStorage", makeFakeLocalStorage());
    const facility = await loadFacility();
    const chosen = declareNotes(facility, "chosen");
    const other = declareNotes(facility, "other");
    facility.appendToChannel(chosen, { text: "mine" });
    facility.appendToChannel(other, { text: "not mine" });

    const payload = facility.buildLogExport([chosen], 1700000000000);

    expect(payload).toEqual({
      artifact: "inventoria-local-log",
      exported_at: 1700000000000,
      channels: [
        {
          name: "chosen",
          reader: chosen.reader,
          sensitivity: "technical",
          entries: [{ text: "mine" }],
        },
      ],
    });
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

  it("names the search channel's owner as the domain that writes it", async () => {
    // ADR-0080's measured fact: there is exactly one registered channel in the
    // app and it is food's. The whole of the jar-wide Local Logs card's current
    // content therefore belongs to Rations.
    vi.resetModules();
    const { SEARCH_CHANNEL } = await import("../../src/lib/logs/search-log");
    expect(SEARCH_CHANNEL.domain).toBe("food");
  });
});

describe("no transport, ever (ADR-0054 §5)", () => {
  it("the facility's source reaches no network API", () => {
    const source = readFileSync(
      new URL("../../src/lib/logs/log-facility.ts", import.meta.url),
      "utf8"
    );
    // The rule is about future changes, so it is asserted rather than assumed.
    for (const forbidden of [
      "fetch(",
      "XMLHttpRequest",
      "sendBeacon",
      "WebSocket",
      "EventSource",
      "import(",
    ])
      expect(source.includes(forbidden)).toBe(false);
  });
});
