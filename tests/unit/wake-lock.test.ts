/**
 * Two wakes at one origin do not overlap (#418).
 *
 * A root browser tab beside the installed root is two opens over **one**
 * `localStorage` jar and **one** ledger. `wake-cadence.ts` queues the triggers
 * of one open and reaches no further, so the serialisation has to be
 * origin-scoped, and `wake-lock.ts` is where it is.
 *
 * The property is the one the ticket states: **`deposit_standing` agrees with
 * the object that is actually at the address** — its etag names that object,
 * and its `brings` is what that object carries. Both halves matter and the
 * second is the one with teeth: `brings` is what an acknowledgement for this
 * index will *mean*, so a standing that overstates it credits the peer with
 * rows it never received and `vectorAboveMatch` withholds them on every later
 * sync.
 *
 * **The interleave is driven rather than hoped for.** The store holds the first
 * wake's answer back after its write has actually landed in the bucket, which
 * is the reordering a network does for free: request A arrives first, response
 * A arrives last. The second wake then gets as far as it can — all the way
 * through its own deposit with no lock, and no further than the queue with one.
 *
 * **The direction the disagreement runs in is stated rather than glossed.** Two
 * overlapping *deposits* cannot produce the overstating case on their own: both
 * compute their delta against the same `peer_vector` over a ledger that only
 * grows, so the later one's is the superset and the standing that survives can
 * only **understate** what the object carries. That is the harmless side of the
 * asymmetry, and it is the side measured here. The overstating side needs the
 * two errands to disagree about `peer_vector` — a collection running beside a
 * deposit — and the lock covers it because it serialises the errand rather than
 * the case.
 *
 * The ledger is a real SQLite one and the store is the real route over a bucket
 * that honours `onlyIf.etagMatches`, for `wake.test.ts`'s reason: the etag
 * refusal that makes the recreate happen is the whole mechanism, and a fake
 * that always accepted a `PUT` would test nothing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createLedgerSchema,
  importConvergedRows,
  importLedgerRows,
  readLedgerPage,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import {
  vectorOfRows,
  type VersionVector,
} from "../../src/lib/db/version-vector";
import { storeOverFetch, type Store } from "../../src/lib/p2p/deposit-store";
import {
  derivePairingChains,
  deriveLaneKey,
  laneAddress,
} from "../../src/lib/p2p/pairing-chain";
import { openDeposit } from "../../src/lib/p2p/sealed-deposit";
import { readDatomChunk } from "../../src/lib/p2p/datom-chunk";
import {
  laneChainOf,
  readPairedDevices,
  type DepositStanding,
  type PairedDevice,
} from "../../src/lib/stores/paired-devices";
import type { WakeLedger } from "../../src/lib/p2p/wake";
import { depositToPeers, openAppWake } from "../../src/lib/p2p/wake-errand";
import { underWakeLock, WAKE_LOCK_NAME } from "../../src/lib/p2p/wake-lock";
import { stubLocalStorage } from "./support/local-storage";
import { fakeBucket, routeOver } from "./support/store-bucket";
import { pairedWith } from "./support/paired-device";
import {
  stubLockManager,
  stubNoLockManager,
  stubRefusingLockManager,
  stubUnreachableLockManager,
  type FakeLockManager,
} from "./support/web-locks";

const ORIGIN = "https://app.example";

/** The one record the whole Paired Device list lives in (`paired-devices.ts`). */
const JAR_KEY = "inventoria_paired_devices";

const PEER = "dev_laptop";

/**
 * The untyped WASM handle, narrowed to the one constructor this suite calls.
 *
 * The package ships no types, which is the boundary `CODING_STANDARDS.md` §3.2
 * admits a cast at; the neighbouring wake suites take it as `any`, and one
 * shape stated once is what this is instead.
 */
type OpenSqlite = () => Promise<{ oo1: { DB: new () => LedgerDb } }>;

let db: LedgerDb;
let ledger: WakeLedger;
let bucket: ReturnType<typeof fakeBucket>;
let route: Store;

beforeEach(async () => {
  const sqlite3 = await (sqlite3InitModule as unknown as OpenSqlite)();
  db = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  ledger = {
    oldestAbove: async (after, budgetBytes, above, scope) =>
      readLedgerPage(db, after, budgetBytes, {
        above,
        laneScope: scope,
        order: "stamp",
      }),
    write: async (rows) => importConvergedRows(db, rows).outcome.rowsAdded,
  };
  bucket = fakeBucket();
  route = storeOverFetch(routeOver(bucket.bucket), ORIGIN);
});

afterEach(() => vi.unstubAllGlobals());

/** One row this device logged, stamped by hand. */
const logged = (entity: string, at: number): LedgerRow => ({
  entity,
  attribute: "event/kind",
  value: '"consume_food"',
  time: at,
  hlc_ms: at,
  hlc_ctr: 0,
  device_id: "dev_phone",
});

/** One completed pairing in the jar, as the act leaves it. */
async function paired(): Promise<void> {
  const chains = await derivePairingChains(
    new Uint8Array(32).fill(7),
    "showed"
  );
  stubLocalStorage({
    seed: { [JAR_KEY]: JSON.stringify([pairedWith(PEER, chains)]) },
  });
}

