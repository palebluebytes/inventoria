import type { EntityPayload } from "../ingestion/ingest";
import {
  PER_100G,
  NUTRITION_INFO_ATTR,
  FOOD_PORTIONS_ATTR,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { buildRawProvenance, type MergedSource } from "./provenance";
import {
  ADAPTER_VERSION,
  FDC_FOOD_BASE,
  compileReferenceFoodQuery,
  compareRelevance,
  readReferenceFoodName,
  type ReferenceFoodName,
} from "./usda-fdc";

/**
 * The bundled USDA corpus: the Search index the food search reads and the
 * Nutrient store staging reads, both committed artifacts generated from USDA's
 * bulk archives by `scripts/usda-bundle.mjs` (ADR-0047).
 *
 * This module owns their shape, their loading, and the search over them. It is
 * the whole of what replaces `api.nal.usda.gov`: no key, no quota, no network,
 * and a keystroke answered in single-digit milliseconds instead of ~700–1000 ms.
 *
 * The two artifacts are separate files because their parse costs differ by two
 * orders of magnitude — 2.91 ms for the index against 102.38 ms for the
 * nutrients, and 136.75 ms combined (ADR-0047 §2). The index is read at startup;
 * the nutrients wait for idle, because search never reads a nutrient.
 */

// ---------------------------------------------------------------------------
// Artifact shapes
// ---------------------------------------------------------------------------

/** One archive release an artifact was generated from (ADR-0047 §12). */
export interface ArchiveSource {
  dataset: string;
  release: string;
  file: string;
  sha256: string;
}

/**
 * The macros a search result row renders. A subset of the panel rather than a
 * parallel shape, so a field cannot be spelled one way here and another there —
 * and so the row's values drop straight into `nutrition/info`.
 */
export type IndexMacros = Pick<
  NutritionInfo,
  "calories" | "protein_content" | "fat_content" | "carbohydrate_content"
>;

/**
 * One Search index row: identity, the fields ADR-0042 ranks on, the macros the
 * results list shows, the household portions, and the reference to any SR Legacy
 * twin whose values the row borrowed (ADR-0047 §2 and §8).
 *
 * Every absent field is omitted rather than emitted null — "not measured" is a
 * distinction the panel makes — so the optionality here is the artifact's, not a
 * defensive `?`.
 */
export interface UsdaIndexRow {
  fdcId: number;
  description: string;
  dataType: string;
  foodCategory?: string;
  scientificName?: string;
  macros: IndexMacros;
  portions?: Portion[];
  merged_from?: MergedSource[];
}

/** The committed Search index artifact. */
export interface SearchIndex {
  artifact: "usda-search-index";
  schema_version: number;
  generated_from: ArchiveSource[];
  foods: UsdaIndexRow[];
}

/** The committed Nutrient store artifact, keyed by `fdcId` (ADR-0047 §5). */
export interface NutrientStore {
  artifact: "usda-nutrient-store";
  schema_version: number;
  generated_from: ArchiveSource[];
  /** Every nutrient id the corpus reports, with USDA's own name and unit. */
  nutrients: Record<string, { name: string; unit: string }>;
  /** `fdcId` -> nutrient id -> the amount in that nutrient's published unit. */
  foods: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * How many ranked rows one search hands to the results list. This is the page
 * size FDC's search defaulted to, kept because it is the list's ceiling and not
 * the corpus's: a bare "b" matches 2,999 rows, and rendering an option per row
 * would cost far more than the search itself.
 */
export const SEARCH_RESULT_LIMIT = 50;

/** One Search index row with its name already read the way ranking reads it. */
export interface SearchableFood {
  row: UsdaIndexRow;
  name: ReferenceFoodName;
}

/**
 * The Search index in the form a keystroke searches: every description split
 * into words once, at load, rather than 4,491 times per keystroke.
 *
 * This is what makes the corpus an index rather than a list, and it is measured
 * rather than assumed. Reading the names costs 18.5 ms once and takes a search
 * from 17 ms to 0.6–1.5 ms, and the splitting does not depend on what was typed,
 * so paying it once is the whole of the difference.
 */
export type SearchCorpus = SearchableFood[];

/** Reads a parsed Search index into the searchable corpus. Pure. */
export function buildSearchCorpus(index: SearchIndex): SearchCorpus {
  return index.foods.map((row) => ({
    row,
    name: readReferenceFoodName(row.description),
  }));
}

/**
 * The reference foods answering `query`, best first (ADR-0042 §5), capped at one
 * page. Pure — the corpus is passed in — so the ordering is asserted against the
 * committed artifact rather than through a fetch.
 *
 * There is no filter step. ADR-0042's brand/packaged/prepared filters ran once
 * at generation time and the index holds only their 4,491 survivors (ADR-0047
 * §4), so re-running them per keystroke would be work over a corpus that cannot
 * fail them.
 */
export function searchIndexRows(
  corpus: SearchCorpus,
  query: string
): UsdaIndexRow[] {
  if (!query.trim()) return [];
  const rank = compileReferenceFoodQuery(query);
  return corpus
    .map((food) => ({ row: food.row, key: rank(food.name) }))
    .filter(({ key }) => key.tier > 0)
    .sort((a, b) => compareRelevance(a.key, b.key))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ row }) => row);
}

