/**
 * Hybrid Logical Clock (HLC), per ADR-0020.
 *
 * A datom's order and identity is `(hlc_ms, hlc_ctr, device_id)` rather than a
 * bare wall-clock `time`. The pair `(hlc_ms, hlc_ctr)` is a standard HLC:
 * `now()` stamps a local write, tracking wall-clock milliseconds and breaking
 * same-millisecond ties with the counter; `update()` advances the clock on
 * receiving remote datoms during sync, which preserves causality so a write
 * made after observing a remote edit always orders after it. `device_id` gives
 * a deterministic tiebreak between genuinely concurrent writes, yielding one
 * total order every device computes identically.
 *
 * Every shape here speaks the ledger's column names (`hlc_ms`, `hlc_ctr`,
 * `device_id`), so a stamp is written, compared, and read back without renaming
 * fields at any boundary. This module is pure and injectable (`wallClock`) so
 * it can be tested without a real clock. Persistence of the high-water mark is
 * the ledger's job: the clock is seeded from the ledger's max stamp on init
 * (see `readHlcHighWater`).
 */

/** A clock position without a device: the seed, high-water mark, and peek shape. */
export interface HlcMark {
  hlc_ms: number;
  hlc_ctr: number;
}

/** An HLC stamp / ledger-row key: a mark plus the device that issued it. */
export interface HlcKey extends HlcMark {
  device_id: string;
}

export interface Hlc {
  /** Stamp a local write. Monotonic across calls. */
  now(): HlcKey;
  /** Advance on receiving a remote stamp, preserving causality. */
  update(remote: HlcMark): HlcKey;
  /** The current high-water mark, without advancing. */
  peek(): HlcMark;
}

export interface HlcOptions {
  seed?: HlcMark;
  wallClock?: () => number;
}

export function createHlc(device_id: string, opts: HlcOptions = {}): Hlc {
  let hlc_ms = opts.seed?.hlc_ms ?? 0;
  let hlc_ctr = opts.seed?.hlc_ctr ?? 0;
  const wall = opts.wallClock ?? (() => Date.now());

  return {
    now(): HlcKey {
      const pt = wall();
      if (pt > hlc_ms) {
        hlc_ms = pt;
        hlc_ctr = 0;
      } else {
        hlc_ctr += 1;
      }
      return { hlc_ms, hlc_ctr, device_id };
    },

    update(remote: HlcMark): HlcKey {
      const pt = wall();
      const prev = hlc_ms;
      hlc_ms = Math.max(prev, remote.hlc_ms, pt);
      if (hlc_ms === prev && hlc_ms === remote.hlc_ms) {
        hlc_ctr = Math.max(hlc_ctr, remote.hlc_ctr) + 1;
      } else if (hlc_ms === prev) {
        hlc_ctr = hlc_ctr + 1;
      } else if (hlc_ms === remote.hlc_ms) {
        hlc_ctr = remote.hlc_ctr + 1;
      } else {
        hlc_ctr = 0;
      }
      return { hlc_ms, hlc_ctr, device_id };
    },

    peek(): HlcMark {
      return { hlc_ms, hlc_ctr };
    },
  };
}

/** Total order over HLC-stamped rows: physical ms, then counter, then device id. */
export function compareHlc(a: HlcKey, b: HlcKey): number {
  return (
    a.hlc_ms - b.hlc_ms ||
    a.hlc_ctr - b.hlc_ctr ||
    (a.device_id < b.device_id ? -1 : a.device_id > b.device_id ? 1 : 0)
  );
}

/** The SQL `ORDER BY` fragment putting rows in HLC order (ascending). */
export const HLC_ORDER_ASC = "hlc_ms ASC, hlc_ctr ASC, device_id ASC";
export const HLC_ORDER_DESC = "hlc_ms DESC, hlc_ctr DESC, device_id DESC";
