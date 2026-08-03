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

// ---------------------------------------------------------------------------
// User label-capture provenance (food/label_capture)
// ---------------------------------------------------------------------------
//
// When a user captures a food from its label photo, the origin of what they
// typed is recorded under a DISTINCT `food/label_capture` attribute — never the
// `twin/raw_provenance` above (ADR-0034 §7). The two are siblings: a
// found-but-poor `gtin:` twin enriched in place holds BOTH an OFF
// `twin/raw_provenance` blob and a user `food/label_capture` datom, so its dual
// origin stays auditable and a second `twin/raw_provenance` would latest-wins
// clobber the OFF response.
//
// Photos are REFERENCED, not duplicated here: they live once in
// `food/label_photos[]`. This envelope carries only the capture's metadata.

/** Bumped when the label-capture envelope's shape or semantics change. */
export const LABEL_ADAPTER_VERSION = 1;

/**
 * How the label's values reached the panel: `manual` is v1's guided
 * transcription (the human reads the label into the rows, no model call);
 * `ai-confirmed` is the deferred AI-autofill-then-confirm path (#49/#51). Either
 * way the stored values are what the user confirmed, never written un-reviewed.
 */
export type LabelCaptureMethod = "manual" | "ai-confirmed";

/**
 * The provenance envelope stored under `food/label_capture` — a sibling of
 * {@link RawProvenance} recording that a user supplied/edited a twin's panel
 * from its label (ADR-0034 §7). Like {@link RawProvenance} it is deliberately
 * clock-free: the Datom's `time` IS the capture basis, so this stays a pure
 * deterministic value.
 */
export interface LabelCapture {
  /** Always "label" — the capture surface, paralleling `RawProvenance.adapter`. */
  adapter: "label";
  /** Envelope version, bumped with {@link LABEL_ADAPTER_VERSION}. */
  adapter_version: number;
  /** How the values were read from the label. */
  method: LabelCaptureMethod;
  /**
   * The basis the panel was entered against — the #52 form's basis toggle
   * resolved to a `serving_size` string (`100 g` / `N g` / `1 serving`).
   */
  basis: string;
  /**
   * What the user supplied or edited, e.g. `["name", "nutriments", "portions"]`
   * — an audit hint, not a schema, so the form decides the labels.
   */
  fields: string[];
}

/**
 * Builds the `food/label_capture` envelope. Pure, deterministic and clock-free —
 * mirrors {@link buildRawProvenance} — so it composes into the save path without
 * making the writer impure. It does NOT take or embed photo base64: photos live
 * once in `food/label_photos[]` and are only referenced from here (ADR-0034 §7).
 */
export function buildLabelCapture(args: {
  method: LabelCaptureMethod;
  basis: string;
  fields: string[];
}): LabelCapture {
  return {
    adapter: "label",
    adapter_version: LABEL_ADAPTER_VERSION,
    method: args.method,
    basis: args.basis,
    fields: args.fields,
  };
}

// ---------------------------------------------------------------------------
// User manual-entry provenance (food/manual_entry)
// ---------------------------------------------------------------------------
//
// The three eating-out / estimation intents behind the Custom tab's chooser —
// quick estimate, from a menu, from a plate photo (ADR-0035) — are neither
// ingested (`twin/raw_provenance`) nor label reads (`food/label_capture`), so a
// DISTINCT `food/manual_entry` sibling records their origin. Its `kind`
// discriminator is the single source of truth for reusability: a `menu` dish is
// a catalogue food (Recent/Search), a `quick_estimate` / `plate_estimate` is a
// one-off and excluded (ADR-0035 §6).

/** The EAVT attribute holding a manual entry's origin envelope. */
export const MANUAL_ENTRY_ATTR = "food/manual_entry";

/** Bumped when the manual-entry envelope's shape or semantics change. */
export const MANUAL_ENTRY_ADAPTER_VERSION = 1;

/**
 * Which manual intent minted the twin (ADR-0035 §3–§5). `menu` is the reusable
 * catalogue case; `quick_estimate` and `plate_estimate` are one-offs. This is the
 * ONE field the Recent/Search reusability rule keys off ({@link
 * manualEntryIsReusable}).
 */
export type ManualEntryKind = "quick_estimate" | "menu" | "plate_estimate";

/**
 * The provenance envelope stored under `food/manual_entry` — a sibling of
 * {@link LabelCapture} recording that a user hand-entered a food through one of
 * the Custom chooser's intents (ADR-0035 §6). Like its siblings it is
 * deliberately clock-free: the Datom's `time` IS the entry basis, so it stays a
 * pure deterministic value.
 */
export interface ManualEntry {
  /** Always "manual" — the entry surface, paralleling `LabelCapture.adapter`. */
  adapter: "manual";
  /** Envelope version, bumped with {@link MANUAL_ENTRY_ADAPTER_VERSION}. */
  adapter_version: number;
  /** Which intent minted the twin — the reusability discriminator. */
  kind: ManualEntryKind;
  /**
   * The coarse categories the user supplied, e.g. `["name", "calories",
   * "ingredients"]` — an audit hint, not a schema.
   */
  fields: string[];
}

/**
 * Builds the `food/manual_entry` envelope. Pure, deterministic and clock-free —
 * mirrors {@link buildLabelCapture} — so it composes into the save path without
 * making the writer impure.
 */
export function buildManualEntry(args: {
  kind: ManualEntryKind;
  fields: string[];
}): ManualEntry {
  return {
    adapter: "manual",
    adapter_version: MANUAL_ENTRY_ADAPTER_VERSION,
    kind: args.kind,
    fields: args.fields,
  };
}

/**
 * The single reusability rule (ADR-0035 §6): a manual entry is a catalogue food
 * (surfaced in Recent/Search) only when it is a `menu` dish. A `quick_estimate`
 * or `plate_estimate` is a one-off vague guess, excluded. A twin with no
 * `food/manual_entry` at all (a searched/scanned/label twin) is decided
 * elsewhere — this answers only "is THIS manual entry reusable?".
 */
export function manualEntryIsReusable(kind: ManualEntryKind): boolean {
  return kind === "menu";
}
