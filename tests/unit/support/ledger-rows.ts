import type { LedgerRow } from "../../../src/lib/db/db.core";

/**
 * One stored row, as a test writes it.
 *
 * `value` is the TEXT the ledger holds — `JSON.stringify` of the value —
 * because that is what an NDJSON artifact carries verbatim (ADR-0064 §1), so a
 * fixture that passed a bare JavaScript value would be testing a shape the wire
 * never sees.
 */
export function row(
  entity: string,
  attribute: string,
  value: unknown,
  stamp: Partial<
    Pick<LedgerRow, "time" | "hlc_ms" | "hlc_ctr" | "device_id">
  > = {}
): LedgerRow {
  return {
    entity,
    attribute,
    value: JSON.stringify(value),
    time: stamp.time ?? 1_700_000_000_000,
    hlc_ms: stamp.hlc_ms ?? 1_700_000_000_000,
    hlc_ctr: stamp.hlc_ctr ?? 0,
    device_id: stamp.device_id ?? "dev_sender",
  };
}