const heldRow = (): PairedDevice =>
  readPairedDevices().find((row) => row.device_id === PEER)!;

const standing = (): DepositStanding => heldRow().deposit_standing!;

/** Where this device's deposits to that peer sit, now. */
const address = (): Promise<string> =>
  laneAddress(laneChainOf(heldRow().deposit));

/**
 * The rows the object at the outgoing lane's address actually carries.
 *
 * Chunk zero is the envelope (`wake.ts`); everything after it is datoms.
 */
async function carried(): Promise<LedgerRow[]> {
  const row = heldRow();
  const lane = laneChainOf(row.deposit);
  const object = bucket.held.get(await laneAddress(lane))!;
  const chunks = await openDeposit(
    { key: await deriveLaneKey(lane, "seal") },
    row.deposit.index,
    object.bytes
  );
  return chunks
    .slice(1)
    .flatMap((chunk) => readDatomChunk(new TextDecoder().decode(chunk)));
}

/** What a peer that collected the object at the address would then hold. */
const carriedVector = async (): Promise<VersionVector> =>
  vectorOfRows(await carried());

// ---------------------------------------------------------------------------
// A store that can hold one answer back after its write has landed
// ---------------------------------------------------------------------------

interface HeldAnswer {
  /** Resolves once the write is in the bucket and the caller is waiting. */
  landed: Promise<void>;
  /** Lets the caller see the answer its write already earned. */
  release: () => void;
}

/**
 * The route, with a one-shot hold on the answer to the next `PUT`.
 *
 * The write lands first and the answer waits, because that is the reordering
 * the defect needs and the one a network supplies unasked: the depositor whose
 * bytes arrived first can be the one whose record write lands last.
 */
