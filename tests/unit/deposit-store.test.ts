/**
 * The client half of the Store's route, over the route itself (ADR-0096 §1,
 * §5 and §16).
 *
 * The two statuses this file is really about are **outcomes rather than
 * failures**: a collection that finds nothing is normal, and a rewrite that is
 * refused is the orphan design working. Everything else is a wake that did not
 * converge.
 */
import { describe, it, expect } from "vitest";
import { DEPOSIT_CEILING_BYTES as ROUTE_CEILING_BYTES } from "../../worker/src/store";
import {
  DEPOSIT_CEILING_BYTES,
  StoreUnreachableError,
  storeOverFetch,
} from "../../src/lib/p2p/deposit-store";
import { fakeBucket, routeOver } from "./support/store-bucket";

const ORIGIN = "https://app.example";
const ADDRESS = "a".repeat(43);

const over = () => {
  const { bucket, held } = fakeBucket();
  return { held, store: storeOverFetch(routeOver(bucket), ORIGIN) };
};

const bytes = (text: string) => new TextEncoder().encode(text);

it("declares the same ceiling the route enforces, not a second number", () => {
  expect(DEPOSIT_CEILING_BYTES).toBe(ROUTE_CEILING_BYTES);
});

describe("a deposit round-trips at the address the client derived", () => {
  it("deposits, collects the same bytes back, and discards", async () => {
    const { store, held } = over();

    const etag = await store.deposit(ADDRESS, bytes("sealed"), null);
    expect(etag).not.toBeNull();

    const taken = await store.collect(ADDRESS);
    expect(taken?.bytes).toEqual(bytes("sealed"));
    expect(taken?.etag).toBe(etag);

    await store.discard(ADDRESS);
    expect(held.size).toBe(0);
  });

  it("names the address on the query, and nowhere in a path", async () => {
    const seen: string[] = [];
    const { bucket } = fakeBucket();
    const store = storeOverFetch((request) => {
      seen.push(request.url);
      return routeOver(bucket)(request);
    }, ORIGIN);

    await store.deposit(ADDRESS, bytes("sealed"), null);

    expect(seen[0]).toBe(`${ORIGIN}/api/store?key=${ADDRESS}`);
  });
});

describe("finding nothing is the normal outcome, not an error", () => {
  it("reads an empty lane as nothing rather than throwing", async () => {
    const { store } = over();
    await expect(store.collect(ADDRESS)).resolves.toBeNull();
  });

  it("discards an address holding nothing without complaint", async () => {
    const { store } = over();
    await expect(store.discard(ADDRESS)).resolves.toBeUndefined();
  });
});

describe("the conditional rewrite", () => {
  it("supersedes in place while the etag still matches", async () => {
    const { store, held } = over();

    const first = await store.deposit(ADDRESS, bytes("one"), null);
    const second = await store.deposit(ADDRESS, bytes("two"), first);

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(held.size).toBe(1);
    expect((await store.collect(ADDRESS))?.bytes).toEqual(bytes("two"));
  });

  it("is refused, and does not recreate, once the peer has collected", async () => {
    const { store, held } = over();

    const etag = await store.deposit(ADDRESS, bytes("one"), null);
    await store.discard(ADDRESS);

    // The etag is gone, so the write fails — and the object is simply not
    // recreated, which is what removes the permanently orphaned object rather
    // than tolerating it.
    await expect(
      store.deposit(ADDRESS, bytes("two"), etag)
    ).resolves.toBeNull();
    expect(held.size).toBe(0);
  });
});

describe("everything else is a wake that did not converge", () => {
  it("reads a refusal the protocol has no reading for as unreachable", async () => {
    const store = storeOverFetch(
      async () => new Response("no", { status: 500 }),
      ORIGIN
    );
    await expect(store.collect(ADDRESS)).rejects.toThrow(StoreUnreachableError);
  });

  it("reads a network that is not there as unreachable", async () => {
    const store = storeOverFetch(() => {
      throw new TypeError("Failed to fetch");
    }, ORIGIN);
    await expect(store.deposit(ADDRESS, bytes("sealed"), null)).rejects.toThrow(
      StoreUnreachableError
    );
  });

  it("does not swallow a deposit the route says is over the ceiling", async () => {
    const { store } = over();
    await expect(
      store.deposit(ADDRESS, new Uint8Array(DEPOSIT_CEILING_BYTES + 1), null)
    ).rejects.toThrow(StoreUnreachableError);
  });
});
