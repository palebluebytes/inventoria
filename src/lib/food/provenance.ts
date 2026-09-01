// ---------------------------------------------------------------------------
// Food-twin Provenance (provenance/raw)
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
 * under `provenance/raw`: the untouched source object plus enough metadata
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
  /**
   * Sibling records from the SAME source whose values filled fields `raw_data`
   * does not carry (ADR-0045 §4). Present only when a merge actually happened,
   * so an unmerged twin's blob is byte-identical to what it was before.
   *
   * A merged panel must never read as one record the source served: this is what
   * lets a later reader tell a measured value from a borrowed one, and re-fetch
   * either record. Merging across DIFFERENT sources is forbidden (ADR-0045 §5),
   * so every entry here shares `adapter` with the envelope.
   */
  merged_from?: MergedSource[];
}

/** One record that filled gaps in a {@link RawProvenance}'s `raw_data`. */
export interface MergedSource {
  /** Canonical URI of the record the values came from. */
  source_uri: string;
  /** How the source names the record, for whoever reads the blob later. */
  description: string;
  /** The source's own name for the dataset the record belongs to, if it has one. */
  data_type?: string;
  /** Mapped-payload fields taken from this record rather than from `raw_data`. */
  filled_fields: string[];
}

/**
 * Builds the `provenance/raw` envelope. Pure and deterministic — no clock,
 * no I/O — so it composes into the pure adapter Mappers.
 */
export function buildRawProvenance<RawT>(args: {
  adapter: string;
  adapter_version: string;
  source_uri: string;
  raw_data: RawT;
  merged_from?: readonly MergedSource[];
}): RawProvenance<RawT> {
  const provenance: RawProvenance<RawT> = {
    raw_data: args.raw_data,
    source_uri: args.source_uri,
    adapter: args.adapter,
    adapter_version: args.adapter_version,
  };
  // Omitted, not emitted empty: a food with no merged twin keeps exactly the
  // blob it had before ADR-0045.
  if (args.merged_from?.length) provenance.merged_from = [...args.merged_from];
  return provenance;
}

// ---------------------------------------------------------------------------
// User label-capture provenance (food/label_capture)
// ---------------------------------------------------------------------------
//
// When a user captures a food from its label photo, the origin of what they
// typed is recorded under a DISTINCT `food/label_capture` attribute — never the
// `provenance/raw` above (ADR-0034 §7). The two are siblings: a
// found-but-poor `gtin:` twin enriched in place holds BOTH an OFF
// `provenance/raw` blob and a user `food/label_capture` datom, so its dual
// origin stays auditable and a second `provenance/raw` would latest-wins
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
// ingested (`provenance/raw`) nor label reads (`food/label_capture`), so a
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

// ---------------------------------------------------------------------------
// Arrival provenance (food/arrival)
// ---------------------------------------------------------------------------
//
// A food that reached this device because somebody sent you a meal is neither
// ingested (`twin/raw_provenance`), read off a label (`food/label_capture`) nor
// hand-entered (`food/manual_entry`), so a THIRD sibling records its origin
// (ADR-0073 §11). A received meal lands re-minted on the recipient's own clock
// with no foreign `device_id`, which erases the free provenance mark a foreign
// stamp would have left — so it is written explicitly instead.
//
// It records how this food came to be here and NEVER who sent it: no sender
// identity exists in the ledger, the envelope or the wire. And it is
// display-only — `foodSourceView` reads it, and nothing else does. It never
// gates reuse, never hides a food from Recent or search, and is never written
// for a datom from one of your own devices (ADR-0075 §13).

/** The EAVT attribute holding the arrival mark. */
export const FOOD_ARRIVAL_ATTR = "food/arrival";

/** Bumped when the arrival envelope's shape or semantics change. */
export const ARRIVAL_ADAPTER_VERSION = 1;

/**
 * The provenance envelope stored under `food/arrival` — the third sibling of
 * {@link LabelCapture} and {@link ManualEntry} (ADR-0073 §11).
 *
 * Unlike those two it is NOT clock-free. Theirs takes its basis from the
 * datom's own `time`, which is the moment the user did the thing the envelope
 * records; here the datom's `time` is the accept and the food itself is older
 * than this device has any way of knowing, so the one instant worth stating is
 * the arrival and it is stated rather than inferred.
 */
export interface Arrival {
  /** Always "send" — the capture surface, paralleling {@link ManualEntry}. */
  adapter: "send";
  /** Envelope version, bumped with {@link ARRIVAL_ADAPTER_VERSION}. */
  adapter_version: number;
  /** When the meal carrying this food was accepted, in Unix ms. */
  received_at: number;
}

/**
 * Builds the `food/arrival` envelope. Pure and deterministic — the clock is a
 * parameter rather than a `Date.now()` inside, so the accept path stamps every
 * food of one meal with the one moment it arrived (`CODING_STANDARDS.md` §6).
 */
export function buildArrival(received_at: number): Arrival {
  return {
    adapter: "send",
    adapter_version: ARRIVAL_ADAPTER_VERSION,
    received_at,
  };
}
