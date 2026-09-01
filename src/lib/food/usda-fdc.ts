// ---------------------------------------------------------------------------
// The USDA FoodData Central adapter
// ---------------------------------------------------------------------------
//
// One record of somebody else's serialisation, turned into this app's shapes:
// the nutrition panel, the identity key that collects a food's twins, the names
// a merge discards, the portions and the provenance. It moves when USDA's
// serialisation or the panel moves, which is what every `ADAPTER_VERSION` bump
// below names.
//
// Whether a record is a reference food AT ALL is a different question with a
// different reason to change, and the five judgements that answer it live in
// `usda-food-kind.ts` (#146).
// ---------------------------------------------------------------------------

import type { EntityPayload } from "../ingestion/ingest";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  formatPortionLabel,
  reportsNoEnergy,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { buildRawProvenance, type MergedSource } from "./provenance";
import { wordsOf } from "./reference-food-ranking";

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
//     food/portions and refreshes provenance/raw with the fuller record
//     (ADR-0030 §5). The search dataset stays Foundation + SR Legacy; its
//     filtering, ranking and query-weighting are ADR-0042.
// v8: when Foundation and SR Legacy carry the same ndbNumber, search MERGES the
//     pair fill-only instead of discarding the SR Legacy twin (ADR-0045 §2):
//     Foundation stays the base record and the twin supplies only the panel
//     fields it does not carry. Borrowed values are named in
//     provenance/raw.merged_from (§4).
// v9: staging reads the bundled artifacts and never the API (ADR-0047). The
//     `/food/{fdcId}` detail fetch is gone with hydrateFdcFood and
//     mapFdcDetailToPayload: portions ride on the generated row (§6), the panel
//     is rebuilt from the Nutrient store through buildNutritionPanel (§2), and
//     provenance/raw carries that row rather than an untouched API record
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
 * and "Seeds, chia seeds, dried", both ndbNumber 12006). A record with no
 * `ndbNumber` falls back to its description, and the absence is tested rather
 * than treated as falsy: an `ndbNumber` of `0` is a number USDA assigned, and
 * `??`/`||` disagree about it.
 *
 * A shared `ndbNumber` is USDA saying two records are one food, and that is not
 * reliably true: 11243 holds a raw portabella and a grilled one, 9501 holds
 * Honeycrisp and Golden Delicious. `splitNdbNumbers` names the numbers an
 * adjudication refused, and each of their records keys alone — `${ndb}:${fdcId}`,
 * which no other record can collide with — so the two never meet and nothing
 * downstream has to know why (ADR-0051; the set is `SPLIT_TWIN_NDB_NUMBERS` in
 * `usda-twin-ledger.ts`).
 *
 * The set is an ARGUMENT rather than an import, and it is required rather than
 * defaulted. The ledger is 190 rows of adjudication that must not enter a user's
 * bundle, and a default of "no splits" would let a caller group records one way
 * while the generator groups them another — the drift ADR-0047 §4 exists to
 * prevent. There is exactly one caller, and it passes the ledger.
 *
 * Exported alongside {@link resolveFdcGroup} because `scripts/usda-bundle.mjs`
 * pairs the twins over the bulk archives (ADR-0047 §2), and the key that decides
 * WHICH records merge has to be the same one search uses.
 */
