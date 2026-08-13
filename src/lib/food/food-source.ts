import type { EntityPayload } from "../ingestion/ingest";

/**
 * The food-source (origin) presentation model (ADR-0043 §2) — the pure,
 * table-testable mapping from a food twin to the SOURCE tag that floats
 * top-right of its name on the staged card: where the food's data came from
 * (Open Food Facts / USDA / a hand entry / a recipe). Every food has exactly one
 * origin, so this tag ALWAYS shows (unlike the present-only dietary tags).
 *
 * The origin is read off the entity id's prefix — the same authoritative key the
 * save path (`gtin:` enrich vs `food:custom_` mint, ADR-0034 §6) and
 * `deriveNovaVerdict`'s `fdc:` inference already key on — so it needs no written
 * attribute. Anything not carrying a recognised source prefix (`food:custom_…`
 * and any bare id) is a user-authored manual entry.
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

/**
 * Read a food twin's source tag off its entity id (ADR-0043 §2). A `gtin:` twin
 * came from an OFF barcode lookup, an `fdc:` twin from USDA FoodData Central, a
 * `recipe:` twin from a user recipe; everything else (a `food:custom_…` mint or a
 * bare id) is a hand-authored manual entry. Pure and total — a food always has an
 * origin, so this never returns absent.
 */
export function foodSourceView(food: EntityPayload): FoodSourceView {
  const entity = food.entity ?? "";
  for (const { prefix, kind } of PREFIX_SOURCES) {
    if (entity.startsWith(prefix))
      return { kind, ...SOURCE_PRESENTATION[kind] };
  }
  return { kind: "manual", ...SOURCE_PRESENTATION.manual };
}
