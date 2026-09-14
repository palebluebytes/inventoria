/**
 * Which wakes serve which lanes, and what each one deposits (ADR-0103 §9).
 *
 * > **A wake serves a lane if the waking Facet's scope meets it, and deposits
 * > only the domains the waking Facet holds.**
 *
 * Four cases fall out of that sentence and the fourth is the repair, so the
 * fixture is the table itself: two devices with real SQLite ledgers on either
 * side of the **real store route**, a lane whose scope is written by the app's
 * own record writer, and a wake run through `wake-errand.ts` with a Facet named.
 * Nothing here re-implements the narrowing it is measuring — what a deposit
 * carries is read back out of the bucket by opening it.
 *
 * The fourth case is [#415](https://github.com/palebluebytes/inventoria/issues/415):
 * a Facet-scoped wipe performed in the standalone Rations install deposited
 * nothing, because a wake was an open of the root. It is proved closed here, in
 * the shape the ticket describes — wipe on the Rations side, nothing but that
 * Facet's wake afterwards, and the peer collecting a week later with the wiping
 * device shut.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  createLedgerSchema,
  importConvergedRows,
  importLedgerRows,
  readLedgerPage,
  wipeFacetFromLedger,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import { createHlc, type Hlc } from "../../src/lib/db/hlc";
import { entityPrefixesOf, type FacetId } from "../../src/lib/facets/registry";
import { storeOverFetch, type Store } from "../../src/lib/p2p/deposit-store";
import { derivePairingChains } from "../../src/lib/p2p/pairing-chain";
import { laneAddress } from "../../src/lib/p2p/pairing-chain";
import { WHOLE_JAR, type LaneScope } from "../../src/lib/p2p/lane-scope";
import {
  laneChainOf,
  readPairedDevices,
  rememberPairedDevice,
  updatePairedDevice,
  type PairedDevice,
} from "../../src/lib/stores/paired-devices";
import type { WakeLedger } from "../../src/lib/p2p/wake";
import {
  convergeWithPeers,
  depositToPeers,
  type SyncRound,
} from "../../src/lib/p2p/wake-errand";
import { wakeCounter } from "../../src/lib/p2p/wake-counter";
import {
  stubLocalStorage,
  type FakeLocalStorage,
} from "./support/local-storage";
import { fakeBucket, routeOver } from "./support/store-bucket";

const ORIGIN = "https://app.example";

/** The one record the whole Paired Device list lives in (`paired-devices.ts`). */
const JAR_KEY = "inventoria_paired_devices";

/** The prefixes a Facet-scoped wipe of Rations freezes into its deletion. */
const FOOD = entityPrefixesOf("food");

let sqlite3: any;
let jar: FakeLocalStorage;
let store: Store;
let held: Map<string, { bytes: Uint8Array; etag: string }>;
/** Every address written, in order, so a skipped lane can be shown untouched. */
let reached: string[];

beforeEach(async () => {
  sqlite3 = await (sqlite3InitModule as any)();
  jar = stubLocalStorage();
  const bucket = fakeBucket();
  held = bucket.held;
  reached = [];
  const route = storeOverFetch(routeOver(bucket.bucket), ORIGIN);
  store = {
    collect: (address) => (reached.push(address), route.collect(address)),
    deposit: (address, sealed, ifMatch) => (
      reached.push(address),
      route.deposit(address, sealed, ifMatch)
    ),
    discard: (address) => (reached.push(address), route.discard(address)),
  };
});

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Two devices, each with one ledger and its own list of pairings
// ---------------------------------------------------------------------------

interface Device {
  device_id: string;
  db: LedgerDb;
  clock: Hlc;
  ledger: WakeLedger;
  /** This device's whole Paired Device list, as its jar holds it. */
  rows: PairedDevice[];
}

/**
 * One device, with `sync-ledger.ts`' own seam against a real ledger rather than
 * through the worker: what the peer lacks, inside what this wake carries.
 *
 * The scope goes into `readLedgerPage` whole, exactly as `appWakeLedger` hands
 * it over — a harness that derived prefixes here instead would be proving its
 * own narrowing rather than the app's, and §6's deletion rule is the half a
 * prefix list cannot state.
 */
