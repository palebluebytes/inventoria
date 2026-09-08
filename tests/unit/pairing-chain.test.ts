/**
 * The two lanes of one pairing, and the secret that does not survive minting
 * them (ADR-0096 §4).
 *
 * §4 states a **property** and then one **named conforming construction**,
 * because the property alone was read literally by two tickets and rotted once:
 *
 * > An operator holding every address a pairing ever used learns nothing about
 * > any key that sealed anything.
 *
 * A test cannot prove that property — it is a statement about what cannot be
 * computed. What it can do is hold the construction to the record word for
 * word, which is why the info strings below are written out rather than reached
 * through the module under test, and assert the two things that would break the
 * property if they were ever wrong: that the four derivations off one state are
 * four different keys, and that the seed is gone afterwards.
 */
import { describe, it, expect } from "vitest";
import {
  CHAIN_STATE_BYTES,
  derivePairingChains,
  deriveLaneKey,
  ratchetLane,
  type LaneChain,
} from "../../src/lib/p2p/pairing-chain";

const PAIRING_SECRET_BYTES = 32;

const aSecret = () =>
  new Uint8Array(PAIRING_SECRET_BYTES).map((_, i) => (i * 37 + 11) % 256);

const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The construction ADR-0096 §4 names, computed here rather than imported. */
async function hkdf(ikm: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    ikm as BufferSource,
    "HKDF",
    false,
    ["deriveBits"]
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: new TextEncoder().encode(info),
      },
      key,
      CHAIN_STATE_BYTES * 8
    )
  );
}

const lane = (state: Uint8Array, direction: "a2b" | "b2a"): LaneChain => ({
  state,
  direction,
});

describe("both devices derive the same two lanes, mirrored", () => {
  it("gives each device its peer's collect lane as its own deposit lane", async () => {
    const secret = aSecret();
    const shown = await derivePairingChains(secret.slice(), "showed");
    const read = await derivePairingChains(secret.slice(), "read");

    expect(hex(shown.deposit.state)).toBe(hex(read.collect.state));
    expect(hex(shown.collect.state)).toBe(hex(read.deposit.state));
  });

  it("runs the code-minter's own lane from A to B", async () => {
    const chains = await derivePairingChains(aSecret(), "showed");
    expect(chains.deposit.direction).toBe("a2b");
    expect(chains.collect.direction).toBe("b2a");
  });

  it("keeps the two lanes of one pairing apart, which is what the direction label is for", async () => {
    // Without it both lanes derive from the same state, and §3's one-key-per-
    // wake invariant depends on a wake touching exactly one key.
    const chains = await derivePairingChains(aSecret(), "showed");
    expect(hex(chains.deposit.state)).not.toBe(hex(chains.collect.state));
  });

  it("seeds each lane by one ratchet step off the secret, under its own label", async () => {
    const secret = aSecret();
    const chains = await derivePairingChains(secret.slice(), "showed");

    expect(hex(chains.deposit.state)).toBe(
      hex(await hkdf(secret, "inventoria/v1/ratchet/a2b"))
    );
    expect(hex(chains.collect.state)).toBe(
      hex(await hkdf(secret, "inventoria/v1/ratchet/b2a"))
    );
  });
});

describe("the pairing secret does not survive its own pairing", () => {
  it("leaves nothing of the secret behind", async () => {
    const secret = aSecret();
    await derivePairingChains(secret, "showed");
    expect([...secret]).toEqual(new Array(PAIRING_SECRET_BYTES).fill(0));
  });

  it("destroys the one value that could regenerate both chains", async () => {
    // What makes the zeroing worth anything is *what* was zeroed: a device
    // that still held these bytes could regenerate state₀ and ratchet forward,
    // and forward secrecy would be worth exactly nothing (§4).
    const secret = aSecret();
    const chains = await derivePairingChains(secret.slice(), "showed");
    const again = await derivePairingChains(secret.slice(), "showed");
    expect(hex(again.deposit.state)).toBe(hex(chains.deposit.state));

    await derivePairingChains(secret, "showed");
    const fromWhatIsLeft = await derivePairingChains(secret, "showed");
    expect(hex(fromWhatIsLeft.deposit.state)).not.toBe(
      hex(chains.deposit.state)
    );
  });
});

