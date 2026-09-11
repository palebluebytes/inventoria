import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  beginScanSession,
  closeScanSession,
  SCAN_ATTEMPTS,
  SCAN_DOORS,
  SCAN_OUTCOMES,
  scanAnswered,
  scanAttempted,
  scanOpenedDoor,
  scanEntryLabels,
  scanReport,
  type ScanAttempt,
  type ScanDoor,
  type ScanOutcome,
  type ScanSession,
} from "../../src/lib/logs/scan-log";
import { freshModule, freshModuleWithStorage } from "./support/local-storage";
import { readCode } from "./support/source";

/**
 * The scan channel (ADR-0071): one entry per barcode lookup against Open Food
 * Facts, carrying what OFF answered and what the user did about it — and never
 * the barcode.
 *
 * The suite is in four parts, and the order is the order the facts arrive: the
 * session as a pure fold, the two properties the record has to have for #208 to
 * be answerable from it (no identifier, and the outcome/door pair in one entry),
 * the write through the facility, and the reading ADR-0071 §6's view renders.
 */

const loadScanLog = () => import("../../src/lib/logs/scan-log");
const loadRoster = () => import("../../src/lib/logs/channels");

const AT = 1_757_000_000_000;

/** A session that got as far as an answer, with the attempt reported first. */
function answered(
  outcome: ScanOutcome,
  attempt: ScanAttempt = "single",
  door: ScanDoor = "none"
): ScanSession {
  let session = beginScanSession();
  session = scanAttempted(session, attempt);
  session = scanAnswered(session, outcome);
  if (door !== "none") session = scanOpenedDoor(session, door);
  return session;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a scan session, as a fold over what happened", () => {
  it("leaves exactly one entry for every outcome and every attempt state", () => {
    // ADR-0071 §2's unit. The grid is written out rather than sampled because
    // the ticket's first acceptance criterion is all four classes against all
    // three attempt states, and a sampled grid is the half that passes.
    for (const outcome of SCAN_OUTCOMES)
      for (const attempt of SCAN_ATTEMPTS) {
        const entry = closeScanSession(answered(outcome, attempt), AT);
        expect(entry, `${outcome}/${attempt}`).toEqual({
          outcome,
          attempt,
          door: "none",
          settled: outcome === "found",
          at: AT,
        });
      }
  });

  it("records nothing for a lookup that never answered", () => {
    // The sheet closed mid-fetch. There is no outcome, so there is no entry —
    // the same rule `search` keeps for a visit in which no search settled.
    expect(closeScanSession(beginScanSession(), AT)).toBeNull();
    expect(
      closeScanSession(scanAttempted(beginScanSession(), "single"), AT)
    ).toBeNull();
  });

  it("records nothing for an answer the retry policy did not report", () => {
    // Unreachable through `lookupBarcodeWithRetry`, which reports in a
    // `finally`. If it ever happens the honest answer is no record, not an
    // invented `single`.
    let session = beginScanSession();
    session = scanAnswered(session, "found");
    expect(closeScanSession(session, AT)).toBeNull();
  });

  it("settles a session that staged a food", () => {
    // `found` is an ending because the scan stages what it looked up in the
    // same statement that reads the payload.
    expect(closeScanSession(answered("found"), AT)?.settled).toBe(true);
  });

  it("settles a session that opened a capture door, whatever the outcome", () => {
    for (const outcome of SCAN_OUTCOMES)
      for (const door of ["missing", "poor", "unreadable"] as const)
        expect(
          closeScanSession(answered(outcome, "single", door), AT)?.settled,
          `${outcome}/${door}`
        ).toBe(true);
  });

  it("records an abandoned session, and says it was abandoned", () => {
    // The subtle ending: OFF did not answer, the banner offered Try again, and
    // the user walked away. It is still a lookup that happened and still
    // evidence about how often the scan works — it simply reached no ending.
    for (const outcome of ["absent", "unreachable", "refused"] as const) {
      const entry = closeScanSession(answered(outcome), AT);
      expect(entry, outcome).toMatchObject({ outcome, settled: false });
    }
  });

  it("keeps the last door, which is the one the session ended on", () => {
    let session = answered("unreachable", "retried", "unreadable");
    session = scanOpenedDoor(session, "missing");
    expect(closeScanSession(session, AT)?.door).toBe("missing");
  });

  it("advances without mutating the session it was handed", () => {
    // Held as data and advanced by pure functions, so "one entry per session"
    // is a fold rather than a component's lifecycle.
    const opened = beginScanSession();
    scanOpenedDoor(
      scanAnswered(scanAttempted(opened, "retried"), "found"),
      "poor"
    );
    expect(opened).toEqual({ outcome: null, attempt: null, door: "none" });
  });
});

