/**
 * A sleeping peer converges: one Wake collects, one Wake deposits, and the two
 * devices are never awake at the same time (ADR-0096 §3, §5 and §7).
 *
 * Two real ledgers sit on either side of the **real store route**, over a
 * bucket that honours `onlyIf.etagMatches` the way R2 documents. Nothing in
 * here is two fakes agreeing with each other: what is exercised is a row
 * leaving one SQLite database, sitting sealed at an address, and arriving in
 * another — with the device that wrote it shut.
 *
 * The claims the ticket turns on are all reachable from here: that a deposit
 * carries an acknowledgement and a delta either of which may be empty, that the
 * rewrite is refused rather than recreating a collected object, that a refused
 * write never advances the index and only a sealed acknowledgement does, that a
 * truncated collection is re-collectable, that the ceiling drains across round
 * trips, and that a collection finding nothing is a normal outcome.
 */
import { describe, it, expect, beforeEach } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createLedgerSchema,
  importLedgerRows,
  readLedgerPage,
  readLedgerVersionVector,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";
import type { VersionVector } from "../../src/lib/db/version-vector";
import {
  storeOverFetch,
  StoreUnreachableError,
  type Store,
} from "../../src/lib/p2p/deposit-store";
import {
  derivePairingChains,
  deriveLaneKey,
  type LaneChain,
  type PairedChains,
} from "../../src/lib/p2p/pairing-chain";
import { base64url } from "../../src/lib/p2p/room-code";
import { openDeposit, sealDeposit } from "../../src/lib/p2p/sealed-deposit";
import {
  laneChainOf,
  type PairedDevice,
  type StoredLane,
} from "../../src/lib/stores/paired-devices";
import {
  convergeWithPeer,
  depositToPeer,
  type DepositOutcome,
  type WakeLedger,
  type WakeOutcome,
} from "../../src/lib/p2p/wake";
import { fakeBucket, routeOver } from "./support/store-bucket";

const ORIGIN = "https://app.example";

let sqlite3: any;
let store: Store;
let held: Map<string, { bytes: Uint8Array; etag: string }>;

beforeEach(async () => {
  sqlite3 = await (sqlite3InitModule as any)();
  const bucket = fakeBucket();
  held = bucket.held;
  store = storeOverFetch(routeOver(bucket.bucket), ORIGIN);
});

// ---------------------------------------------------------------------------
// Two devices, each with a real ledger and one side of one pairing
// ---------------------------------------------------------------------------

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const storedLane = (lane: LaneChain): StoredLane => ({
  direction: lane.direction,
  state: b64(lane.state),
  index: 0,
});

interface Device {
  db: LedgerDb;
  clock: Hlc;
  ledger: WakeLedger;
  record: PairedDevice;
}

function device(
  device_id: string,
  peer_id: string,
  chains: PairedChains
): Device {
  const db: LedgerDb = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  const clock = createHlc(device_id, { wallClock: () => 1_000 });
  return {
    db,
    clock,
    record: {
      device_id: peer_id,
      name: null,
      deposit: storedLane(chains.deposit),
      collect: storedLane(chains.collect),
      peer_vector: {},
      deposit_standing: null,
      peer_roster: null,
      unproductive_wakes: 0,
      last_met: "2026-09-13",
      revoked: false,
    },
    ledger: {
      oldestAbove: async (after, budgetBytes, above) =>
        readLedgerPage(db, after, budgetBytes, { above, order: "stamp" }),
      write: async (rows) => {
        const outcome = importLedgerRows(db, rows);
        if (outcome.highWater) clock.update(outcome.highWater);
        return outcome.rowsAdded;
      },
    },
  };
}

/** Both sides of one pairing, from one secret, exactly as the act leaves them. */
async function pair(): Promise<[Device, Device]> {
  const secret = new Uint8Array(32).fill(42);
  const showed = await derivePairingChains(secret.slice(), "showed");
  const read = await derivePairingChains(secret.slice(), "read");
  return [device("dev_a", "dev_b", showed), device("dev_b", "dev_a", read)];
}

interface WakeAdjustments {
  store?: Store;
  ceilingBytes?: number;
  chunkBudgetBytes?: number;
  /**
   * Everything this device is paired with, as `wake-errand.ts` hands it over:
   * the peer of this very lane included, because trimming it is the deposit's
   * own job (§6). The default is a household of two.
   */
  roster?: readonly string[];
}

