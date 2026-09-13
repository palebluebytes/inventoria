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
  foldVersionVector,
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
import { stubLockManager, stubNoLockManager } from "./support/web-locks";

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
    oldestAbove: async (after, budgetBytes, above) =>
      readLedgerPage(db, after, budgetBytes, { above, order: "stamp" }),
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
  foldVersionVector(await carried());

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

/** Every task the runtime has queued, run out. */
async function drained(turns = 200): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * The second wake, run as far as it can get while the first is still holding.
 *
 * Without a lock that is all the way through its own deposit, and the errand
 * wins the race; with one it is the back of the queue, and the drain wins.
 */
const asFarAsItGets = (errand: Promise<unknown>): Promise<unknown> =>
  Promise.race([errand, drained()]);

// ---------------------------------------------------------------------------

describe("two wakes at one origin leave the record agreeing with the store", () => {
  /**
   * Two overlapping deposit errands, interleaved so that the first wake's
   * bytes land first and its record write lands last, with a row logged in the
   * other window in between so the two deltas genuinely differ.
   */
  async function overlappingWakes(): Promise<void> {
    await paired();
    const { store, holdNextDeposit } = holdingStore(route);

    // A deposit already stands at this index, so the next rewrite is
    // conditional and a refusal has somewhere to come from.
    importLedgerRows(db, [logged("event:breakfast", 1_000)]);
    await underWakeLock(() => depositToPeers(store, ledger));

    const holding = holdNextDeposit();
    const first = underWakeLock(() => depositToPeers(store, ledger));
    await holding.landed;

    // A meal logged in the other window, after the first wake read the ledger
    // and before the second one does. This is the whole of what makes the two
    // deltas differ (#418).
    importLedgerRows(db, [logged("event:lunch", 2_000)]);

    const second = underWakeLock(() => depositToPeers(store, ledger));
    await asFarAsItGets(second);
    holding.release();
    await Promise.all([first, second]);
  }

  it("names the object that is actually at the address", async () => {
    stubLockManager();

    await overlappingWakes();

    expect(standing().etag).toBe(bucket.held.get(await address())!.etag);
  });

  it("credits the peer with what that object carries and no more", async () => {
    stubLockManager();

    await overlappingWakes();

    // `brings` is what an acknowledgement for this index will mean. Anything
    // beyond what the object holds is a row the peer is credited with and will
    // never be offered again.
    expect(standing().brings).toEqual(await carriedVector());
    expect((await carried()).map((row) => row.entity).sort()).toEqual([
      "event:breakfast",
      "event:lunch",
    ]);
  });

  it("runs the second wake once the first has finished, never beside it", async () => {
    const locks = stubLockManager();

    await overlappingWakes();

    expect(locks.requested).toEqual([
      WAKE_LOCK_NAME,
      WAKE_LOCK_NAME,
      WAKE_LOCK_NAME,
    ]);
  });
});

describe("a browser with no Web Locks still wakes", () => {
  it("deposits on the lane with no LockManager to take", async () => {
    stubNoLockManager();
    await paired();
    importLedgerRows(db, [logged("event:breakfast", 1_000)]);

    await underWakeLock(() => depositToPeers(route, ledger));

    // The fallback is "wake", not "do not wake": a device with one open has
    // nothing to serialise against.
    expect(bucket.held.has(await address())).toBe(true);
    expect((await carried()).map((row) => row.entity)).toEqual([
      "event:breakfast",
    ]);
  });

  it("keeps the record agreeing with the store across two errands", async () => {
    stubNoLockManager();
    await paired();
    importLedgerRows(db, [logged("event:breakfast", 1_000)]);

    await underWakeLock(() => depositToPeers(route, ledger));
    importLedgerRows(db, [logged("event:lunch", 2_000)]);
    await underWakeLock(() => depositToPeers(route, ledger));

    expect(standing().etag).toBe(bucket.held.get(await address())!.etag);
    expect(standing().brings).toEqual(await carriedVector());
  });
});

describe("the app's own wake takes the lock", () => {
  it("opens under it rather than beside it", async () => {
    // Proved through `openAppWake` and not through the seam alone: a lock the
    // errand does not reach is a lock that serialises nothing.
    //
    // The jar is empty, so the round serves no lane and never reaches the
    // worker that owns SQLite — what is under test is that the errand ran
    // inside the lock at all.
    const locks = stubLockManager();
    stubLocalStorage({ seed: { [JAR_KEY]: "[]" } });

    const wake = openAppWake(route, { collectionFloorMs: 60 * 60 * 1_000 });
    await drained(20);
    wake.close();

    expect(locks.requested).toEqual([WAKE_LOCK_NAME]);
  });
});
