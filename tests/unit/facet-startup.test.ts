import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The errands every Facet's entry point runs (#301).
 *
 * The one worth asserting as behaviour is the persistence request. It sat
 * inside `App.svelte` until Rations got an entry point of its own, and the
 * failure it would have caused is silent by construction: the food app would
 * have opened the same OPFS ledger, never asked the browser to keep it, and
 * looked entirely healthy until the device ran short of disk (ADR-0065).
 *
 * The corpus warm and the retired-secret sweep are stubbed rather than run.
 * Neither has a browser to reach here, and neither is what this file is about.
 */
const warmUsdaCorpus = vi.fn();
const clearRetiredSecrets = vi.fn();

vi.mock("../../src/lib/food/usda-corpus", () => ({
  warmUsdaCorpus: () => warmUsdaCorpus(),
}));
vi.mock("../../src/lib/stores/secrets", () => ({
  clearRetiredSecrets: () => clearRetiredSecrets(),
}));

/**
 * `persistent-storage` memoises its request so it fires at most once per
 * session, so the module graph is rebuilt after stubbing the `navigator` it
 * will read.
 */
async function loadStartup() {
  vi.resetModules();
  return import("../../src/lib/facets/startup");
}

beforeEach(() => {
  vi.unstubAllGlobals();
  warmUsdaCorpus.mockClear();
  clearRetiredSecrets.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an entry point's startup errands (ADR-0065, #301)", () => {
  it("asks the browser to keep the ledger", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      storage: { persisted: vi.fn().mockResolvedValue(false), persist },
    });

    const { runStartupErrands } = await loadStartup();
    runStartupErrands();
    // The request is deliberately not awaited by the caller, so the assertion
    // waits for the microtasks it was left running in.
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });

  it("carries the rest of the list, so a second entry point cannot lose one", async () => {
    vi.stubGlobal("navigator", { userAgent: "a browser from 2015" });

    const { runStartupErrands } = await loadStartup();
    runStartupErrands();

    expect(warmUsdaCorpus).toHaveBeenCalledTimes(1);
    expect(clearRetiredSecrets).toHaveBeenCalledTimes(1);
  });

  it("returns rather than throwing where the browser answers nothing", async () => {
    // Every errand is a startup errand whose answer changes nothing about the
    // load, so none of them may reach ADR-0069's boot guard.
    vi.stubGlobal("navigator", undefined);

    const { runStartupErrands } = await loadStartup();
    expect(() => runStartupErrands()).not.toThrow();
  });
});
