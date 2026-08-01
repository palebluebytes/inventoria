import type { EntityPayload } from "../ingestion/ingest";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { buildRawProvenance } from "./provenance";

// Mapper version, bumped when the OFF -> nutrition/info normalisation changes.
// OFF_BASE (the product endpoint) is defined below and reused for source_uri.
// v2: panel gains trans fat, cholesterol and unsaturated fat (mono + poly).
// v3: panel gains the twelve Nutrition-Facts micronutrients (ADR-0030), read
//     from the `*_100g` nutriments (OFF already reports these in grams).
// v4: emits food/category (categories), food/ingredients_text (ingredients_text),
//     twin/brand (brands) and the OFF-only food/assessment blob (ADR-0030 §4).
// v5: emits a single food/portions entry from serving_quantity/serving_size
//     when the product carries serving data (ADR-0030 §2/§5).
const ADAPTER_VERSION = "5";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Open Food Facts reports every nutriment per 100 g already in the panel's
// fixed units (macros in grams, energy in kcal, sodium in grams), so the values
// map straight across with no conversion.
export interface OFFNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  sodium_100g?: number;
  "saturated-fat_100g"?: number;
  "trans-fat_100g"?: number;
  cholesterol_100g?: number;
  "monounsaturated-fat_100g"?: number;
  "polyunsaturated-fat_100g"?: number;
  // Micronutrients — the twelve US Nutrition-Facts label vitamins and minerals
  // (ADR-0030). OFF reports each `*_100g` already in grams, so they map straight
  // across with no conversion. Folate is OFF's `vitamin-b9`.
  "vitamin-d_100g"?: number;
  calcium_100g?: number;
  iron_100g?: number;
  potassium_100g?: number;
  "vitamin-a_100g"?: number;
  "vitamin-c_100g"?: number;
  "vitamin-e_100g"?: number;
  "vitamin-b6_100g"?: number;
  "vitamin-b12_100g"?: number;
  "vitamin-b9_100g"?: number;
  magnesium_100g?: number;
  zinc_100g?: number;
}

/**
 * Open Food Facts' consumer-facing assessment signals, captured as one atomic
 * `food/assessment` blob (ADR-0030 §4). OFF-only — no schema.org counterpart.
 * Every sub-field is optional: the mapper carries across only what the product
 * reports, so a product with only a Nutri-Score yields `{ nutri_score }`.
 */
export interface FoodAssessment {
  nova_group?: number;
  nutri_score?: string;
  eco_score?: string;
  nutrient_levels?: Record<string, string>;
  allergens?: string[];
  additives?: string[];
  labels?: string[];
}

export interface OFFProduct {
  code: string;
  /** v3 API uses string status: "success" | "failure" */
  status: "success" | "failure" | 0 | 1;
  product: {
    product_name?: string;
    /**
     * OFF's own data-quality score for the record (0–1). Surfaced read-through
     * by the mapper so the found-but-poor predicate can use it as a corroborator
     * for a short generic name (ADR-0034 §1); a record-level signal, not a
     * nutriment. Absent on sparse records.
     */
    completeness?: number;
    nutriments?: OFFNutriments;
    // Serving data (ADR-0030 §2/§5). OFF normalises `serving_quantity` to grams;
    // `serving_size` is the human label ("15 g", "1 portion (37 g)"). Either can
    // be absent, in which case no food/portions entry is emitted.
    serving_quantity?: number | string;
    serving_size?: string;
    // Record-level source signals (ADR-0030 §4). All optional; a missing field
    // is omitted from the payload rather than emitted as empty/null.
    brands?: string;
    categories?: string;
    ingredients_text?: string;
    nova_group?: number;
    nutriscore_grade?: string;
    ecoscore_grade?: string;
    nutrient_levels?: Record<string, string>;
    allergens_tags?: string[];
    additives_tags?: string[];
    labels_tags?: string[];
  };
}