export function fdcIdentityKey(
  food: FdcFood,
  splitNdbNumbers: ReadonlySet<number>
): string | number {
  if (food.ndbNumber === undefined)
    return `desc:${food.description.toLowerCase().trim()}`;
  return splitNdbNumbers.has(food.ndbNumber)
    ? `${food.ndbNumber}:${food.fdcId}`
    : food.ndbNumber;
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
 * True when an FDC record reports no energy under any of {@link ENERGY_IDS} —
 * the {@link reportsNoEnergy} question, asked about a record instead of about a
 * panel (ADR-0048 §6).
 *
 * It is not a second predicate and must never become one: it maps the record
 * through the app's own {@link buildNutritionPanel} and defers, so the generator
 * dropping a row and the food card refusing a log are the same decision reached
 * the same way. An id joining `ENERGY_IDS` moves both at once.
 *
 * Ask it of the **merged** food, never of a raw Foundation record: five oils
 * carry no energy of their own and borrow their SR Legacy twin's (ADR-0045 §2),
 * which is why ADR-0048 §5 puts this filter after `resolveFdcGroup`.
 *
 * A filter by use and an adapter by construction, which is why it sits here
 * beside the panel and not in `usda-food-kind.ts` with the four judgements it
 * runs alongside (#146). §6's whole point is that this is NOT a food-kind
 * question: it is the panel's own question asked a second time, and expressing
 * it anywhere the panel is not in scope would invite a second answer.
 */
export function fdcReportsNoEnergy(food: FdcFood): boolean {
  return reportsNoEnergy(buildNutritionPanel(food.foodNutrients));
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
      "provenance/raw": buildRawProvenance({
        adapter: "fdc",
        adapter_version: ADAPTER_VERSION,
        source_uri: `${FDC_FOOD_BASE}/${food.fdcId}`,
        raw_data: food,
        merged_from,
      }),
    },
  };
}

/**
 * USDA's two editorial parentheticals, which say something about the record's
 * distribution or its labelling rather than naming the food.
 *
 * A closed list of two phrases, not a rule about parentheses. A parenthetical is
 * usually a NAME in these archives — `Cabbage, chinese (pak-choi), raw`,
 * `Yambean (jicama), raw`, `Green onion, (scallion)` — so a general strip would
 * take the very words an alias exists to carry.
 */
const ARCHIVE_BOILERPLATE =
  /\s*\((?:includes foods for usda's food distribution program|may contain additives to retain moisture)\)/gi;

/**
 * A description with {@link ARCHIVE_BOILERPLATE} taken off: the form an alias is
 * carried in, and the form the generator's own check searches by.
 *
 * Its own export so that the rule below and the check in
 * `scripts/usda-bundle.mjs` can share a strip without sharing an answer — the
 * check asks whether the finished row still answers to a name USDA holds, and
 * it has to ask in the spelling the rule would have kept.
 */
export function stripArchiveBoilerplate(description: string): string {
  return description.replace(ARCHIVE_BOILERPLATE, "").trim();
}

/**
 * The names a merged identity answers to besides the one it ships under.
 *
 * {@link resolveFdcGroup} keeps the base record's identity, so where USDA holds
 * one `ndbNumber` under two descriptions the loser's name is discarded and
 * nothing carries it: raw spinach ships as `Spinach, mature`, raw millet as
 * `Millet, whole grain`, and a person typing either archived name reaches
 * nothing at all. These are what the search index carries so that it does
 * (#137).
 *
 * An alias asserts **retrievability, not identity**. It says this row answers to
 * that name; it never says the two names are the same food. Where USDA reused an
 * `ndbNumber` across two genuinely different foods the merge already fused them
 * and this makes the fusion visible rather than hidden — see #145, whose
 * worklist is exactly what this function emits.
 *
 * A name is kept when ranking would read it differently from the surviving one,
 * which is the whole of the rule. That covers both gains without a judgement
 * about which key matters: a name carrying a word the survivor lacks
 * (`Spinach, raw`) is what retrieval needs, and a better-formed name for the
 * same words (`Bananas, raw`, which ends in ", raw" where the survivor buries it
 * behind two qualifiers) is what the ordering needs.
 *
 * Exported for the same reason its neighbours are: `scripts/usda-bundle.mjs`
 * applies it at generation time and must not restate it (ADR-0047 §4).
 */
export function twinSearchAliases(
  descriptions: readonly string[],
  surviving: string
): string[] {
  const asRead = (description: string) => wordsOf(description).join(" ");
  const seen = new Set([asRead(surviving)]);
  const aliases: string[] = [];
  for (const description of descriptions) {
    // The surviving record contributes no alias, even where stripping the
    // boilerplate would leave a different string. Nothing discarded that name —
    // the row already ships under it, and reading a record's own description
    // back to it is a different feature from carrying a twin's.
    if (description === surviving) continue;
    const alias = stripArchiveBoilerplate(description);
    const read = asRead(alias);
    if (seen.has(read)) continue;
    seen.add(read);
    aliases.push(alias);
  }
  return aliases;
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
