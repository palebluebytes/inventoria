/**
 * The two-phase unpair, and the ordering that is the whole mechanism
 * (ADR-0096 §11, as amended 2026-09-12).
 *
 * > 1. Mark the pairing revoked, **keeping the pairing state and both chain
 * >    indices**.
 * > 2. Delete **both** lane objects.
 * > 3. **Only then** remove the Paired Device row.
 *
 * Every claim in here is about an *order* or about what survives a failure, so
 * the store is the real route over a bucket rather than a fake that agrees:
 * what is asserted is that two addresses are empty afterwards, and that they
 * are the addresses the record's own lanes derive.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { stubLocalStorage } from "./support/local-storage";
import { fakeBucket, routeOver } from "./support/store-bucket";
import {
  derivePairingChains,
  laneAddress,
  type PairedChains,
} from "../../src/lib/p2p/pairing-chain";
import {
  storeOverFetch,
  StoreUnreachableError,
  type Store,
} from "../../src/lib/p2p/deposit-store";
import {
  pairingsBeside,
  UNPAIR_ELSEWHERE,
  unpairClaim,
} from "../../src/lib/p2p/unpair";

const ORIGIN = "https://app.example";

afterEach(() => vi.unstubAllGlobals());

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/**
 * One row of the jar, with real chain states, because the record's own guard
 * decodes them and the addresses under test are derived from them.
 */
async function pairing(
  device_id: string,
  fill: number,
  over: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const chains: PairedChains = await derivePairingChains(
    new Uint8Array(32).fill(fill),
    "showed"
  );
  return {
    device_id,
    name: null,
    deposit: {
      direction: chains.deposit.direction,
      state: b64(chains.deposit.state),
      index: 3,
    },
    collect: {
      direction: chains.collect.direction,
      state: b64(chains.collect.state),
      index: 7,
    },
    peer_vector: {},
    deposit_standing: { etag: "etag-1", brings: {} },
    peer_roster: null,
    unproductive_wakes: 0,
    last_met: "2026-09-13",
    ...over,
  };
}

/** Both of a row's addresses, derived the way the modules under test do. */
async function addressesOf(row: Record<string, unknown>) {
  const lane = (side: "deposit" | "collect") => {
    const kept = row[side] as { direction: "a2b" | "b2a"; state: string };
    return {
      direction: kept.direction,
      state: Uint8Array.from(atob(kept.state), (c) => c.charCodeAt(0)),
    };
  };
  return {
    deposit: await laneAddress(lane("deposit")),
    collect: await laneAddress(lane("collect")),
  };
}

/**
 * The modules, re-imported over a jar seeded here, and the real route over a
 * bucket a test can look inside.
 */
async function withJar(rows: Record<string, unknown>[]) {
  stubLocalStorage({
    seed: { inventoria_paired_devices: JSON.stringify(rows) },
  });
  vi.resetModules();
  const bucket = fakeBucket();
  const store: Store = storeOverFetch(routeOver(bucket.bucket), ORIGIN);
  const unpair = await import("../../src/lib/p2p/unpair");
  const records = await import("../../src/lib/stores/paired-devices");
  return { unpair, records, store, held: bucket.held };
}

/** Every verb this act sends, in the order it sent them. */
function watched(
  store: Store,
  log: string[],
  onDiscard: (address: string) => void = () => {}
): Store {
  return {
    collect: (address) => {
      log.push(`get ${address}`);
      return store.collect(address);
    },
    deposit: (address, sealed, ifMatch) => {
      log.push(`put ${address}`);
      return store.deposit(address, sealed, ifMatch);
    },
    discard: async (address) => {
      log.push(`delete ${address}`);
      onDiscard(address);
      return store.discard(address);
    },
  };
}

/** A store that cannot be reached, which is what a pending revocation waits on. */
const unreachable: Store = {
  collect: async () => {
    throw new StoreUnreachableError("offline");
  },
  deposit: async () => {
    throw new StoreUnreachableError("offline");
  },
  discard: async () => {
    throw new StoreUnreachableError("offline");
  },
};

