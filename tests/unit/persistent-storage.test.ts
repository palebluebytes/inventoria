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

  it("reports unknown when the browser refuses to answer at all", async () => {
    stubStorageManager({
      persisted: vi.fn().mockRejectedValue(new DOMException("denied")),
      persist: vi.fn().mockResolvedValue(true),
    });

    const { ensurePersistentStorage } = await loadStorage();

    await expect(ensurePersistentStorage()).resolves.toBe("unknown");
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
