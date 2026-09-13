/**
 * The first sync, against two real ledgers and the real Relay (ADR-0075 §6–§8,
 * §11; ADR-0096 §2 and §8).
 *
 * Two clients sit on either side of the same `Relay` object that ships to the
 * edge, each holding its own sqlite-wasm database, so what is exercised is
 * convergence rather than an agreement between two fakes. The claims this
 * ticket turns on are all checkable from here: that everything above the peer's
 * vector crosses and nothing else does, that the closing exchange is what
 * leaves each side with a current view of the other, and that an attempt which
 * does not finish leaves nothing behind but rows a later attempt will skip.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { localRelay } from "./support/local-relay";

// `jar-wipe.ts` reaches the worker RPC only to build its default seams, and the
// one case below injects its own.
vi.mock("../../src/lib/db/db.client", () => ({ dbClient: {} }));
import {
  createLedgerSchema,
  importLedgerRows,
  readLedgerPage,
  readLedgerVersionVector,
  resetLedgerSchema,
  type LedgerDb,
  type LedgerRow,
} from "../../src/lib/db/db.core";
import { runJarWipe } from "../../src/lib/jar-wipe";
import { createHlc, type Hlc, type HlcMark } from "../../src/lib/db/hlc";
import { derivePairingChains } from "../../src/lib/p2p/pairing-chain";
import {
  runFirstSync,
  type FirstSyncLedger,
  type FirstSyncProgress,
} from "../../src/lib/p2p/first-sync";
import { PairingRefusedError } from "../../src/lib/p2p/pairing-act";
import { enterRoom, RoomFailedError } from "../../src/lib/p2p/relay-room";
import { mintRoomCode, type RoomCode } from "../../src/lib/p2p/room-code";
import { SealRefusedError } from "../../src/lib/p2p/sealed-frame";

// ---------------------------------------------------------------------------
// Two devices, each with a real ledger
// ---------------------------------------------------------------------------

interface Device {
  db: LedgerDb;
  clock: Hlc;
  ledger: FirstSyncLedger;
  /** Every stamp a chunk advanced this device's clock to, in order. */
  advanced: HlcMark[];
  /** Every progress report this side made. */
  progress: FirstSyncProgress[];
}

let sqlite3: any;

beforeEach(async () => {
  sqlite3 = await (sqlite3InitModule as any)();
});

function device(device_id: string): Device {
  const db: LedgerDb = new sqlite3.oo1.DB();
  createLedgerSchema(db);
  const clock = createHlc(device_id, { wallClock: () => 1_000 });
  const advanced: HlcMark[] = [];
  return {
    db,
    clock,
    advanced,
    progress: [],
    ledger: {
      device_id,
      vector: async () => readLedgerVersionVector(db),
      page: async (after, budgetBytes, above) =>
        readLedgerPage(db, after, budgetBytes, { above }),
      write: async (rows) => {
        // What `db.worker.ts` does on every `ledger_import` batch, and what
        // ADR-0075 §8 reuses unchanged: a stamp issued elsewhere moves this
        // device's clock, per chunk, against that chunk's greatest stamp.
        const outcome = importLedgerRows(db, rows);
        if (outcome.highWater) {
          clock.update(outcome.highWater);
          advanced.push(outcome.highWater);
        }
        return outcome.rowsAdded;
      },
    },
  };
}

/** One row, stamped by hand: these tests are about stamps, not about writes. */
const row = (over: Partial<LedgerRow> = {}): LedgerRow => ({
  entity: "habit:1",
  attribute: "habit/name",
  value: '"Meditate"',
  time: 1_000,
  hlc_ms: 1_000,
  hlc_ctr: 0,
  device_id: "device_a",
  ...over,
});

const hold = (held: Device, rows: LedgerRow[]) =>
  importLedgerRows(held.db, rows);

const rowsOf = (held: Device) =>
  readLedgerPage(held.db, null, 1024 * 1024).map(
    (r) => `${r.entity}|${r.attribute}|${r.hlc_ms}.${r.hlc_ctr}|${r.device_id}`
  );

/**
 * One whole act in one room, both sides at once, starting from a pairing
 * secret the way `pairing-act.ts` leaves it.
 */
