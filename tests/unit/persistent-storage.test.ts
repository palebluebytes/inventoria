import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The module memoises its request so it fires at most once per session, so each
 * test re-imports it fresh after stubbing the `navigator` it will read.
 */
async function loadStorage() {
  vi.resetModules();
  return import("../../src/lib/storage/persistent-storage");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A `navigator.storage` that answers the way a given browser would. */
function stubStorageManager(manager: Partial<StorageManager>) {
  vi.stubGlobal("navigator", { storage: manager });
}

describe("where the browser has no StorageManager", () => {
  it("reports an unknown persistence state rather than throwing", async () => {
    vi.stubGlobal("navigator", { userAgent: "a browser from 2015" });
    const { ensurePersistentStorage } = await loadStorage();
    await expect(ensurePersistentStorage()).resolves.toBe("unknown");
  });
});

describe("asking the browser to keep this origin's storage", () => {
  it("does not re-request a grant that is already in place", async () => {
    const persisted = vi.fn().mockResolvedValue(true);
    const persist = vi.fn().mockResolvedValue(true);
    stubStorageManager({ persisted, persist });

    const { ensurePersistentStorage } = await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("persisted");
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("requests persistence when the origin does not have it, and reports the grant", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    stubStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist,
    });

    const { ensurePersistentStorage } = await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("reports a refusal as best-effort storage rather than swallowing it", async () => {
    stubStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    });

    const { ensurePersistentStorage } = await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("best-effort");
  });

  it("asks once per session however many callers want the answer", async () => {
    const persisted = vi.fn().mockResolvedValue(false);
    const persist = vi.fn().mockResolvedValue(false);
    stubStorageManager({ persisted, persist });

    const { ensurePersistentStorage } = await loadStorage();

    // Two at once, from the startup errand and a screen that mounted while it
    // was still in flight, then a third once the answer is in.
    const [first, second] = await Promise.all([
      ensurePersistentStorage(),
      ensurePersistentStorage(),
    ]);
    const third = await ensurePersistentStorage();

    expect([first, second, third]).toEqual([
      "best-effort",
      "best-effort",
      "best-effort",
    ]);
    expect(persisted).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("reports unknown on a StorageManager that only estimates", async () => {
    // Safari shipped `estimate()` years before `persist()`, so half a
    // StorageManager is a real browser rather than a defensive hypothetical.
    stubStorageManager({ estimate: vi.fn().mockResolvedValue({ usage: 10 }) });

    const { ensurePersistentStorage } = await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("unknown");
  });

  it("stands by what the browser already said when the request itself throws", async () => {
    stubStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockRejectedValue(new DOMException("denied")),
    });

    const { ensurePersistentStorage } = await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("best-effort");
  });

  it("reports unknown when the browser refuses to answer at all", async () => {
    stubStorageManager({
      persisted: vi.fn().mockRejectedValue(new DOMException("denied")),
      persist: vi.fn().mockResolvedValue(true),
    });

    const { ensurePersistentStorage } = await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("unknown");
  });
});

describe("reading the state back without asking for anything", () => {
  it("sees a grant that arrived after this session's request was refused", async () => {
    // Chromium can grant persistence on its own as a site is used more, so the
    // memoised request's answer goes stale while the page is still open.
    const persisted = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const persist = vi.fn().mockResolvedValue(false);
    stubStorageManager({ persisted, persist });

    const { ensurePersistentStorage, readPersistenceState } =
      await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("best-effort");
    await expect(readPersistenceState()).resolves.toBe("persisted");
    // The reading is a read. Nothing was requested a second time.
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("reports unknown where the browser has no StorageManager", async () => {
    vi.stubGlobal("navigator", { userAgent: "a browser from 2015" });
    const { readPersistenceState } = await loadStorage();
    await expect(readPersistenceState()).resolves.toBe("unknown");
  });
});

describe("reading how much storage this origin has", () => {
  it("has no reading where the browser has no StorageManager", async () => {
    vi.stubGlobal("navigator", { userAgent: "a browser from 2015" });
    const { readStorageEstimate } = await loadStorage();
    await expect(readStorageEstimate()).resolves.toBeNull();
  });

  it("reports the usage and the quota the browser gives", async () => {
    stubStorageManager({
      estimate: vi
        .fn()
        .mockResolvedValue({ usage: 412_000_000, quota: 3_200_000_000 }),
    });

    const { readStorageEstimate } = await loadStorage();

    await expect(readStorageEstimate()).resolves.toEqual({
      usageBytes: 412_000_000,
      quotaBytes: 3_200_000_000,
    });
  });

  it("keeps the figure the browser does give when the other is missing", async () => {
    stubStorageManager({
      estimate: vi.fn().mockResolvedValue({ usage: 8_000 }),
    });

    const { readStorageEstimate } = await loadStorage();

    await expect(readStorageEstimate()).resolves.toEqual({
      usageBytes: 8_000,
      quotaBytes: null,
    });
  });

  it("has no reading where the browser refuses to estimate", async () => {
    stubStorageManager({
      estimate: vi.fn().mockRejectedValue(new DOMException("denied")),
    });

    const { readStorageEstimate } = await loadStorage();

    await expect(readStorageEstimate()).resolves.toBeNull();
  });
});

describe("the reading both badges take (#335)", () => {
  it("waits for this session's request, then reports what the browser says now", async () => {
    // The order is the point: a grant Chromium made on its own after refusing
    // at load is what a badge must show, and a reader that skipped the request
    // would report a refusal from ten minutes ago instead.
    const persisted = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const persist = vi.fn().mockResolvedValue(false);
    stubStorageManager({ persisted, persist });

    const { refreshPersistenceState } = await loadStorage();

    await expect(refreshPersistenceState()).resolves.toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("asks the browser once however many surfaces report the state", async () => {
    // Two surfaces draw the badge now — root Settings and Rations settings —
    // and on the root both can be mounted at once. The request is memoised, so
    // the second reader is a read and not a second request.
    const persisted = vi.fn().mockResolvedValue(false);
    const persist = vi.fn().mockResolvedValue(false);
    stubStorageManager({ persisted, persist });

    const { refreshPersistenceState } = await loadStorage();

    await refreshPersistenceState();
    await refreshPersistenceState();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("says the browser has decided only where it has answered", async () => {
    // `unknown` is this module's own third case, for a browser that was never
    // asked. It is what makes a badge render nothing rather than guess.
    const { isDecided } = await loadStorage();

    expect(isDecided("persisted")).toBe(true);
    expect(isDecided("best-effort")).toBe(true);
    expect(isDecided("unknown")).toBe(false);
  });
});
