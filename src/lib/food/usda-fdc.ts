import type { EntityPayload } from "../ingestion/ingest";
import { getSecret } from "../stores/secrets";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  formatPortionLabel,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { buildRawProvenance, type MergedSource } from "./provenance";
import {
  compileReferenceFoodQuery,
  compareRelevance,
  readReferenceFoodName,
} from "./reference-food-ranking";

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
//     (ADR-0030 §5). The search dataset stays Foundation + SR Legacy; its
//     filtering, ranking and query-weighting are ADR-0042.
// v8: when Foundation and SR Legacy carry the same ndbNumber, search MERGES the
//     pair fill-only instead of discarding the SR Legacy twin (ADR-0045 §2):
//     Foundation stays the base record and the twin supplies only the panel
//     fields it does not carry. Borrowed values are named in
//     twin/raw_provenance.merged_from (§4).
// Exported so `usda-corpus.ts` stamps a bundled row with the SAME adapter
// identity: a Search index row is this adapter's output, generated ahead of time
// rather than mapped live, and a second version string would let the two drift.
export const ADAPTER_VERSION = "8";
export const FDC_FOOD_BASE = "https://api.nal.usda.gov/fdc/v1/food";

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

/** A field of the emitted panel — everything except the fixed serving basis. */
type PanelField = Exclude<keyof NutritionInfo, "serving_size">;

// Every panel field with the FDC nutrient ids that can carry it. This is the
// granularity the twin merge works at (ADR-0045 §3): a field carried by more
// than one id (energy 1008/2047/2048, carbohydrate 1005/1050, sugars 2000/1063)
// counts as PRESENT under any of them, so a Foundation food that reports energy
// only as Atwater factors never borrows SR Legacy's 1008 and stays coherent with
// the macros shown beside it. Exported because `scripts/usda-coverage.mjs`
// measures the bulk archives against the same ids and is checked against these.
export const PANEL_FIELDS: readonly {
  key: PanelField;
  ids: readonly number[];
}[] = [
  { key: "calories", ids: ENERGY_IDS },
  ...MASS_NUTRIENTS,
  // Present-if-either, matching the rule above: a base record carrying only MUFA
  // keeps its own partial sum rather than mixing in the twin's PUFA.
  { key: "unsaturated_fat_content", ids: [MUFA_ID, PUFA_ID] },
];

/** True when `food` reports the panel field under any of the ids that carry it. */
function hasPanelField(food: FdcFood, ids: readonly number[]): boolean {
  return ids.some((id) => findNutrient(food.foodNutrients, id) !== undefined);
}

/**
 * Fills the panel fields `base` does not carry from `twin`, and reports which
 * fields were borrowed (ADR-0045 §2/§3).
 *
 * Fill-only: a value `base` already reports is NEVER overwritten, because the
 * Foundation assay is the newer measurement. The base record's identity —
 * fdcId, description, category, scientific name — is untouched, so the merged
 * food keeps its own entity id.
 */
function fillFromTwin(
  base: FdcFood,
  twin: FdcFood
): { food: FdcFood; filled_fields: PanelField[] } {
  const borrowed: FdcNutrient[] = [];
  const filled_fields: PanelField[] = [];

  for (const { key, ids } of PANEL_FIELDS) {
    if (hasPanelField(base, ids)) continue;
    const donors = ids
      .map((id) => findNutrient(twin.foodNutrients, id))
      .filter((n): n is FdcNutrient => n !== undefined);
    if (donors.length === 0) continue;
    // Every donor id is appended, not just the first: the mapper's own
    // preference order still picks the winner, and unsaturated fat genuinely
    // needs both of its ids.
    borrowed.push(...donors);
    filled_fields.push(key);
  }

  if (borrowed.length === 0) return { food: base, filled_fields };
  return {
    food: { ...base, foodNutrients: [...base.foodNutrients, ...borrowed] },
    filled_fields,
  };
}