/** One open of the app on one device. */
const wake = (
  who: Device,
  {
    store: over = store,
    roster = [who.record.device_id],
    ...rest
  }: WakeAdjustments = {}
): Promise<WakeOutcome> =>
  convergeWithPeer(who.record, over, who.ledger, {
    keep: (next) => (who.record = next),
    roster,
    ...rest,
  });

/** One deposit inside an open, triggered by the delta growing (§3, amended). */
const deposit = (
  who: Device,
  {
    store: over = store,
    roster = [who.record.device_id],
    ...rest
  }: WakeAdjustments = {}
): Promise<DepositOutcome> =>
  depositToPeer(who.record, over, who.ledger, {
    keep: (next) => (who.record = next),
    roster,
    ...rest,
  });

/** One row, stamped by hand: these tests are about crossing, not about writes. */
const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  entity: "event:1",
  attribute: "event/kind",
  value: '"consume_food"',
  time: 1_000,
  hlc_ms: 1_000,
  hlc_ctr: 0,
  device_id: "dev_a",
  ...over,
});

const hold = (who: Device, rows: LedgerRow[]) => importLedgerRows(who.db, rows);

const rowsOf = (who: Device) =>
  readLedgerPage(who.db, null, 8 * 1024 * 1024).map(
    (r) => `${r.entity}|${r.attribute}|${r.hlc_ms}.${r.hlc_ctr}|${r.device_id}`
  );

const vectorOf = (who: Device): VersionVector =>
  readLedgerVersionVector(who.db);

/** Where a device's own deposit sits, so a test can reach behind the route. */
const depositAddress = async (who: Device) =>
  base64url(await deriveLaneKey(laneChainOf(who.record.deposit), "addr"));

const collectAddress = async (who: Device) =>
  base64url(await deriveLaneKey(laneChainOf(who.record.collect), "addr"));

// ---------------------------------------------------------------------------

describe("a meal logged on one device reaches the other with it shut", () => {
  it("crosses on the peer's own open, and the peer's ledger holds it", async () => {
    const [a, b] = await pair();
    hold(a, [row({ entity: "event:breakfast" })]);

    // Device A is open, deposits, and is closed. Nothing waits for anybody.
    const left = await wake(a);
    expect(left.deposited).toBe(1);
    expect(held.size).toBe(1);

    // Device B opens later, with A shut.
    const taken = await wake(b);

    expect(taken.collected).toBe(1);
    expect(rowsOf(b)).toEqual(["event:breakfast|event/kind|1000.0|dev_a"]);
  });

  it("stops re-sending once the acknowledgement comes back", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);

    await wake(a);
    await wake(b);
    const acknowledged = await wake(a);

    expect(acknowledged.acknowledged).toBe(true);
    expect(a.record.deposit.index).toBe(1);
    // The acknowledgement is what advances this device's view of its peer, so
    // the row it just delivered is not offered again.
    expect(a.record.peer_vector).toEqual(vectorOf(b));
    expect(acknowledged.deposited).toBe(0);
    expect((await wake(a)).deposited).toBe(0);
  });

  it("carries a row each way without either side re-sending the other's", async () => {
    const [a, b] = await pair();
    hold(a, [row({ entity: "event:a" })]);
    hold(b, [row({ entity: "event:b", device_id: "dev_b" })]);

    await wake(a);
    await wake(b);
    await wake(a);

    expect(rowsOf(a).sort()).toEqual(rowsOf(b).sort());
    // B collected A's row, so B knows A holds it and never offers it back.
    expect((await wake(b)).deposited).toBe(0);
  });
});

describe("a deposit carries an acknowledgement and a delta, either of which may be empty", () => {
  it("still deposits with nothing of its own to send, or the peer's chain stalls", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);

    await wake(a);
    const readMostly = await wake(b);

    // B has nothing of its own, and still touched its lane.
    expect(readMostly.deposited).toBe(0);
    expect(held.has(await depositAddress(b))).toBe(true);
  });

  it("acknowledges nothing until it has collected something", async () => {
    const [a] = await pair();
    await wake(a);

    const envelope = await openEnvelope(a, await depositAddress(a), "deposit");
    expect(envelope).toEqual({ acknowledges: null, roster: [] });
  });

  it("acknowledges the index it collected, re-asserted in every deposit", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);

    await wake(a);
    await wake(b);
    expect(await openEnvelope(b, await depositAddress(b), "deposit")).toEqual({
      acknowledges: 0,
      roster: [],
    });

    // B opens again with A still shut, so it collects nothing — and says the
    // same acknowledgement again. That re-assertion is the whole of the
    // self-heal: A hears it whenever A next manages to collect.
    const nothing = await wake(b);
    expect(nothing.collected).toBe(0);
    expect(await openEnvelope(b, await depositAddress(b), "deposit")).toEqual({
      acknowledges: 0,
      roster: [],
    });
  });
});

