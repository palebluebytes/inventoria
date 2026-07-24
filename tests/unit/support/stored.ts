import type { Datom, StoredDatom } from "../../../src/lib/db/db.core";

/**
 * Stamps write-shape `Datom` fixtures into the `StoredDatom` rows the projection
 * folds consume, using the same mapping as the ADR-0020 legacy migration
 * (`hlc_ms = time`, `hlc_ctr = 0`). Under a single device this makes HLC order
 * match `time` order, so fixtures assert latest-wins exactly as before.
 */
export function asStored(
  datoms: Datom[],
  device_id = "test-device"
): StoredDatom[] {
  return datoms.map((d) => ({
    ...d,
    hlc_ms: d.time,
    hlc_ctr: 0,
    device_id,
  }));
}