/**
 * The key one USDA food identity is collected under: `ndbNumber` where a record
 * carries one, else its description behind a `desc:` prefix so a numeric id and
 * a description can never collide.
 *
 * Keying on `ndbNumber` rather than on the description is what collects the two
 * records USDA holds for one food across Foundation and SR Legacy, whose
 * free-text descriptions it rewrites between them (e.g. "Chia seeds, dry, raw"
 * and "Seeds, chia seeds, dried", both ndbNumber 12006). The `??` is deliberate
 * where `||` is not: a record with no `ndbNumber` groups by description rather
 * than colliding with every other record that lacks one.
 *
 * Exported alongside {@link resolveFdcGroup} because `scripts/usda-bundle.mjs`
 * pairs the twins over the bulk archives (ADR-0047 §2), and the key that decides
 * WHICH records merge has to be the same one search uses.
 */
export function fdcIdentityKey(food: FdcFood): string | number {
  return food.ndbNumber ?? `desc:${food.description.toLowerCase().trim()}`;
}

/** A search hit after its same-food siblings have been folded into it. */
export interface ResolvedFdcFood {
  food: FdcFood;
  /** The twins that filled gaps, for provenance. Empty when nothing merged. */
  merged_from: MergedSource[];
}

/**
 * Folds every record USDA returned for one food identity into a single result:
 * the Foundation re-sample is the base (its newer assay and natural-language
 * description win), and the remaining records fill only the panel fields it
 * lacks (ADR-0045 §2).
 *
 * Order-independent by construction — the base is chosen by data type, not by
 * arrival — so the merged food does not depend on the order FDC happened to
 * return the group in.
 *
 * Exported because `scripts/usda-bundle.mjs` precomputes the same merge over the
 * bulk archives (ADR-0047 §2). It runs the merge through this function rather
 * than restating it, so the bundled row and a live search can never disagree
 * about which field came from which record.
 */
export function resolveFdcGroup(group: readonly FdcFood[]): ResolvedFdcFood {
  const base = group.find((f) => f.dataType === "Foundation") ?? group[0];
  const merged_from: MergedSource[] = [];
  let food = base;

  for (const twin of group) {
    if (twin === base) continue;
    const { food: filled, filled_fields } = fillFromTwin(food, twin);
    if (filled_fields.length === 0) continue;
    food = filled;
    merged_from.push({
      source_uri: `${FDC_FOOD_BASE}/${twin.fdcId}`,
      description: twin.description,
      data_type: twin.dataType,
      filled_fields,
    });
  }

  return { food, merged_from };
}

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
 *
 * @param food        - The search hit, already merged with any same-food twin.
 * @param merged_from - Twins that filled gaps in `food`, named in provenance so
 *                      a borrowed value stays distinguishable from a measured
 *                      one (ADR-0045 §4). Omitted when nothing was merged.
 */
