/**
 * Three or more devices: one deposit per pair, and the fan-out is forced
 * (ADR-0096 §10).
 *
 * `wake.test.ts` proves one pairing against two real ledgers and `wake-roster.
 * test.ts` proves what a round says across a list of them. Neither can reach
 * the claims this record makes about **N**, because both hold one jar: a
 * household is three devices each holding two pairings, and every number in
 * §10's table is a statement about the whole graph rather than about one lane.
 *
 * So the fixture here is a household. Each device has its own SQLite ledger and
 * its own Paired Device list, the list is swapped into one `localStorage` jar
 * for the duration of that device's open — **a device is one jar, and one at a
 * time** — and the acts are the app's own: `wake-errand.ts`'s round over every
 * pairing, its deposit-only trigger, and `unpair.ts`'s two phases. Nothing here
 * re-implements a loop it is measuring.
 *
 * **The fan-out is measured rather than asserted**, which is the criterion the
 * ticket adds to §10's table: the deposits one wake makes, the objects the
 * store is left holding, and how many of them carry one row at one moment.
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
  type PairedDevice,
} from "../../src/lib/stores/paired-devices";
import type { WakeLedger } from "../../src/lib/p2p/wake";
import {
  convergeWithPeers,
  depositToPeers,
} from "../../src/lib/p2p/wake-errand";
import { unpairDevice } from "../../src/lib/p2p/unpair";
import {
  stubLocalStorage,
  type FakeLocalStorage,
} from "./support/local-storage";
import { fakeBucket, routeOver } from "./support/store-bucket";
import { base64, pairedWith } from "./support/paired-device";

const ORIGIN = "https://app.example";

/** The one record the whole Paired Device list lives in (`paired-devices.ts`). */
const JAR_KEY = "inventoria_paired_devices";

let sqlite3: any;
let jar: FakeLocalStorage;
let store: Store;
let held: Map<string, { bytes: Uint8Array; etag: string }>;
/** Every address written, in order, so a wake's deposits can be counted. */
let puts: string[];

beforeEach(async () => {
  sqlite3 = await (sqlite3InitModule as any)();
  jar = stubLocalStorage();
  const bucket = fakeBucket();
  held = bucket.held;
  puts = [];
  const route = storeOverFetch(routeOver(bucket.bucket), ORIGIN);
  store = {
    ...route,
    deposit: (address, sealed, ifMatch) => {
      puts.push(address);
      return route.deposit(address, sealed, ifMatch);
    },
  };
});

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// A household: three devices, each with one ledger and its own list of pairings
// ---------------------------------------------------------------------------

interface Device {
  device_id: string;
  db: LedgerDb;
  ledger: WakeLedger;
  /** This device's whole Paired Device list, as its jar holds it. */
  rows: PairedDevice[];
}

/**
 * One device: a ledger, and the list of pairings its jar holds.
 *
 * **No clock.** Every row in this suite is stamped by hand, so nothing here
 * ever issues one — `wake.test.ts` keeps an Hlc because it is the harness the
 * app's import path moves, and a clock nobody reads would be a field to
 * maintain for nothing.
 */
function device(device_id: string): Device {
  const db: LedgerDb = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  return {
    device_id,
    db,
    rows: [],
    ledger: {
      oldestAbove: async (after, budgetBytes, above, scope) =>
        readLedgerPage(db, after, budgetBytes, {
          above,
          laneScope: scope,
          order: "stamp",
        }),
      // The converging write path, which is the one `db.worker.ts` takes for a
      // batch that *arrived*: every carried deletion this ledger holds is
      // applied to it (ADR-0096 §12).
      write: async (rows) => importConvergedRows(db, rows).outcome.rowsAdded,
    },
  };
}

/**
 * One completed pairing, written down on both devices, exactly as the act
 * leaves it: one secret, two roles, and both vectors empty because a first sync
 * between two fresh ledgers exchanges nothing.
 *
 * **A distinct secret per pair is the whole of §10's second claim** — there is
 * no household seed and no per-device seed, so the only thing a pairing shares
 * is with the one device it was made with.
 */
async function pairUp(a: Device, b: Device, secret: number): Promise<void> {
  const showed = await derivePairingChains(
    new Uint8Array(32).fill(secret),
    "showed"
  );
  const read = await derivePairingChains(
    new Uint8Array(32).fill(secret),
    "read"
  );
  a.rows.push(pairedWith(b.device_id, showed));
  b.rows.push(pairedWith(a.device_id, read));
}

/**
 * One device's turn at the jar.
 *
 * The app reads its pairings from `localStorage` and there is one of those, so
 * a household is modelled by swapping the list in for the duration of an act
 * and reading back what the act left. It is the same boundary the app crosses —
 * `readPairedDevices()` on the way in, the record's own guard on the way out —
 * rather than a second list the test keeps beside it.
 */
