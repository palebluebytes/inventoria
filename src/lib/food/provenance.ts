// ---------------------------------------------------------------------------
// Food-twin Provenance (twin/raw_provenance)
// ---------------------------------------------------------------------------
//
// Every food Digital Twin ingested from a reputable source (USDA FoodData
// Central, Open Food Facts) stores the raw source response as an immutable
// Provenance blob, so any nutrient the `nutrition/info` panel does not surface
// today can be backfilled later with no network re-fetch (ADR-0016, ADR-0021
// §4). This is the same isolated-Mapper provenance envelope items and media
// already carry; food was the lone ingested twin type that skipped it.

/**
 * The extraction-metadata envelope stored as one atomic, immutable Datom value
 * under `twin/raw_provenance`: the untouched source object plus enough metadata
 * to remap it losslessly later.
 *
 * There is deliberately NO captured-at field. The ledger stamps each Datom's
 * `time` at ingest (`ingestEntity`), and that time IS this provenance's capture
 * basis — so the timestamp lives on the Datom, not in the blob. This keeps the
 * Mappers pure and deterministic (the Seam-1 tests feed a fixed fixture and
 * assert exact output; a `Date.now()` in the mapper would break that).
 */
export interface RawProvenance<RawT = unknown> {
  /** The untouched source object the Mapper received, verbatim. */
  raw_data: RawT;
  /** Canonical URI the raw response was fetched from. */
  source_uri: string;
  /** Short data-source identifier (e.g. "fdc", "off"). */
  adapter: string;
  /** Mapper version, bumped when the normalisation logic changes. */
  adapter_version: string;
}

/**
 * Builds the `twin/raw_provenance` envelope. Pure and deterministic — no clock,
 * no I/O — so it composes into the pure adapter Mappers.
 */
export function buildRawProvenance<RawT>(args: {
  adapter: string;
  adapter_version: string;
  source_uri: string;
  raw_data: RawT;
}): RawProvenance<RawT> {
  return {
    raw_data: args.raw_data,
    source_uri: args.source_uri,
    adapter: args.adapter,
    adapter_version: args.adapter_version,
  };
}
