import { writable } from "svelte/store";
import type { VersionVector } from "../db/version-vector";
import {
  CHAIN_STATE_BYTES,
  type LaneChain,
  type LaneDirection,
  type PairedChains,
} from "../p2p/pairing-chain";

/**
 * The Paired Device list: `localStorage`, never a datom (ADR-0075 §3 as
 * replaced by ADR-0096 §9).
 *
 * > **A Paired Device record holds derived, per-lane chain state and never a
 * > reusable credential. Nothing in it can regenerate the pairing, only advance
 * > it.**
 *
 * A rule rather than a list of fields, and it is a **strengthening**: ADR-0075
 * §3's record held the 256-bit pairing secret, which regenerates both `state₀`s
 * and with them every deposit address and every seal key from pairing onward.
 * The secret does not survive its own pairing (ADR-0096 §4), so what is here is
 * one ratchet step past it and a stolen record opens at most one outstanding
 * object per lane and nothing behind it.
 *
 * ### Why it is here and not in the ledger
 *
 * Two arguments, and ADR-0096 §9 leaves both untouched:
 *
 * - Secrets never live in the append-only ledger, because it is undeletable
 *   **and it syncs**. Putting derived pairing material inside the thing it
 *   unlocks is circular.
 * - **A revocation cannot live in an append-only log that the revoked device
 *   also writes to.** If these were datoms, unpairing on one device would be
 *   *undone by the next sync from the other*: the deletion is not a fact the
 *   ledger can represent, and the pairing datom would simply come back.
 *
 * ADR-0085 §1 is **not** what puts it here — that record governs settings, and
 * chain state is no more a setting than the pairing secret was. It is derived
 * material, it lives where the seed lived, and it inherits the seed's rules:
 * never a datom, and never in an ADR-0064 export, which is structural because
 * an export is a walk of `datoms`.
 *
 * ### Guard 1 is what decides when a row appears
 *
 * > **A pairing is not complete until its first sync completes. An incomplete
 * > pairing deposits nothing and collects nothing.**
 *
 * So {@link rememberPairedDevice} is called on completion and nowhere else, and
 * an abandoned attempt leaves nothing to clean up. **Pairing is keyed by
 * `device_id`, and pairing again replaces** — losslessly, which is the repair
 * path for the one side that can commit alone when the last frame is lost
 * (ADR-0096 §8). "Pair a device" must therefore work with no row present, and
 * "Pair again" promises nothing, because `device_id` is not learned until the
 * act is spent.
 */

/** One lane's ratchet, at the index it has reached. */
export interface StoredLane {
  direction: LaneDirection;
  /**
   * {@link CHAIN_STATE_BYTES} of state as base64. Never an address and never a
   * key: both are derived from it, under separate labels, at use.
   */
  state: string;
  /**
   * How far along the ratchet this lane is. **It advances on collections,
   * never on the clock** (ADR-0096 §4), so a first sync leaves it at zero and
   * #396 is what moves it.
   */
  index: number;
}

export interface PairedDevice {
  /** The peer's own id, and the key: pairing again replaces this row. */
  device_id: string;
  /**
   * A name typed **locally, about the peer, after the act**, and never sent
   * (ADR-0096 §6 and §9). A row reads by short `device_id` until it is named.
   */
  name: string | null;
  /** The lane this device deposits into. */
  deposit: StoredLane;
  /** The lane this device collects from. */
  collect: StoredLane;
  /**
   * What the peer said it held when the first sync closed.
   *
   * This is the whole point of ADR-0096 §8's **closing vector exchange**:
   * without it both sides would finish holding the peer's *pre-sync* state, and
   * the first deposit would re-send everything the first sync had just
   * delivered. It is superseded by each later exchange, never merged.
   */
  peer_vector: VersionVector;
}

/**
 * One `localStorage` record holding the whole list.
 *
 * The list is the unit rather than one key per device: every read wants all of
 * them (a wake serves every pairing, one key each), replacing by `device_id` is
 * a rewrite of the same record either way, and the jar-wide wipe that unpairs
 * has one key to take rather than an enumeration to get right.
 */
const LS_KEY = "inventoria_paired_devices";