async function atDevice<T>(who: Device, act: () => Promise<T>): Promise<T> {
  jar.store.set(JAR_KEY, JSON.stringify(who.rows));
  try {
    return await act();
  } finally {
    who.rows = readPairedDevices();
  }
}

/** One open of the app: a round over every pairing this device holds. */
const open = (who: Device) =>
  atDevice(who, () => convergeWithPeers("root", store, who.ledger));

/** The delta growing: a deposit on every lane, collecting from none (§3). */
const growth = (who: Device) =>
  atDevice(who, () => depositToPeers("root", store, who.ledger));

/** The user severing one pairing on this device, both phases (§11). */
const unpair = (who: Device, peer: Device) =>
  atDevice(who, () => unpairDevice(peer.device_id, store));

const pairingWith = (who: Device, peer: Device): PairedDevice | undefined =>
  who.rows.find((row) => row.device_id === peer.device_id);

const lanesOf = (who: Device, peer: Device) => {
  const row = pairingWith(who, peer)!;
  return {
    deposit: laneChainOf(row.deposit),
    collect: laneChainOf(row.collect),
  };
};

/** Where this device's deposits to that one sit. */
const depositAddress = (who: Device, peer: Device) =>
  laneAddress(lanesOf(who, peer).deposit);

/** One row, stamped by hand: this suite is about crossing, not about writing. */
const row = (entity: string, minter: string, at: number): LedgerRow => ({
  entity,
  attribute: "event/kind",
  value: '"consume_food"',
  time: at,
  hlc_ms: at,
  hlc_ctr: 0,
  device_id: minter,
});

/** Rows straight into a device's ledger, as if it had always held them. */
const hold = (who: Device, rows: LedgerRow[]): void => {
  importLedgerRows(who.db, rows);
};

const entitiesOf = (who: Device): string[] =>
  readLedgerPage(who.db, null, 8 * 1024 * 1024)
    .map((stored) => stored.entity)
    .sort();

/**
 * A household of three, every pair of them paired.
 *
 * **The order each device's list is in is the order it paired in**, and it is
 * stated rather than incidental: a round serves its pairings in list order, so
 * the household below is the one where the tablet and the laptop were paired
 * with each other before the phone arrived.
 */
async function household(): Promise<[Device, Device, Device]> {
  const phone = device("dev_phone");
  const tablet = device("dev_tablet");
  const laptop = device("dev_laptop");
  await pairUp(tablet, laptop, 1);
  await pairUp(phone, tablet, 2);
  await pairUp(phone, laptop, 3);
  return [phone, tablet, laptop];
}

// ---------------------------------------------------------------------------

describe("a device with N−1 peers deposits N−1 times per wake", () => {
  it("touches one lane per pair, and no lane twice", async () => {
    const [phone, tablet, laptop] = await household();
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);

    await open(phone);

    expect(puts.length).toBe(2);
    expect(puts.slice().sort()).toEqual(
      [
        await depositAddress(phone, tablet),
        await depositAddress(phone, laptop),
      ].sort()
    );
  });

  it("deposits on every lane with nothing of its own to send", async () => {
    // A read-mostly device still spends its N−1 writes: a lane whose depositor
    // goes quiet is a chain its peer cannot advance (§5).
    const [phone] = await household();

    await open(phone);

    expect(puts.length).toBe(2);
    expect(held.size).toBe(2);
  });
});

describe("each pair has its own chain, its own indices and its own seal keys", () => {
  it("shares no address and no key across the household's three pairings", async () => {
    const [phone, tablet, laptop] = await household();
    const pairs: [Device, Device][] = [
      [phone, tablet],
      [phone, laptop],
      [tablet, laptop],
    ];

    const addresses: string[] = [];
    const keys: string[] = [];
    for (const [one, other] of pairs) {
      for (const [who, peer] of [
        [one, other],
        [other, one],
      ] as [Device, Device][]) {
        const lane = lanesOf(who, peer).deposit;
        addresses.push(await laneAddress(lane));
        keys.push(base64(await deriveLaneKey(lane, "seal")));
      }
    }

    // Six lanes, six addresses, six keys — N(N−1) of each, and nothing in
    // common between two pairs.
    expect(new Set(addresses).size).toBe(6);
    expect(new Set(keys).size).toBe(6);
  });

  it("cannot open one pair's deposit with another pair's key", async () => {
    const [phone, tablet, laptop] = await household();
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);
    await open(phone);

    const toTablet = held.get(await depositAddress(phone, tablet))!;
    const wrongKey = await deriveLaneKey(
      lanesOf(phone, laptop).deposit,
      "seal"
    );

    await expect(
      openDeposit({ key: wrongKey }, 0, toTablet.bytes)
    ).rejects.toThrow();
  });

  it("advances one pairing's index while the other's stands still", async () => {
    const [phone, tablet, laptop] = await household();
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);

    // The tablet collects and says the word for it; the laptop sleeps through.
    await open(phone);
    await open(tablet);
    await open(phone);

    expect(pairingWith(phone, tablet)!.deposit.index).toBe(1);
    expect(pairingWith(phone, laptop)!.deposit.index).toBe(0);
  });
});

