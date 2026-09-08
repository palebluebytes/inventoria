/**
 * The two lanes of one pairing, and the secret that does not survive minting
 * them (ADR-0096 §4).
 *
 * ADR-0075 §5 said the room id and the session key were both `KDF(secret,
 * epoch)` and then delegated the KDF to implementation. Read literally, the
 * address and the key have **identical inputs**, and the operator necessarily
 * sees the address — an implementer following those words hands the operator
 * the key. §4 replaces that with a property plus one named conforming
 * construction, and this module is that instance.
 *
 * > **Property.** An operator holding every address a pairing ever used learns
 * > nothing about any key that sealed anything.
 *
 * > **Construction.** `HKDF-SHA-256(ikm = stateᵢ, info = "inventoria/v1/" ‖
 * > purpose ‖ "/" ‖ direction)`, with `purpose ∈ {addr, seal}` and
 * > `direction ∈ {a2b, b2a}`; ratchet step `stateᵢ₊₁ = HKDF-SHA-256(ikm =
 * > stateᵢ, info = "inventoria/v1/ratchet/" ‖ direction)`.
 *
 * **The direction label is load-bearing rather than tidy.** Without it both
 * lanes of one pairing derive from the same state, and §3's one-key-per-wake
 * invariant depends on a wake touching exactly one key.
 *
 * **A ratchet with old state dropped, not an indexed KDF of the pairing
 * secret.** The indexed form is reconstructible from the secret forever, and a
 * device compromised in 2030 would open every object ever left, back to
 * pairing. Under the ratchet it opens the current index and nothing behind it.
 * The prize is the seal rather than the address, because under retention the
 * objects *are* the record.
 *
 * **Two of the Double Ratchet's three properties, and this says which one is
 * missing.** Resilience and forward secrecy hold. **Break-in recovery does
 * not**: that property comes from fresh DH entropy injected at each step and a
 * hash chain has none, and injecting it needs an exchange the two devices
 * cannot have during an absence. A device compromised at index *i* yields every
 * future index forever, and re-pairing is the only recovery (§18).
 */

/** The width of a chain state, an address and a seal key alike: SHA-256's. */
export const CHAIN_STATE_BYTES = 32;

/** The namespace every label in this construction sits under. */
export const CHAIN_INFO_PREFIX = "inventoria/v1/";

/**
 * One direction of one pairing (ADR-0096 §3). `a2b` runs from the device that
 * **showed** the Pairing code to the device that read it.
 *
 * Which device is A is decided by the act rather than by anything durable: the
 * code-minter is A, because it is the side that mints the pairing secret inside
 * the room (§8). There is no main device and no hub, and this label says
 * nothing about either.
 */
export type LaneDirection = "a2b" | "b2a";

/** What a lane's chain state is asked for. */
export type LanePurpose = "addr" | "seal";

/** One lane, and how far along its ratchet it has got. */
export interface LaneChain {
  readonly direction: LaneDirection;
  /** {@link CHAIN_STATE_BYTES} of state. Never an address and never a key. */
  readonly state: Uint8Array;
}

/** Which end of the pairing act this device was. */
export type PairingRole = "showed" | "read";

/**
 * Both lanes of one pairing, from one device's point of view.
 *
 * Named for what this device does with each rather than for their directions,
 * because every caller has one of those two jobs and none of them has both:
 * a wake collects what its peer left and deposits what its peer lacks (§3).
 */
export interface PairedChains {
  /** The lane this device deposits into. */
  readonly deposit: LaneChain;
  /** The lane this device collects from. */
  readonly collect: LaneChain;
}

const utf8 = new TextEncoder();

/**
 * The construction itself.
 *
 * The salt is empty, which is RFC 5869's default of a string of zeros: the
 * whole of the domain separation is in `info`, and a salt would be a second
 * place for it to be wrong.
 */
async function hkdf(ikm: Uint8Array, info: string): Promise<Uint8Array> {
  // WebCrypto's `BufferSource` will not take a `Uint8Array<ArrayBufferLike>`,
  // and this is the genuine external boundary CODING_STANDARDS §3.2 admits a
  // cast at — the same one `sealed-frame.ts` crosses.
  const material = await crypto.subtle.importKey(
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
        info: utf8.encode(info),
      },
      material,
      CHAIN_STATE_BYTES * 8
    )
  );
}

const stepInfo = (direction: LaneDirection) =>
  `${CHAIN_INFO_PREFIX}ratchet/${direction}`;

/** A lane's address or seal key at its current state. */
export function deriveLaneKey(
  lane: LaneChain,
  purpose: LanePurpose
): Promise<Uint8Array> {
  return hkdf(lane.state, `${CHAIN_INFO_PREFIX}${purpose}/${lane.direction}`);
}

/**
 * The lane at its next index.
 *
 * **The index advances on collections, never on the clock** (§4). An address
 * findable after an absence of *T* must live for *T*, but it does not follow
 * that it rotates every *T* — only that it may not rotate *during* one. So the
 * address is fixed by the absence itself and free to change the moment the two
 * devices are in contact again, which is the theoretical floor.
 *
 * It leaves the state it stepped from alone. Dropping the old state is what
 * forward secrecy needs, and that is a property of **what a device stores**
 * rather than of what one function did with an array: the Paired Device record
 * holds one state per lane and replaces it (§9). There is no scan window to
 * keep an old state for — one key per wake means no session ever touches two
 * steps of one chain, so the look-ahead every event-indexed chain in the
 * literature ships is zero here.
 */
export async function ratchetLane(lane: LaneChain): Promise<LaneChain> {
  return {
    direction: lane.direction,
    state: await hkdf(lane.state, stepInfo(lane.direction)),
  };
}

/**
 * Both lanes' `state₀`, and the end of the pairing secret.
 *
 * **The secret is state₋₁, shared by the two lanes, and one ratchet step in
 * each direction is what separates them.** That is the construction §4 names
 * rather than a third label invented here: a seed that needed its own `info`
 * would be a fourth thing to keep in step with the record, and the step is
 * exactly the operation that has to be irreversible for the destruction below
 * to be worth anything.
 *
 * **It consumes the secret**, overwriting the caller's bytes with zeros. §4
 * requires the destruction and gives the reason: a compromised device that
 * still held the secret would regenerate `state₀`, ratchet forward, and forward
 * secrecy would be worth exactly nothing. The asymmetry generalises — the half
 * that stores needs forward secrecy; the half that stores nothing does not —
 * which is why nothing is destroyed on the live room's side of this.
 *
 * What this can reach is the caller's array. Copies WebCrypto made while
 * deriving are the platform's, and no browser API hands them back to be wiped;
 * that limit is stated rather than papered over, and it is why §8 moves the
 * secret off the QR in the first place — a photograph is not on disk either.
 */
export async function derivePairingChains(
  secret: Uint8Array,
  role: PairingRole
): Promise<PairedChains> {
  const outbound: LaneDirection = role === "showed" ? "a2b" : "b2a";
  const inbound: LaneDirection = role === "showed" ? "b2a" : "a2b";

  const chains: PairedChains = {
    deposit: {
      direction: outbound,
      state: await hkdf(secret, stepInfo(outbound)),
    },
    collect: {
      direction: inbound,
      state: await hkdf(secret, stepInfo(inbound)),
    },
  };
  secret.fill(0);
  return chains;
}