describe("a refused rewrite is answered by a recreate", () => {
  it("puts the object back at the same index when the peer had collected", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);

    await wake(a);
    const address = await depositAddress(a);
    // B collects and acknowledges, but the word never reaches A — a lost
    // collection on A's side, which is the only way the healthy path meets a
    // refusal at all.
    await wake(b);
    const blinded: Store = { ...store, collect: async () => null };

    const refused = await wake(a, { store: blinded });

    expect(refused.recreated).toBe(true);
    expect(held.has(address)).toBe(true);
  });

  it("does not advance the index, however often it is refused", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);
    await wake(b);
    const blinded: Store = { ...store, collect: async () => null };
    await wake(a, { store: blinded });

    await wake(a, { store: blinded });

    // Absence is not an acknowledgement: only a sealed one advances a chain.
    expect(a.record.deposit.index).toBe(0);
  });

  it("recovers on the next open, when the acknowledgement does arrive", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);
    await wake(b);
    await wake(a, { store: { ...store, collect: async () => null } });

    const healed = await wake(a);

    expect(healed.acknowledged).toBe(true);
    expect(a.record.deposit.index).toBe(1);
    expect(held.has(await depositAddress(a))).toBe(true);
  });

  it("puts back an object that expired unread, for a peer still waiting at it", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);
    // The backstop fires on an object nobody collected. ADR-0096 §1 says this
    // costs one wake of latency and never data, and the recreate is what makes
    // that true: B has not moved, so the address it reads is the one refilled.
    held.delete(await depositAddress(a));

    const put_back = await wake(a);
    await wake(b);

    expect(put_back.recreated).toBe(true);
    expect(rowsOf(b)).toEqual(rowsOf(a));
  });
});

describe("an acknowledgement credits the rewrite the peer took", () => {
  it("does not credit a fuller recreate, or the rows only it carried are lost", async () => {
    const [a, b] = await pair();
    const first = row({ entity: "event:1" });
    const second = row({ entity: "event:2", hlc_ms: 2_000 });
    hold(a, [first]);

    // A deposits `first` and B takes it, but the acknowledgement does not reach
    // A. A meanwhile logs `second`, so its recreate at the same index is
    // **fuller than the object B actually collected**.
    await wake(a);
    await wake(b);
    hold(a, [second]);
    await wake(a, { store: { ...store, collect: async () => null } });

    // Now the word arrives. It is for that index, and what it means is the
    // smaller claim: B holds `first`. Crediting the recreate would mark
    // `second` as delivered to a device that will never read that address
    // again, and no later deposit would carry it.
    await wake(a);
    await wake(b);

    expect(rowsOf(b)).toEqual(rowsOf(a));
  });
});

describe("a pairing cannot freeze while both devices can reach the store", () => {
  it("survives a deposit that fails after the peer's object was taken", async () => {
    const [a, b] = await pair();
    hold(a, [row({ entity: "event:a" })]);
    hold(b, [row({ entity: "event:b", device_id: "dev_b", hlc_ms: 2_000 })]);
    const sulking: Store = {
      ...store,
      deposit: async () => {
        throw new StoreUnreachableError("the network went away mid-wake.");
      },
    };

    await wake(a);
    // #410's step 1: B takes A's object and then cannot deposit. Under §5 as
    // first written it would delete what it took and owe a word it could never
    // say; the collection commits on the acknowledgement instead, so it keeps
    // the object where it is.
    const stalled = wake(b, { store: sulking });
    await expect(stalled).rejects.toThrow(StoreUnreachableError);
    expect(b.record.collect.index).toBe(0);
    expect(held.has(await collectAddress(b))).toBe(true);

    // Three ordinary opens, and the pairing is converged rather than frozen.
    await wake(b);
    await wake(a);
    await wake(b);

    expect(rowsOf(a)).toEqual(rowsOf(b));
    expect(vectorOf(a)).toEqual(vectorOf(b));
  });

  it("reports a take that moved rows without settling", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);

    await expect(
      wake(b, {
        store: {
          ...store,
          deposit: async () => {
            throw new StoreUnreachableError("the network went away mid-wake.");
          },
        },
      })
    ).rejects.toThrow(StoreUnreachableError);
    const retried = await wake(b);

    // The first take imported the rows and settled nothing; the second is the
    // one §11 counts, because the first would have repeated identically.
    expect(retried.settled).toBe(true);
    expect(retried.collected).toBe(1);
  });
});