async function converge(
  a: Device,
  b: Device,
  options: {
    code?: RoomCode;
    dial?: ReturnType<typeof localRelay>["dial"];
    chunkBudgetBytes?: number;
  } = {}
) {
  const relay = options.dial ? null : localRelay();
  const dial = options.dial ?? relay!.dial;
  const code = options.code ?? mintRoomCode();
  const secret = new Uint8Array(32).fill(7);

  // Both sides derive off the same secret, mirrored, exactly as the pairing act
  // hands them over. The secret is consumed, so each side gets its own copy.
  const shown = await derivePairingChains(secret.slice(), "showed");
  const read = await derivePairingChains(secret.slice(), "read");

  const roomA = await enterRoom(code.room, { dial });
  const roomB = await enterRoom(code.room, { dial });
  try {
    const both = await Promise.all([
      runFirstSync(roomA, code, shown, a.ledger, {
        chunkBudgetBytes: options.chunkBudgetBytes,
        onProgress: (p) => a.progress.push(p),
      }),
      runFirstSync(roomB, code, read, b.ledger, {
        chunkBudgetBytes: options.chunkBudgetBytes,
        onProgress: (p) => b.progress.push(p),
      }),
    ]);
    return { a: both[0], b: both[1], relay, code };
  } finally {
    roomA.leave();
    roomB.leave();
  }
}

// ---------------------------------------------------------------------------

describe("two devices converge, and what crosses is what the peer lacks", () => {
  it("leaves a device that held nothing holding the other's whole ledger", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [
      row({ attribute: "a/1" }),
      row({ attribute: "a/2", hlc_ms: 2_000 }),
    ]);

    await converge(a, b);

    expect(rowsOf(b)).toEqual(rowsOf(a));
    expect(rowsOf(b)).toHaveLength(2);
  });

  it("carries rows both ways in one session", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [row({ entity: "habit:1", attribute: "a/1" })]);
    hold(b, [row({ entity: "habit:2", attribute: "b/1", device_id: "dev_b" })]);

    const ended = await converge(a, b);

    expect(rowsOf(a)).toEqual(rowsOf(b));
    expect(rowsOf(a)).toHaveLength(2);
    expect(ended.a).toMatchObject({ rows_sent: 1, rows_received: 1 });
    expect(ended.b).toMatchObject({ rows_sent: 1, rows_received: 1 });
  });

  // ADR-0096 §12: the jar-wide wipe unpairs, and re-pairing afterwards honestly
  // means *pull it all back from the laptop*. It is demonstrated rather than
  // asserted because it is the honest outcome rather than a bug — and it is
  // demonstrated **here**, in the suite that owns first syncs, because the
  // whole claim is that it is a normal one with no special path.
  it("pulls the whole ledger back after a jar-wide wipe, as a normal first sync", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [
      row({ attribute: "a/1" }),
      row({ attribute: "a/2", hlc_ms: 2_000 }),
    ]);

    await converge(a, b);
    expect(rowsOf(b)).toHaveLength(2);

    // The wipe on A, through the real run: the pairings are severed (there are
    // none in this Node jar, which is the honest zero) and the ledger goes.
    const wiped = await runJarWipe({
      clearLedger: async () => resetLedgerSchema(a.db),
      reclaimSpace: async () => {},
      withdrawLanes: async () => {},
    });
    expect(wiped.kind).toBe("wiped");
    expect(rowsOf(a)).toEqual([]);

    // Pairing again is a first sync, and a first sync is the empty-vector case.
    const again = await converge(a, b);

    expect(rowsOf(a)).toEqual(rowsOf(b));
    expect(rowsOf(a)).toHaveLength(2);
    expect(again.a).toMatchObject({ rows_sent: 0, rows_received: 2 });
  });

  it("is the empty case when neither device holds anything", async () => {
    const a = device("device_a");
    const b = device("dev_b");

    const ended = await converge(a, b);

    expect(ended.a).toMatchObject({ rows_sent: 0, rows_received: 0 });
    expect(ended.b).toMatchObject({ rows_sent: 0, rows_received: 0 });
    expect(ended.a.device_id).toBe("dev_b");
    expect(ended.b.device_id).toBe("device_a");
  });

  it("sends nothing twice: a row both already hold does not cross", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    const shared = row({ attribute: "a/1" });
    hold(a, [shared, row({ attribute: "a/2", hlc_ms: 2_000 })]);
    hold(b, [shared]);

    const ended = await converge(a, b);

    // One row above B's vector, and nothing above A's.
    expect(ended.a).toMatchObject({ rows_sent: 1, rows_received: 0 });
    expect(ended.b).toMatchObject({ rows_sent: 0, rows_received: 1 });
  });

  // The refutation a scalar watermark cannot survive, as a converging session
  // rather than as an argument.
  it("carries a row stamped below the peer's maximum from a device it lacks", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [row({ attribute: "c/1", hlc_ms: 40, device_id: "dev_c" })]);
    hold(b, [row({ attribute: "b/1", hlc_ms: 9_000, device_id: "dev_b" })]);

    await converge(a, b);

    expect(rowsOf(b)).toContain("habit:1|c/1|40.0|dev_c");
  });

  it("keeps the stamp each row came with rather than restamping it", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [row({ attribute: "a/1", hlc_ms: 4_242, hlc_ctr: 9 })]);

    await converge(a, b);

    expect(readLedgerVersionVector(b.db)).toEqual({
      device_a: { hlc_ms: 4_242, hlc_ctr: 9 },
    });
  });
});

