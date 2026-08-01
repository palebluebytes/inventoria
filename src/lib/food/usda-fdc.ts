import type { EntityPayload } from "../ingestion/ingest";
import { getSecret } from "../stores/secrets";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  formatPortionLabel,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { buildRawProvenance } from "./provenance";

// Mapper version, bumped when the FDC -> nutrition/info normalisation changes.
// v2: energy falls back to the Atwater IDs so Foundation foods aren't 0 kcal.
// v3: carbohydrate and fiber fall back to alternate assay IDs (1050 / 2033).
// v4: panel gains trans fat (1257), cholesterol (1253) and unsaturated fat
//     (mono 1292 + poly 1293).
// v5: panel gains the twelve Nutrition-Facts micronutrients (ADR-0030), mapped
//     by nutrient id and normalised mg/µg -> g via toGrams.
// v6: emits the food-identity scalars food/category (foodCategory) and
//     food/scientific_name (scientificName) captured at search-map time (ADR-0030).
// v7: hydrateFdcFood maps the /food/{id} detail record's foodPortions[] ->
//     food/portions and refreshes twin/raw_provenance with the fuller record
//     (ADR-0030 §5). Search itself is unchanged (Foundation + SR Legacy).
const ADAPTER_VERSION = "7";
const FDC_FOOD_BASE = "https://api.nal.usda.gov/fdc/v1/food";

// Read the current key on demand (evaluated per call) from the localStorage-
// backed secrets accessor (ADR-0034 §8), rather than the EAVT ledger.
function activeUsdaKey(): string {
  return getSecret("usda_api_key");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FdcNutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
  unitName: string;
}

export interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  // The Standard Reference food number. When USDA re-samples an SR Legacy food
  // into the newer Foundation dataset the Foundation record inherits the same
  // ndbNumber, so it links the two datasets' records of one food where the
  // free-text descriptions don't (e.g. "Chia seeds, dry, raw" / "Seeds, chia
  // seeds, dried" both carry ndbNumber 12006). Optional: a rare record omits it,
  // in which case dedup falls back to the description.
  ndbNumber?: number;
  foodNutrients: FdcNutrient[];
  // Record-level food-identity metadata carried on the search hit (ADR-0030).
  // Both are optional: SR Legacy foods often omit scientificName, and either can
  // be absent, in which case the corresponding attribute is not emitted.
  foodCategory?: string;
  scientificName?: string;
}

// A single household measure on the FDC `/food/{fdcId}` detail record's
// `foodPortions[]` (ADR-0030 §5). `gramWeight` is the weight the portion
// resolves to; `amount` + `modifier`/`measureUnit` describe it (e.g. amount 1,
// modifier "cup, sliced"). `portionDescription` is a ready-made label when the
// source supplies one (often empty for Foundation/SR Legacy). All but amount and
// gramWeight are optional across datasets.
export interface FdcFoodPortion {
  amount: number;
  gramWeight: number;
  modifier?: string;
  portionDescription?: string;
  measureUnit?: { name?: string; abbreviation?: string };
}

// The `/food/{fdcId}` detail record. It is a superset of the search hit (fuller
// nutrients, record metadata) but only its `foodPortions[]` is mapped here — the
// rest is kept verbatim in provenance, not re-normalised (the nutrition panel is
// already captured at search-map time). Modelled as a subset: the extra detail
// fields ride along untyped inside the provenance blob.
export interface FdcFoodDetail {
  fdcId: number;
  description?: string;
  dataType?: string;
  foodPortions?: FdcFoodPortion[];
}