/**
 * The mapper's return: a normal {@link EntityPayload} carrying OFF's
 * `completeness` as a READ-THROUGH sibling of `attributes` (ADR-0034 §1). It is
 * deliberately NOT an attribute — `ingestEntity` only flattens `attributes`, so
 * completeness never becomes a datom; it rides the return value purely so the
 * found-but-poor predicate can read it from the freshly-looked-up payload.
 */
export interface OffPayload extends EntityPayload {
  completeness?: number;
}

export class ProductNotFoundError extends Error {
  constructor(barcode: string) {
    super(`Product not found for barcode: ${barcode}`);
    this.name = "ProductNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * Builds a food's `food/portions` list from OFF's serving fields (ADR-0030 §5).
 * OFF offers exactly one serving, so the list is 0 or 1 long: a single portion
 * that resolves to `serving_quantity` grams, labelled by `serving_size` (falling
 * back to a generic "1 serving" when the label is absent). Returns an empty list
 * — never a zero-gram portion — when there is no usable serving weight, so the
 * caller omits the attribute rather than emitting an empty one.
 */
function offPortions(
  serving_quantity: number | string | undefined,
  serving_size: string | undefined
): Portion[] {
  const grams =
    typeof serving_quantity === "string"
      ? Number(serving_quantity)
      : serving_quantity;
  if (grams == null || !Number.isFinite(grams) || grams <= 0) return [];
  const label = serving_size?.trim() || "1 serving";
  return [{ label, amount: 1, unit: "serving", grams }];
}

/**
 * Maps an Open Food Facts product response to an EntityPayload ready for
 * ingestion into the EAVT ledger. Nutrition is emitted as a single atomic
 * `nutrition/info` panel (ADR-0021), populated with whatever subset of the
 * schema.org fields the product carries.
 */
export function mapOffProductToPayload(product: OFFProduct): OffPayload {
  const p = product.product;
  const n = p.nutriments ?? {};

  const nutrition: NutritionInfo = { serving_size: PER_100G };
  const set = (value: number | undefined, key: keyof NutritionInfo) => {
    if (value != null) (nutrition[key] as number) = value;
  };
  set(n["energy-kcal_100g"], "calories");
  set(n.proteins_100g, "protein_content");
  set(n.fat_100g, "fat_content");
  set(n.carbohydrates_100g, "carbohydrate_content");
  set(n.fiber_100g, "fiber_content");
  set(n.sugars_100g, "sugar_content");
  set(n.sodium_100g, "sodium_content");
  set(n["saturated-fat_100g"], "saturated_fat_content");
  set(n["trans-fat_100g"], "trans_fat_content");
  set(n.cholesterol_100g, "cholesterol_content");
  // schema.org unsaturatedFatContent = mono + poly. Sum whatever OFF carries.
  const mono = n["monounsaturated-fat_100g"];
  const poly = n["polyunsaturated-fat_100g"];
  if (mono != null || poly != null) {
    // Round to shed float noise from the addition.
    nutrition.unsaturated_fat_content =
      Math.round(((mono ?? 0) + (poly ?? 0)) * 1e6) / 1e6;
  }
  // Micronutrients (ADR-0030) — OFF reports each `*_100g` already in grams.
  set(n["vitamin-d_100g"], "vitamin_d");
  set(n.calcium_100g, "calcium");
  set(n.iron_100g, "iron");
  set(n.potassium_100g, "potassium");
  set(n["vitamin-a_100g"], "vitamin_a");
  set(n["vitamin-c_100g"], "vitamin_c");
  set(n["vitamin-e_100g"], "vitamin_e");
  set(n["vitamin-b6_100g"], "vitamin_b6");
  set(n["vitamin-b12_100g"], "vitamin_b12");
  set(n["vitamin-b9_100g"], "folate");
  set(n.magnesium_100g, "magnesium");
  set(n.zinc_100g, "zinc");

  const attributes: EntityPayload["attributes"] = {
    "food/name": p.product_name || "Unknown",
    "nutrition/info": nutrition,
  };
  // Record-level source signals (ADR-0030 §4). Each is emitted only when the
  // product carries it, so a missing field is omitted (never empty/null).
  if (p.brands) attributes["twin/brand"] = p.brands;
  if (p.categories) attributes["food/category"] = p.categories;
  if (p.ingredients_text)
    attributes["food/ingredients_text"] = p.ingredients_text;

  // The OFF-only consumer assessments, gathered into one atomic blob. Only the
  // sub-fields the product carries are included; an assessment with no populated
  // sub-field is dropped entirely rather than emitted empty.
  const assessment: FoodAssessment = {};
  if (p.nova_group != null) assessment.nova_group = p.nova_group;
  if (p.nutriscore_grade) assessment.nutri_score = p.nutriscore_grade;
  if (p.ecoscore_grade) assessment.eco_score = p.ecoscore_grade;
  if (p.nutrient_levels && Object.keys(p.nutrient_levels).length > 0)
    assessment.nutrient_levels = p.nutrient_levels;
  if (p.allergens_tags?.length) assessment.allergens = p.allergens_tags;
  if (p.additives_tags?.length) assessment.additives = p.additives_tags;
  if (p.labels_tags?.length) assessment.labels = p.labels_tags;
  if (Object.keys(assessment).length > 0)
    attributes["food/assessment"] = assessment;

  // Household portion (ADR-0030 §2/§5). OFF's single product response already
  // carries the serving, so no second network call: map serving_quantity (grams)
  // to one food/portions entry, labelled by serving_size when present. Omitted
  // entirely when the product reports no usable serving weight.
  const portions = offPortions(p.serving_quantity, p.serving_size);
  if (portions.length > 0) attributes[FOOD_PORTIONS_ATTR] = portions;

  return {
    entity: `gtin:${product.code}`,
    // Read-through (never a datom, see {@link OffPayload}): only OFF's numeric
    // completeness rides along, so the poor-quality predicate can corroborate a
    // short generic name without a network re-fetch.
    completeness:
      typeof p.completeness === "number" ? p.completeness : undefined,
    attributes: {
      ...attributes,
      // Keep the untouched OFF response as immutable Provenance so nutriments
      // beyond the eight panel fields can be backfilled later with no network
      // re-fetch (ADR-0016).
      "twin/raw_provenance": buildRawProvenance({
        adapter: "off",
        adapter_version: ADAPTER_VERSION,
        source_uri: `${OFF_BASE}/${product.code}.json`,
        raw_data: product,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const OFF_BASE = "https://world.openfoodfacts.org/api/v3/product";

/**
 * Fetches product data from the Open Food Facts API for a given barcode and
 * returns it as an EntityPayload.
 *
 * @throws ProductNotFoundError when the product is not in the OFF database.
 */
export async function lookupBarcode(barcode: string): Promise<OffPayload> {
  const res = await fetch(`${OFF_BASE}/${barcode}.json`);

  // v3 returns HTTP 404 for unknown barcodes (empty body), catch it first
  if (!res.ok) {
    throw new ProductNotFoundError(barcode);
  }

  const data: OFFProduct = await res.json();

  // v3 uses string "failure"; v2 used integer 0 — handle both
  if (data.status === "failure" || data.status === 0) {
    throw new ProductNotFoundError(barcode);
  }

  return mapOffProductToPayload(data);
}

// ---------------------------------------------------------------------------
// V2 STUB: Submit to Open Food Facts
// ---------------------------------------------------------------------------

/**
 * V2 Feature Stub: Submits manually entered product data back to the Open Food
 * Facts database to contribute to the global dataset.
 */
export async function submitToOpenFoodFacts(
  barcode: string,
  details: {
    name: string;
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  }
): Promise<boolean> {
  console.info(
    `[V2 STUB] submitToOpenFoodFacts called for barcode: ${barcode}`,
    details
  );

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  // In a real implementation, this would use the OFF v3 product write API
  // https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-write/
  console.info("[V2 STUB] Successfully simulated submission to OFF.");

  return true;
}
