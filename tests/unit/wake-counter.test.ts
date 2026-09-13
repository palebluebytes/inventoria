/**
 * §11's counter: K = 200, the stop it causes, and the date it keeps
 * (ADR-0096 §11, as amended 2026-09-12).
 *
 * Two halves, and they are tested at two levels because they are two claims.
 *
 * The **counting** is arithmetic over the record and is proved directly: what a
 * wake does to a pairing that produced nothing, what a productive sync undoes,
 * and the one property the whole bound rests on — that a session polling eight
 * times against an absent peer burns one wake and not eight.
 *
 * The **stop** is a claim about the store, so it is proved against the real
 * route over a bucket: a pairing at K has neither of its keys touched, while
 * the pairing beside it is served in the same round.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { stubLocalStorage } from "./support/local-storage";
import { fakeBucket, routeOver } from "./support/store-bucket";
import {
  derivePairingChains,
  deriveLaneKey,
  type PairedChains,
} from "../../src/lib/p2p/pairing-chain";
import { base64url } from "../../src/lib/p2p/room-code";
import {
  storeOverFetch,
  StoreUnreachableError,
  type Store,
} from "../../src/lib/p2p/deposit-store";
import { depositToPeer, type WakeLedger } from "../../src/lib/p2p/wake";
import {
  isStopped,
  wakeCounter,
  UNPRODUCTIVE_WAKE_LIMIT,
} from "../../src/lib/p2p/wake-counter";
import type { PairedDevice } from "../../src/lib/stores/paired-devices";
import { WHOLE_JAR } from "../../src/lib/p2p/lane-scope";

const ORIGIN = "https://app.example";

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// One wake's counting, over a list held in memory
// ---------------------------------------------------------------------------

/**
 * A pairing as the counter sees it. Only three of its fields matter here, and
 * the rest are what a completed first sync leaves.
 */
const pairing = (
  device_id: string,
  over: Partial<PairedDevice> = {}
): PairedDevice => ({
  device_id,
  name: null,
  deposit: { direction: "a2b", state: "", index: 0 },
  collect: { direction: "b2a", state: "", index: 0 },
  scope: WHOLE_JAR,
  peer_vector: {},
  deposit_standing: null,
  peer_roster: null,
  unproductive_wakes: 0,
  last_met: null,
  revoked: false,
  ...over,
});

/** One wake's counter over a list a test can read back. */
function counting(rows: PairedDevice[], day = "2026-09-13") {
  let held = rows;
  const count = wakeCounter(
    () => held,
    (device) => {
      held = held.map((row) =>
        row.device_id === device.device_id ? device : row
      );
    },
    () => new Date(`${day}T09:13:00`)
  );
  return {
    count,
    row: (device_id: string) =>
      held.find((device) => device.device_id === device_id)!,
  };
}

