/**
 * The Paired Device record: `localStorage`, never a datom (ADR-0096 §9).
 *
 * The two claims worth holding a suite for are both negative. **Nothing in the
 * record can regenerate the pairing, only advance it** — so what is written is
 * compared against the pairing secret it descends from, rather than merely
 * described. And it is **never a datom and never in an ADR-0064 export** — so
 * the write path is run beside a real ledger and the ledger is asked whether
 * anything landed in it.
 *
 * `PairedDevicesSection.svelte` covers what the section draws; this covers what
 * is kept.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import {
  freshModuleWithStorage,
  stubLocalStorage,
  stubNoLocalStorage,
  type FakeLocalStorage,
} from "./support/local-storage";
import {
  countDatoms,
  createLedgerSchema,
  readLedgerPage,
  type LedgerDb,
} from "../../src/lib/db/db.core";
import {
  derivePairingChains,
  deriveLaneKey,
  type PairedChains,
} from "../../src/lib/p2p/pairing-chain";
import type { VersionVector } from "../../src/lib/db/version-vector";
import { WHOLE_JAR } from "../../src/lib/p2p/lane-scope";
import { TRACKED_DOMAINS } from "../../src/lib/facets/registry";

type Records = typeof import("../../src/lib/stores/paired-devices");

const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const A_VECTOR: VersionVector = {
  dev_b: { food: { hlc_ms: 12, hlc_ctr: 3 } },
};

/** A pairing act's chains, from a secret a test can still hold afterwards. */
async function chainsFrom(fill: number): Promise<PairedChains> {
  return derivePairingChains(new Uint8Array(32).fill(fill), "showed");
}

let records: Records;
let jar: FakeLocalStorage;

beforeEach(async () => {
  [records, jar] = await freshModuleWithStorage(
    () => import("../../src/lib/stores/paired-devices")
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("a row appears only when a first sync completes", () => {
  it("holds nothing before one does", () => {
    expect(records.readPairedDevices()).toEqual([]);
  });

  it("keeps the peer, both lanes and what the peer said it holds", async () => {
    const chains = await chainsFrom(7);
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains,
      peer_vector: A_VECTOR,
      scope: WHOLE_JAR,
    });

    const [kept] = records.readPairedDevices();
    expect(kept).toMatchObject({
      device_id: "dev_b",
      name: null,
      deposit: { direction: "a2b", index: 0 },
      collect: { direction: "b2a", index: 0 },
      peer_vector: A_VECTOR,
    });
  });

  it("stores the lane state a later deposit derives its address and key from", async () => {
    const chains = await chainsFrom(7);
    const address = await deriveLaneKey(chains.deposit, "addr");
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains,
      peer_vector: A_VECTOR,
      scope: WHOLE_JAR,
    });

    const [kept] = records.readPairedDevices();
    const back = records.laneChainOf(kept.deposit);
    expect(hex(await deriveLaneKey(back, "addr"))).toBe(hex(address));
  });
});

describe("nothing in the record can regenerate the pairing", () => {
  // ADR-0075 §3 kept the 256-bit pairing secret, which regenerates both state₀s
  // and with them every address and every seal key from pairing onward. §9
  // replaces that with a rule, and this is the rule as an assertion.
  it("holds no byte of the pairing secret it descends from", async () => {
    const secret = new Uint8Array(32).fill(7);
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await derivePairingChains(secret.slice(), "showed"),
      peer_vector: A_VECTOR,
      scope: WHOLE_JAR,
    });

    const written = jar.store.get("inventoria_paired_devices") ?? "";
    expect(written).not.toContain(btoa(String.fromCharCode(...secret)));
    // A stolen record is one ratchet step past the secret, so it cannot be run
    // backwards to state₋₁.
    const [kept] = records.readPairedDevices();
    expect(kept.deposit.state).not.toBe(btoa(String.fromCharCode(...secret)));
  });

  it("holds neither lane's address nor its seal key, only the state they come off", async () => {
    const chains = await chainsFrom(9);
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains,
      peer_vector: A_VECTOR,
      scope: WHOLE_JAR,
    });

    const written = jar.store.get("inventoria_paired_devices") ?? "";
    for (const purpose of ["addr", "seal"] as const) {
      for (const lane of [chains.deposit, chains.collect]) {
        const derived = await deriveLaneKey(lane, purpose);
        expect(written).not.toContain(btoa(String.fromCharCode(...derived)));
      }
    }
  });
});