function device(device_id: string): Device {
  const db: LedgerDb = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  return {
    device_id,
    db,
    clock: createHlc(device_id, { wallClock: () => 1_000 }),
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
 * One device's turn at the jar.
 *
 * The app reads its pairings from `localStorage` and there is one of those, so
 * two devices are modelled by swapping the list in for the duration of an act
 * and reading back what the act left — the same boundary the app crosses, and
 * not a second list kept beside it.
 */
async function atDevice<T>(who: Device, act: () => Promise<T>): Promise<T> {
  jar.store.set(JAR_KEY, JSON.stringify(who.rows));
  try {
    return await act();
  } finally {
    who.rows = readPairedDevices();
  }
}

/**
 * One completed pairing at a stated scope, written down on both devices by the
 * app's own writer.
 *
 * `rememberPairedDevice` is what a first sync calls, and it takes the scope
 * from the act (ADR-0103 §4), so a lane at any scope is made here the way the
 * app makes one rather than by writing a different record literal.
 */
async function pairUp(
  a: Device,
  b: Device,
  secret: number,
  scope: LaneScope
): Promise<void> {
  const showed = await derivePairingChains(
    new Uint8Array(32).fill(secret),
    "showed"
  );
  const read = await derivePairingChains(
    new Uint8Array(32).fill(secret),
    "read"
  );
  await atDevice(a, async () => {
    rememberPairedDevice({
      device_id: b.device_id,
      chains: showed,
      peer_vector: {},
      scope,
    });
  });
  await atDevice(b, async () => {
    rememberPairedDevice({
      device_id: a.device_id,
      chains: read,
      peer_vector: {},
      scope,
    });
  });
}

/** One open of the app on this device, in one Facet (§9). */
const wakeIn = (who: Device, facetId: FacetId) =>
  atDevice(who, () => convergeWithPeers(facetId, store, who.ledger));

/** The delta growing inside an open: a deposit on every lane it serves. */
const growthIn = (who: Device, facetId: FacetId) =>
  atDevice(who, () => depositToPeers(facetId, store, who.ledger));

/**
 * One open's counter, folded over this device's jar (ADR-0096 §11).
 *
 * The join `openAppWake` makes: one counter per open, handed every sync's
 * round. It is here rather than inside {@link wakeIn} because a wake may hold
 * several syncs and the counter has to outlive each of them.
 */
function counter(who: Device): (round: SyncRound) => Promise<void> {
  const count = wakeCounter(readPairedDevices, updatePairedDevice);
  return (round) =>
    atDevice(who, async () => {
      count(round);
    });
}

/** One sync, counted as the only one of its wake. */
const counting = async (
  who: Device,
  round: SyncRound
): Promise<PairedDevice> => {
  await counter(who)(round);
  return who.rows[0];
};

/** One row, stamped by hand: this suite is about crossing, not about writes. */
const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  entity: "event:consume_1",
  attribute: "event/kind",
  value: '"consume_food"',
  time: 1_000,
  hlc_ms: 1_000,
  hlc_ctr: 0,
  device_id: "dev_phone",
  ...over,
});

/**
 * Rows straight into a device's ledger, as if it had always held them, moving
 * its clock the way `db.worker.ts` moves it on every import.
 */
const hold = (who: Device, rows: LedgerRow[]): void => {
  const outcome = importLedgerRows(who.db, rows);
  if (outcome.highWater) who.clock.update(outcome.highWater);
};

/** One of each kind, so a narrowed deposit has something to leave behind. */
const oneOfEach = (who: Device): void =>
  hold(who, [
    row({ entity: "event:consume_1", hlc_ms: 1_000 }),
    row({ entity: "habit:1", attribute: "habit/name", hlc_ms: 1_001 }),
    row({ entity: "isbn:9780", attribute: "twin/name", hlc_ms: 1_002 }),
  ]);

const entitiesOf = (who: Device): string[] =>
  readLedgerPage(who.db, null, 8 * 1024 * 1024)
    .map((r) => r.entity)
    .sort();

/** Where this device's own deposit sits, so a test can see it untouched. */
const depositAddress = (who: Device, peer: Device): Promise<string> =>
  laneAddress(
    laneChainOf(
      who.rows.find((paired) => paired.device_id === peer.device_id)!.deposit
    )
  );

// ---------------------------------------------------------------------------
// §9's table
// ---------------------------------------------------------------------------