describe("what the entry may never carry (ADR-0071 §4)", () => {
  it("holds five fields, all of them closed vocabularies and a clock", () => {
    // The structural half of §4: there is nowhere in this record for a barcode,
    // a product name, a brand or a `gtin:` id to ride, because every field but
    // the timestamp is one of three declared enums or a boolean.
    for (const outcome of SCAN_OUTCOMES)
      for (const attempt of SCAN_ATTEMPTS)
        for (const door of SCAN_DOORS) {
          const entry = closeScanSession(answered(outcome, attempt, door), AT)!;
          expect(Object.keys(entry).sort()).toEqual([
            "at",
            "attempt",
            "door",
            "outcome",
            "settled",
          ]);
          const values = JSON.stringify(entry);
          expect(values).not.toMatch(/gtin/);
          for (const value of [entry.outcome, entry.attempt, entry.door])
            expect([
              ...SCAN_OUTCOMES,
              ...SCAN_ATTEMPTS,
              ...SCAN_DOORS,
            ] as readonly string[]).toContain(value);
        }
  });

  it("is handed nothing that could carry one — its only import is the facility", () => {
    // The claim §4's shape argument actually rests on, and the one that catches
    // somebody widening the entry later: this module cannot reach an
    // `OffPayload`, a `gtin:` id or a product name, because it imports nothing
    // that has one. A field added tomorrow would have to import its source
    // through this line first. Comments stripped, because §4 is discussed at
    // length in the header and a claim a doc comment can satisfy is no claim.
    const code = readCode("src/lib/logs/scan-log.ts");
    const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./log-facility"]);
  });

  it("writes only its own vocabulary to the store, on every code path", async () => {
    // The strongest form of §4 available: not what the module says, but what
    // lands in `localStorage` after every outcome, attempt and door this
    // channel can produce. A free-text field added later fails here whatever it
    // is called.
    const [log, ls] = await freshModuleWithStorage(loadScanLog);
    let at = AT;
    for (const outcome of SCAN_OUTCOMES)
      for (const attempt of SCAN_ATTEMPTS)
        for (const door of SCAN_DOORS)
          log.recordScanSession(answered(outcome, attempt, door), at++);

    const permittedKeys = new Set([
      "v",
      "lvl",
      "entry",
      "outcome",
      "attempt",
      "door",
      "settled",
      "at",
      "counts",
      "since",
      ...(log.SCAN_CHANNEL.counters ?? []),
    ]);
    const permittedStrings = new Set<string>([
      ...SCAN_OUTCOMES,
      ...SCAN_ATTEMPTS,
      ...SCAN_DOORS,
    ]);

    const walk = (value: unknown, where: string): void => {
      if (typeof value === "string")
        expect(permittedStrings, where).toContain(value);
      else if (Array.isArray(value))
        value.forEach((item, i) => walk(item, `${where}[${i}]`));
      else if (typeof value === "object" && value !== null)
        for (const [key, inner] of Object.entries(value)) {
          expect(permittedKeys, `${where}.${key}`).toContain(key);
          walk(inner, `${where}.${key}`);
        }
    };

    for (const key of ["inventoria_log_scan", "inventoria_log_scan_counters"]) {
      const raw = ls.store.get(key);
      expect(raw, key).toBeDefined();
      walk(JSON.parse(raw!), key);
    }
  });

  it("puts the outcome and the door in one entry, which is what #208 reads", () => {
    // The pair is the whole reason the unit is the session: a capture opened
    // after `unreachable` is the poisoned twin #208 is about, one opened after
    // `absent` is the missing-barcode door working. Split across two entries
    // they would have to be rejoined by a key, and the only key is the barcode.
    const poisoned = closeScanSession(
      answered("unreachable", "single", "unreadable"),
      AT
    );
    const intended = closeScanSession(
      answered("absent", "single", "missing"),
      AT
    );
    expect(poisoned).toMatchObject({
      outcome: "unreachable",
      door: "unreadable",
    });
    expect(intended).toMatchObject({ outcome: "absent", door: "missing" });
  });
});