/**
 * Maps one Search index row to the food twin payload the app ingests — the same
 * attributes `mapFdcFoodToPayload` emits from a live search hit, since the row
 * was generated by running that mapper over the archives.
 *
 * The panel carries the four macros the row holds. The rest of USDA's nutrients
 * live in the Nutrient store and are read when the food is staged (ADR-0047 §2).
 */
export function mapIndexRowToPayload(row: UsdaIndexRow): EntityPayload {
  const attributes: EntityPayload["attributes"] = {
    "food/name": row.description,
    [NUTRITION_INFO_ATTR]: {
      serving_size: PER_100G,
      ...row.macros,
    } satisfies NutritionInfo,
  };
  // Food-identity metadata (ADR-0030 §3): emitted only where the row carries it.
  if (row.foodCategory) attributes["food/category"] = row.foodCategory;
  if (row.scientificName)
    attributes["food/scientific_name"] = row.scientificName;
  if (row.portions) attributes[FOOD_PORTIONS_ATTR] = row.portions;
  // The generated row IS the provenance now (ADR-0047 §7): the bundle is the
  // backfill source for every food, offline, so a per-food copy of USDA's
  // untouched record would cost 25x the bytes to buy nothing. `source_uri` still
  // names the canonical record, and `merged_from` still names the SR Legacy twin
  // whose values the panel borrowed (ADR-0045 §4).
  attributes["twin/raw_provenance"] = buildRawProvenance({
    adapter: "fdc",
    adapter_version: ADAPTER_VERSION,
    source_uri: `${FDC_FOOD_BASE}/${row.fdcId}`,
    raw_data: row,
    merged_from: row.merged_from,
  });
  return { entity: `fdc:${row.fdcId}`, attributes };
}

/**
 * Searches the bundled corpus and maps the matches to food twin payloads.
 *
 * `load` is a parameter so the search is testable against a fixture without a
 * fetch, matching how the rest of the app injects its impure edges.
 */
export async function searchUsdaCorpus(
  query: string,
  load: () => Promise<SearchCorpus> = loadSearchCorpus
): Promise<EntityPayload[]> {
  if (!query.trim()) return [];
  return searchIndexRows(await load(), query).map(mapIndexRowToPayload);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const SEARCH_INDEX_URL = "/usda/search-index.json";
const NUTRIENT_STORE_URL = "/usda/nutrient-store.json";

async function fetchArtifact<T>(url: string): Promise<T> {
  const res = await fetch(url);
  // Both artifacts are precached at install (ADR-0047 §11), so a miss here is a
  // broken build or a broken service worker rather than an offline user. Say
  // which file, because the two fail for the same reasons and read alike.
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status}).`);
  return (await res.json()) as T;
}

let loadedCorpus: Promise<SearchCorpus> | null = null;
let loadedNutrients: Promise<NutrientStore> | null = null;

/** The Search index, fetched, parsed and read into words once per session. */
export function loadSearchCorpus(): Promise<SearchCorpus> {
  loadedCorpus ??=
    fetchArtifact<SearchIndex>(SEARCH_INDEX_URL).then(buildSearchCorpus);
  return loadedCorpus;
}

/** The Nutrient store, fetched and parsed once per session. */
export function loadNutrientStore(): Promise<NutrientStore> {
  loadedNutrients ??= fetchArtifact<NutrientStore>(NUTRIENT_STORE_URL);
  return loadedNutrients;
}

/**
 * Warms both artifacts, on the schedule ADR-0047 §2 sets: the index now, because
 * the food screen is the app's first and a search must not wait on a fetch; the
 * nutrient store at idle, because its 102 ms parse belongs nowhere near first
 * paint and nothing reads it until a food is staged.
 *
 * Failures are swallowed deliberately — this is a warm-up, and the real search
 * and staging paths await the same promises and report their own errors.
 */
export function warmUsdaCorpus(): void {
  void loadSearchCorpus().catch(() => {});
  const warmNutrients = () => void loadNutrientStore().catch(() => {});
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(warmNutrients);
  else setTimeout(warmNutrients, 0);
}