describe("the mark is phase one, and it keeps what the withdrawal needs", () => {
  it("marks the pairing revoked and keeps both lanes and both indices", async () => {
    const row = await pairing("dev_b", 1);
    const { records } = await withJar([row]);

    records.revokePairedDevice("dev_b");

    const [held] = records.readPairedDevices();
    expect(held.revoked).toBe(true);
    // Discarding these first is what would make the withdrawal best-effort:
    // they are the only things that reach the two objects it has to take.
    expect(held.deposit).toEqual(row.deposit);
    expect(held.collect).toEqual(row.collect);
    expect(held.deposit_standing).toEqual(row.deposit_standing);
  });

  it("marks nothing where there is no such pairing", async () => {
    const { records } = await withJar([await pairing("dev_b", 1)]);

    records.revokePairedDevice("dev_c");

    expect(records.readPairedDevices()).toEqual([
      expect.objectContaining({ device_id: "dev_b", revoked: false }),
    ]);
  });

  it("reads a record written before the mark existed as a live pairing", async () => {
    const { revoked: _gone, ...older } = await pairing("dev_b", 1, {
      revoked: false,
    });
    const { records } = await withJar([older]);

    expect(records.readPairedDevices()[0].revoked).toBe(false);
  });
});

describe("the withdrawal deletes both lanes, and only then drops the row", () => {
  it("empties the revoker's own lane and the peer's lane to it", async () => {
    const row = await pairing("dev_b", 1);
    const { unpair, records, store, held } = await withJar([row]);
    const at = await addressesOf(row);
    held.set(at.deposit, { bytes: new Uint8Array([1]), etag: "etag-1" });
    held.set(at.collect, { bytes: new Uint8Array([2]), etag: "etag-2" });

    await unpair.unpairDevice("dev_b", store);

    expect(held.has(at.deposit)).toBe(false);
    expect(held.has(at.collect)).toBe(false);
    expect(records.readPairedDevices()).toEqual([]);
  });

  it("still holds the marked row while the deletes are going out", async () => {
    const row = await pairing("dev_b", 1);
    const { unpair, records, store } = await withJar([row]);
    const log: string[] = [];
    const seen: boolean[] = [];
    const at = await addressesOf(row);

    await unpair.unpairDevice(
      "dev_b",
      watched(store, log, () => {
        const [still] = records.readPairedDevices();
        seen.push(still?.revoked === true);
      })
    );

    // Both deletes saw a row that was still here and already marked, which is
    // the whole of the ordering: the addresses outlive the act that spends them.
    expect(seen).toEqual([true, true]);
    expect(log).toEqual([`delete ${at.deposit}`, `delete ${at.collect}`]);
    expect(records.readPairedDevices()).toEqual([]);
  });

  it("sends no message to the peer: the whole act is two deletes", async () => {
    const { unpair, store } = await withJar([await pairing("dev_b", 1)]);
    const log: string[] = [];

    await unpair.unpairDevice("dev_b", watched(store, log));

    // Silence is the only revocation signal that cannot be forged (ADR-0075
    // §12), so there is nothing here to suppress.
    expect(log.filter((verb) => verb.startsWith("put"))).toEqual([]);
    expect(log.filter((verb) => verb.startsWith("get"))).toEqual([]);
  });

  it("succeeds where a lane's object has already been collected", async () => {
    const row = await pairing("dev_b", 1);
    const { unpair, records, store, held } = await withJar([row]);
    const at = await addressesOf(row);
    held.set(at.collect, { bytes: new Uint8Array([2]), etag: "etag-2" });

    await unpair.unpairDevice("dev_b", store);

    // A delete of an already-collected key is a no-op that succeeds, so the
    // common case — the peer took it days ago — finishes the unpair.
    expect(held.size).toBe(0);
    expect(records.readPairedDevices()).toEqual([]);
  });

  it("takes nothing but the pairing it was asked for", async () => {
    const mine = await pairing("dev_b", 1);
    const other = await pairing("dev_c", 2);
    const { unpair, records, store, held } = await withJar([mine, other]);
    const kept = await addressesOf(other);
    held.set(kept.deposit, { bytes: new Uint8Array([1]), etag: "etag-1" });

    await unpair.unpairDevice("dev_b", store);

    expect(records.readPairedDevices().map((d) => d.device_id)).toEqual([
      "dev_c",
    ]);
    expect(held.has(kept.deposit)).toBe(true);
  });
});