describe("a wake that produced nothing burns one of K", () => {
  it("counts a wake in which no acknowledgement arrived and nothing settled", () => {
    const jar = counting([pairing("dev_b", { unproductive_wakes: 7 })]);

    jar.count([]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(8);
  });

  it("resets the count the moment a pairing produces something", () => {
    const jar = counting([pairing("dev_b", { unproductive_wakes: 199 })]);

    jar.count(["dev_b"]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(0);
  });

  it("counts each pairing on its own, in the same wake", () => {
    const jar = counting([
      pairing("dev_b", { unproductive_wakes: 3 }),
      pairing("dev_c", { unproductive_wakes: 3 }),
    ]);

    jar.count(["dev_c"]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(4);
    expect(jar.row("dev_c").unproductive_wakes).toBe(0);
  });
});

describe("K is counted in wakes and never in syncs", () => {
  it("burns one wake through eight polls against an absent peer", () => {
    const jar = counting([pairing("dev_b")]);

    // The cadence's own case — a session that collects on open and then on the
    // hourly floor eight times over — folded into this counter. Eight, or
    // K = 200 quietly becomes K = 25 and "about seven months of daily use" is
    // wrong by an order of magnitude.
    for (let sync = 0; sync < 9; sync += 1) jar.count([]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(1);
  });

  it("lets a later sync of the same wake undo what an earlier one burned", () => {
    const jar = counting([pairing("dev_b", { unproductive_wakes: 4 })]);

    jar.count([]);
    expect(jar.row("dev_b").unproductive_wakes).toBe(5);

    // The hourly floor, an hour into the same open, finding the peer awake.
    jar.count(["dev_b"]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(0);
  });

  it("does not burn a second wake after a productive sync", () => {
    const jar = counting([pairing("dev_b", { unproductive_wakes: 4 })]);

    jar.count(["dev_b"]);
    jar.count([]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(0);
  });
});

describe("the last-met date is coarsened to the day it fell on", () => {
  it("dates a productive wake, and keeps no hour of it", () => {
    const jar = counting([pairing("dev_b")], "2026-09-13");

    jar.count(["dev_b"]);

    expect(jar.row("dev_b").last_met).toBe("2026-09-13");
  });

  it("leaves the date where it was through a wake that produced nothing", () => {
    const jar = counting([pairing("dev_b", { last_met: "2026-03-01" })]);

    jar.count([]);

    expect(jar.row("dev_b").last_met).toBe("2026-03-01");
  });
});

describe("at K the pairing stops, and the stop is a state rather than a removal", () => {
  it("reaches the stop on the two-hundredth consecutive wake", () => {
    const jar = counting([
      pairing("dev_b", { unproductive_wakes: UNPRODUCTIVE_WAKE_LIMIT - 1 }),
    ]);

    jar.count([]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(UNPRODUCTIVE_WAKE_LIMIT);
    expect(isStopped(jar.row("dev_b"))).toBe(true);
  });

  it("still serves the wake it reaches K on, rather than stopping before it", () => {
    // The counter settles after the sync and not before it, or a pairing whose
    // peer came back on wake 200 would be stopped without ever being asked.
    const jar = counting([
      pairing("dev_b", { unproductive_wakes: UNPRODUCTIVE_WAKE_LIMIT - 1 }),
    ]);

    jar.count(["dev_b"]);

    expect(isStopped(jar.row("dev_b"))).toBe(false);
  });

  it("counts no further once it has stopped, because nothing is looked for", () => {
    const jar = counting([
      pairing("dev_b", { unproductive_wakes: UNPRODUCTIVE_WAKE_LIMIT }),
    ]);

    jar.count([]);

    expect(jar.row("dev_b").unproductive_wakes).toBe(UNPRODUCTIVE_WAKE_LIMIT);
  });

  it("keeps the pairing, both lanes and the outstanding deposit", () => {
    // Hitting K never unpairs: auto-removal would convert a recoverable pause
    // into an irreversible act taken by a timer, and the user cannot re-pair
    // without the other device in the room.
    const standing = { etag: "outstanding", brings: {} };
    const jar = counting([
      pairing("dev_b", {
        unproductive_wakes: UNPRODUCTIVE_WAKE_LIMIT - 1,
        deposit: { direction: "a2b", state: "one", index: 4 },
        collect: { direction: "b2a", state: "two", index: 3 },
        deposit_standing: standing,
      }),
    ]);

    jar.count([]);

    const stopped = jar.row("dev_b");
    expect(stopped.deposit).toEqual({
      direction: "a2b",
      state: "one",
      index: 4,
    });
    expect(stopped.collect).toEqual({
      direction: "b2a",
      state: "two",
      index: 3,
    });
    // The store still holds the full outstanding delta at the address this
    // etag reaches, so a peer waking on day 900 collects it and resumes one
    // batch behind with nothing lost.
    expect(stopped.deposit_standing).toEqual(standing);
  });
});

// ---------------------------------------------------------------------------
// The stop, against the real route
// ---------------------------------------------------------------------------

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

/** A nothing-in-it ledger: this half is about which keys are touched. */
const EMPTY_LEDGER: WakeLedger = {
  oldestAbove: async () => [],
  write: async () => 0,
};

/** One row of the jar, with real chain states, and both of its addresses. */
async function laneRow(
  device_id: string,
  fill: number,
  over: Record<string, unknown> = {}
): Promise<{ row: Record<string, unknown>; deposit: string; collect: string }> {
  const chains: PairedChains = await derivePairingChains(
    new Uint8Array(32).fill(fill),
    "showed"
  );
  return {
    row: {
      device_id,
      name: null,
      deposit: {
        direction: chains.deposit.direction,
        state: b64(chains.deposit.state),
        index: 0,
      },
      collect: {
        direction: chains.collect.direction,
        state: b64(chains.collect.state),
        index: 0,
      },
      peer_vector: {},
      deposit_standing: null,
      peer_roster: null,
      unproductive_wakes: 0,
      last_met: null,
      ...over,
    },
    deposit: base64url(await deriveLaneKey(chains.deposit, "addr")),
    collect: base64url(await deriveLaneKey(chains.collect, "addr")),
  };
}

/** The errand, re-imported so its record reader reads the jar seeded here. */
async function withJar(rows: Record<string, unknown>[]) {
  stubLocalStorage({
    seed: { inventoria_paired_devices: JSON.stringify(rows) },
  });
  vi.resetModules();
  const bucket = fakeBucket();
  const store: Store = storeOverFetch(routeOver(bucket.bucket), ORIGIN);
  const reached: string[] = [];
  const watched: Store = {
    collect: (address) => (reached.push(address), store.collect(address)),
    deposit: (address, sealed, ifMatch) => (
      reached.push(address),
      store.deposit(address, sealed, ifMatch)
    ),
    discard: (address) => (reached.push(address), store.discard(address)),
  };
  const errand = await import("../../src/lib/p2p/wake-errand");
  return { errand, store: watched, reached };
}

describe("a severed pairing is not counted at all", () => {
  it("burns no wake on a row the user has revoked", () => {
    // The mark stops both lanes immediately, so every wake after it would be
    // unproductive by construction: the row is here only until the withdrawal
    // lands, and a counter climbing on it would be measuring the act itself.
    const { count, row } = counting([pairing("dev_b", { revoked: true })]);

    count([]);

    expect(row("dev_b").unproductive_wakes).toBe(0);
  });

  it("still burns the wake for a live pairing beside it", () => {
    const { count, row } = counting([
      pairing("dev_b", { revoked: true }),
      pairing("dev_c"),
    ]);

    count([]);

    expect(row("dev_b").unproductive_wakes).toBe(0);
    expect(row("dev_c").unproductive_wakes).toBe(1);
  });
});

describe("a stopped pairing has neither of its keys touched", () => {
  it("serves the pairing beside it and not the one at K", async () => {
    const live = await laneRow("dev_b", 1);
    const out = await laneRow("dev_stopped", 2, {
      unproductive_wakes: UNPRODUCTIVE_WAKE_LIMIT,
    });
    const { errand, store, reached } = await withJar([live.row, out.row]);

    await errand.convergeWithPeers(store, EMPTY_LEDGER);

    expect(reached).toContain(live.collect);
    expect(reached).toContain(live.deposit);
    // The whole of §11's stop: a key that would otherwise be touched on every
    // wake, for ever, at an index that can never move.
    expect(reached).not.toContain(out.collect);
    expect(reached).not.toContain(out.deposit);
  });

  it("leaves it out of the deposit-only sync as well", async () => {
    const out = await laneRow("dev_stopped", 2, {
      unproductive_wakes: UNPRODUCTIVE_WAKE_LIMIT,
    });
    const { errand, store, reached } = await withJar([out.row]);

    await errand.depositToPeers(store, EMPTY_LEDGER);

    expect(reached).toEqual([]);
  });
});

describe("a take that imported rows and did not settle is not productive", () => {
  it("reports nothing produced, so the wake it sits in is burned", async () => {
    // A collection commits on its acknowledgement. This one takes rows — they
    // are in the ledger and a re-import is a no-op — and cannot deposit the
    // word for them, so the lane does not advance and the next wake repeats it
    // identically. Counting it as productive would let a pairing getting
    // nowhere never reach K.
    const peer = await laneRow("dev_a", 3);
    const mine = await laneRow("dev_b", 3, {
      // The far side of the same secret: what the peer deposits into is what
      // this device collects from.
      deposit: peer.row.collect,
      collect: peer.row.deposit,
    });
    const { errand, store } = await withJar([mine.row]);

    // The peer leaves one real object, with one real row in it.
    const imported: number[] = [];
    await depositToPeer(
      peer.row as unknown as PairedDevice,
      store,
      {
        oldestAbove: async (after) =>
          after === null
            ? [
                {
                  entity: "event:1",
                  attribute: "event/kind",
                  value: '"consume_food"',
                  time: 1,
                  hlc_ms: 1,
                  hlc_ctr: 0,
                  device_id: "dev_a",
                },
              ]
            : [],
        write: async () => 0,
      },
      { keep: () => {}, roster: [] }
    );

    const jammed: Store = {
      collect: store.collect,
      deposit: async () => {
        throw new StoreUnreachableError("the acknowledgement did not land.");
      },
      discard: store.discard,
    };
    const round = await errand.convergeWithPeers(jammed, {
      oldestAbove: async () => [],
      write: async (rows) => (imported.push(rows.length), rows.length),
    });

    expect(imported.reduce((all, some) => all + some, 0)).toBe(1);
    expect(round.productive).toEqual([]);
    expect(round.owed).toBe(true);
  });
});