describe("a three-device household converges", () => {
  it("reaches both peers, including the one that slept through", async () => {
    const [phone, tablet, laptop] = await household();
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);

    // The phone is opened and shut. The tablet is opened the same evening.
    await open(phone);
    await open(tablet);
    expect(entitiesOf(tablet)).toEqual(["event:consume_breakfast"]);

    // The laptop is opened a week later, with both others shut.
    await open(laptop);
    expect(entitiesOf(laptop)).toEqual(["event:consume_breakfast"]);
  });

  it("carries a row logged on any of the three to both others", async () => {
    const [phone, tablet, laptop] = await household();
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);
    hold(tablet, [row("event:consume_lunch", "dev_tablet", 2_000)]);
    hold(laptop, [row("event:consume_dinner", "dev_laptop", 3_000)]);

    // Three opens each: every lane has to carry in both directions, and a
    // deposit is built against what its last acknowledgement established.
    for (let round = 0; round < 3; round += 1) {
      for (const who of [phone, tablet, laptop]) await open(who);
    }

    const all = [
      "event:consume_breakfast",
      "event:consume_dinner",
      "event:consume_lunch",
    ];
    expect(entitiesOf(phone)).toEqual(all);
    expect(entitiesOf(tablet)).toEqual(all);
    expect(entitiesOf(laptop)).toEqual(all);
  });
});

describe("relay is a bonus, never the plan", () => {
  it("carries a row across a pairing that was never made", async () => {
    // The phone is paired with the tablet, and the tablet with the laptop. The
    // phone and the laptop have never met.
    const phone = device("dev_phone");
    const tablet = device("dev_tablet");
    const laptop = device("dev_laptop");
    await pairUp(phone, tablet, 1);
    await pairUp(tablet, laptop, 2);
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);

    await open(phone);
    await open(tablet);
    await open(laptop);

    expect(entitiesOf(laptop)).toEqual(["event:consume_breakfast"]);
  });

  it("stops carrying the moment the only route is severed", async () => {
    // The claim under test is *a pairing never made is a route the store
    // cannot supply*, and an absence on a device that was never paired cannot
    // fail — no implementation could make it arrive. So the absence is
    // produced by **taking the pairing away**: the same line as above, and the
    // same row crossing it, until the middle pairing is severed.
    const phone = device("dev_phone");
    const tablet = device("dev_tablet");
    const laptop = device("dev_laptop");
    await pairUp(phone, tablet, 1);
    await pairUp(tablet, laptop, 2);
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);
    for (const who of [phone, tablet, laptop]) await open(who);
    expect(entitiesOf(laptop)).toEqual(["event:consume_breakfast"]);

    await unpair(tablet, laptop);
    hold(phone, [row("event:consume_lunch", "dev_phone", 2_000)]);
    for (const who of [phone, tablet, laptop]) await open(who);

    // The tablet has lunch and the laptop never will: the relay it arrived by
    // was a pairing, and the pairing is gone.
    expect(entitiesOf(tablet)).toEqual([
      "event:consume_breakfast",
      "event:consume_lunch",
    ]);
    expect(entitiesOf(laptop)).toEqual(["event:consume_breakfast"]);
  });
});

describe("the roster from the deposit shows each device's own pairings", () => {
  it("keeps two peers' rosters apart rather than merging them", async () => {
    const [phone, tablet, laptop] = await household();

    // Every device deposits, and then every device collects.
    for (const who of [phone, tablet, laptop]) await open(who);
    for (const who of [phone, tablet, laptop]) await open(who);

    // What the phone holds is two separate statements, each made by the device
    // that made it, and neither is a view of the household.
    expect(pairingWith(phone, tablet)!.peer_roster).toEqual(["dev_laptop"]);
    expect(pairingWith(phone, laptop)!.peer_roster).toEqual(["dev_tablet"]);
    expect(pairingWith(tablet, phone)!.peer_roster).toEqual(["dev_laptop"]);
    expect(pairingWith(laptop, phone)!.peer_roster).toEqual(["dev_tablet"]);
  });
});