describe("a pending revocation is carried, and retried on any later open", () => {
  it("keeps the mark and the row where the store could not be reached", async () => {
    const row = await pairing("dev_b", 1);
    const { unpair, records, held } = await withJar([row]);
    const at = await addressesOf(row);
    held.set(at.deposit, { bytes: new Uint8Array([1]), etag: "etag-1" });

    await unpair.unpairDevice("dev_b", unreachable);

    const [still] = records.readPairedDevices();
    expect(still.revoked).toBe(true);
    expect(still.deposit).toEqual(row.deposit);
    expect(held.has(at.deposit)).toBe(true);
  });

  it("finishes the withdrawal on the next open, from the mark alone", async () => {
    const row = await pairing("dev_b", 1, { revoked: true });
    const { unpair, records, store, held } = await withJar([row]);
    const at = await addressesOf(row);
    held.set(at.deposit, { bytes: new Uint8Array([1]), etag: "etag-1" });
    held.set(at.collect, { bytes: new Uint8Array([2]), etag: "etag-2" });

    await unpair.withdrawRevoked(store);

    expect(held.size).toBe(0);
    expect(records.readPairedDevices()).toEqual([]);
  });

  it("leaves a live pairing alone on that sweep", async () => {
    const live = await pairing("dev_c", 2);
    const { unpair, records, store, held } = await withJar([
      await pairing("dev_b", 1, { revoked: true }),
      live,
    ]);
    const at = await addressesOf(live);
    held.set(at.deposit, { bytes: new Uint8Array([1]), etag: "etag-1" });

    await unpair.withdrawRevoked(store);

    expect(records.readPairedDevices().map((d) => d.device_id)).toEqual([
      "dev_c",
    ]);
    expect(held.has(at.deposit)).toBe(true);
  });

  it("does not stop one pending withdrawal on another's failure", async () => {
    const first = await pairing("dev_b", 1, { revoked: true });
    const second = await pairing("dev_c", 2, { revoked: true });
    const { unpair, records, store, held } = await withJar([first, second]);
    const at = await addressesOf(second);
    held.set(at.deposit, { bytes: new Uint8Array([1]), etag: "etag-1" });
    const refusing: Store = {
      ...store,
      discard: async (address) => {
        const only = await addressesOf(first);
        if (address === only.deposit)
          throw new StoreUnreachableError("offline");
        return store.discard(address);
      },
    };

    await unpair.withdrawRevoked(refusing);

    expect(records.readPairedDevices().map((d) => d.device_id)).toEqual([
      "dev_b",
    ]);
    expect(held.size).toBe(0);
  });
});

