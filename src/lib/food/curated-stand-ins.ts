import type { OFFProduct } from "./open-food-facts";

// ---------------------------------------------------------------------------
// Curated stand-ins (ADR-0046)
// ---------------------------------------------------------------------------
//
// A handful of real base ingredients exist in NO reference table — not USDA
// Foundation, SR Legacy or Survey, not CIQUAL. Cacao nibs is the founding case:
// every table carries the two halves the bean is pressed into (cocoa powder,
// cocoa butter) and not the bean, so search returned nothing and the nearest
// surviving record was wrong by 4x on the macro that dominates the food
// (research note #109).
//
// Each entry here pins such a food to ONE vetted Open Food Facts record, which
// search returns as if it were a reference food. This is an exception list
// against a coverage hole, NOT a second composition table: ADR-0045 §1 still
// governs every food USDA carries, and nothing here fills a USDA panel from a
// non-USDA value (ADR-0045 §5 forbids it and this leaves it forbidden).
//
// Three properties are load-bearing, and each is a decision recorded in ADR-0046:
//
//  - The entity is the REAL barcode and the payload comes from the ordinary OFF
//    mapper (§3), so scanning the same pack later resolves to the same twin
//    instead of minting a duplicate, and the panel stays traceable to a record
//    that can be re-fetched or refuted. There is deliberately no `curated:`
//    prefix: a manufacturer measured this food, we did not.
//  - The response is SNAPSHOTTED, never fetched at search time (§4). Search runs
//    per keystroke and OFF records are publicly editable; a live lookup would put
//    an editable third-party value and a round-trip on every search. The cost is
//    silent staleness, which `captured` makes auditable.
//  - Admission is evidential (§2): absence proven against complete archives, a
//    single-ingredient record, a panel on the cross-product consensus, and an
//    independent corroboration. `absence` and `corroboration` carry that evidence
//    with the entry rather than leaving it in the commit that added it.
//
// The list has a CEILING (§6). Reaching it is a signal to revisit CIQUAL under
// ADR-0045 §5, not a cap to raise: a curated table that grows without bound is a
// second composition table admitted one food at a time.
//
// The table sits in its own module, apart from the matching and disclosure code
// in `curated-foods.ts`, and that split is load-bearing rather than tidiness:
// `scripts/curated-snapshot-check.mjs` imports this file directly under a bare
// GitHub runner's Node — no install step, no bundler — to re-fetch each pinned
// barcode and diff it against the snapshot below (#117). That works only while
// every import here is a TYPE import: one runtime import would drag in the
// mapper, the stores, and a whole extensionless resolution chain Node will not
// follow. Keep it type-only.
// ---------------------------------------------------------------------------

/** One base food no reference table carries, pinned to a vetted OFF record. */
export interface CuratedStandIn {
  /** The food being stood in for, in the app's own words ("cacao nibs"). */
  food: string;
  /**
   * The queries that reach this entry. Lowercase phrases, matched token-wise and
   * plural-tolerantly, so "cacao nib" reaches "cacao nibs". A query whose tokens
   * EQUAL an alias's leads the results; a query that merely prefix-matches trails
   * them, so searching "cocoa" still surfaces USDA's cocoa powder first.
   */
  aliases: readonly string[];
  /** ISO date the snapshot below was captured from OFF (ADR-0046 §4). */
  captured: string;
  /** Where the food was looked for and not found (ADR-0046 §2, admission 1). */
  absence: string;
  /** What corroborates the pinned panel (ADR-0046 §2, admissions 3 and 4). */
  corroboration: string;
  /**
   * The OFF v3 response, trimmed to the fields {@link OFFProduct} declares. It is
   * fed to the same mapper a live lookup uses, so the twin is comparable with a
   * scanned one and every derived reading — NOVA, allergens, dietary tags — works
   * with no special case. `twin/raw_provenance` therefore holds this trimmed
   * capture verbatim, which is what the mapper received.
   */
  snapshot: OFFProduct;
}

/**
 * The ceiling on this list (ADR-0046 §6). Not enforced at runtime — it is a
 * review-time signal, and a test asserts it — because the decision it triggers is
 * "adopt a real second table", which no runtime check can make.
 */
export const CURATED_CEILING = 8;

export const CURATED_STAND_INS: readonly CuratedStandIn[] = [
  {
    food: "cacao nibs",
    // "cocoa beans" reaches nibs deliberately: nibs ARE the crushed, de-husked
    // bean, and OFF's own taxonomy files this product under `en:cocoa-beans`.
    // Bare "cacao"/"cocoa" is NOT an alias — it prefix-matches instead, so USDA's
    // cocoa powder keeps the lead for that query.
    aliases: ["cacao nibs", "cocoa nibs", "nibs", "cacao beans", "cocoa beans"],
    captured: "2026-08-18",
    absence:
      "Absent from USDA Foundation (363 records), SR Legacy (7,793) and Survey FNDDS (5,432), searched over the complete mirrored archives, and from CIQUAL 2025. Every table carries cocoa powder and cocoa butter — the two halves the bean is pressed into — and not the bean.",
    corroboration:
      "Median of 21 single-ingredient nib records on OFF: 633 kcal, 53 g fat, 32 g saturated, 22.4 g fibre, 13 g protein per 100 g. Independently, recombining USDA's own cocoa powder and cocoa butter at 46:54 reproduces every one of those macros (fat 53.4, saturated 31.8, fibre 20.0, protein 10.6). Energy is the one figure that does not transfer: label energy counts fibre at 4 kcal/g where USDA applies cocoa-specific Atwater factors, a ~100 kcal spread on one food.",
    snapshot: {
      code: "5400706613279",
      status: "success",
      product: {
        product_name: "Cacao Nibs",
        completeness: 0.775,
        nutriments: {
          "energy-kcal_100g": 652,
          fat_100g: 55,
          "saturated-fat_100g": 32,
          carbohydrates_100g: 29.5,
          sugars_100g: 2.5,
          fiber_100g: 27,
          proteins_100g: 12,
          sodium_100g: 0,
        },
        serving_quantity: 100,
        serving_size: "100 g",
        brands: "Purasana",
        categories: "Rauwe cacaobonen, rauwe-cacao",
        ingredients_text: "100% organic cacao nibs",
        nova_group: 1,
        nova_groups_tags: ["en:1-unprocessed-or-minimally-processed-foods"],
        nutriscore_grade: "d",
        nutrient_levels: {
          fat: "high",
          salt: "low",
          "saturated-fat": "high",
          sugars: "low",
        },
        labels_tags: [
          "en:organic",
          "en:eu-organic",
          "en:be-bio-02",
          "fr:ab-agriculture-biologique",
          "fr:triman",
        ],
        image_front_url:
          "https://images.openfoodfacts.org/images/products/540/070/661/3279/front_en.28.400.jpg",
        image_nutrition_url:
          "https://images.openfoodfacts.org/images/products/540/070/661/3279/nutrition_en.32.400.jpg",
        image_ingredients_url:
          "https://images.openfoodfacts.org/images/products/540/070/661/3279/ingredients_en.30.400.jpg",
        image_packaging_url:
          "https://images.openfoodfacts.org/images/products/540/070/661/3279/packaging_en.42.400.jpg",
      },
    },
  },
];