describe("the address and the seal key come off one chain", () => {
  it("derives each under the label the record names", async () => {
    const state = aSecret();
    expect(hex(await deriveLaneKey(lane(state, "a2b"), "addr"))).toBe(
      hex(await hkdf(state, "inventoria/v1/addr/a2b"))
    );
    expect(hex(await deriveLaneKey(lane(state, "b2a"), "seal"))).toBe(
      hex(await hkdf(state, "inventoria/v1/seal/b2a"))
    );
  });

  it("gives one lane's seal key no relation to any address, its own or the other lane's", async () => {
    // The property is that an operator holding addresses learns nothing about
    // keys, which no test can prove. What is asserted is its precondition: the
    // four derivations off one state are four different values, so no address
    // an operator sees *is* a key, on either lane.
    const state = aSecret();
    const four = await Promise.all([
      deriveLaneKey(lane(state, "a2b"), "addr"),
      deriveLaneKey(lane(state, "a2b"), "seal"),
      deriveLaneKey(lane(state, "b2a"), "addr"),
      deriveLaneKey(lane(state, "b2a"), "seal"),
    ]);
    expect(new Set(four.map(hex)).size).toBe(4);
  });

  it("gets nowhere running the construction forward from an address it holds", async () => {
    // The operator's only material is addresses. The obvious attempt is to feed
    // one back in as state and carry on deriving — so it is written out and
    // checked: neither lane's real seal key comes back, on either label.
    const state = aSecret();
    const seen = await deriveLaneKey(lane(state, "a2b"), "addr");
    const real = await Promise.all([
      deriveLaneKey(lane(state, "a2b"), "seal"),
      deriveLaneKey(lane(state, "b2a"), "seal"),
    ]);
    const attempts = await Promise.all([
      deriveLaneKey(lane(seen, "a2b"), "seal"),
      deriveLaneKey(lane(seen, "b2a"), "seal"),
      deriveLaneKey(lane(seen, "a2b"), "addr"),
      deriveLaneKey(lane(seen, "b2a"), "addr"),
      ratchetLane(lane(seen, "a2b")).then((next) => next.state),
      ratchetLane(lane(seen, "b2a")).then((next) => next.state),
    ]);
    for (const got of attempts) {
      expect(real.map(hex)).not.toContain(hex(got));
    }
  });

  it("binds the direction into both, so one lane's labels are not the other's", async () => {
    const state = aSecret();
    for (const purpose of ["addr", "seal"] as const) {
      expect(hex(await deriveLaneKey(lane(state, "a2b"), purpose))).not.toBe(
        hex(await deriveLaneKey(lane(state, "b2a"), purpose))
      );
    }
  });
});

describe("the chain steps forward, and only forward", () => {
  it("moves to a state that is not the one it came from", async () => {
    const chain = lane(aSecret(), "a2b");
    const next = await ratchetLane(chain);
    expect(hex(next.state)).not.toBe(hex(chain.state));
    expect(next.direction).toBe("a2b");
  });

  it("steps each lane under its own label", async () => {
    const state = aSecret();
    expect(hex((await ratchetLane(lane(state, "a2b"))).state)).not.toBe(
      hex((await ratchetLane(lane(state, "b2a"))).state)
    );
  });

  it("leaves the state it stepped from alone, because dropping it is a matter of what is stored", async () => {
    const chain = lane(aSecret(), "a2b");
    const before = hex(chain.state);
    await ratchetLane(chain);
    expect(hex(chain.state)).toBe(before);
  });
});
