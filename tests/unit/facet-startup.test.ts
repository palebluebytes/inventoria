import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The errands every Facet's entry point runs (#301).
 *
 * The one worth asserting as behaviour is the persistence request. It sat
 * inside `App.svelte` until Rations got an entry point of its own, and the
 * failure it would have caused is silent by construction: the food app would
 * have opened the same OPFS ledger, never asked the browser to keep it, and
 * looked entirely healthy until the device ran short of disk (ADR-0065).
 *
 * The retired-secret sweep and the visible band are stubbed rather than run.
 * Neither has a browser to reach here, and neither is what this file is about —
 * the band's own geometry is `viewport-inset.test.ts`'s.
 *
 * **The USDA warm is no longer one of them** (ADR-0114 §13). It left this list
 * when the root stopped landing on food: it belongs to the face that searches
 * rather than to the entry that mounted the shell, so it is asserted where it is
 * now called and the absence is asserted here.
 */
const clearRetiredSecrets = vi.fn();
const startViewportInset = vi.fn(() => () => {});

vi.mock("../../src/lib/stores/secrets", () => ({
  clearRetiredSecrets: () => clearRetiredSecrets(),
}));
vi.mock("../../src/lib/ui/viewport-inset", () => ({
  startViewportInset: () => startViewportInset(),
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
  clearRetiredSecrets.mockClear();
  startViewportInset.mockClear();
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

    expect(clearRetiredSecrets).toHaveBeenCalledTimes(1);
    expect(startViewportInset).toHaveBeenCalledTimes(1);
  });

  it("does not warm the USDA artifacts, because a face does that now", async () => {
    // ADR-0114 §13. The root lands on the grid of faces, so a warm here would
    // fetch and parse ~812 KB of search index for a screen that reads neither it
    // nor the nutrient store — and it would do it on the one paint this arc made
    // independent of the ledger.
    //
    // **Read off the source, and a stub could not replace it.** The obvious shape
    // — keep the `usda-corpus` mock and assert it was never called — is vacuous
    // here in the way a deleted dependency always is: this module no longer
    // imports that one, so the stub would stand in for nothing and the assertion
    // would pass however the file were rewritten. What is left to assert is the
    // text, and it is the import line that actually carries the claim: an errand
    // is the Jar's or it is a face's, and a `../food/` edge in this file is the
    // first half of it coming back.
    vi.stubGlobal("navigator", { userAgent: "a browser from 2015" });
    const { runStartupErrands } = await loadStartup();
    runStartupErrands();

    const source = readFileSync("src/lib/facets/startup.ts", "utf8");
    expect(source).not.toMatch(/warmUsdaCorpus\(\)/);
    expect(source).not.toMatch(/from "\.\.\/food\//);
  });

  it("returns rather than throwing where the browser answers nothing", async () => {
    // Every errand is a startup errand whose answer changes nothing about the
    // load, so none of them may reach ADR-0069's boot guard.
    vi.stubGlobal("navigator", undefined);

    const { runStartupErrands } = await loadStartup();
    expect(() => runStartupErrands()).not.toThrow();
  });
});
