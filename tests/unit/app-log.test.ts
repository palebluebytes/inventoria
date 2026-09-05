import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubLocalStorage } from "./support/local-storage";
import {
  APP_CHANNEL,
  appDebug,
  appError,
  appLogEntry,
  appWarn,
} from "../../src/lib/logs/app-log";
import {
  clearChannel,
  partitionChannel,
  readChannel,
  SEVERITY,
  setDialPosition,
} from "../../src/lib/logs/log-facility";

/**
 * ADR-0092 §5.3's channel, and the Amendment of 2026-09-05 that rebuilt every
 * number it was argued with.
 *
 * The claims worth holding here are the ones a reader of the record cannot
 * check by eye: that the write prints *and* records, that the print survives a
 * store that refuses the write, and that the three bounds are the ones the
 * budget test prices.
 */

const bytes = (value: string) => new TextEncoder().encode(value).length;

describe("the app channel records and prints at one call site", () => {
  beforeEach(() => {
    stubLocalStorage();
    clearChannel(APP_CHANNEL);
    setDialPosition(SEVERITY.DEBUG);
    vi.restoreAllMocks();
  });

  it("writes a record and calls the matching console method", () => {
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new TypeError("could not read the ledger");

    appError("Ledger import failed", err);

    expect(printed).toHaveBeenCalledWith("Ledger import failed", err);
    expect(readChannel(APP_CHANNEL)).toEqual([
      {
        msg: "Ledger import failed",
        name: "TypeError",
        message: "could not read the ledger",
      },
    ]);
  });

  it("prints even when the store refuses the write", () => {
    // The floor this channel must not fall below: every one of these sites was
    // a working `console.*` before the facility existed, and a quota error must
    // not take that away.
    const printed = vi.spyOn(console, "error").mockImplementation(() => {});
    stubLocalStorage({ refuses: "quota" });

    expect(() =>
      appError("the wipe could not reclaim the space it freed")
    ).not.toThrow();
    expect(printed).toHaveBeenCalledWith(
      "the wipe could not reclaim the space it freed"
    );
  });

  it("keeps a bare message when there is no error to report", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    appDebug("dbClient: worker finished initialization");

    expect(readChannel(APP_CHANNEL)).toEqual([
      { msg: "dbClient: worker finished initialization" },
    ]);
  });

  it("records nothing from a throw that is not an Error", () => {
    // `err.name` and `err.message` are what §5.3 captures, and a value carrying
    // neither has said nothing the `msg` did not.
    vi.spyOn(console, "warn").mockImplementation(() => {});

    appWarn("service worker registration failed", "a string");

    expect(readChannel(APP_CHANNEL)).toEqual([
      { msg: "service worker registration failed" },
    ]);
  });
});

describe("every field is bounded (ADR-0092 §7, as amended)", () => {
  it("truncates msg at 256 bytes, which one real site all but fills", () => {
    // `mount-facet.ts`'s cross-origin-isolation warning weighs 252 bytes with
    // the longer Facet name in it. The bound is not arbitrary and it is not
    // slack.
    const entry = appLogEntry("m".repeat(400));
    expect(bytes(entry.msg)).toBe(256);
  });

  it("truncates err.name at 64 bytes, the bound §7 did not have", () => {
    // Without it there is no maximum record for this channel, and §8's
    // invariant is not computable at all.
    const err = new Error("short");
    err.name = "N".repeat(200);
    expect(bytes(appLogEntry("m", err).name ?? "")).toBe(64);
  });

  it("truncates err.message at 256 bytes", () => {
    expect(
      bytes(appLogEntry("m", new Error("g".repeat(900))).message ?? "")
    ).toBe(256);
  });

  it("cuts on a codepoint boundary rather than mid-character", () => {
    // A UTF-8 buffer sliced mid-codepoint decodes to a replacement character,
    // which is a corrupted record rather than a short one.
    const entry = appLogEntry("é".repeat(200));
    expect(bytes(entry.msg)).toBeLessThanOrEqual(256);
    expect(entry.msg).not.toContain("�");
  });
});

describe("the dial decides what this channel captures", () => {
  beforeEach(() => {
    stubLocalStorage();
    clearChannel(APP_CHANNEL);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("holds errors and warnings but no narration at the default Normal", () => {
    setDialPosition(SEVERITY.INFO);

    appError("Ledger export failed");
    appWarn("Not cross-origin isolated");
    appDebug("worker: db opened successfully");

    expect(readChannel(APP_CHANNEL).map((e) => e.msg)).toEqual([
      "Ledger export failed",
      "Not cross-origin isolated",
    ]);
  });

  it("drops the warning too at Errors & warnings' neighbour, and prints all three regardless", () => {
    setDialPosition(SEVERITY.WARN);

    appError("Ledger export failed");
    appDebug("worker: db opened successfully");

    expect(readChannel(APP_CHANNEL).map((e) => e.msg)).toEqual([
      "Ledger export failed",
    ]);
    // The print is the floor and the dial is a budget device, so narration is
    // still on the console at every position.
    expect(console.log).toHaveBeenCalledWith("worker: db opened successfully");
  });
});

describe("the channel's declaration", () => {
  it("is jar-wide, capped at 100, and counts nothing", () => {
    expect(APP_CHANNEL.domain).toBeNull();
    expect(APP_CHANNEL.cap).toBe(100);
    expect(APP_CHANNEL.counters).toBeUndefined();
    expect(APP_CHANNEL.tally).toBeUndefined();
  });

  it("keeps at most its cap, oldest dropped", () => {
    stubLocalStorage();
    clearChannel(APP_CHANNEL);
    setDialPosition(SEVERITY.DEBUG);
    vi.spyOn(console, "error").mockImplementation(() => {});

    for (let i = 0; i < 130; i++) appError(`failure ${i}`);

    const kept = readChannel(APP_CHANNEL);
    expect(kept).toHaveLength(100);
    expect(kept[0]?.msg).toBe("failure 30");
    expect(kept[99]?.msg).toBe("failure 129");
  });

  it("keeps a record written at another version as unreadable", () => {
    stubLocalStorage();
    clearChannel(APP_CHANNEL);
    localStorage.setItem(
      "inventoria_log_app",
      JSON.stringify([{ v: 99, lvl: SEVERITY.ERROR, entry: { msg: "x" } }])
    );

    expect(partitionChannel(APP_CHANNEL)).toEqual({
      entries: [],
      unreadable: 1,
    });
  });
});
