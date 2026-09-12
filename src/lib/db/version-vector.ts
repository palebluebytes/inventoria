/**
 * The version vector: what this device holds, per originating device, read
 * straight off `datoms` (ADR-0075 §6).
 *
 * **The watermark is not stored, it is queried.** Every datom carries the
 * `device_id` that minted it, and a device's own stamps are strictly monotonic
 * — `Hlc.now` raises `hlc_ms` or increments `hlc_ctr`, and `Hlc.update`
 * likewise. So the greatest `(hlc_ms, hlc_ctr)` **per originating device** is an
 * exact statement of what this device holds from that device. There is no
 * second table, no import log and no content hash to fall out of step with the
 * ledger, because the vector *is* a read of the ledger, and ADR-0067 §2's
 * refusal of an import log therefore does not apply to it at all.
 *
 * **A single scalar HLC watermark is wrong, not merely coarse.** A peer can
 * hand you a row stamped *below* your maximum — from a third device, or from a
 * device whose wall clock was behind — and a scalar filter would silently drop
 * it. The bug would be invisible and permanent, which is why the shape here is
 * a map keyed by device rather than one pair.
 *
 * **Two properties fall out for free.** A *first* sync is just the empty-vector
 * case, so it needs no separate code path — {@link vectorAboveMatch} of an empty
 * vector matches every row. And resume after a dropped socket costs nothing:
 * re-exchange vectors and continue from wherever it got to.
 *
 * This module is pure. It owns the vector in all three of its forms — the query
 * that computes one, the `WHERE` that filters by one, and the shape one takes
 * when it crosses a wire — so those three can never disagree about what "above"
 * means.
 */

import { describeMarker } from "./describe-value";
import {
  compareHlcMark,
  HLC_ORDER_DESC,
  type HlcKey,
  type HlcMark,
} from "./hlc";

/**
 * The greatest stamp held from each originating device, keyed by that device.
 *
 * A device absent from the map is one this ledger has never held a row from,
 * which is the same statement as a stamp of zero and is written as absence so
 * that the empty vector — a device that has never held anything at all — is the
 * empty map rather than a map of zeros it would have to enumerate.
 */
export type VersionVector = Readonly<Record<string, HlcMark>>;

/** A vector that holds nothing: what a device with an empty ledger sends. */
export const EMPTY_VERSION_VECTOR: VersionVector = Object.freeze({});

/**
 * The query, one row per originating device.
 *
 * `MAX(hlc_ms), MAX(hlc_ctr)` grouped by device would be **wrong** rather than
 * approximate: the two aggregates are free to come from different rows, so a
 * ledger holding `(5, 0)` and `(4, 9)` would report `(5, 9)` and the peer would
 * be told to withhold a row nobody has. The window function takes the whole
 * pair off one row, which is the only reading of "greatest" the vector can
 * stand on.
 *
 * It is a full scan, because no index leads with `device_id` and one added for
 * this would be paid on every append to save a read that happens once per open.
 */
export const VERSION_VECTOR_SQL = `
  SELECT device_id, hlc_ms, hlc_ctr FROM (
    SELECT device_id, hlc_ms, hlc_ctr,
           ROW_NUMBER() OVER (
             PARTITION BY device_id ORDER BY ${HLC_ORDER_DESC}
           ) AS place
      FROM datoms
  ) WHERE place = 1;
`;

/** The rows {@link VERSION_VECTOR_SQL} returns, as the vector they describe. */
export function foldVersionVector(rows: readonly HlcKey[]): VersionVector {
  const vector: Record<string, HlcMark> = {};
  for (const row of rows) {
    vector[row.device_id] = { hlc_ms: row.hlc_ms, hlc_ctr: row.hlc_ctr };
  }
  return vector;
}