describe("pairing is keyed by device, and pairing again replaces", () => {
  it("replaces the row for the same device rather than adding one", async () => {
    const first = await chainsFrom(1);
    const second = await chainsFrom(2);
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: first,
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: second,
      peer_vector: A_VECTOR,
      scope: WHOLE_JAR,
    });

    const held = records.readPairedDevices();
    expect(held).toHaveLength(1);
    expect(held[0].peer_vector).toEqual(A_VECTOR);
    expect(held[0].deposit.state).toBe(
      btoa(String.fromCharCode(...second.deposit.state))
    );
  });

  it("keeps a name the user typed, so re-pairing does not ask for it again", async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    records.namePairedDevice("dev_b", "The laptop");
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(2),
      peer_vector: {},
      scope: WHOLE_JAR,
    });

    expect(records.readPairedDevices()[0].name).toBe("The laptop");
  });

  it("re-scopes the lane, because the act that just ran decides what it carries", async () => {
    // ADR-0105 §4: one pairing per device pair, and pairing again replaces it
    // **and re-scopes it**. A user who paired from the root and later pairs the
    // same phone from Rations has narrowed the lane, and the record is where
    // that lands.
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(2),
      peer_vector: {},
      scope: ["food"],
    });

    expect(records.readPairedDevices()[0].scope).toEqual(["food"]);
  });

  it("keeps a second device beside the first", async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    records.rememberPairedDevice({
      device_id: "dev_c",
      chains: await chainsFrom(2),
      peer_vector: {},
      scope: WHOLE_JAR,
    });

    expect(records.readPairedDevices().map((d) => d.device_id)).toEqual([
      "dev_b",
      "dev_c",
    ]);
  });

  it("severs one pairing here, unilaterally, taking nothing else with it", async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    records.rememberPairedDevice({
      device_id: "dev_c",
      chains: await chainsFrom(2),
      peer_vector: {},
      scope: WHOLE_JAR,
    });

    records.forgetPairedDevice("dev_b");

    expect(records.readPairedDevices().map((d) => d.device_id)).toEqual([
      "dev_c",
    ]);
  });
});

describe("a wake moves the record it was handed", () => {
  beforeEach(async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
  });

  it("leaves the first deposit of a pairing's life with nothing to match on", () => {
    expect(records.readPairedDevices()[0].deposit_standing).toBeNull();
  });

  it("steps a lane's ratchet and drops the state it stepped from", async () => {
    const [before] = records.readPairedDevices();
    const stepped = await records.advancedLane(before.deposit);

    expect(stepped.index).toBe(before.deposit.index + 1);
    expect(stepped.direction).toBe(before.deposit.direction);
    expect(stepped.state).not.toBe(before.deposit.state);
    // The address and the key both come off the state, so a lane that moved
    // reaches a different object under a different key (ADR-0096 §4).
    expect(
      hex(await deriveLaneKey(records.laneChainOf(stepped), "addr"))
    ).not.toBe(
      hex(await deriveLaneKey(records.laneChainOf(before.deposit), "addr"))
    );
  });

  it("writes back a pairing that moved, keeping the others where they are", async () => {
    records.rememberPairedDevice({
      device_id: "dev_c",
      chains: await chainsFrom(2),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    const [held] = records.readPairedDevices();

    records.updatePairedDevice({
      ...held,
      deposit_standing: { etag: "etag-1", brings: A_VECTOR },
    });

    const [moved, untouched] = records.readPairedDevices();
    expect(moved.deposit_standing).toEqual({
      etag: "etag-1",
      brings: A_VECTOR,
    });
    expect(untouched.device_id).toBe("dev_c");
    expect(untouched.deposit_standing).toBeNull();
  });

  it("does not bring back a pairing severed while a wake was in flight", () => {
    const [held] = records.readPairedDevices();
    records.forgetPairedDevice("dev_b");

    records.updatePairedDevice({
      ...held,
      deposit_standing: { etag: "etag-1", brings: A_VECTOR },
    });

    expect(records.readPairedDevices()).toEqual([]);
  });

  it("reads a record written before there was anything to deposit", async () => {
    const [sound] = records.readPairedDevices();
    const { deposit_standing: _gone, ...older } = sound;
    stubLocalStorage({
      seed: { inventoria_paired_devices: JSON.stringify([older]) },
    });

    // The absence is a healthy record rather than a broken one: index zero,
    // nothing written at it. It reads as the `null` this version writes.
    expect(records.readPairedDevices()[0].deposit_standing).toBeNull();
  });

  it("drops a row whose standing is not one", async () => {
    const [sound] = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([
          { ...sound, deposit_standing: { brings: {} } },
        ]),
      },
    });

    expect(records.readPairedDevices()).toEqual([]);
  });
});