describe("a wake serves a lane its Facet's scope meets", () => {
  it("carries a food lane wholly when Rations is what woke", async () => {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 1, ["food"]);
    oneOfEach(phone);

    await wakeIn(phone, "food");
    await wakeIn(laptop, "root");

    // The lane is food, so food is the whole of what it ever carried — and
    // Rations' scope meets the whole of it.
    expect(entitiesOf(laptop)).toEqual(["event:consume_1"]);
  });

  it("carries a jar-wide lane wholly when the root is what woke", async () => {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 2, WHOLE_JAR);
    oneOfEach(phone);

    await wakeIn(phone, "root");
    await wakeIn(laptop, "root");

    expect(entitiesOf(laptop)).toEqual([
      "event:consume_1",
      "habit:1",
      "isbn:9780",
    ]);
  });

  it("carries a food lane wholly when the root is what woke", async () => {
    // The root's scope contains every lane's, so it narrows nothing the lane
    // has not already narrowed — ADR-0078 §3's asymmetry, already sanctioned.
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 3, ["food"]);
    oneOfEach(phone);

    await wakeIn(phone, "root");
    await wakeIn(laptop, "root");

    expect(entitiesOf(laptop)).toEqual(["event:consume_1"]);
  });

  it("carries food and nothing else when Rations wakes on a jar-wide lane", async () => {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 4, WHOLE_JAR);
    oneOfEach(phone);

    await wakeIn(phone, "food");
    await wakeIn(laptop, "root");

    // Rations writes only rows from the domains it owns, onto a lane it did
    // not create, and leaves the other five to the root's wake.
    expect(entitiesOf(laptop)).toEqual(["event:consume_1"]);
  });

  it("leaves the other five domains' marks untouched, so the root's wake still carries them", async () => {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 5, WHOLE_JAR);
    oneOfEach(phone);

    await wakeIn(phone, "food");
    await wakeIn(laptop, "root");
    // The acknowledgement comes back, so what the deposit *brought* is folded
    // into this device's view of its peer. Under a per-device scalar that fold
    // would have claimed the peer held everything below the greatest stamp
    // sent, and the habit and Media rows would have been withheld for ever.
    await wakeIn(phone, "food");

    const view = phone.rows[0].peer_vector;
    expect(Object.keys(view.dev_phone ?? {})).toEqual(["food"]);

    // The person opens the root on the same phone, and the rest goes.
    await wakeIn(phone, "root");
    await wakeIn(laptop, "root");

    expect(entitiesOf(laptop)).toEqual([
      "event:consume_1",
      "habit:1",
      "isbn:9780",
    ]);
  });
});

// ---------------------------------------------------------------------------
// #415
// ---------------------------------------------------------------------------

describe("a wipe performed in Rations reaches the peer on Rations' own wake", () => {
  /** Two converged devices on a jar-wide lane, each holding one of each kind. */
  async function converged(): Promise<[Device, Device]> {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 6, WHOLE_JAR);
    oneOfEach(phone);
    await wakeIn(phone, "root");
    await wakeIn(laptop, "root");
    await wakeIn(phone, "root");
    expect(entitiesOf(laptop)).toHaveLength(3);
    return [phone, laptop];
  }

  it("deposits the carried deletion, and the peer applies it with the phone shut", async () => {
    const [phone, laptop] = await converged();

    // "Delete all my food data", pressed in the standalone Rations install.
    // The control is `FoodDataSection`, which both shells mount.
    expect(wipeFacetFromLedger(phone.db, FOOD, phone.clock.now())).toBe(1);
    // The ledger-growth trigger, inside the only wake this person has open.
    await growthIn(phone, "food");

    // The laptop opens a week later, with the phone shut.
    const taken = await wakeIn(laptop, "root");

    expect(taken.productive).toEqual(["dev_phone"]);
    // The food row is gone from the peer and nothing else is, which is the
    // whole of #415: before this the lane still held the pre-wipe object, and a
    // peer collecting in that window got the very rows the wipe removed.
    expect(
      entitiesOf(laptop).filter((e) => !e.startsWith("deletion:"))
    ).toEqual(["habit:1", "isbn:9780"]);
  });

  it("refuses the rows the wipe took when the peer offers them back", async () => {
    const [phone, laptop] = await converged();
    wipeFacetFromLedger(phone.db, FOOD, phone.clock.now());
    await growthIn(phone, "food");
    await wakeIn(laptop, "root");

    // The laptop is the device that still had them a moment ago, so this is
    // the round that would re-supply them if the deletion were an event rather
    // than a standing predicate.
    await wakeIn(laptop, "root");
    await wakeIn(phone, "food");

    expect(entitiesOf(phone).filter((e) => !e.startsWith("deletion:"))).toEqual(
      ["habit:1", "isbn:9780"]
    );
  });

  it("carries no deletion that reaches past what the lane carries", async () => {
    // The same wipe, down a **food** lane. Its prefix list is food's, so it
    // crosses; a wipe that had taken Media as well would not, because a lane
    // deletes nothing it does not carry (§6).
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 7, ["food"]);
    oneOfEach(phone);
    await wakeIn(phone, "food");
    await wakeIn(laptop, "root");
    await wakeIn(phone, "food");

    wipeFacetFromLedger(phone.db, [...FOOD, "isbn:"], phone.clock.now());
    await growthIn(phone, "food");
    await wakeIn(laptop, "root");

    expect(entitiesOf(laptop)).toEqual(["event:consume_1"]);
  });
});