describe("the clock advances per chunk, against that chunk's greatest stamp", () => {
  it("advances the receiver to what the chunk carried", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [row({ attribute: "a/1", hlc_ms: 5_000, hlc_ctr: 3 })]);

    await converge(a, b);

    expect(b.advanced).toEqual([{ hlc_ms: 5_000, hlc_ctr: 3 }]);
    expect(b.clock.peek().hlc_ms).toBe(5_000);
  });

  it("advances once per chunk rather than once per sync", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [
      row({ attribute: "a/1", value: JSON.stringify("x".repeat(400)) }),
      row({
        attribute: "a/2",
        hlc_ms: 2_000,
        value: JSON.stringify("y".repeat(400)),
      }),
      row({
        attribute: "a/3",
        hlc_ms: 3_000,
        value: JSON.stringify("z".repeat(400)),
      }),
    ]);

    await converge(a, b, { chunkBudgetBytes: 420 });

    expect(b.advanced).toEqual([
      { hlc_ms: 1_000, hlc_ctr: 0 },
      { hlc_ms: 2_000, hlc_ctr: 0 },
      { hlc_ms: 3_000, hlc_ctr: 0 },
    ]);
    expect(rowsOf(b)).toHaveLength(3);
  });
});

describe("the closing exchange", () => {
  // Without it each side would finish holding the peer's *pre-sync* state, and
  // the first deposit would re-send everything this session just delivered.
  it("leaves each side holding what the peer holds now, not what it held before", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [row({ attribute: "a/1", hlc_ms: 7_000 })]);

    const ended = await converge(a, b);

    // B was empty when it opened. A's record must say B now holds A's row.
    expect(ended.a.peer_vector).toEqual({
      device_a: { hlc_ms: 7_000, hlc_ctr: 0 },
    });
    expect(ended.a.peer_vector).toEqual(readLedgerVersionVector(b.db));
    expect(ended.b.peer_vector).toEqual(readLedgerVersionVector(a.db));
  });

  it("makes the next exchange send nothing, which is what a resume costs", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [row({ attribute: "a/1" })]);

    await converge(a, b);
    const again = await converge(a, b);

    expect(again.a).toMatchObject({ rows_sent: 0, rows_received: 0 });
    expect(again.b).toMatchObject({ rows_sent: 0, rows_received: 0 });
  });
});

describe("what a completed sync reports", () => {
  // The counts have to survive the lopsided case, where one side sends three
  // chunks and the other sends one empty one. They do, and the barrier is why:
  // a peer cannot close until it holds this lane's final chunk.
  it("counts every row that left, however lopsided the two lanes were", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [
      row({ attribute: "a/1", value: JSON.stringify("x".repeat(400)) }),
      row({
        attribute: "a/2",
        hlc_ms: 2_000,
        value: JSON.stringify("y".repeat(400)),
      }),
      row({
        attribute: "a/3",
        hlc_ms: 3_000,
        value: JSON.stringify("z".repeat(400)),
      }),
    ]);

    // B holds nothing, so B's lane is one empty chunk and closes at once while
    // A is still on chunk 0 of three.
    const ended = await converge(a, b, { chunkBudgetBytes: 420 });

    expect(ended.a.rows_sent).toBe(3);
    expect(ended.b.rows_received).toBe(3);
  });
});

describe("progress is shown on both sides", () => {
  it("reports rows as they cross, on the sending and the receiving side", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [
      row({ attribute: "a/1", value: JSON.stringify("x".repeat(400)) }),
      row({
        attribute: "a/2",
        hlc_ms: 2_000,
        value: JSON.stringify("y".repeat(400)),
      }),
    ]);

    await converge(a, b, { chunkBudgetBytes: 420 });

    expect(a.progress.map((p) => p.rows_sent)).toEqual([1, 2]);
    expect(b.progress.map((p) => p.rows_received)).toEqual([1, 2]);
  });
});