describe("an unpair is scoped to that pairing and pending on the others", () => {
  it("leaves the other two pairings converging exactly as they were", async () => {
    const [phone, tablet, laptop] = await household();
    for (const who of [phone, tablet, laptop]) await open(who);

    await unpair(phone, laptop);

    // The phone has dropped the laptop and both their lane objects are gone.
    expect(pairingWith(phone, laptop)).toBeUndefined();
    expect(held.has(await depositAddress(laptop, phone))).toBe(false);

    // The laptop is still paired with the tablet, and a row logged on the
    // laptop still reaches it — and reaches the phone through it.
    hold(laptop, [row("event:consume_dinner", "dev_laptop", 3_000)]);
    await open(laptop);
    await open(tablet);
    await open(phone);

    expect(entitiesOf(tablet)).toEqual(["event:consume_dinner"]);
    expect(entitiesOf(phone)).toEqual(["event:consume_dinner"]);
  });

  it("stops naming the severed pairing to the peers that still stand", async () => {
    const [phone, tablet, laptop] = await household();
    for (const who of [phone, tablet, laptop]) await open(who);
    await open(tablet);
    expect(pairingWith(tablet, phone)!.peer_roster).toEqual(["dev_laptop"]);

    await unpair(phone, laptop);
    await open(phone);
    await open(tablet);

    // The tablet's picture of the phone is the phone's own, and it is current.
    expect(pairingWith(tablet, phone)!.peer_roster).toEqual([]);
  });

  it("latches the revoked device's own deposit at an address nobody reads", async () => {
    const [phone, , laptop] = await household();
    for (const who of [phone, laptop]) await open(who);

    const laneToPhone = await depositAddress(laptop, phone);
    await unpair(phone, laptop);
    expect(held.has(laneToPhone)).toBe(false);

    // The laptop has not been told and cannot be: its rewrite is refused, and
    // the recreate that answers it puts the object back at an address the
    // phone no longer holds the chain state to derive (§10, §11).
    await open(laptop);

    expect(held.has(laneToPhone)).toBe(true);
    expect(phone.rows.map((kept) => kept.device_id)).toEqual(["dev_tablet"]);
  });
});

describe("the fan-out is superlinear, and it is measured", () => {
  it("leaves N(N−1) live objects with one row in (N−1)² of them", async () => {
    const three = await household();
    const [phone, tablet, laptop] = three;
    hold(phone, [row("event:consume_breakfast", "dev_phone", 1_000)]);

    // The phone logs breakfast and is shut. Its deposit goes to both peers.
    await growth(phone);
    // The tablet and then the laptop are opened. Each collects breakfast from
    // the phone; neither has anything from the other yet, so neither learns
    // that the other holds it.
    await open(tablet);
    await open(laptop);
    // Everybody logs something over the day, and no acknowledgement has made
    // it home yet, so every deposit re-asserts breakfast to a peer its
    // depositor still believes lacks it.
    hold(phone, [row("event:consume_elevenses", "dev_phone", 4_000)]);
    for (const who of [phone, tablet, laptop]) await growth(who);

    // Six lanes, six live objects: N(N−1) at N = 3.
    expect(held.size).toBe(6);
    expect(await copiesOf("event:consume_breakfast", three)).toBe(4);
    // And a row minted after both peers had collected sits in N−1 of them,
    // which is what the difference between the two counts is: the two relay
    // copies the phone never made and did not have to.
    expect(await copiesOf("event:consume_elevenses", three)).toBe(2);
  });
});

/**
 * How many of the household's live objects carry one entity at this moment.
 *
 * It opens every lane with the lane's own key, which is the only way to count
 * them: the store holds sealed bytes and cannot be asked.
 */
async function copiesOf(entity: string, devices: Device[]): Promise<number> {
  let copies = 0;
  for (const who of devices) {
    for (const peer of devices) {
      if (peer === who) continue;
      const paired = pairingWith(who, peer);
      if (!paired) continue;
      const lane = laneChainOf(paired.deposit);
      const object = held.get(await laneAddress(lane));
      if (!object) continue;
      const chunks = await openDeposit(
        { key: await deriveLaneKey(lane, "seal") },
        paired.deposit.index,
        object.bytes
      );
      // Read through the app's own chunk reader rather than by searching the
      // bytes: a substring would match any datom whose *value* happened to
      // carry the string, and what is being counted is the row.
      const carried = chunks
        .slice(1)
        .flatMap((chunk) => readDatomChunk(new TextDecoder().decode(chunk)));
      if (carried.some((datom) => datom.entity === entity)) copies += 1;
    }
  }
  return copies;
}