// ---------------------------------------------------------------------------
// A lane a Facet meets no part of
// ---------------------------------------------------------------------------

describe("a lane the waking Facet does not meet is not served at all", () => {
  /**
   * A Media-only lane, which no pairing act can mint today: both Facets hold
   * food, so every lane meets both. A later build's Facet could, and the record
   * admits a domain id this one has never heard of — so the skip is written
   * against the shape rather than against the roster.
   */
  const mediaOnly = async (): Promise<[Device, Device]> => {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 8, ["media"]);
    oneOfEach(phone);
    return [phone, laptop];
  };

  it("touches neither of its keys", async () => {
    const [phone, laptop] = await mediaOnly();
    const address = await depositAddress(phone, laptop);

    const round = await wakeIn(phone, "food");

    expect(round.served).toEqual([]);
    expect(reached).toEqual([]);
    expect(held.has(address)).toBe(false);
  });

  it("is served by the Facet whose scope does meet it", async () => {
    const [phone, laptop] = await mediaOnly();

    const round = await wakeIn(phone, "root");
    await wakeIn(laptop, "root");

    expect(round.served).toEqual(["dev_laptop"]);
    expect(entitiesOf(laptop)).toEqual(["isbn:9780"]);
  });

  it("burns none of K on the wake that did not look", async () => {
    // §11's counter measures absences somebody looked for. A wake that never
    // reached this lane has produced nothing on it, and counting that would
    // stop a pairing the other Facet's wakes are converging perfectly well.
    const [phone] = await mediaOnly();

    const round = await wakeIn(phone, "food");

    expect((await counting(phone, round)).unproductive_wakes).toBe(0);
  });

  it("burns one on the lane it did serve and found nobody at", async () => {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 9, WHOLE_JAR);

    const round = await wakeIn(phone, "food");

    expect((await counting(phone, round)).unproductive_wakes).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §11's counter, which is per-pairing and blind to which Facet woke
// ---------------------------------------------------------------------------

describe("a pairing served by both Facets burns one wake per wake", () => {
  it("counts a root open and a Rations open as two wakes, not four", async () => {
    // One number on one record, whoever woke. A counter split per Facet would
    // have a pairing served by both count toward 200 twice — which is what
    // ADR-0103 §9 pays for here by keeping the counter blind to the Facet.
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 10, WHOLE_JAR);

    await counting(phone, await wakeIn(phone, "root"));
    const both = await counting(phone, await wakeIn(phone, "food"));

    expect(both.unproductive_wakes).toBe(2);
  });

  it("burns one however many syncs of that wake report it", async () => {
    const phone = device("dev_phone");
    const laptop = device("dev_laptop");
    await pairUp(phone, laptop, 11, WHOLE_JAR);

    // One counter per open, handed every sync of it — the hourly collection
    // floor firing eight times inside one open of Rations.
    const wake = counter(phone);
    for (let sync = 0; sync < 8; sync += 1) {
      await wake(await wakeIn(phone, "food"));
    }

    expect(phone.rows[0].unproductive_wakes).toBe(1);
  });
});