describe("the record holds the peer's last-stated roster (ADR-0096 §6)", () => {
  beforeEach(async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
  });

  it("holds none at all until a deposit states one", () => {
    // A first sync crosses no deposit, so a fresh pairing has heard nothing.
    // `null` is *nothing stated*, which is not the same news as a peer that
    // stated it is paired with nobody else.
    expect(records.readPairedDevices()[0].peer_roster).toBeNull();
  });

  it("supersedes rather than accumulating, because two rosters are never merged", () => {
    const [held] = records.readPairedDevices();
    records.updatePairedDevice({ ...held, peer_roster: ["dev_c", "dev_d"] });
    records.updatePairedDevice({ ...held, peer_roster: ["dev_e"] });

    expect(records.readPairedDevices()[0].peer_roster).toEqual(["dev_e"]);
  });

  it("keeps a peer's statement that it is paired with nobody else", () => {
    const [held] = records.readPairedDevices();
    records.updatePairedDevice({ ...held, peer_roster: [] });

    expect(records.readPairedDevices()[0].peer_roster).toEqual([]);
  });

  it("forgets the roster when the pairing is made again", async () => {
    const [held] = records.readPairedDevices();
    records.updatePairedDevice({ ...held, peer_roster: ["dev_c"] });

    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(3),
      peer_vector: {},
      scope: WHOLE_JAR,
    });

    // Unlike the name, which is this device's own and is kept: the roster is
    // the peer's statement, and the peer has not made one down this pairing.
    expect(records.readPairedDevices()[0].peer_roster).toBeNull();
  });

  it("reads a record written before a roster crossed", () => {
    const [sound] = records.readPairedDevices();
    const { peer_roster: _gone, ...older } = sound;
    stubLocalStorage({
      seed: { inventoria_paired_devices: JSON.stringify([older]) },
    });

    expect(records.readPairedDevices()[0].peer_roster).toBeNull();
  });

  it("drops a row whose roster is not a list of device ids", () => {
    const [sound] = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([
          { ...sound, peer_roster: ["dev_c", 7] },
        ]),
      },
    });

    expect(records.readPairedDevices()).toEqual([]);
  });
});

describe("the record carries K's counter and the last-met date (§11)", () => {
  beforeEach(async () => {
    records.rememberPairedDevice(
      {
        device_id: "dev_b",
        chains: await chainsFrom(7),
        peer_vector: {},
        scope: WHOLE_JAR,
      },
      new Date("2026-09-13T23:40:00")
    );
  });

  it("starts a fresh pairing with no wakes burned", () => {
    expect(records.readPairedDevices()[0].unproductive_wakes).toBe(0);
  });

  it("dates the pairing itself, because a first sync is a meeting", () => {
    // The loudest meeting there is — the two devices were in a room together —
    // and without it the one screen whose job is to say when they last met
    // would say nothing until the first productive wake.
    expect(records.readPairedDevices()[0].last_met).toBe("2026-09-13");
  });

  it("keeps the day and no hour of it, off the local calendar", () => {
    // Twenty to midnight is not tomorrow, which is `send-date.ts`'s reason for
    // reading the parts rather than going through `toISOString`.
    expect(records.readPairedDevices()[0].last_met).not.toContain("T");
  });

  it("starts the count over when a pairing is made again", async () => {
    const [held] = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([
          { ...held, unproductive_wakes: 200 },
        ]),
      },
    });

    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(9),
      peer_vector: {},
      scope: WHOLE_JAR,
    });

    // Pairing again is the reversal §11 leaves to the user, so the act that
    // makes a pairing cannot inherit the count that stopped the last one.
    expect(records.readPairedDevices()[0].unproductive_wakes).toBe(0);
  });

  it("reads a record written before either field existed", () => {
    const [sound] = records.readPairedDevices();
    const { unproductive_wakes: _wakes, last_met: _met, ...older } = sound;
    stubLocalStorage({
      seed: { inventoria_paired_devices: JSON.stringify([older]) },
    });

    // A pairing that has not been measured rather than one that has run out,
    // and a date never kept rather than a claim the devices never met.
    expect(records.readPairedDevices()[0]).toMatchObject({
      unproductive_wakes: 0,
      last_met: null,
    });
  });

  it("reads a record written before the lane had a scope as the whole Jar", () => {
    const [sound] = records.readPairedDevices();
    const { scope: _scope, ...older } = sound;
    stubLocalStorage({
      seed: { inventoria_paired_devices: JSON.stringify([older]) },
    });

    // ADR-0105 §1: a record written before this field predates the pairing
    // surface leaving the root, and the root's lane is the whole Jar. Reading
    // it as anything narrower would withhold rows from a healthy pairing.
    expect(records.readPairedDevices()[0].scope).toEqual(
      TRACKED_DOMAINS.map((d) => d.id)
    );
  });

  it("drops a row whose lane scope is not a list of domains", () => {
    const [sound] = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([
          { ...sound, scope: "food" },
        ]),
      },
    });

    expect(records.readPairedDevices()).toEqual([]);
  });

  it("drops a row whose count is not a whole number of wakes", () => {
    const [sound] = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([
          { ...sound, unproductive_wakes: -1 },
        ]),
      },
    });

    expect(records.readPairedDevices()).toEqual([]);
  });

  it("drops a row whose last-met date is not a day", () => {
    const [sound] = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([
          { ...sound, last_met: 1789291734233 },
        ]),
      },
    });

    expect(records.readPairedDevices()).toEqual([]);
  });

  it("reads a kept day back as the local day it was written on", () => {
    const back = records.readMet("2026-09-13");
    expect([back.getFullYear(), back.getMonth() + 1, back.getDate()]).toEqual([
      2026, 9, 13,
    ]);
  });
});

