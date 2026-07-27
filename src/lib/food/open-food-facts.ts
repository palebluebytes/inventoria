import type { EntityPayload } from "../ingestion/ingest";
import { PER_100G, type NutritionInfo } from "./nutrition";
import { buildRawProvenance } from "./provenance";

// Mapper version, bumped when the OFF -> nutrition/info normalisation changes.
// OFF_BASE (the product endpoint) is defined below and reused for source_uri.
// v2: panel gains trans fat, cholesterol and unsaturated fat (mono + poly).
const ADAPTER_VERSION = "2";

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
}

export interface OFFProduct {
  code: string;
  /** v3 API uses string status: "success" | "failure" */
  status: "success" | "failure" | 0 | 1;
  product: {
    product_name?: string;
    nutriments?: OFFNutriments;
  };
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
 * Maps an Open Food Facts product response to an EntityPayload ready for
 * ingestion into the EAVT ledger. Nutrition is emitted as a single atomic
 * `nutrition/info` panel (ADR-0021), populated with whatever subset of the
 * schema.org fields the product carries.
 */
export function mapOffProductToPayload(product: OFFProduct): EntityPayload {
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

  return {
    entity: `gtin:${product.code}`,
    attributes: {
      "food/name": p.product_name || "Unknown",
      "nutrition/info": nutrition,
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
export async function lookupBarcode(barcode: string): Promise<EntityPayload> {
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
