/**
 * One Paired Device record as a completed pairing leaves it (ADR-0096 §9).
 *
 * Three suites were building this literal — `wake.test.ts`, `wake-roster.
 * test.ts` and `wake-household.test.ts` — and the record has ten fields whose
 * starting values are each an argument: both indices at zero because **the
 * index advances on collections**, `deposit_standing` at `null` because
 * nothing has been written at index zero yet, `peer_roster` at `null` because
 * *nothing stated* is not *paired with nobody*, and the counter at zero
 * because a fresh pairing has burned no wakes. A copy per suite is a copy of
 * that reasoning, and the copies drift.
 *
 * **The untyped builders stay where they are, and that is deliberate.**
 * `wake-roster.test.ts` and `unpair.test.ts` seed the jar with
 * `Record<string, unknown>` rows on purpose: what they exercise is the
 * record's own guard reading a jar a devtools console can reach, and a typed
 * literal cannot express the malformed row or the missing field they are for.
 * This builder is for the suites that hand a record straight to a wake.
 */
import type {
  LaneChain,
  PairedChains,
} from "../../../src/lib/p2p/pairing-chain";
import type {
  PairedDevice,
  StoredLane,
} from "../../../src/lib/stores/paired-devices";

export const base64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

/**
 * A lane as the record keeps it, at the index a first sync leaves it.
 *
 * It takes no index for `storedLane`'s reason: a pairing act has collected
 * nothing, and `advancedLane` is how a lane moves afterwards.
 */
export const laneAt = (lane: LaneChain): StoredLane => ({
  direction: lane.direction,
  state: base64(lane.state),
  index: 0,
});

/** The day these fixtures pair on, so a record's last-met is a real date. */
export const PAIRED_ON = "2026-09-13";

/**
 * One side of one pairing, keyed by the peer it is with.
 *
 * It takes no overrides: every caller wants the record a completed act
 * leaves, and a suite that needs a row in some other state moves it with the
 * app's own functions rather than by writing a different literal.
 */
export const pairedWith = (
  peer_id: string,
  chains: PairedChains
): PairedDevice => ({
  device_id: peer_id,
  name: null,
  deposit: laneAt(chains.deposit),
  collect: laneAt(chains.collect),
  peer_vector: {},
  deposit_standing: null,
  peer_roster: null,
  unproductive_wakes: 0,
  last_met: PAIRED_ON,
  revoked: false,
});