export function mapFdcFoodToPayload(
  food: FdcFood,
  merged_from: readonly MergedSource[] = []
): EntityPayload {
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
        merged_from,
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
 * Maps a record's `foodPortions[]` to the ordered `food/portions` value, dropping
 * every entry that resolves to no usable weight — a portion whose grams are
 * missing, zero or non-finite names a measure the app cannot scale by.
 *
 * Exported because `scripts/usda-bundle.mjs` runs this at generation time
 * (ADR-0047 §6): the bulk archives carry the portions the search response omits,
 * so a bundled row ships the mapped {@link Portion} list rather than USDA's raw
 * measures, and the generated artifact cannot drift from what hydration mapped.
 */
export function mapFdcPortions(portions: readonly FdcFoodPortion[]): Portion[] {
  return portions
    .filter((p) => p && Number.isFinite(p.gramWeight) && p.gramWeight > 0)
    .map(mapFdcPortion);
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
 *
 * `merged_from` is the staged food's own merge reference, passed back in so the
 * refreshed provenance keeps naming the twin whose values the panel carries.
 */
export function mapFdcDetailToPayload(
  detail: FdcFoodDetail,
  merged_from: readonly MergedSource[] = []
): EntityPayload {
  const portions = mapFdcPortions(detail.foodPortions ?? []);

  const attributes: EntityPayload["attributes"] = {
    // Refresh Provenance with the fuller detail record (larger than the search
    // hit), so any nutrient still not in the panel can be backfilled with no
    // further re-fetch (ADR-0016).
    "twin/raw_provenance": buildRawProvenance({
      adapter: "fdc",
      adapter_version: ADAPTER_VERSION,
      source_uri: `${FDC_FOOD_BASE}/${detail.fdcId}`,
      raw_data: detail,
      // Carried through, not re-derived: the detail record is Foundation's
      // alone, so without this the refreshed blob would silently drop the twin
      // that supplied the panel's borrowed fields (ADR-0045 §4).
      merged_from,
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
 * @param fdcId       - The FDC id of the staged food.
 * @param merged_from - The staged food's merge reference (ADR-0045 §4), echoed
 *                      into the refreshed provenance so hydration does not drop
 *                      it. Empty for a food that merged nothing.
 * @param apiKey      - USDA FDC API key. Defaults to the configured key.
 */
export async function hydrateFdcFood(
  fdcId: number,
  merged_from: readonly MergedSource[] = [],
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
  return mapFdcDetailToPayload(detail, merged_from);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1/foods/search";

// ---------------------------------------------------------------------------
// Brand exclusion
//
// SR Legacy (a frozen, discontinued USDA dataset) bakes brand names directly
// into otherwise-generic descriptions — "Grapefruit juice, white, bottled,
// unsweetened, OCEAN SPRAY" — with NO structured brand field to filter on
// (brandOwner / brandName / gtinUpc are all null on these records). USDA's
// editorial convention renders those brands in ALL CAPS, so an all-caps token
// is the only available signal. We drop such records so generic whole foods win
// the search.
//
// Brands belong to the OFF barcode path, never to the USDA base-ingredient
// search, so a branded record is ALWAYS dropped — even when the query names the
// brand. (An earlier query-aware rescue leaked lookalikes: "apple" kept
// APPLEBEE'S, "almond" kept ALMOND JOY, because a generic food word capitalised
// inside a brand name matched the query.)
//
// Precision comes first — never drop a real food. Validated against the entire
// 7,793-record SR Legacy corpus: 901 records dropped, 0 of them generic foods
// (the sole raw casualty is "Kiwifruit, ZESPRI SunGold, raw", and generic kiwi
// remains). Three guards keep it precise:
//   1. a trigger needs >=3 letters, so 2-letter units and state codes never
//      match ("US", "LB", and "Beef, short loin (NY strip steak), raw");
//   2. generic all-caps acronyms are stoplisted (USDA commodity foods; DHA/ARA
//      in infant formula; NFS/BBQ; capitalised stopwords);
//   3. USDA's generic "assorted brands" composites name a brand as an example
//      ("Cereals, farina, enriched, assorted brands including CREAM OF WHEAT")
//      but are themselves generic — a small safelist keeps them. Trademarked
//      products in their own right (Cream of Wheat, Cream of Rice) are dropped.
// ---------------------------------------------------------------------------

const BRAND_CAPS = /\b[A-Z][A-Z&'.\-]*[A-Z]\b/g;

const GENERIC_CAPS_ACRONYMS = new Set([
  "USDA",
  "USA",
  "DHA",
  "ARA",
  "NFS",
  "NFSMI",
  "BBQ",
  "LGG",
  "TLC",
  "NOS",
  "EPA",
  "MSG",
  "UHT",
  "RTE",
  "RTD",
  "GMO",
  "THE",
  "AND",
  "WITH",
  "OVER",
]);

// USDA's generic "assorted brands" composites name a specific brand only as an
// example ("...assorted brands including CREAM OF WHEAT") yet are themselves
// generic, so keep them. Matched as a lowercased substring. Note this does NOT
// safelist the trademarked products in their own right ("Cereals, CREAM OF
// WHEAT, dry"), which are dropped like any other brand.
const GENERIC_FOOD_SAFELIST = ["assorted brands"];

// Trademarked products whose name is built entirely from otherwise-generic
// words ("cream", "wheat"). The all-caps token check below can't tell these from
// a real food, so drop them unconditionally. Matched as a lowercased substring,
// after the safelist above (so the generic "assorted brands" farina that merely
// names one is still kept).
const TRADEMARK_DENYLIST = ["cream of wheat", "cream of rice"];

/**
 * True when an FDC description names a specific brand — an ALL-CAPS token that is
 * not a generic acronym and not a safelisted generic food. Used to drop
 * brand-specific SR Legacy records so generic whole foods win the search; brands
 * belong to the OFF scan path. See the block comment above for the precision
 * guards and the corpus validation.
 */
export function isBrandSpecific(description: string): boolean {
  const lower = description.toLowerCase();
  if (GENERIC_FOOD_SAFELIST.some((phrase) => lower.includes(phrase)))
    return false;
  if (TRADEMARK_DENYLIST.some((phrase) => lower.includes(phrase))) return true;

  return (description.match(BRAND_CAPS) ?? []).some(
    (token) =>
      token.replace(/[^A-Z]/g, "").length >= 3 &&
      !GENERIC_CAPS_ACRONYMS.has(token)
  );
}

// ---------------------------------------------------------------------------
// Processed-product exclusion
//
// The USDA search is for un-barcoded BASE ingredients; a packaged/processed food
// (canned grapes, grape soda, juice drink, fruit cocktail) carries a barcode and
// belongs to the Open Food Facts scan path instead. Drop those so a food search
// returns raw and minimally-processed base foods.
//
// The markers are packaging/processing states — NOT cooking states — so generic
// cooked/roasted staples survive, and base foods that never carry "raw" (cheese,
// oil, spices, flour) stay findable (that's why this is narrower than a raw-only
// filter, which would drop those entirely). Two guards keep it precise:
//   - a food described "raw" is always a base ingredient and is never dropped,
//     even retail cuts sold frozen ("Lamb, … frozen, … raw");
//   - "carbonated" (not "soda") marks fizzy drinks, so "baking soda" survives.
// ---------------------------------------------------------------------------

const PROCESSED_MARKERS =
  /\b(canned|frozen|bottled|sweetened|syrup|drink|carbonated|concentrate|babyfood|cocktail|dehydrated|instant|ready-to-eat|juice)\b/i;

/**
 * True when an FDC description names a packaged/processed product (a barcode-
 * bearing form handled by the OFF scan path) rather than a base ingredient.
 * Foods described as "raw" are always treated as base ingredients. See the block
 * comment above for the marker set and its guards.
 */
export function isProcessedProduct(description: string): boolean {
  if (/\braw\b/.test(description.toLowerCase())) return false;
  return PROCESSED_MARKERS.test(description);
}

// ---------------------------------------------------------------------------
// Prepared-food exclusion
//
// Some prepared/composite foods carry no brand and no packaging marker yet are
// plainly not base ingredients — "Candies, milk chocolate, with almonds",
// "Cookies, …", "Potato salad, home-prepared". Two signals drop them:
//
// 1. foodCategory — USDA files each food under a structured category, so the
//    categories that are wholly prepared are dropped outright. Beverages is NOT
//    among them: generic coffee/tea/water are reference foods worth keeping, and
//    the packaged drinks (soda, juice, ready-to-drink) already fall to the
//    brand/marker filters.
// 2. Composite-dish description markers — home-prepared dishes leak into base
//    categories ("Potato salad" is filed under Vegetables), so catch them by
//    description regardless of category.
//
// Two categories are mixed and split by the food's head word rather than dropped
// wholesale:
//   - "Sweets" holds confections (candies, chocolate, jams) AND single-ingredient
//     pantry sweeteners (honey, sugar, cocoa, molasses, syrup); only the
//     confections are dropped.
//   - "Baked Products" holds bready staples (bread, croissant, bagel, tortilla,
//     English muffin, biscuit) AND sweet treats (cake, cookies, doughnuts, pie);
//     only the treats are dropped, so a reference food like a croissant stays.
// Both keep their staples consistent with keeping oil, flour and spices.
// ---------------------------------------------------------------------------

const PREPARED_CATEGORIES = new Set([
  "Soups, Sauces, and Gravies",
  "Sausages and Luncheon Meats",
  "Breakfast Cereals",
  "Fast Foods",
  "Restaurant Foods",
  "Meals, Entrees, and Side Dishes",
  "Snacks",
  "Baby Foods",
]);

// Composite/prepared dishes that leak into base categories (e.g. "Potato salad"
// under Vegetables, "Chicken … cooked, fried, flour" under Poultry). Matched by
// description regardless of category. The breaded/battered/deep-fried markers
// catch fried DISHES (breaded fried chicken, french fries, breaded fish) while
// leaving simple cooked preparations alone — a plain fried egg, pan-fried meat
// or stir-fried mushroom is a reference food like a scrambled egg or a roast, so
// bare "fried" is NOT a marker; the flour/batter/breading coating is the signal
// (see the fried+flour rule in isPreparedProduct). No ", raw" food carries any
// of these words. ("home recipe" catches "crab cakes, home recipe"; distinct
// from a bread's "prepared from recipe", which is deliberately NOT a marker.)
const PREPARED_DISH_MARKERS =
  /\b(home[- ](?:prepared|recipe)|au gratin|scalloped|breaded|breading|batter|french[- ]fried)\b/i;
// "salad" names a dish ("Potato salad") — but also a use for a base cooking oil
// ("Oil, olive, salad or cooking"), which must NOT be dropped.
const SALAD_DISH = /\bsalad\b/i;
const SALAD_AS_OIL_USE =
  /salad (?:or|and) cooking|cooking (?:or|and) salad|salad oil/i;

// Head words of the single-ingredient sweeteners in the mixed "Sweets" category
// that are base pantry staples, kept while the confections around them go.
const SWEETENER_HEADS = new Set([
  "honey",
  "sugar",
  "sugars",
  "syrup",
  "syrups",
  "molasses",
  "cocoa",
  "sweeteners",
]);

// Head words of the bready staples in the mixed "Baked Products" category that
// are reference foods, kept while the sweet treats (cake, cookies, doughnuts,
// pie) are dropped. "english" catches "English muffins"; plain "muffins" (corn,
// blueberry) are treats and stay out.
const BAKED_STAPLE_HEADS = new Set([
  "bread",
  "breads",
  "bagel",
  "bagels",
  "croissant",
  "croissants",
  "tortilla",
  "tortillas",
  "roll",
  "rolls",
  "bun",
  "buns",
  "biscuit",
  "biscuits",
  "pita",
  "naan",
  "english",
]);

/** The first alphanumeric word of a description, lowercased ("" if none). */
function headWord(description: string): string {
  return (
    description
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)[0] ?? ""
  );
}

/**
 * True when an FDC record is a prepared/composite food rather than a base
 * ingredient — by its foodCategory (wholly-prepared categories) or by a
 * composite-dish marker in its description (a home-prepared dish filed under a
 * base category, like "Potato salad"). The mixed "Sweets" and "Baked Products"
 * categories keep their staples (sweeteners; bready reference foods) and drop
 * the rest. See the block comment above.
 */
export function isPreparedProduct(
  foodCategory: string | undefined,
  description: string
): boolean {
  if (PREPARED_DISH_MARKERS.test(description)) return true;
  // Flour-battered deep-fried dishes ("Chicken … cooked, fried, flour"). Needs
  // both words, so a plain fried egg is kept and plain flour is not touched.
  if (
    /\bfried\b/.test(description.toLowerCase()) &&
    /\bflour\b/.test(description.toLowerCase())
  )
    return true;
  if (SALAD_DISH.test(description) && !SALAD_AS_OIL_USE.test(description))
    return true;
  if (!foodCategory) return false;
  if (PREPARED_CATEGORIES.has(foodCategory)) return true;
  if (foodCategory === "Sweets")
    return !SWEETENER_HEADS.has(headWord(description));
  if (foodCategory === "Baked Products")
    return !BAKED_STAPLE_HEADS.has(headWord(description));
  return false;
}

/**
 * Builds the FDC Lucene query for a free-text search. Two parts:
 *
 *  1. The tokens as typed AND a wildcard prefix on each ("bana" -> "bana bana*").
 *     FDC matches whole words, so a fragment matches nothing on the small
 *     Foundation/SR Legacy datasets without the "*"; the wildcard is what makes
 *     results appear while typing.
 *
 *     The bare term has to ride along because FDC's description index is
 *     STEMMED and a wildcard term is matched literally, against the stored
 *     terms, never through the analyser. So a word whose stem differs from what
 *     the user typed is unreachable by wildcard alone: "balsamic" is indexed as
 *     "balsam", `balsamic*` matches nothing, and searching balsamic returned no
 *     balsamic vinegar. The bare token goes through the analyser, stems the same
 *     way the index did, and finds it. FDC ORs the clauses
 *     (`requireAllWords: false`), so the pair is a union: the stemmed term
 *     catches whole words, the wildcard catches prefixes mid-type.
 *
 *  2. A heavy boost on foods whose NAME starts with the query. A broad short
 *     prefix like "gra*" matches ~1000 foods (grain, grass-fed, granny, grape),
 *     and FDC scores every wildcard hit identically, returning them in a fixed
 *     order that buries the obvious "Grapes" ~400 deep — past the fetched page.
 *     `lowercaseDescription.keyword` is the NON-tokenised description field, so
 *     `lowercaseDescription.keyword:gra*` is a true starts-with; boosting it
 *     floats the name-leading foods ("Grapes", "Grains") to the top of the very
 *     first page while the wildcard clause preserves full coverage.
 *
 *  3. Everything lowercased. Both targets hold lowercase text, and a WILDCARD
 *     term is matched literally — the index analyser never folds its case — so
 *     "Banana*" matches nothing at all while "banana*" matches. That is not a
 *     hypothetical: a phone capitalises the first word and its predictive bar
 *     inserts words capitalised, so a search typed on a phone would silently
 *     return no foods while the same word typed on a desktop worked.
 */
function toFdcQuery(query: string): string {
  // The tokens as typed (any wildcard the caller supplied stripped, so the
  // analyser sees a real word), then the same tokens wildcarded.
  const bare = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/\*+$/, ""))
    .filter(Boolean);
  const tokens = bare.map((token) => `${token}*`);
  const terms = [...bare, ...tokens].join(" ");
  // Boost on the first token's prefix — for USDA's "Food, qualifier" naming the
  // food name leads the description, so this rewards typing the food itself.
  const headPrefix = tokens[0] ?? "";
  return `${terms} lowercaseDescription.keyword:${headPrefix}^500`;
}

/** The outcome of one FDC search: what survived, and what there was to survive. */
export interface FdcSearchResult {
  /** The reference foods left after the ADR-0042 filters, ranked. */
  foods: EntityPayload[];
  /**
   * How many foods came back BEFORE those filters ran — twins already folded,
   * so it counts foods rather than dataset rows, and it counts the page FDC
   * returned rather than every record it holds (the query sets no `pageSize`
   * and `totalHits` goes unread). It is therefore a floor, not a total: read it
   * as "USDA returned something" versus "USDA returned nothing", which is the
   * distinction the caller needs to say why a search came back empty (#118).
   */
  matchedFoods: number;
}

/**
 * Searches the USDA FoodData Central API and returns the matching reference
 * foods as EntityPayloads, alongside how many records the query matched before
 * filtering.
 *
 * @param query  - Free-text search query (e.g. "banana").
 * @param apiKey - USDA FDC API key. Defaults to VITE_USDA_FDC_API_KEY env var.
 */
export async function searchFdc(
  query: string,
  apiKey: string = activeUsdaKey()
): Promise<FdcSearchResult> {
  if (!apiKey) {
    throw new Error("USDA API Key is not configured.");
  }
  const search = encodeURIComponent(toFdcQuery(query));
  const url = `${FDC_BASE}?query=${search}&dataType=Foundation,SR%20Legacy&api_key=${apiKey}`;
  const res = await fetch(url);
  // A failed request (bad/expired key -> 403, exhausted quota -> 429, outage ->
  // 5xx) returns a body with no `foods` field. Without this guard that collapses
  // to an empty result set, which the caller would then report as a food USDA
  // does not carry (issue #118) — a fault wearing a coverage verdict. Failing on
  // the status is what keeps the two apart for every failure that carries one.
  if (!res.ok) {
    if (res.status === 403)
      throw new Error("USDA API rejected the key. Check it in Settings.");
    if (res.status === 429)
      throw new Error("USDA API rate limit reached. Try again shortly.");
    throw new Error(`USDA API request failed (${res.status}).`);
  }
  const data: { foods: FdcFood[] } = await res.json();

  // Group by USDA food identity (ndbNumber), then fold each group into one
  // result. Keying on ndbNumber — not the description — collects the two records
  // USDA carries for one food across the Foundation and SR Legacy datasets,
  // whose descriptions it rewrites between them (e.g. chia's "Chia seeds, dry,
  // raw" vs "Seeds, chia seeds, dried", both ndbNumber 12006).
  //
  // The group is MERGED, not thinned (ADR-0045 §2). Foundation is a newer but
  // far narrower re-assay — 45% of its records carry no fibre at all — so the
  // old "Foundation replaces SR Legacy" rule kept the sparser of the two
  // records: blueberries (ndbNumber 9050) lost the twin's 2.4 g of fibre and its
  // whole micronutrient tail. Foundation still wins every value it reports; the
  // twin only fills what Foundation is silent about.
  const groups = new Map<string | number, FdcFood[]>();
  for (const food of data.foods ?? []) {
    const key = fdcIdentityKey(food);
    const group = groups.get(key);
    if (group) group.push(food);
    else groups.set(key, [food]);
  }

  // Keep only un-barcoded base ingredients: drop brand-specific records
  // ("… OCEAN SPRAY"), packaged/processed forms (canned, soda, juice drinks) and
  // prepared/composite foods by category (candies, cookies, soups, beverages) —
  // all of which belong to the OFF scan path. Raw foods are always base
  // ingredients (see isProcessedProduct); Sweets keeps its base sweeteners (see
  // isPreparedProduct).
  const uniqueFoods = Array.from(groups.values())
    .map(resolveFdcGroup)
    .filter(
      ({ food }) =>
        !isBrandSpecific(food.description) &&
        !isProcessedProduct(food.description) &&
        !isPreparedProduct(food.foodCategory, food.description)
    );

  // Re-rank by how *exactly* each name matches the query (ADR-0042 §5): FDC's
  // own relevance floats the prefix lookalikes its wildcarded OR query returns
  // above the real thing. Sorting is stable, so FDC's order breaks ties.
  const rank = compileReferenceFoodQuery(query);
  const ranked = uniqueFoods
    .map((resolved) => ({
      resolved,
      key: rank(readReferenceFoodName(resolved.food.description)),
    }))
    .sort((a, b) => compareRelevance(a.key, b.key));

  return {
    foods: ranked.map(({ resolved: { food, merged_from } }) =>
      mapFdcFoodToPayload(food, merged_from)
    ),
    matchedFoods: groups.size,
  };
}