// FDC nutrient IDs mapped onto the schema.org nutrition panel. FDC reports macro
// masses in grams and sodium in milligrams; `toGrams` normalises whatever unit
// the source used so every `*_content` field is grams (ADR-0021).
// Energy (kcal). SR Legacy and Branded foods report it under 1008 ("Energy"),
// but Foundation foods omit 1008 and give only Atwater factors — 2047 (General)
// and 2048 (Specific). Prefer 1008, then Atwater General, then Specific, so
// Foundation foods (e.g. "Apples, fuji, with skin, raw") don't read 0 kcal. All
// three are kcal-valued; the kilojoule id (1062) is intentionally excluded.
const ENERGY_IDS = [1008, 2047, 2048];
/** The gram-valued panel fields (everything except serving_size and calories). */
type MassField = Exclude<keyof NutritionInfo, "serving_size" | "calories">;
// Each gram-valued field lists the FDC nutrient ids that can carry it, in
// preference order (first present wins). Several fields have more than one id
// because FDC reports the same nutrient by different assays across datasets, and
// Foundation foods sometimes carry only the newer one:
//   - carbohydrate: 1005 "by difference" (universal) vs 1050 "by summation"
//   - fiber: 1079 "total dietary" vs 2033 AOAC 2011.25 (some Foundation foods
//     report fiber ONLY under 2033 — without this they read 0 g fiber)
//   - sugars: 2000 "Total Sugars" vs the older 1063 "Sugars, total"
const MASS_NUTRIENTS: { ids: number[]; key: MassField }[] = [
  { ids: [1003], key: "protein_content" }, // Protein
  { ids: [1004], key: "fat_content" }, // Total lipid (fat)
  { ids: [1005, 1050], key: "carbohydrate_content" }, // Carbohydrate
  { ids: [1079, 2033], key: "fiber_content" }, // Fiber, total dietary
  { ids: [1258], key: "saturated_fat_content" }, // Fatty acids, total saturated
  { ids: [1257], key: "trans_fat_content" }, // Fatty acids, total trans
  { ids: [1253], key: "cholesterol_content" }, // Cholesterol (mg -> g)
  { ids: [1093], key: "sodium_content" }, // Sodium, Na (mg)
  { ids: [2000, 1063], key: "sugar_content" }, // Total sugars
  // Micronutrients — the twelve US Nutrition-Facts label vitamins and minerals
  // (ADR-0030). FDC reports these in mg (minerals, most vitamins) or µg (A, B12,
  // folate, D); toGrams normalises each to the panel's fixed gram unit.
  { ids: [1114], key: "vitamin_d" }, // Vitamin D (D2 + D3) (µg)
  { ids: [1087], key: "calcium" }, // Calcium, Ca (mg)
  { ids: [1089], key: "iron" }, // Iron, Fe (mg)
  { ids: [1092], key: "potassium" }, // Potassium, K (mg)
  { ids: [1106], key: "vitamin_a" }, // Vitamin A, RAE (µg)
  { ids: [1162], key: "vitamin_c" }, // Vitamin C, total ascorbic acid (mg)
  { ids: [1109], key: "vitamin_e" }, // Vitamin E (alpha-tocopherol) (mg)
  { ids: [1175], key: "vitamin_b6" }, // Vitamin B-6 (mg)
  { ids: [1178], key: "vitamin_b12" }, // Vitamin B-12 (µg)
  { ids: [1177], key: "folate" }, // Folate, total (µg)
  { ids: [1090], key: "magnesium" }, // Magnesium, Mg (mg)
  { ids: [1095], key: "zinc" }, // Zinc, Zn (mg)
];
// Unsaturated fat has no single FDC id: schema.org's unsaturatedFatContent is the
// sum of monounsaturated (1292) and polyunsaturated (1293) fatty acids.
const MUFA_ID = 1292;
const PUFA_ID = 1293;

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function findNutrient(
  nutrients: FdcNutrient[],
  id: number
): FdcNutrient | undefined {
  return nutrients.find((n) => n.nutrientId === id);
}

/** Normalises an FDC mass value to grams from its (case-insensitive) unit. */
function toGrams(value: number, unitName: string): number {
  switch (unitName.toUpperCase()) {
    case "MG":
      return value / 1000;
    case "UG":
    case "µG":
      return value / 1_000_000;
    default:
      return value; // G
  }
}

/**
 * Maps a USDA FoodData Central food entry to an EntityPayload ready for
 * ingestion into the EAVT ledger. Nutrition is emitted as a single atomic
 * `nutrition/info` panel (ADR-0021), populated with whatever subset of the
 * schema.org fields the food provides.
 */
