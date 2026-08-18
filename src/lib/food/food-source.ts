import type { EntityPayload } from "../ingestion/ingest";
import type { RawProvenance } from "./provenance";

/**
 * The food-source (origin) presentation model (ADR-0043 §2) — the pure,
 * table-testable mapping from a food twin to the SOURCE tag that rides the
 * top-right corner above its name: where the food's data came from (Open Food
 * Facts / USDA / a hand entry / a recipe). Every food has exactly one origin, so
 * this tag ALWAYS shows (unlike the present-only dietary tags).
 *
 * Two readings, in order:
 *
 *  1. An ingested record — `twin/raw_provenance` — is the strongest evidence a
 *     twin can carry, and it SURVIVES a user's later label correction (the
 *     enrich append adds `food/label_capture` beside it, ADR-0034 §6/§7). So an
 *     edited OFF product still reads OFF: the user corrected that record, they
 *     did not author a new food.
 *  2. Otherwise the entity id's prefix — the same authoritative key the save
 *     path (`gtin:` enrich vs `food:custom_` mint) and `deriveNovaVerdict`'s
 *     `fdc:` inference key on. Anything with no recognised prefix
 *     (`food:custom_…`, any bare id) is a user-authored manual entry.
 */

/** A food's origin bucket. `manual` is the catch-all for user-authored twins. */
export type FoodSourceKind = "off" | "usda" | "manual" | "recipe";

/** What the source tag draws: origin bucket, short uppercase label, leading icon. */
export interface FoodSourceView {
  kind: FoodSourceKind;
  /** Short label the brutalist tag renders (uppercased by the skin). */
  label: string;
  /**
   * Leading origin glyph rendered before the label (ADR-0043 §2, prototype #97).
   * `◆` marks a resolved data source (OFF / USDA / a computed recipe); `✎` marks
   * a hand-authored manual entry.
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
};

// Ingest adapter → origin, for the `twin/raw_provenance` reading. A `recipe:`
// twin is composed, never ingested, so it has no adapter of its own.
const ADAPTER_SOURCES: Readonly<Record<string, FoodSourceKind>> = {
  off: "off",
  fdc: "usda",
};

/**
 * Read a food twin's source tag (ADR-0043 §2): its ingested record's adapter
 * first, then its entity id — a `gtin:` twin came from an OFF barcode lookup, an
 * `fdc:` twin from USDA FoodData Central, a `recipe:` twin from a user recipe;
 * everything else (a `food:custom_…` mint or a bare id) is a hand-authored manual
 * entry. Pure and total — a food always has an origin, so this never returns
 * absent.
 *
 * Reading the provenance first is what keeps a CORRECTED source food honest: a
 * user editing an OFF product from its label appends over the same twin, so the
 * OFF record is still there and still what the panel descends from. The tag
 * follows the record, not the last hand that touched it.
 */
export function foodSourceView(food: EntityPayload): FoodSourceView {
  const provenance = food.attributes?.["twin/raw_provenance"] as
    | RawProvenance
    | undefined;
  const ingested = provenance?.adapter
    ? ADAPTER_SOURCES[provenance.adapter]
    : undefined;
  if (ingested) return { kind: ingested, ...SOURCE_PRESENTATION[ingested] };

  const entity = food.entity ?? "";
  for (const { prefix, kind } of PREFIX_SOURCES) {
    if (entity.startsWith(prefix))
      return { kind, ...SOURCE_PRESENTATION[kind] };
  }
  return { kind: "manual", ...SOURCE_PRESENTATION.manual };
}