// `localStorage` is absent under the Node unit runner and can throw in a
// privacy-locked browser, so every access is guarded the way `secrets.ts`
// guards its own: a missing store reads as no pairings and a refused write
// simply does not persist.
function jar(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const unb64 = (text: string) =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

const storedLane = (lane: LaneChain, index = 0): StoredLane => ({
  direction: lane.direction,
  state: b64(lane.state),
  index,
});

/** A stored lane back as the chain it is, for deriving an address or a key. */
export function laneChainOf(lane: StoredLane): LaneChain {
  return { direction: lane.direction, state: unb64(lane.state) };
}

/**
 * Every pairing this device holds.
 *
 * A record that will not parse reads as **no pairings** rather than throwing,
 * and a row that is not a pairing is dropped rather than carried. This jar is a
 * boundary like any other — a devtools console reaches it, and so does a
 * version of this app that wrote a different shape — and the guard is here,
 * once, so that everything above can trust the type.
 *
 * It is deliberately the gentler failure. A Settings screen that cannot render
 * is a worse way to learn about a broken record than a list saying nothing is
 * paired beside a "Pair a device" that still works, and re-pairing is the
 * repair either way.
 */
export function readPairedDevices(): PairedDevice[] {
  const held = jar()?.getItem(LS_KEY);
  if (!held) return [];
  try {
    const parsed: unknown = JSON.parse(held);
    return Array.isArray(parsed) ? parsed.filter(isPairedDevice) : [];
  } catch {
    return [];
  }
}

function isPairedDevice(row: unknown): row is PairedDevice {
  if (row === null || typeof row !== "object") return false;
  return (
    "device_id" in row &&
    typeof row.device_id === "string" &&
    row.device_id.length > 0 &&
    "name" in row &&
    (row.name === null || typeof row.name === "string") &&
    "deposit" in row &&
    isStoredLane(row.deposit) &&
    "collect" in row &&
    isStoredLane(row.collect) &&
    "peer_vector" in row &&
    row.peer_vector !== null &&
    typeof row.peer_vector === "object"
  );
}

function isStoredLane(lane: unknown): lane is StoredLane {
  if (lane === null || typeof lane !== "object") return false;
  return (
    "direction" in lane &&
    (lane.direction === "a2b" || lane.direction === "b2a") &&
    "state" in lane &&
    typeof lane.state === "string" &&
    "index" in lane &&
    typeof lane.index === "number"
  );
}

/** The live list, for a Settings section that redraws when one is added. */
export const pairedDevices = writable<PairedDevice[]>(readPairedDevices());

/**
 * Writes the list, and then publishes **what the jar actually holds** rather
 * than what was handed in.
 *
 * The two differ only where the store refused — a full jar, or site data
 * blocked outright — and there the difference is the whole point: a section
 * showing a pairing that a reload will not find would be reporting success for
 * a write that did not happen. Re-pairing is the repair, and it is only offered
 * if the screen says nothing is paired.
 */
function keep(devices: PairedDevice[]): void {
  try {
    jar()?.setItem(LS_KEY, JSON.stringify(devices));
  } catch {
    /* privacy-locked / quota-exceeded — the pairing just does not persist */
  }
  pairedDevices.set(readPairedDevices());
}

/** What a completed first sync hands over, and the whole of what is kept. */
export interface CompletedPairing {
  device_id: string;
  chains: PairedChains;
  peer_vector: VersionVector;
}

/**
 * Writes one pairing down, replacing any row for the same device.
 *
 * **Called on completion and nowhere else.** Both halves of guard 1 rest on
 * that: it is what bounds what the store can accumulate, and it is what makes a
 * fresh pairing cost a live session rather than a whole-ledger upload.
 */
export function rememberPairedDevice({
  device_id,
  chains,
  peer_vector,
}: CompletedPairing): PairedDevice {
  const held = readPairedDevices();
  const remembered: PairedDevice = {
    device_id,
    // The name is the user's to type afterwards, so re-pairing a device they
    // have already named keeps the name rather than making them type it again.
    name: held.find((device) => device.device_id === device_id)?.name ?? null,
    deposit: storedLane(chains.deposit),
    collect: storedLane(chains.collect),
    peer_vector,
  };
  keep([
    ...held.filter((device) => device.device_id !== device_id),
    remembered,
  ]);
  return remembered;
}

/** The name this device calls a peer, typed locally and never sent. */
export function namePairedDevice(device_id: string, name: string): void {
  const named = name.trim();
  keep(
    readPairedDevices().map((device) =>
      device.device_id === device_id
        ? { ...device, name: named.length > 0 ? named : null }
        : device
    )
  );
}

/**
 * Severs one pairing, here, unilaterally, with no message and no coordination.
 *
 * ADR-0075 §4: every device already holds total power over its own pairings,
 * and §12 makes **silence the revocation signal** — a message can be dropped,
 * blocked or missed, and a revocation you can suppress is worse than none
 * because it reports success. The two-phase delete that also takes what this
 * device left in the store is #400's; this is the local half it will extend.
 */
export function forgetPairedDevice(device_id: string): void {
  keep(readPairedDevices().filter((device) => device.device_id !== device_id));
}
