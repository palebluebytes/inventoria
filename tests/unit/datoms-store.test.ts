import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

// The scaffold talks to the worker through `dbClient`, so the client is mocked
// down to the two things it uses: a loader and the invalidation subscription.
const { invalidate, onInvalidateMock } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    invalidate: () => listeners.forEach((l) => l()),
    onInvalidateMock: vi.fn((l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    }),
  };
});

vi.mock("../../src/lib/db/db.client", () => ({
  dbClient: { onInvalidate: onInvalidateMock },
}));

import { createLedgerStore } from "../../src/lib/stores/datoms.store";

beforeEach(() => {
  onInvalidateMock.mockClear();
});

// A store only loads once something subscribes, so every case here keeps a live
// subscription for the duration.
function subscribed<T>(store: {
  subscribe: (fn: (v: T) => void) => () => void;
}) {
  const seen: T[] = [];
  const stop = store.subscribe((v) => seen.push(v));
  return { seen, stop };
}

describe("createLedgerStore load status", () => {
  it("starts pending, with the placeholder value nobody should read", () => {
    const store = createLedgerStore(() => new Promise<number[]>(() => {}), []);
    const sub = subscribed(store);
    expect(get(store.status)).toBe("pending");
    expect(get(store)).toEqual([]);
    sub.stop();
  });

  it("does not load at all until something subscribes", () => {
    const load = vi.fn().mockResolvedValue([1]);
    const store = createLedgerStore(load, [] as number[]);
    expect(load).not.toHaveBeenCalled();
    expect(get(store.status)).toBe("pending");
    const sub = subscribed(store);
    expect(load).toHaveBeenCalledTimes(1);
    sub.stop();
  });

  it("reaches loaded once the first load resolves", async () => {
    const store = createLedgerStore(async () => [1, 2], [] as number[]);
    const sub = subscribed(store);
    await vi.waitFor(() => expect(get(store.status)).toBe("loaded"));
    expect(get(store)).toEqual([1, 2]);
    sub.stop();
  });

  it("distinguishes a real empty result from not having loaded", async () => {
    // The whole point: `[]` from the ledger and `[]` from the placeholder are
    // the same value, and only the status tells a view which one it is holding.
    const store = createLedgerStore(async () => [] as number[], []);
    const sub = subscribed(store);
    expect(get(store)).toEqual([]);
    await vi.waitFor(() => expect(get(store.status)).toBe("loaded"));
    expect(get(store)).toEqual([]);
    sub.stop();
  });

  it("reaches failed when the FIRST load throws, and reports it", async () => {
    const onError = vi.fn();
    const store = createLedgerStore(
      async () => {
        throw new Error("worker gone");
      },
      [] as number[],
      onError
    );
    const sub = subscribed(store);
    await vi.waitFor(() => expect(get(store.status)).toBe("failed"));
    expect(onError).toHaveBeenCalledTimes(1);
    sub.stop();
  });

  it("recovers from failed to loaded when a later refresh succeeds", async () => {
    let attempt = 0;
    const store = createLedgerStore(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("startup race");
      return [7];
    }, [] as number[]);
    const sub = subscribed(store);
    await vi.waitFor(() => expect(get(store.status)).toBe("failed"));

    invalidate();
    await vi.waitFor(() => expect(get(store.status)).toBe("loaded"));
    expect(get(store)).toEqual([7]);
    sub.stop();
  });

  it("stays loaded when a REFRESH fails, because the held value is still real", async () => {
    // `failed` means "there is nothing to show", not "something went wrong" —
    // the error still reaches onError, but a view must not blank a real day
    // because a later read stumbled.
    const onError = vi.fn();
    let attempt = 0;
    const store = createLedgerStore(
      async () => {
        attempt += 1;
        if (attempt === 1) return [1];
        throw new Error("later failure");
      },
      [] as number[],
      onError
    );
    const sub = subscribed(store);
    await vi.waitFor(() => expect(get(store.status)).toBe("loaded"));

    invalidate();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(get(store.status)).toBe("loaded");
    expect(get(store)).toEqual([1]);
    sub.stop();
  });

  it("keeps its loaded status across the last subscriber leaving and returning", async () => {
    // A store that has loaded once has loaded, whoever is watching: the status
    // lives outside the readable's start/stop cycle.
    const store = createLedgerStore(async () => [3], [] as number[]);
    const first = subscribed(store);
    await vi.waitFor(() => expect(get(store.status)).toBe("loaded"));
    first.stop();
    expect(get(store.status)).toBe("loaded");

    const second = subscribed(store);
    expect(get(store.status)).toBe("loaded");
    second.stop();
  });
});