describe("only a sealed acknowledgement advances a chain", () => {
  it("discards one for an index this lane is not at", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);

    // A deposit sealed for the lane A collects from, correct in every way
    // except the index it acknowledges.
    await leaveDeposit(b, { acknowledges: 7 });

    const taken = await wake(a);

    expect(taken.acknowledged).toBe(false);
    expect(a.record.deposit.index).toBe(0);
  });

  it("discards a replay of one it has already acted on", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);
    await wake(b);
    await wake(a);
    expect(a.record.deposit.index).toBe(1);

    await leaveDeposit(b, { acknowledges: 0 });
    await wake(a);

    expect(a.record.deposit.index).toBe(1);
  });
});

describe("a collection that finds nothing is a normal outcome", () => {
  it("collects nothing on the very first wake of a pairing", async () => {
    const [a] = await pair();

    const first = await wake(a);

    expect(first.collected).toBe(0);
    expect(first.acknowledged).toBe(false);
    expect(a.record.collect.index).toBe(0);
  });

  it("finds nothing at the new index while the depositor is still at the old one", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);
    await wake(b);

    // B advanced on collecting; A has not yet seen the acknowledgement, so it
    // is still rewriting one index behind. B looks where nothing is.
    const empty = await wake(b);

    expect(empty.collected).toBe(0);
    expect(b.record.collect.index).toBe(1);
  });
});

describe("the collector deletes only after the final chunk verifies", () => {
  it("leaves a truncated deposit where it is, and takes it on a later open", async () => {
    const [a, b] = await pair();
    hold(a, [row({ entity: "event:one" })]);
    await wake(a);

    const address = await collectAddress(b);
    const whole = held.get(address)!;
    held.set(address, { ...whole, bytes: whole.bytes.slice(0, -8) });

    // Cut mid-chunk it is a framing refusal and cut at a boundary it is a seal
    // refusal, because the chunk now in last place was sealed as `more`. What
    // matters to a collector is the same either way: nothing verified, so
    // nothing is deleted.
    await expect(wake(b)).rejects.toThrow();
    expect(held.has(address)).toBe(true);
    expect(b.record.collect.index).toBe(0);

    held.set(address, whole);
    expect((await wake(b)).collected).toBe(1);
    expect(held.has(address)).toBe(false);
  });
});

describe("the ceiling drains rather than refusing", () => {
  it("empties a backlog one ceiling per round trip, with no one-sided state", async () => {
    const [a, b] = await pair();
    const many = Array.from({ length: 24 }, (_, n) =>
      row({ entity: `event:${String(n).padStart(3, "0")}`, hlc_ms: 1_000 + n })
    );
    hold(a, many);

    // A ceiling that takes a couple of chunks, and chunks that take a couple
    // of rows, so the delta needs several round trips to cross.
    const narrow = { ceilingBytes: 1_400, chunkBudgetBytes: 40 };

    let rounds = 0;
    for (; rounds < 20 && rowsOf(b).length < many.length; rounds += 1) {
      const left = await wake(a, narrow);
      expect(left.jammed).toBe(false);
      for (const [, object] of held) {
        expect(object.bytes.length).toBeLessThanOrEqual(narrow.ceilingBytes);
      }
      await wake(b, narrow);
    }

    expect(rounds).toBeGreaterThan(1);
    expect(rowsOf(b).sort()).toEqual(rowsOf(a).sort());
    // Both lanes end in step: nothing is outstanding and nothing is stuck.
    await wake(a, narrow);
    expect((await wake(a, narrow)).deposited).toBe(0);
    expect((await wake(b, narrow)).deposited).toBe(0);
  });

  it("sends the oldest rows first, so a truncated deposit withholds nothing", async () => {
    const [a, b] = await pair();
    // The primary key is entity-first, so `event:aaa` walks ahead of
    // `event:bbb` while carrying the **later** stamp. A deposit truncated in
    // key order would tell its peer it had been brought up to 900, and
    // `event:bbb` — stamped 100 — would never be offered again.
    hold(a, [
      row({ entity: "event:aaa", hlc_ms: 900 }),
      row({ entity: "event:bbb", hlc_ms: 100 }),
    ]);

    const narrow = { ceilingBytes: 340, chunkBudgetBytes: 1 };
    const first = await wake(a, narrow);
    expect(first.deposited).toBe(1);
    await wake(b, narrow);
    await wake(a, narrow);
    await wake(b, narrow);

    expect(rowsOf(b).sort()).toEqual(rowsOf(a).sort());
  });

  it("reports a datom wider than a whole deposit rather than stalling quietly", async () => {
    const [a] = await pair();
    hold(a, [row({ value: JSON.stringify("x".repeat(4_000)) })]);

    const left = await wake(a, { ceilingBytes: 500 });

    expect(left.jammed).toBe(true);
    expect(left.deposited).toBe(0);
  });
});

