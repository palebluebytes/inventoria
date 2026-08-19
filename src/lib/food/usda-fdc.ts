import type { EntityPayload } from "../ingestion/ingest";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  formatPortionLabel,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { buildRawProvenance, type MergedSource } from "./provenance";

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
// v9: staging reads the bundled artifacts and never the API (ADR-0047). The
//     `/food/{fdcId}` detail fetch is gone with hydrateFdcFood and
//     mapFdcDetailToPayload: portions ride on the generated row (§6), the panel
//     is rebuilt from the Nutrient store through buildNutritionPanel (§2), and
//     twin/raw_provenance carries that row rather than an untouched API record
//     (§7). toGrams also folds the archives' "µg" onto the API's "UG".
// Exported so `usda-corpus.ts` stamps a bundled row with the SAME adapter
// identity: a Search index row is this adapter's output, generated ahead of time
// rather than mapped live, and a second version string would let the two drift.
export const ADAPTER_VERSION = "9";
export const FDC_FOOD_BASE = "https://api.nal.usda.gov/fdc/v1/food";

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
  nutrients: readonly FdcNutrient[],
  id: number
): FdcNutrient | undefined {
  return nutrients.find((n) => n.nutrientId === id);
}

/**
 * Normalises an FDC mass value to grams from its (case-insensitive) unit.
 *
 * Micrograms arrive spelled three ways and all three have to land on the same
 * branch: the API writes "UG", the bulk archives write "µg" with the MICRO SIGN,
 * and `"µ".toUpperCase()` is GREEK CAPITAL MU rather than itself — so matching
 * an upper-cased "µG" literal silently misses every archive record and stages a
 * microgram of vitamin A as a gram of it. Folding both micro signs to "U" first
 * is what keeps the bundled corpus (ADR-0047) reading like the API did.
 */
function toGrams(value: number, unitName: string): number {
  switch (
    unitName
      .trim()
      .toUpperCase()
      .replace(/[\u00b5\u03bc\u039c]/g, "U")
  ) {
    case "MG":
      return value / 1000;
    case "UG":
      return value / 1_000_000;
    default:
      return value; // G
  }
}

/**
 * The `nutrition/info` panel one record's nutrients make (ADR-0021): every
 * schema.org field the ids below can fill, per 100 g, with each mass normalised
 * to grams and absent left absent rather than zeroed.
 *
 * Exported because a staged food's panel is rebuilt from the bundled Nutrient
 * store rather than from a search hit (ADR-0047 §2): the store keeps USDA's own
 * amounts under USDA's own units, so the id preference order, the mg/µg
 * normalisation and the mono+poly sum have to be these ones and not a second
 * copy of them.
 */
export function buildNutritionPanel(
  nutrients: readonly FdcNutrient[]
): NutritionInfo {
  const nutrition: NutritionInfo = { serving_size: PER_100G };

  for (const id of ENERGY_IDS) {
    const energy = findNutrient(nutrients, id);
    if (energy) {
      nutrition.calories = energy.value;
      break;
    }
  }

  for (const { ids, key } of MASS_NUTRIENTS) {
    for (const id of ids) {
      const n = findNutrient(nutrients, id);
      if (n) {
        nutrition[key] = toGrams(n.value, n.unitName);
        break;
      }
    }
  }

  // Unsaturated fat = mono + poly (schema.org has no separate fields). Sum
  // whatever the food carries; round to shed float noise from the addition.
  const mufa = findNutrient(nutrients, MUFA_ID);
  const pufa = findNutrient(nutrients, PUFA_ID);
  if (mufa || pufa) {
    const total =
      toGrams(mufa?.value ?? 0, mufa?.unitName ?? "G") +
      toGrams(pufa?.value ?? 0, pufa?.unitName ?? "G");
    nutrition.unsaturated_fat_content = Math.round(total * 1e6) / 1e6;
  }

  return nutrition;
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
  const nutrition = buildNutritionPanel(food.foodNutrients);

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
// Portions: USDA's foodPortions[] -> food/portions (ADR-0030 §5, ADR-0047 §6)
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
 * so a bundled row ships the mapped {@link Portion} list and a staged food has
 * its measures already, with no second request to fetch them.
 */
export function mapFdcPortions(portions: readonly FdcFoodPortion[]): Portion[] {
  return portions
    .filter((p) => p && Number.isFinite(p.gramWeight) && p.gramWeight > 0)
    .map(mapFdcPortion);
}

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
