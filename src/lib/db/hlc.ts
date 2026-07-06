/**
 * Hybrid Logical Clock (HLC), per ADR-0020.
 *
 * A datom's order and identity is `(physical_ms, logical_counter, device_id)`
 * rather than a bare wall-clock `time`. The pair `(physical_ms, counter)` is a
 * standard HLC: `now()` stamps a local write, tracking wall-clock milliseconds
 * and breaking same-millisecond ties with the counter; `update()` advances the
 * clock on receiving remote datoms during sync, which preserves causality so a
 * write made after observing a remote edit always orders after it. `device_id`
 * gives a deterministic tiebreak between genuinely concurrent writes, yielding
 * one total order every device computes identically.
 *
 * This module is pure and injectable (`wallClock`) so it can be tested without
 * a real clock. Persistence of the high-water mark is the ledger's job: the
 * clock is seeded from the ledger's max stamp on init (see `readHlcHighWater`).
 */

export interface HlcStamp {
  physical: number;
  counter: number;
  deviceId: string;
}

export interface HlcMark {
  physical: number;
  counter: number;
}

/** An HLC as stored on a ledger row (DB column names), for ordering reads. */
export interface HlcKey {
  hlc_ms: number;
  hlc_ctr: number;
  device_id: string;
}

export interface Hlc {
  /** Stamp a local write. Monotonic across calls. */
  now(): HlcStamp;
  /** Advance on receiving a remote stamp, preserving causality. */
  update(remote: HlcMark): HlcStamp;
  /** The current high-water mark, without advancing. */
  peek(): HlcMark;
}

export interface HlcOptions {
  seed?: HlcMark;
  wallClock?: () => number;
}

export function createHlc(deviceId: string, opts: HlcOptions = {}): Hlc {
  let physical = opts.seed?.physical ?? 0;
  let counter = opts.seed?.counter ?? 0;
  const wall = opts.wallClock ?? (() => Date.now());

  return {
    now(): HlcStamp {
      const pt = wall();
      if (pt > physical) {
        physical = pt;
        counter = 0;
      } else {
        counter += 1;
      }
      return { physical, counter, deviceId };
    },

    update(remote: HlcMark): HlcStamp {
      const pt = wall();
      const prev = physical;
      physical = Math.max(prev, remote.physical, pt);
      if (physical === prev && physical === remote.physical) {
        counter = Math.max(counter, remote.counter) + 1;
      } else if (physical === prev) {
        counter = counter + 1;
      } else if (physical === remote.physical) {
        counter = remote.counter + 1;
      } else {
        counter = 0;
      }
      return { physical, counter, deviceId };
    },

    peek(): HlcMark {
      return { physical, counter };
    },
  };
}

/** Total order over HLC-stamped rows: physical, then counter, then device id. */
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