describe("a name is typed locally, about the peer, after the act", () => {
  beforeEach(async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
  });

  it("takes a name and gives it back", () => {
    records.namePairedDevice("dev_b", "  The laptop  ");
    expect(records.readPairedDevices()[0].name).toBe("The laptop");
  });

  it("reads a cleared name as unnamed rather than as an empty one", () => {
    records.namePairedDevice("dev_b", "The laptop");
    records.namePairedDevice("dev_b", "   ");
    expect(records.readPairedDevices()[0].name).toBeNull();
  });
});

describe("the record never reaches the ledger", () => {
  let db: LedgerDb;

  beforeEach(async () => {
    const sqlite3 = await (sqlite3InitModule as any)();
    db = new sqlite3.oo1.DB();
    createLedgerSchema(db);
  });

  // Structural rather than a rule anyone has to remember — an export is a walk
  // of `datoms` — but the claim is worth an assertion, because the cost of it
  // being false is a secret in an undeletable log that also syncs.
  it("writes no datom, so nothing of it can leave in an export", async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(7),
      peer_vector: A_VECTOR,
      scope: WHOLE_JAR,
    });

    expect(countDatoms(db)).toBe(0);
    expect(readLedgerPage(db, null, 1024 * 1024)).toEqual([]);
    expect([...jar.store.keys()]).toEqual(["inventoria_paired_devices"]);
  });
});

describe("the jar is a boundary like any other", () => {
  it("reads no pairings at all where there is no store", async () => {
    stubNoLocalStorage();
    const alone = await import("../../src/lib/stores/paired-devices");
    expect(alone.readPairedDevices()).toEqual([]);
  });

  it("reads a record that will not parse as no pairings", async () => {
    stubLocalStorage({ seed: { inventoria_paired_devices: "{not json" } });
    expect(records.readPairedDevices()).toEqual([]);
  });

  // The jar is checked to the standard the two things it holds will be used
  // at: a vector goes through the ledger's own reader, and a lane state has to
  // decode to a chain state. A looser test here would bind `undefined` into a
  // deposit's `WHERE`, or throw inside `atob` far from this boundary.
  it.each([
    ["a vector that is not one", { peer_vector: { dev_c: { hlc_ms: -1 } } }],
    [
      "a lane state that is not base64",
      { deposit: { direction: "a2b", state: "!!!!", index: 0 } },
    ],
    [
      "a lane state of the wrong width",
      { deposit: { direction: "a2b", state: "AAAA", index: 0 } },
    ],
    [
      "an index that is not a whole count",
      {
        collect: { direction: "b2a", state: btoa("\0".repeat(32)), index: -1 },
      },
    ],
  ])("drops a row carrying %s", async (_what, broken) => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    const [sound] = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([{ ...sound, ...broken }]),
      },
    });

    expect(records.readPairedDevices()).toEqual([]);
  });

  it("drops a row that is not a pairing and keeps the ones that are", async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    const kept = records.readPairedDevices();
    stubLocalStorage({
      seed: {
        inventoria_paired_devices: JSON.stringify([
          { device_id: "dev_c" },
          null,
          ...kept,
        ]),
      },
    });

    expect(records.readPairedDevices().map((d) => d.device_id)).toEqual([
      "dev_b",
    ]);
  });

  it("survives a jar that refuses the write, without pretending it landed", async () => {
    const [refusing] = await freshModuleWithStorage(
      () => import("../../src/lib/stores/paired-devices"),
      { refuses: "quota" }
    );
    const chains = await chainsFrom(1);
    expect(() =>
      refusing.rememberPairedDevice({
        device_id: "dev_b",
        chains,
        peer_vector: {},
        scope: WHOLE_JAR,
      })
    ).not.toThrow();
    // Both the read and the live list say nothing is paired, because nothing
    // is: a section claiming otherwise would be reporting a write that a
    // reload will not find.
    expect(refusing.readPairedDevices()).toEqual([]);
    expect(get(refusing.pairedDevices)).toEqual([]);
  });

  it("publishes the completed pairing to the live list", async () => {
    records.rememberPairedDevice({
      device_id: "dev_b",
      chains: await chainsFrom(1),
      peer_vector: {},
      scope: WHOLE_JAR,
    });
    expect(get(records.pairedDevices).map((d) => d.device_id)).toEqual([
      "dev_b",
    ]);
  });
});