describe("the claim says exactly what the deletes achieve", () => {
  const claim = unpairClaim("the laptop", 0);

  it("claims what has not been picked up yet, and names the device", async () => {
    expect(claim).toContain("the laptop");
    expect(claim).toContain("has not been picked up yet");
  });

  it("does not claim what the peer already collected", async () => {
    // The store cannot tell a revoked collector from a legitimate one, so the
    // one door taken is removing the bytes that are left.
    expect(claim).toContain("already collected stays on it");
  });

  it("does not claim household completeness", async () => {
    // An unpair is scoped to one pairing; at three devices the others go on
    // syncing exactly as they were (§10).
    expect(claim).toContain("these two devices only");
  });

  it("says nothing about other devices on a household of two", async () => {
    // The same rule as the wipe's confirmation: a sentence about your other
    // devices on a jar with one pairing teaches a word for nothing.
    expect(claim).not.toContain(UNPAIR_ELSEWHERE);
  });

  it("names the cost §10 says is paid at the surface, past two", async () => {
    // Revocation completes at the rate of the household's least-used device,
    // because each device is unpaired on itself and a device you have not
    // opened is one you have not unpaired.
    const household = unpairClaim("the laptop", 1);

    expect(household).toContain(UNPAIR_ELSEWHERE);
    expect(household.startsWith(claim)).toBe(true);
  });

  it("counts the pairings that still stand, and not the one being severed", async () => {
    const { records } = await withJar([
      await pairing("dev_b", 1),
      await pairing("dev_c", 2),
    ]);

    // Severing either one leaves exactly one other device to go and tap.
    expect(pairingsBeside("dev_b", records.readPairedDevices())).toBe(1);
    expect(pairingsBeside("dev_c", records.readPairedDevices())).toBe(1);
  });

  it("does not count a pairing already on its way out", async () => {
    // A household of two part way through a withdrawal is the household of
    // two it is about to be: the marked row is not another device to go and
    // tap, so severing the one that still stands leaves nobody.
    const { records } = await withJar([
      await pairing("dev_b", 1),
      await pairing("dev_gone", 2, { revoked: true }),
    ]);

    expect(pairingsBeside("dev_b", records.readPairedDevices())).toBe(0);
  });

  it("is not read as permanent", async () => {
    // A peer that has not yet learned of the unpairing may leave one more
    // sealed object, which nothing can open and which the backstop reaps.
    expect(claim).toContain("one more message");
    expect(claim).toContain("nothing can open");
  });
});

describe("what the peer meets afterwards, and what re-pairing is", () => {
  it("refuses the peer's next rewrite, because the etag it matched on is gone", async () => {
    const row = await pairing("dev_b", 1);
    const { unpair, store, held } = await withJar([row]);
    const at = await addressesOf(row);
    const written = await store.deposit(at.collect, new Uint8Array([2]), null);

    await unpair.unpairDevice("dev_b", store);
    const rewritten = await store.deposit(
      at.collect,
      new Uint8Array([3]),
      written
    );

    // The peer answers that refusal with an unconditional write at the same
    // index (§5's 2026-09-12 amendment), which is what stops its lane falling
    // mute — one more sealed object under a chain this device has destroyed.
    expect(rewritten).toBeNull();
    expect(held.has(at.collect)).toBe(false);
  });

  it("leaves a pairing made again at a fresh first sync", async () => {
    const row = await pairing("dev_b", 1, { name: "The laptop" });
    const { unpair, records, store } = await withJar([row]);
    await unpair.unpairDevice("dev_b", store);

    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await derivePairingChains(new Uint8Array(32).fill(9), "read"),
      peer_vector: {},
    });

    const [fresh] = records.readPairedDevices();
    expect(fresh.revoked).toBe(false);
    expect(fresh.deposit.index).toBe(0);
    expect(fresh.collect.index).toBe(0);
    expect(fresh.deposit_standing).toBeNull();
    expect(fresh.peer_roster).toBeNull();
    expect(fresh.unproductive_wakes).toBe(0);
    // The locally typed name goes with the record, which is what removing it
    // means: `rememberPairedDevice` carries a name across a re-pairing that
    // *replaces* a live row, and an unpair leaves no row to carry one from.
    expect(fresh.name).toBeNull();
  });

  it("takes the old lanes before a re-pairing overwrites what reaches them", async () => {
    const row = await pairing("dev_b", 1, { revoked: true });
    const { unpair, records, store, held } = await withJar([row]);
    const at = await addressesOf(row);
    held.set(at.deposit, { bytes: new Uint8Array([1]), etag: "etag-1" });

    // What the pairing act does before guard 1's one line: a re-pairing is
    // online by definition, so it is the one moment a pending withdrawal is
    // sure of a chance, and afterwards the indices that reach it are gone.
    await unpair.withdrawRevoked(store);
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await derivePairingChains(new Uint8Array(32).fill(9), "read"),
      peer_vector: {},
    });

    expect(held.size).toBe(0);
    expect(records.readPairedDevices()[0].revoked).toBe(false);
  });
});