/**
 * The vector a holder of `vector` has once it also holds `rows`.
 *
 * **A lower bound, and a sound one**, which is what a store-carried
 * convergence needs and a live one never did. The peer's own vector crosses
 * exactly once, at the first sync's closing exchange (ADR-0096 §8); after that
 * each side keeps its view of the other current from what it has **observed**
 * — rows it collected from the peer, which the peer necessarily held to send,
 * and rows of its own the peer acknowledged collecting.
 *
 * That is why a Deposit carries an acknowledgement and a delta and no vector
 * (ADR-0096 §3). Re-asserting one would state which *third* devices this
 * ledger has heard from, which ADR-0096 §6 closes the door on, and it would buy
 * only exactness: understating what a peer holds costs a re-sent row an import
 * ignores, where overstating it would withhold a row permanently.
 */
export function vectorWith(
  vector: VersionVector,
  rows: readonly HlcKey[]
): VersionVector {
  const held: Record<string, HlcMark> = { ...vector };
  for (const row of rows) {
    const mark = { hlc_ms: row.hlc_ms, hlc_ctr: row.hlc_ctr };
    const standing = held[row.device_id];
    if (!standing || compareHlcMark(standing, mark) < 0) {
      held[row.device_id] = mark;
    }
  }
  return held;
}

/**
 * The `WHERE` matching every row a holder of `vector` does not have, and the
 * values to bind under it.
 *
 * Two clauses, and the first is the one a scalar watermark cannot express: a
 * device the peer has never heard of contributes **all** of its rows, whatever
 * their stamps, so rows stamped below the peer's greatest anything still cross.
 *
 * An empty vector matches everything, which is the first sync, and is why there
 * is no separate first-sync path anywhere above this.
 */
export function vectorAboveMatch(vector: VersionVector): {
  where: string;
  bind: unknown[];
} {
  const devices = Object.keys(vector);
  if (devices.length === 0) return { where: "1", bind: [] };
  const unheard = `device_id NOT IN (${devices.map(() => "?").join(", ")})`;
  const past = devices.map(
    () => "(device_id = ? AND (hlc_ms, hlc_ctr) > (?, ?))"
  );
  return {
    where: [unheard, ...past].join(" OR "),
    bind: [
      ...devices,
      ...devices.flatMap((id) => [id, vector[id].hlc_ms, vector[id].hlc_ctr]),
    ],
  };
}

/**
 * A vector that arrived from somewhere else, checked.
 *
 * ADR-0075 §13 keeps two of ADR-0073 §8's refusals on this path — a chunk whose
 * seal fails, and rows failing `importLedgerRows`' column validation — not
 * because a paired device is untrusted but because **if the seal held and what
 * is inside is malformed, that is a bug**, and a bug that drives a sync decides
 * which rows are withheld permanently. A vector is the other input that decides
 * that, so it is checked to the same standard rather than trusted for being
 * sealed.
 */
export function readVersionVector(raw: unknown): VersionVector {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VersionVectorRefusedError("a version vector is a JSON object.");
  }
  const vector: Record<string, HlcMark> = {};
  for (const device_id of Object.keys(raw)) {
    if (device_id.length === 0) {
      throw new VersionVectorRefusedError(
        "a version vector is keyed by device, and one of its keys is empty."
      );
    }
    const mark: unknown = Reflect.get(raw, device_id);
    if (!isMark(mark)) {
      throw new VersionVectorRefusedError(
        // The id is what a reader needs to find the entry, and it is a label
        // rather than content — `datoms` carries it in every primary key. It is
        // still quoted back only while it is label-sized, because this one
        // arrived off a wire and the refusal is rendered (#227). What the entry
        // *said* is never quoted at all.
        `the entry for ${describeMarker(device_id)} is not a whole stamp.`
      );
    }
    vector[device_id] = { hlc_ms: mark.hlc_ms, hlc_ctr: mark.hlc_ctr };
  }
  return vector;
}

export class VersionVectorRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "VersionVectorRefusedError";
  }
}

function isMark(value: unknown): value is HlcMark {
  return (
    value !== null &&
    typeof value === "object" &&
    "hlc_ms" in value &&
    "hlc_ctr" in value &&
    isStampPart(value.hlc_ms) &&
    isStampPart(value.hlc_ctr)
  );
}

/** What the ledger's own integer columns accept, and so what a stamp is. */
const isStampPart = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