describe("the channel", () => {
  it("states the purpose ADR-0092 §2 requires, ADR-0071's cap and its domain", async () => {
    const { SCAN_CHANNEL } = await freshModule(loadScanLog);
    expect(SCAN_CHANNEL.name).toBe("scan");
    expect(SCAN_CHANNEL.cap).toBe(200);
    expect(SCAN_CHANNEL.domain).toBe("food");
    expect(SCAN_CHANNEL.purpose).toMatch(/#208/);
    expect(SCAN_CHANNEL.version).toBe(1);
  });

  it("declares one counter per enum value, plus settled and #208's pair", async () => {
    // ADR-0071 §5's list, and "nothing else". Written out rather than counted,
    // because a count passes for the wrong thirteen.
    const { SCAN_CHANNEL } = await freshModule(loadScanLog);
    expect([...(SCAN_CHANNEL.counters ?? [])].sort()).toEqual(
      [
        "attempt_gate_skipped",
        "attempt_retried",
        "attempt_single",
        "door_missing",
        "door_none",
        "door_poor",
        "door_unreadable",
        "outcome_absent",
        "outcome_found",
        "outcome_refused",
        "outcome_unreachable",
        "settled",
        "unreachable_then_door",
      ].sort()
    );
  });

  it("parses a golden stored record, envelope and all", async () => {
    // Without a golden, `version` never moves, because nothing notices the
    // shape changed.
    const [log, ls] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");
    ls.store.set(
      "inventoria_log_scan",
      JSON.stringify([
        {
          v: 1,
          lvl: 13,
          entry: {
            outcome: "unreachable",
            attempt: "retried",
            door: "unreadable",
            settled: true,
            at: AT,
          },
        },
      ])
    );
    expect(facility.readChannel(log.SCAN_CHANNEL)).toEqual([
      {
        outcome: "unreachable",
        attempt: "retried",
        door: "unreadable",
        settled: true,
        at: AT,
      },
    ]);
  });

  it("refuses a record whose enum this build does not know", async () => {
    // Kept and disclosed as unreadable, never rewritten: a session whose door
    // is unknown is a session whose ending is unknown, and counting it either
    // way would be the parse inventing the fact the entry carries.
    const [log, ls] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");
    ls.store.set(
      "inventoria_log_scan",
      JSON.stringify([
        {
          v: 1,
          lvl: 9,
          entry: {
            outcome: "found",
            attempt: "single",
            door: "photographed",
            settled: true,
            at: AT,
          },
        },
      ])
    );
    expect(facility.partitionChannel(log.SCAN_CHANNEL)).toEqual({
      entries: [],
      unreadable: 1,
    });
  });
});

describe("what level a session is recorded at (ADR-0092 §5.2)", () => {
  it("puts a refused settled session at ERROR, above an outage", async () => {
    const { scanSessionLevel, closeScanSession: close } =
      await freshModule(loadScanLog);
    const level = (outcome: ScanOutcome) =>
      scanSessionLevel(close(answered(outcome, "single", "missing"), AT)!);
    expect(level("refused")).toBe(17);
    expect(level("unreachable")).toBe(13);
    expect(level("absent")).toBe(13);
    expect(level("found")).toBe(9);
  });

  it("puts an abandoned session at INFO, whatever the outcome was", async () => {
    // ADR-0092 §5.2's own row, and `searchSessionLevel` resolves the same way.
    // The counters run above the dial's gate, so the rate of abandoned failures
    // survives at every position even where the records do not.
    const { scanSessionLevel, closeScanSession: close } =
      await freshModule(loadScanLog);
    for (const outcome of SCAN_OUTCOMES)
      expect(scanSessionLevel(close(answered(outcome), AT)!), outcome).toBe(9);
  });
});

describe("recording a finished session", () => {
  it("appends one entry through the facility, and counts it", async () => {
    const [log] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");

    log.recordScanSession(answered("absent", "single", "missing"), AT);

    expect(facility.readChannel(log.SCAN_CHANNEL)).toEqual([
      {
        outcome: "absent",
        attempt: "single",
        door: "missing",
        settled: true,
        at: AT,
      },
    ]);
    const counters = facility.channelCounters(log.SCAN_CHANNEL, AT)!;
    expect(counters.counts).toMatchObject({
      outcome_absent: 1,
      attempt_single: 1,
      door_missing: 1,
      settled: 1,
      unreachable_then_door: 0,
    });
  });

  it("writes nothing at all for a lookup that never answered", async () => {
    const [log] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");

    log.recordScanSession(beginScanSession(), AT);

    expect(facility.channelEntryCount(log.SCAN_CHANNEL)).toBe(0);
    expect(facility.channelCounters(log.SCAN_CHANNEL, AT)!.counts.settled).toBe(
      0
    );
  });

  it("keeps an abandoned session out of the two counters #208 reads", async () => {
    // It still counts its outcome, its attempt and its door — those happened —
    // and it is in neither the denominator nor the pair, because #208's
    // question is about what users did.
    const [log] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");

    log.recordScanSession(answered("unreachable", "gate_skipped"), AT);

    const { counts } = facility.channelCounters(log.SCAN_CHANNEL, AT)!;
    expect(counts).toMatchObject({
      outcome_unreachable: 1,
      attempt_gate_skipped: 1,
      door_none: 1,
      settled: 0,
      unreachable_then_door: 0,
    });
  });

  it("counts #208's pair only when a door followed an outage", async () => {
    const [log] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");

    log.recordScanSession(answered("unreachable", "single", "unreadable"), AT);
    log.recordScanSession(answered("absent", "single", "missing"), AT);
    log.recordScanSession(answered("unreachable", "single"), AT);

    const { counts } = facility.channelCounters(log.SCAN_CHANNEL, AT)!;
    expect(counts.unreachable_then_door).toBe(1);
    expect(counts.settled).toBe(2);
  });

  it("keeps counting past the cap, so the rate is not the last 200 sessions", async () => {
    // ADR-0092 §9's whole reason: the ring is a recency window and a rate taken
    // over it wears a lifetime label it has not earned.
    const [log] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");

    const sessions = 250;
    for (let i = 0; i < sessions; i++)
      log.recordScanSession(answered("found"), AT + i);

    expect(facility.channelEntryCount(log.SCAN_CHANNEL)).toBe(200);
    const { counts } = facility.channelCounters(log.SCAN_CHANNEL, AT)!;
    expect(counts.outcome_found).toBe(sessions);
    expect(counts.settled).toBe(sessions);
  });

  it("keeps counting when the shared budget sheds its entries", async () => {
    // Entries are shed and counters are not — the promise ADR-0054's Amendment
    // made and ADR-0092 §9 moved to a key of its own to make literally true.
    // Provoked rather than argued: the store is seeded past the 256 KiB budget,
    // so the append below runs the shed.
    const [log, ls] = await freshModuleWithStorage(loadScanLog);
    const facility = await import("../../src/lib/logs/log-facility");

    log.recordScanSession(answered("found"), AT);
    const before = facility.channelCounters(log.SCAN_CHANNEL, AT)!;

    const bulky = Array.from({ length: 200 }, () => ({
      v: 1,
      lvl: 9,
      entry: {
        outcome: "found",
        attempt: "single",
        door: "none",
        settled: true,
        at: AT,
        pad: "x".repeat(2000),
      },
    }));
    ls.store.set("inventoria_log_scan", JSON.stringify(bulky));

    log.recordScanSession(answered("found"), AT + 1);

    // The shed took entries…
    expect(facility.channelEntryCount(log.SCAN_CHANNEL)).toBeLessThan(200);
    // …and left every counter standing, one higher than before.
    const after = facility.channelCounters(log.SCAN_CHANNEL, AT)!;
    expect(after.counts.outcome_found).toBe(before.counts.outcome_found + 1);
    expect(after.since).toBe(before.since);
  });

  it("leaves the search channel's own records untouched", async () => {
    // A second channel is a second key, so nothing about `search`'s stored shape
    // moves. Asserted with the roster loaded, which is the arrangement the app
    // actually runs — both channels registered, both writing.
    const [roster, ls] = await freshModuleWithStorage(loadRoster);
    const facility = await import("../../src/lib/logs/log-facility");
    const stored = [
      {
        v: 2,
        lvl: 13,
        entry: {
          query: "wombok",
          outcome: { kind: "nothing" },
          settled: true,
          query_truncated: false,
          vocabulary: { mid_phrase: [], schema_version: 4 },
          at: AT,
        },
      },
    ];
    ls.store.set("inventoria_log_search", JSON.stringify(stored));

    const scan = await import("../../src/lib/logs/scan-log");
    scan.recordScanSession(answered("found"), AT);

    expect(facility.readChannel(roster.SEARCH_CHANNEL)).toHaveLength(1);
    expect(JSON.parse(ls.store.get("inventoria_log_search")!)).toEqual(stored);
  });
});

describe("the reading ADR-0071 §6's view renders", () => {
  it("takes every share over every session, settled or not", async () => {
    const { scanReport: report } = await freshModule(loadScanLog);
    const read = report({
      outcome_found: 6,
      outcome_absent: 2,
      outcome_unreachable: 2,
      outcome_refused: 0,
      settled: 8,
    });

    expect(read.sessions).toBe(10);
    expect(read.outcomes.map((o) => o.count)).toEqual([6, 2, 2, 0]);
    expect(read.outcomes[0].share).toBeCloseTo(0.6);
    expect(read.settled.share).toBeCloseTo(0.8);
  });

  it("has no share at all before there are sessions", () => {
    // A proportion of no sessions is not 0%. A view drawing one would be
    // stating a rate it does not have.
    const read = scanReport({});
    expect(read.sessions).toBe(0);
    for (const row of read.outcomes) expect(row.share).toBeNull();
    expect(read.settled.share).toBeNull();
  });

  it("says what one session was, in the words the counters use", () => {
    // One vocabulary, not two: the list first printed raw enum tokens beside a
    // counter list that had been given prose precisely so a name could not
    // drift — and `unreachable` (an outcome) against `unreadable` (a door) is
    // the pair the counter names are prefixed to keep apart.
    const entry = closeScanSession(
      answered("unreachable", "retried", "unreadable"),
      AT
    )!;
    const labels = scanEntryLabels(entry);
    expect(labels.headline).not.toMatch(/unreachable/);
    expect(labels.detail).not.toMatch(/unreadable|retried/);
    expect(labels.detail).toContain("·");
  });

  it("says nothing extra about the ordinary session", () => {
    // One ask, no form, finished. A line repeating "Asked once · No form
    // opened" under every row would bury the sessions that differ.
    const plain = closeScanSession(answered("found"), AT)!;
    expect(scanEntryLabels(plain).detail).toBe("");
  });

  it("says so when the session was simply left", () => {
    const left = closeScanSession(answered("unreachable"), AT)!;
    expect(scanEntryLabels(left).detail).toMatch(/left/i);
  });

  it("labels every counter in prose, and never as a cause", () => {
    // ADR-0071's Consequences: a run of `unreachable` says the service did not
    // answer THIS device. Whether OFF was down, the network was, or a captive
    // portal was in the way is not something this channel records.
    const read = scanReport({ outcome_unreachable: 3 });
    const rows = [
      ...read.outcomes,
      ...read.attempts,
      ...read.doors,
      read.settled,
      read.unreachable_then_door,
    ];
    for (const row of rows) {
      expect(row.label).not.toBe(row.name);
      expect(row.label.length).toBeGreaterThan(0);
    }
    const unreachable = read.outcomes.find(
      (o) => o.name === "outcome_unreachable"
    )!;
    expect(unreachable.label).not.toMatch(/down|offline|outage/i);
  });
});

describe("how the scan tab drives the session", () => {
  /**
   * Structural, and honestly so: `FoodStager` is a 3,700-line component that
   * `svelte/server` cannot render (its sheet portals), so the three endings are
   * asserted against the source rather than driven through a mount. What that
   * buys is narrow and worth having — the fold above is where the endings are
   * *decided*, and this is what fails if somebody deletes the call that reaches
   * it. Comments are stripped, so a comment saying a session is closed does not
   * satisfy a claim that one is.
   */
  const stager = readCode("src/lib/views/food/FoodStager.svelte");

  it("closes the session at each of the three places a scan can be over", () => {
    // A capture door, a method change, and the component going away. Counted
    // rather than merely found: three call sites plus the one inside the
    // function's own definition.
    expect(stager).toMatch(/function endScanSession\(\)/);
    expect(stager).toMatch(/onDestroy\(endScanSession\)/);
    expect(stager).toMatch(
      /function switchMethod\([^)]*\)\s*\{\s*endScanSession\(\)/
    );
    // "Try again" is a second lookup and therefore a second session; the first
    // reached no ending and is recorded as abandoned before this one opens.
    expect(stager).toMatch(
      /const code = barcode\.trim\(\);\s*endScanSession\(\)/
    );
  });

  it("opens the session after the local-twin check, never before it", () => {
    // A barcode the ledger already holds short-circuits before OFF is asked, so
    // it is not a scan session at all. Positional, because that is exactly what
    // the claim is about.
    const localTwin = stager.indexOf("getLocalFoodTwin");
    const opened = stager.indexOf("beginScanSession()");
    const asked = stager.indexOf("lookupBarcodeWithRetry(code");
    expect(localTwin).toBeGreaterThan(-1);
    expect(opened).toBeGreaterThan(localTwin);
    expect(asked).toBeGreaterThan(opened);
  });

  it("reads the outcome once, from the classifier both branches share", () => {
    // The screen used to branch on the error classes itself. Two branchings over
    // one taxonomy is how a log and the banner beside it come to disagree.
    expect(stager).toMatch(/const outcome = scanOutcomeOfFailure\(e\)/);
    expect(stager).not.toMatch(/instanceof ProductNotFoundError/);
    expect(stager).not.toMatch(/instanceof OffUnreachableError/);
  });
});
