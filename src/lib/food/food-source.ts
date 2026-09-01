import type { EntityPayload } from "../ingestion/ingest";
import {
  FOOD_ARRIVAL_ATTR,
  type Arrival,
  type RawProvenance,
} from "./provenance";

/**
 * The food-source (origin) presentation model (ADR-0043 §2) — the pure,
 * table-testable mapping from a food twin to the SOURCE tag that rides the
 * top-right corner above its name: where the food's data came from (Open Food
 * Facts / USDA / a hand entry / a recipe). Every food has exactly one origin, so
 * this tag ALWAYS shows (unlike the present-only dietary tags).
 *
 * Three readings, in order:
 *
 *  1. An ingested record — `provenance/raw` — is the strongest evidence a
 *     twin can carry, and it SURVIVES a user's later label correction (the
 *     enrich append adds `food/label_capture` beside it, ADR-0034 §6/§7). So an
 *     edited OFF product still reads OFF: the user corrected that record, they
 *     did not author a new food.
 *  2. The arrival mark — `food/arrival` — which says this food is here because
 *     somebody sent you a meal (ADR-0073 §11). It sits ABOVE the id and BELOW
 *     the record, which is exactly the ground the mark covers: a received food
 *     the device can vouch for is not a special citizen, so a received `fdc:`
 *     twin whose provenance §3 rebuilt from this device's own bundle reads USDA
 *     like any other, and reads it identically whether it was searched for or
 *     sent. What the id alone would get wrong is what the mark answers instead —
 *     a received `food:custom_` twin matches no prefix and would fall through to
 *     `manual`, falsely claiming the recipient hand-authored it, and a received
 *     `gtin:` twin would read OFF while carrying none of OFF's record, since §3
 *     refuses to rebuild that one. The mark is also what explains its missing
 *     NOVA verdict.
 *  3. Otherwise the entity id's prefix — the same authoritative key the save
 *     path (`gtin:` enrich vs `food:custom_` mint) and `deriveNovaVerdict`'s
 *     `fdc:` inference key on. Anything with no recognised prefix
 *     (`food:custom_…`, any bare id) is a user-authored manual entry.
 */

/** A food's origin bucket. `manual` is the catch-all for user-authored twins. */
export type FoodSourceKind = "off" | "usda" | "manual" | "recipe" | "arrival";

/** What the source tag draws: origin bucket, short uppercase label, leading icon. */
export interface FoodSourceView {
  kind: FoodSourceKind;
  /** Short label the brutalist tag renders (uppercased by the skin). */
  label: string;
  /**
   * Leading origin glyph rendered before the label (ADR-0043 §2, prototype #97).
   * `◆` marks a resolved data source (OFF / USDA / a computed recipe); `✎` marks
   * a hand-authored manual entry; `↓` marks a food that arrived with a meal
   * somebody sent (ADR-0073 §11).
   */
  icon: string;
}

// Entity-id prefix → origin. Order is irrelevant (prefixes are disjoint); the
// list is the single place the id conventions map to a source bucket.
const PREFIX_SOURCES: readonly { prefix: string; kind: FoodSourceKind }[] = [
  { prefix: "gtin:", kind: "off" },
  { prefix: "fdc:", kind: "usda" },
  { prefix: "recipe:", kind: "recipe" },
];

// A kind's full tag presentation in one place: its short label + leading origin
// glyph (prototype #97 — ◆ marks a resolved data source, ✎ a hand-authored entry).
const SOURCE_PRESENTATION: Record<
  FoodSourceKind,
  { label: string; icon: string }
> = {
  off: { label: "OFF", icon: "◆" },
  usda: { label: "USDA", icon: "◆" },
  recipe: { label: "Recipe", icon: "◆" },
  manual: { label: "Manual", icon: "✎" },
  // Neither a resolved data source nor a hand entry, so neither glyph: a food
  // that arrived is marked by the direction it came from.
  arrival: { label: "Received", icon: "↓" },
};

// Ingest adapter → origin, for the `provenance/raw` reading. A `recipe:`
// twin is composed, never ingested, so it has no adapter of its own.
const ADAPTER_SOURCES: Readonly<Record<string, FoodSourceKind>> = {
  off: "off",
  fdc: "usda",
};

/**
 * Read a food twin's source tag (ADR-0043 §2): its ingested record's adapter
 * first, then its arrival mark, then its entity id — a `gtin:` twin came from an
 * OFF barcode lookup, an `fdc:` twin from USDA FoodData Central, a `recipe:` twin
 * from a user recipe, and a recordless twin that arrived with a sent meal reads
 * as received; everything else (a `food:custom_…` mint or a bare id) is a
 * hand-authored manual entry. Pure and total — a food always has an origin, so
 * this never returns absent.
 *
 * Reading the provenance first is what keeps a CORRECTED source food honest: a
 * user editing an OFF product from its label appends over the same twin, so the
 * OFF record is still there and still what the panel descends from. The tag
 * follows the record, not the last hand that touched it. Reading the arrival mark
 * next is what stops a food with no record claiming an origin this device cannot
 * vouch for.
 */
export function foodSourceView(food: EntityPayload): FoodSourceView {
  const provenance = food.attributes?.["provenance/raw"] as
    | RawProvenance
    | undefined;
  const ingested = provenance?.adapter
    ? ADAPTER_SOURCES[provenance.adapter]
    : undefined;
  if (ingested) return { kind: ingested, ...SOURCE_PRESENTATION[ingested] };

  const arrival = food.attributes?.[FOOD_ARRIVAL_ATTR] as Arrival | undefined;
  if (arrival) return { kind: "arrival", ...SOURCE_PRESENTATION.arrival };

  const entity = food.entity ?? "";
  for (const { prefix, kind } of PREFIX_SOURCES) {
    if (entity.startsWith(prefix))
      return { kind, ...SOURCE_PRESENTATION[kind] };
  }
  return { kind: "manual", ...SOURCE_PRESENTATION.manual };
}