// ---------------------------------------------------------------------------

/** What one of a device's own lanes is carrying, read from behind the route. */
async function openEnvelope(
  who: Device,
  address: string,
  lane: "deposit" | "collect"
): Promise<unknown> {
  const object = held.get(address)!;
  const chunks = await openDeposit(
    { key: await deriveLaneKey(laneChainOf(who.record[lane]), "seal") },
    who.record[lane].index,
    object.bytes
  );
  return JSON.parse(new TextDecoder().decode(chunks[0]));
}

/**
 * Leaves a deposit on a device's own deposit lane by hand, so a test can say
 * something the app has no way to say — an acknowledgement for an index its
 * peer is not at.
 */
async function leaveDeposit(
  who: Device,
  envelope: { acknowledges: number | null; roster?: string[] }
): Promise<void> {
  const lane = laneChainOf(who.record.deposit);
  const sealed = await sealDeposit(
    { key: await deriveLaneKey(lane, "seal") },
    who.record.deposit.index,
    [new TextEncoder().encode(JSON.stringify(envelope))]
  );
  held.set(base64url(await deriveLaneKey(lane, "addr")), {
    bytes: sealed,
    etag: "planted",
  });
}

// ---------------------------------------------------------------------------
// A deposit follows the data, and a rewrite before a collection is free
// ---------------------------------------------------------------------------

describe("a deposit follows the data rather than the open", () => {
  it("lands every rewrite before a collection on the same address", async () => {
    const [a] = await pair();
    hold(a, [row({ entity: "event:one" })]);

    const address = await depositAddress(a);
    await deposit(a);
    hold(a, [row({ entity: "event:two" })]);
    await deposit(a);
    hold(a, [row({ entity: "event:three" })]);
    const third = await deposit(a);

    // The whole affordability of depositing on every change: the index advances
    // on **collection**, so three meals logged in one open are three writes to
    // one key. It merges no components of the address chain and spends nothing
    // of ADR-0096 §4.
    expect(a.record.deposit.index).toBe(0);
    expect(await depositAddress(a)).toBe(address);
    expect([...held.keys()]).toEqual([address]);
    expect(third.deposited).toBe(3);
  });

  it("carries the whole delta to a peer that opens once, afterwards", async () => {
    const [a, b] = await pair();
    hold(a, [row({ entity: "event:one" })]);
    await deposit(a);
    hold(a, [row({ entity: "event:two" })]);
    await deposit(a);

    expect((await wake(b)).collected).toBe(2);
    expect(rowsOf(b).sort()).toEqual(rowsOf(a).sort());
  });

  it("re-asserts the acknowledgement for the highest index it has taken", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);
    await wake(b);

    // B deposits again inside the same open, with no collection between. The
    // word it says is the one it said on the wake: an acknowledgement is
    // re-asserted in every deposit, which is what heals a lost one.
    hold(b, [row({ entity: "event:b", device_id: "dev_b" })]);
    const again = await deposit(b);

    expect(again.deposited).toBe(1);
    expect(b.record.collect.index).toBe(1);
    expect(await openEnvelope(b, await depositAddress(b), "deposit")).toEqual({
      acknowledges: 0,
      roster: [],
    });
  });

  it("answers a refusal with a recreate, on this trigger as on a wake's", async () => {
    const [a, b] = await pair();
    hold(a, [row()]);
    await wake(a);
    const address = await depositAddress(a);

    // B takes the object and, having deposited the word for it, deletes it. A
    // has not collected since, so it has not heard that word.
    await wake(b);
    expect(held.has(address)).toBe(false);

    hold(a, [row({ entity: "event:two" })]);
    const again = await deposit(a);

    // The lane may not advance on a refusal — only a sealed acknowledgement
    // does that — so the peer still sitting at this index gets an object back.
    expect(again.recreated).toBe(true);
    expect(a.record.deposit.index).toBe(0);
    expect(held.has(address)).toBe(true);
  });

  it("acknowledges nothing when it has collected nothing", async () => {
    const [a] = await pair();
    await deposit(a);

    expect(await openEnvelope(a, await depositAddress(a), "deposit")).toEqual({
      acknowledges: null,
      roster: [],
    });
  });
});