function holdingStore(inner: Store): {
  store: Store;
  holdNextDeposit: () => HeldAnswer;
} {
  let pending: { landed: () => void; released: Promise<void> } | null = null;

  const holdNextDeposit = (): HeldAnswer => {
    let landed!: () => void;
    let release!: () => void;
    const hasLanded = new Promise<void>((resolve) => (landed = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    pending = { landed, released };
    return { landed: hasLanded, release };
  };

  const store: Store = {
    collect: (at) => inner.collect(at),
    discard: (at) => inner.discard(at),
    deposit: async (at, sealed, ifMatch) => {
      const holding = pending;
      pending = null;
      const answer = await inner.deposit(at, sealed, ifMatch);
      if (holding !== null) {
        holding.landed();
        await holding.released;
      }
      return answer;
    },
  };

  return { store, holdNextDeposit };
}

/** One wake's deposit errand, taking the lock the way `openAppWake` does. */
const wakeOver = (over: Store): Promise<void> =>
  underWakeLock(() => depositToPeers("root", over, ledger));

// ---------------------------------------------------------------------------

describe("two wakes at one origin leave the record agreeing with the store", () => {
  /**
   * Two overlapping deposit errands, interleaved so that the first wake's
   * bytes land first and its record write lands last, with a row logged in the
   * other window in between so the two deltas genuinely differ.
   */
  async function overlappingWakes(locks: FakeLockManager): Promise<void> {
    await paired();
    const { store, holdNextDeposit } = holdingStore(route);

    // A deposit already stands at this index, so the next rewrite is
    // conditional and a refusal has somewhere to come from.
    importLedgerRows(db, [logged("event:consume_breakfast", 1_000)]);
    await wakeOver(store);

    const holding = holdNextDeposit();
    const first = wakeOver(store);
    await holding.landed;

    // A meal logged in the other window, after the first wake read the ledger
    // and before the second one does. This is the whole of what makes the two
    // deltas differ (#418).
    importLedgerRows(db, [logged("event:consume_lunch", 2_000)]);

    // The second wake, run as far as it can get while the first is still
    // holding: to the back of the queue with a lock, and all the way through
    // its own deposit without one. Both endings are waited on by name rather
    // than by a count of event-loop turns, so neither outcome depends on how
    // quickly WebCrypto finishes.
    const queued = locks.queuesOnce();
    const second = wakeOver(store);
    await Promise.race([second, queued]);
    holding.release();
    await Promise.all([first, second]);
  }

  it("names the object that is actually at the address", async () => {
    await overlappingWakes(stubLockManager());

    expect(standing().etag).toBe(bucket.held.get(await address())!.etag);
  });

  it("credits the peer with what that object carries and no more", async () => {
    await overlappingWakes(stubLockManager());

    // `brings` is what an acknowledgement for this index will mean. Anything
    // beyond what the object holds is a row the peer is credited with and will
    // never be offered again.
    expect(standing().brings).toEqual(await carriedVector());
    expect((await carried()).map((row) => row.entity).sort()).toEqual([
      "event:consume_breakfast",
      "event:consume_lunch",
    ]);
  });

  it("runs the second wake once the first has finished, never beside it", async () => {
    const locks = stubLockManager();

    await overlappingWakes(locks);

    expect(locks.requested).toEqual([
      WAKE_LOCK_NAME,
      WAKE_LOCK_NAME,
      WAKE_LOCK_NAME,
    ]);
  });
});

describe("a runtime that cannot give up the lock still wakes", () => {
  /**
   * The three ways not to have one, and every one of them takes the same
   * fallback: **wake**, not "do not wake".
   *
   * The first is the Node runner and any insecure context; the second is a
   * browser that removed the API rather than leaving it `undefined`; the third
   * is an opaque origin, which answers a `request()` with a `SecurityError`
   * and never calls back. Only the first is reachable by a presence check,
   * which is why all three are stated.
   */
  const unlockable: [string, () => void][] = [
    ["no LockManager at all", stubNoLockManager],
    ["a locks accessor that throws", stubUnreachableLockManager],
    ["a request that is refused outright", stubRefusingLockManager],
  ];

  for (const [runtime, stub] of unlockable) {
    it(`deposits on the lane with ${runtime}`, async () => {
      stub();
      await paired();
      importLedgerRows(db, [logged("event:consume_breakfast", 1_000)]);

      await wakeOver(route);

      expect(bucket.held.has(await address())).toBe(true);
      expect((await carried()).map((row) => row.entity)).toEqual([
        "event:consume_breakfast",
      ]);
    });
  }

  it("deposits once and not twice when the request is refused", async () => {
    stubRefusingLockManager();
    await paired();
    const puts: string[] = [];
    const counted: Store = {
      ...route,
      deposit: (at, sealed, ifMatch) => (
        puts.push(at),
        route.deposit(at, sealed, ifMatch)
      ),
    };
    importLedgerRows(db, [logged("event:consume_breakfast", 1_000)]);

    await wakeOver(counted);

    expect(puts).toEqual([await address()]);
  });

  it("keeps the record agreeing with the store across two errands", async () => {
    stubNoLockManager();
    await paired();
    importLedgerRows(db, [logged("event:consume_breakfast", 1_000)]);

    await wakeOver(route);
    importLedgerRows(db, [logged("event:consume_lunch", 2_000)]);
    await wakeOver(route);

    expect(standing().etag).toBe(bucket.held.get(await address())!.etag);
    expect(standing().brings).toEqual(await carriedVector());
  });
});

describe("a lock never granted is not an errand that failed", () => {
  // Both sides of the same rejection, because the fallback reads one and must
  // not read the other: a `request()` that refused before calling back is
  // retried unserialised, and an errand that threw under a lock it was granted
  // is reported. Confusing them puts two deposits on one lane.

  it("reports an errand that threw rather than running it again", async () => {
    stubLockManager();
    let ran = 0;
    const failing = async (): Promise<void> => {
      ran += 1;
      throw new Error("the store could not be reached.");
    };

    await expect(underWakeLock(failing)).rejects.toThrow(
      "the store could not be reached."
    );
    expect(ran).toBe(1);
  });

  it("frees the lock for the next wake when an errand throws", async () => {
    const locks = stubLockManager();
    const after: string[] = [];

    await expect(
      underWakeLock(() => Promise.reject(new Error("nope")))
    ).rejects.toThrow("nope");
    await underWakeLock(async () => void after.push("second"));

    expect(after).toEqual(["second"]);
    expect(locks.requested).toEqual([WAKE_LOCK_NAME, WAKE_LOCK_NAME]);
  });
});

describe("the app's own wake is the one that takes the lock", () => {
  /**
   * A wake whose whole errand is a pending withdrawal, which is the one round
   * that leaves a mark without reaching the worker that owns SQLite.
   *
   * The record is marked revoked and kept, so the round's first act is
   * `withdrawRevoked` — two `DELETE`s and then the row itself (ADR-0096 §11).
   * Its disappearance is how a test proves through `openAppWake` that the
   * errand ran, rather than through the seam it is supposed to be wired to.
   *
   * The collection at open is fired rather than returned, so it is waited on by
   * its effect: `vi.waitFor` retries the assertion until the withdrawal lands.
   */
  async function withdrawnOnOpen(): Promise<void> {
    const chains = await derivePairingChains(
      new Uint8Array(32).fill(7),
      "showed"
    );
    stubLocalStorage({
      seed: {
        [JAR_KEY]: JSON.stringify([
          { ...pairedWith(PEER, chains), revoked: true },
        ]),
      },
    });

    const wake = openAppWake("root", route, {
      collectionFloorMs: 60 * 60 * 1_000,
    });
    try {
      await vi.waitFor(() => expect(readPairedDevices()).toEqual([]));
    } finally {
      wake.close();
    }
  }

  it("opens under it rather than beside it", async () => {
    // Proved through `openAppWake` and not through the seam alone: a lock the
    // errand does not reach is a lock that serialises nothing.
    const locks = stubLockManager();

    await withdrawnOnOpen();

    expect(locks.requested).toEqual([WAKE_LOCK_NAME]);
  });

  it("still runs its errand where there is no lock to take", async () => {
    stubNoLockManager();

    await withdrawnOnOpen();
  });
});
