/**
 * The roster a wake states, across the whole list of pairings (ADR-0096 §6).
 *
 * `wake.ts` holds one pairing and cannot see the list, so the claim that the
 * roster is **complete** — every pairing named, whatever state its lanes are
 * in — is only reachable here, where `readPairedDevices()` is what a deposit is
 * built from.
 *
 * The store is the real route over a bucket that honours `etagMatches`; the
 * ledger is a stub, because nothing in here is about rows crossing.
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
import { openDeposit } from "../../src/lib/p2p/sealed-deposit";
import { storeOverFetch, type Store } from "../../src/lib/p2p/deposit-store";
import type { WakeLedger } from "../../src/lib/p2p/wake";

const ORIGIN = "https://app.example";

afterEach(() => vi.unstubAllGlobals());

/** A ledger with nothing in it: this suite is about the envelope, not the rows. */
const EMPTY_LEDGER: WakeLedger = {
  oldestAbove: async () => [],
  write: async () => 0,
};

/**
 * One row of the jar, with real chain states, because the record's own guard
 * decodes them before a deposit ever reaches a lane.
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
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  return {
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
    ...over,
  };
}

/**
 * The errand, re-imported so its record reader reads the jar seeded here.
 *
 * The jar is snapshotted into a module-level store at import, so stubbing it
 * and reloading the module are two halves of one step.
 */
async function withJar(rows: Record<string, unknown>[]) {
  stubLocalStorage({
    seed: { inventoria_paired_devices: JSON.stringify(rows) },
  });
  vi.resetModules();
  const bucket = fakeBucket();
  const store: Store = storeOverFetch(routeOver(bucket.bucket), ORIGIN);
  const errand = await import("../../src/lib/p2p/wake-errand");
  return { errand, store, held: bucket.held };
}

/** What one device's lane is carrying, read from behind the route. */
async function envelopeOn(
  held: Map<string, { bytes: Uint8Array }>,
  row: Record<string, unknown>
): Promise<{ acknowledges: number | null; roster: string[] }> {
  const deposit = row.deposit as { direction: "a2b" | "b2a"; state: string };
  const lane = {
    direction: deposit.direction,
    state: Uint8Array.from(atob(deposit.state), (c) => c.charCodeAt(0)),
  };
  const address = base64url(await deriveLaneKey(lane, "addr"));
  const chunks = await openDeposit(
    { key: await deriveLaneKey(lane, "seal") },
    0,
    held.get(address)!.bytes
  );
  return JSON.parse(new TextDecoder().decode(chunks[0]));
}

describe("every deposit of a round states the whole list", () => {
  it("tells each peer about the others, and never about itself", async () => {
    const rows = [
      await pairing("dev_b", 1),
      await pairing("dev_c", 2),
      await pairing("dev_d", 3),
    ];
    const { errand, store, held } = await withJar(rows);

    await errand.depositToPeers(store, EMPTY_LEDGER);

    expect((await envelopeOn(held, rows[0])).roster).toEqual([
      "dev_c",
      "dev_d",
    ]);
    expect((await envelopeOn(held, rows[1])).roster).toEqual([
      "dev_b",
      "dev_d",
    ]);
    expect((await envelopeOn(held, rows[2])).roster).toEqual([
      "dev_b",
      "dev_c",
    ]);
  });

  it("names a pairing that has stopped at the counter rather than omitting it", async () => {
    // A pairing whose peer has stopped collecting: its deposit lane is frozen
    // at an index nobody acknowledges, with an object outstanding. It is still
    // a pairing, and it is exactly the one the other end wants named — §10's
    // hunt list for mail stranded at a lane nobody reads.
    const rows = [
      await pairing("dev_b", 1),
      await pairing("dev_stopped", 2, {
        deposit_standing: { etag: "outstanding", brings: {} },
      }),
    ];
    const { errand, store, held } = await withJar(rows);

    await errand.depositToPeers(store, EMPTY_LEDGER);

    expect((await envelopeOn(held, rows[0])).roster).toEqual(["dev_stopped"]);
  });

  it("says nobody else where there is one pairing, which is not silence", async () => {
    const rows = [await pairing("dev_b", 1)];
    const { errand, store, held } = await withJar(rows);

    await errand.depositToPeers(store, EMPTY_LEDGER);

    expect(await envelopeOn(held, rows[0])).toEqual({
      acknowledges: null,
      roster: [],
    });
  });

  it("says the same sentence on a full round as on a deposit-only one", async () => {
    const rows = [await pairing("dev_b", 1), await pairing("dev_c", 2)];
    const { errand, store, held } = await withJar(rows);

    await errand.convergeWithPeers(store, EMPTY_LEDGER);

    expect((await envelopeOn(held, rows[0])).roster).toEqual(["dev_c"]);
    expect((await envelopeOn(held, rows[1])).roster).toEqual(["dev_b"]);
  });
});