export function mapFdcFoodToPayload(food: FdcFood): EntityPayload {
  const nutrition: NutritionInfo = { serving_size: PER_100G };

  for (const id of ENERGY_IDS) {
    const energy = findNutrient(food.foodNutrients, id);
    if (energy) {
      nutrition.calories = energy.value;
      break;
    }
  }

  for (const { ids, key } of MASS_NUTRIENTS) {
    for (const id of ids) {
      const n = findNutrient(food.foodNutrients, id);
      if (n) {
        nutrition[key] = toGrams(n.value, n.unitName);
        break;
      }
    }
  }

  // Unsaturated fat = mono + poly (schema.org has no separate fields). Sum
  // whatever the food carries; round to shed float noise from the addition.
  const mufa = findNutrient(food.foodNutrients, MUFA_ID);
  const pufa = findNutrient(food.foodNutrients, PUFA_ID);
  if (mufa || pufa) {
    const total =
      toGrams(mufa?.value ?? 0, mufa?.unitName ?? "G") +
      toGrams(pufa?.value ?? 0, pufa?.unitName ?? "G");
    nutrition.unsaturated_fat_content = Math.round(total * 1e6) / 1e6;
  }

  const attributes: EntityPayload["attributes"] = {
    "food/name": food.description,
    "nutrition/info": nutrition,
  };
  // Food-identity metadata (ADR-0030 §3): captured only when the source carries
  // it, so a missing field is omitted rather than emitted as empty/null.
  if (food.foodCategory) attributes["food/category"] = food.foodCategory;
  if (food.scientificName)
    attributes["food/scientific_name"] = food.scientificName;

  return {
    entity: `fdc:${food.fdcId}`,
    attributes: {
      ...attributes,
      // Keep the untouched FDC entry as immutable Provenance so any nutrient not
      // in the panel (the full micronutrient list) can be backfilled later with
      // no network re-fetch (ADR-0016).
      "twin/raw_provenance": buildRawProvenance({
        adapter: "fdc",
        adapter_version: ADAPTER_VERSION,
        source_uri: `${FDC_FOOD_BASE}/${food.fdcId}`,
        raw_data: food,
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Detail hydration: foodPortions -> food/portions (ADR-0030 §5)
// ---------------------------------------------------------------------------

/**
 * Reads the measure unit off an FDC portion: the free-text `modifier` ("medium",
 * "cup, sliced") when present, else a named `measureUnit` (FDC writes
 * "undetermined" when it has none), falling back to a generic "serving".
 */
function fdcPortionUnit(portion: FdcFoodPortion): string {
  const modifier = portion.modifier?.trim();
  if (modifier) return modifier;
  const measure = portion.measureUnit?.name?.trim();
  if (measure && measure.toLowerCase() !== "undetermined") return measure;
  return "serving";
}

/** Maps one FDC `foodPortions[]` entry to a `food/portions` {@link Portion}. */
function mapFdcPortion(portion: FdcFoodPortion): Portion {
  const unit = fdcPortionUnit(portion);
  const label =
    portion.portionDescription?.trim() ||
    formatPortionLabel(portion.amount, unit);
  return { label, amount: portion.amount, unit, grams: portion.gramWeight };
}

/**
 * Maps a USDA `/food/{fdcId}` detail record to the augmentation payload that
 * hydration appends to a staged food twin: the household `food/portions` derived
 * from `foodPortions[]`, plus a refreshed `twin/raw_provenance` holding the
 * fuller detail record (ADR-0030 §5). Pure — the Seam-1 contract point.
 *
 * It re-maps nothing else: the `nutrition/info` panel and food-identity scalars
 * were already captured at search-map time, and the detail record's nutrients
 * live on in provenance for a later backfill. When the record carries no usable
 * portions, `food/portions` is omitted (never emitted empty).
 */
export function mapFdcDetailToPayload(detail: FdcFoodDetail): EntityPayload {
  const portions = (detail.foodPortions ?? [])
    .filter((p) => p && Number.isFinite(p.gramWeight) && p.gramWeight > 0)
    .map(mapFdcPortion);

  const attributes: EntityPayload["attributes"] = {
    // Refresh Provenance with the fuller detail record (larger than the search
    // hit), so any nutrient still not in the panel can be backfilled with no
    // further re-fetch (ADR-0016).
    "twin/raw_provenance": buildRawProvenance({
      adapter: "fdc",
      adapter_version: ADAPTER_VERSION,
      source_uri: `${FDC_FOOD_BASE}/${detail.fdcId}`,
      raw_data: detail,
    }),
  };
  if (portions.length > 0) attributes[FOOD_PORTIONS_ATTR] = portions;

  return { entity: `fdc:${detail.fdcId}`, attributes };
}

/**
 * Fetches a searched food's `/food/{fdcId}` detail record and maps it to the
 * portions-and-provenance augmentation (see {@link mapFdcDetailToPayload}).
 * Called once when a searched food is staged (not per keystroke), since
 * `foodPortions` is absent from the Foundation/SR Legacy search response
 * (ADR-0030 §5). Search itself stays the cheap prefix query.
 *
 * @param fdcId  - The FDC id of the staged food.
 * @param apiKey - USDA FDC API key. Defaults to the configured key.
 */
export async function hydrateFdcFood(
  fdcId: number,
  apiKey: string = activeUsdaKey()
): Promise<EntityPayload> {
  if (!apiKey) {
    throw new Error("USDA API Key is not configured.");
  }
  const url = `${FDC_FOOD_BASE}/${fdcId}?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 403)
      throw new Error("USDA API rejected the key. Check it in Settings.");
    if (res.status === 429)
      throw new Error("USDA API rate limit reached. Try again shortly.");
    throw new Error(`USDA API request failed (${res.status}).`);
  }
  const detail: FdcFoodDetail = await res.json();
  return mapFdcDetailToPayload(detail);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1/foods/search";

/**
 * Turns a free-text query into an FDC prefix search. FDC matches whole words,
 * so a fragment like "bana" matches nothing on the small Foundation/SR Legacy
 * datasets; appending a Lucene "*" wildcard to each token makes it prefix-match
 * ("bana" -> "bana*"), so results appear while the user is still typing.
 */
function toPrefixQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((token) => (token.endsWith("*") ? token : `${token}*`))
    .join(" ");
}

/**
 * Searches the USDA FoodData Central API and returns matching foods as
 * EntityPayloads.
 *
 * @param query  - Free-text search query (e.g. "banana").
 * @param apiKey - USDA FDC API key. Defaults to VITE_USDA_FDC_API_KEY env var.
 */
export async function searchFdc(
  query: string,
  apiKey: string = activeUsdaKey()
): Promise<EntityPayload[]> {
  if (!apiKey) {
    throw new Error("USDA API Key is not configured.");
  }
  const search = encodeURIComponent(toPrefixQuery(query));
  const url = `${FDC_BASE}?query=${search}&dataType=Foundation,SR%20Legacy&api_key=${apiKey}`;
  const res = await fetch(url);
  // A failed request (bad/expired key -> 403, exhausted quota -> 429, outage ->
  // 5xx) returns a body with no `foods` field. Without this guard that collapses
  // to an empty result set and surfaces as "No foods found", masking the real
  // cause; distinguish the common failures so the user can act on them.
  if (!res.ok) {
    if (res.status === 403)
      throw new Error("USDA API rejected the key. Check it in Settings.");
    if (res.status === 429)
      throw new Error("USDA API rate limit reached. Try again shortly.");
    throw new Error(`USDA API request failed (${res.status}).`);
  }
  const data: { foods: FdcFood[] } = await res.json();

  // Deduplicate by USDA food identity (ndbNumber), preferring Foundation over
  // SR Legacy. Keying on ndbNumber — not the description — collapses the two
  // records USDA carries for one food across the Foundation and SR Legacy
  // datasets, whose descriptions it rewrites between them (e.g. chia's "Chia
  // seeds, dry, raw" vs "Seeds, chia seeds, dried", both ndbNumber 12006).
  const foodMap = new Map<string | number, FdcFood>();
  for (const food of data.foods ?? []) {
    // Fall back to the description for the rare record with no ndbNumber, so it
    // still dedups exactly as before rather than colliding on `undefined`. Use
    // `??` (not `||`) and a `desc:` prefix so a numeric id and a description key
    // can never collide.
    const key =
      food.ndbNumber ?? `desc:${food.description.toLowerCase().trim()}`;
    const existing = foodMap.get(key);
    if (!existing) {
      foodMap.set(key, food);
    } else if (
      existing.dataType === "SR Legacy" &&
      food.dataType === "Foundation"
    ) {
      // Replace an SR Legacy record with the Foundation re-sample of the same
      // food; its natural-language description also survives as a nicety.
      foodMap.set(key, food);
    }
  }

  const uniqueFoods = Array.from(foodMap.values());

  // FDC matches the wildcarded tokens with OR semantics, so "soy milk" also
  // returns foods that match only one word — and FDC's own relevance can float
  // one of those above the real thing (e.g. "Beverages, rice milk" outranking
  // "Soy milk"). Re-rank so foods whose name contains EVERY query token come
  // first, then apply the raw-food preference within each group. Array.sort is
  // stable, so FDC's relevance order is preserved on ties.
  const queryTokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/\*+$/, ""))
    .filter(Boolean);

  // Every token prefix-matches some word in the name (mirrors the "*" search).
  const matchesAllTokens = (desc: string): boolean => {
    const words = desc
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    return queryTokens.every((t) => words.some((w) => w.startsWith(t)));
  };

  // Raw-food preference: "Bananas, raw" (score 3) over "Bananas, overripe, raw"
  // (score 2) over anything merely containing "raw" (1) over the rest (0).
  const rawScore = (desc: string): number => {
    const d = desc.toLowerCase().trim();
    if (d.endsWith(", raw")) {
      const commas = (d.match(/,/g) || []).length;
      return commas === 1 ? 3 : 2;
    }
    return /\braw\b/.test(d) ? 1 : 0;
  };

  // All-tokens match dominates (weight 10 > max rawScore of 3), so a full-name
  // match always outranks a partial one regardless of how "raw" it is.
  const score = (desc: string): number =>
    (matchesAllTokens(desc) ? 10 : 0) + rawScore(desc);

  uniqueFoods.sort((a, b) => score(b.description) - score(a.description));

  return uniqueFoods.map(mapFdcFoodToPayload);
}