describe("the seal binds each chunk to its place in the stream", () => {
  it("refuses a chunk replayed under a sequence already spent", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [row({ attribute: "a/1" })]);

    const relay = localRelay();
    // The operator replaying bytes it holds: every frame one side sends lands
    // twice. The second copy of chunk 0 arrives where chunk 1 was expected, and
    // the label it was sealed under is not the one the collector derives.
    const doubling: typeof relay.dial = async (roomId, handlers) => {
      const link = await relay.dial(roomId, handlers);
      return {
        ...link,
        send: (frame) => {
          link.send(frame);
          link.send(frame);
        },
      };
    };

    await expect(converge(a, b, { dial: doubling })).rejects.toThrow(
      SealRefusedError
    );
  });
});

describe("an attempt that does not finish", () => {
  it("leaves the rows it did import, so pairing again is a resume", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    hold(a, [
      row({ attribute: "a/1", value: JSON.stringify("x".repeat(400)) }),
      row({
        attribute: "a/2",
        hlc_ms: 2_000,
        value: JSON.stringify("y".repeat(400)),
      }),
      row({
        attribute: "a/3",
        hlc_ms: 3_000,
        value: JSON.stringify("z".repeat(400)),
      }),
    ]);

    // B gives up part way through, which is the tab being closed.
    const relay = localRelay();
    const code = mintRoomCode();
    const secret = new Uint8Array(32).fill(7);
    const shown = await derivePairingChains(secret.slice(), "showed");
    const read = await derivePairingChains(secret.slice(), "read");
    const pulled = new AbortController();

    const roomA = await enterRoom(code.room, { dial: relay.dial });
    const roomB = await enterRoom(code.room, {
      dial: relay.dial,
      signal: pulled.signal,
    });
    // A is left waiting, which is exactly what happens on the other device: a
    // party leaving ends no room, so A sits out the five minutes (#391). The
    // test does not wait them out, it leaves the room the way the screen does.
    const abandoned = runFirstSync(roomA, code, shown, a.ledger, {
      chunkBudgetBytes: 420,
    });
    abandoned.catch(() => {});
    const interrupted = runFirstSync(roomB, code, read, b.ledger, {
      chunkBudgetBytes: 420,
      onProgress: (p) => {
        if (p.rows_received === 1) pulled.abort();
      },
    });

    await expect(interrupted).rejects.toBeInstanceOf(RoomFailedError);
    roomA.leave();
    roomB.leave();
    // Rows already imported are real data, correctly stamped. Nothing is rolled
    // back, and the next vector exchange skips them.
    const kept = rowsOf(b).length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(3);

    const resumed = await converge(a, b);
    expect(rowsOf(b)).toHaveLength(3);
    expect(resumed.a.rows_sent).toBe(3 - kept);
  });

  // A failure reading the ledger is the act's ending, not a timeout: it escapes
  // in its own words rather than leaving the person watching the room's five
  // minutes run out. The retention this also fixes — `collect` waiting forever
  // on a room the caller has since left — is not observable from out here, so
  // this pins the half that is.
  it("ends in the ledger's own words when the ledger will not read", async () => {
    const a = device("device_a");
    const b = device("dev_b");
    const broken = {
      ...a.ledger,
      page: async () => {
        throw new Error("the ledger would not open");
      },
    };

    const relay = localRelay();
    const code = mintRoomCode();
    const secret = new Uint8Array(32).fill(7);
    const shown = await derivePairingChains(secret.slice(), "showed");
    const read = await derivePairingChains(secret.slice(), "read");

    const roomA = await enterRoom(code.room, { dial: relay.dial });
    const roomB = await enterRoom(code.room, { dial: relay.dial });
    const failing = runFirstSync(roomA, code, shown, broken);
    const waiting = runFirstSync(roomB, code, read, b.ledger);
    waiting.catch(() => {});

    await expect(failing).rejects.toThrow("the ledger would not open");
    roomA.leave();
    roomB.leave();
  });

  it("ends loudly when the peer sends something this version cannot read", async () => {
    const a = device("device_a");
    const b = device("dev_b");

    const relay = localRelay();
    // A peer whose opening frame is a shape this version does not understand,
    // under a seal that opens: the room is right and the protocol is not.
    const mangling: typeof relay.dial = async (roomId, handlers) => {
      const link = await relay.dial(roomId, handlers);
      let first = true;
      return {
        ...link,
        send: async (frame) => {
          if (!first) return link.send(frame);
          first = false;
          const { sealFrame } = await import("../../src/lib/p2p/sealed-frame");
          link.send(
            await sealFrame(code, new TextEncoder().encode("{}"), {
              label: "inventoria/v1/sync/a2b/open",
            })
          );
        },
      };
    };
    const code = mintRoomCode();

    await expect(
      converge(a, b, { code, dial: mangling })
    ).rejects.toBeInstanceOf(PairingRefusedError);
  });
});