// ---------------------------------------------------------------------------
// A deposit carries the device roster, and the list is closed
// ---------------------------------------------------------------------------

describe("a deposit states what its depositor is paired with", () => {
  it("names the depositor's other pairings, and not the peer it is telling", async () => {
    const [a, b] = await pair();
    await wake(a, { roster: ["dev_b", "dev_c", "dev_d"] });

    await wake(b);

    // The peer of this lane is trimmed and nothing else is: it already knows
    // it is paired with the depositor, and a deposit carries the *least* that
    // answers a question its peer cannot otherwise answer (§6).
    expect(b.record.peer_roster).toEqual(["dev_c", "dev_d"]);
  });

  it("says it on every deposit, superseding rather than accumulating", async () => {
    const [a, b] = await pair();
    await wake(a, { roster: ["dev_b", "dev_c", "dev_d"] });
    await wake(b);

    // A unpairs from D and opens again. Once-at-pairing fails *silently* as
    // pairings change, which is why it rides every deposit.
    await wake(a, { roster: ["dev_b", "dev_c"] });
    await wake(b);

    expect(b.record.peer_roster).toEqual(["dev_c"]);
  });

  it("states an empty roster as a household of two, which is not silence", async () => {
    const [a, b] = await pair();
    await wake(a);

    expect(b.record.peer_roster).toBeNull();
    await wake(b);
    // Collecting is what turns *nothing stated* into *nobody else*, and the
    // two are different news on the screen.
    expect(b.record.peer_roster).toEqual([]);
  });

  it("is never merged with the collector's own roster", async () => {
    const [a, b] = await pair();
    await wake(a, { roster: ["dev_b", "dev_c"] });

    await wake(b, { roster: ["dev_a", "dev_d"] });

    // Two devices' rosters disagreeing is legitimate under pairwise pairing,
    // so there is nothing to reconcile: what is kept is exactly what A said.
    expect(b.record.peer_roster).toEqual(["dev_c"]);
    expect(b.record.peer_roster).not.toContain("dev_d");
  });

  it("travels one hop, so a peer's roster is never relayed onward", async () => {
    const [a, b] = await pair();
    await wake(a, { roster: ["dev_b", "dev_c"] });
    await wake(b, { roster: ["dev_a", "dev_d"] });

    // A now hears from B. What B says is B's own pairings and nothing A told
    // it — nobody holds a view they did not each separately receive.
    await wake(a, { roster: ["dev_b", "dev_c"] });

    expect(a.record.peer_roster).toEqual(["dev_d"]);
    expect(a.record.peer_roster).not.toContain("dev_c");
  });

  it("rides a deposit that carries no datoms and no acknowledgement", async () => {
    const [a] = await pair();
    await deposit(a, { roster: ["dev_b", "dev_c"] });

    expect(await openEnvelope(a, await depositAddress(a), "deposit")).toEqual({
      acknowledges: null,
      roster: ["dev_c"],
    });
  });

  it("reads a deposit that stated nothing as silence, not as nobody else", async () => {
    const [a, b] = await pair();
    // What a build predating #398 leaves: an envelope with no roster in it.
    await leaveDeposit(a, { acknowledges: null });

    await wake(b);

    // Not `[]`. The empty list is the positive claim *I am paired with nobody
    // but you*, and reading an absence as that claim puts words in the peer's
    // mouth which the screen then repeats.
    expect(b.record.peer_roster).toBeNull();
  });

  it("refuses a roster that is not a list of device ids", async () => {
    const [a, b] = await pair();
    const lane = laneChainOf(a.record.deposit);
    const sealed = await sealDeposit(
      { key: await deriveLaneKey(lane, "seal") },
      a.record.deposit.index,
      [
        new TextEncoder().encode(
          JSON.stringify({ acknowledges: null, roster: "dev_c" })
        ),
      ]
    );
    held.set(base64url(await deriveLaneKey(lane, "addr")), {
      bytes: sealed,
      etag: "planted",
    });

    // The seal held, so this is a bug rather than an attack — and a bug is
    // still refused, because the object stays where it is and a later version
    // can take it.
    await expect(wake(b)).rejects.toThrow();
    expect(b.record.peer_roster).toBeNull();
  });
});
