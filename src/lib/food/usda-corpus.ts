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
  buildNutritionPanel,
  type FdcNutrient,
} from "./usda-fdc";
import {
  compileReferenceFoodQuery,
  compareRelevance,
  readReferenceFoodName,
  type ReferenceFoodName,
} from "./reference-food-ranking";

/**
 * The bundled USDA corpus: the Search index the food search reads and the
 * Nutrient store a staged food's panel is read out of, both committed artifacts
 * generated from USDA's bulk archives by `scripts/usda-bundle.mjs` (ADR-0047).
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
 * into words once, at load, rather than 4,461 times per keystroke.
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
 * There is no filter step. The reference-food filters ran once at generation
 * time and the index holds only their 4,461 survivors (ADR-0047 §4, widened by
 * ADR-0048 §5), so re-running them per keystroke would be work over a corpus
 * that cannot fail them.
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

// ---------------------------------------------------------------------------
// Staging: the full panel, read out of the Nutrient store
// ---------------------------------------------------------------------------

/**
 * The FDC id a food twin's entity names, or null for a twin that did not come
 * out of the corpus — a scanned Open Food Facts product, a manual entry, a
 * recipe. The Nutrient store has nothing to say about those, and a 4 MB parse to
 * discover that is a cost every scan would pay.
 */
function fdcIdFor(entity: string): number | null {
  const match = /^fdc:(\d+)$/.exec(entity);
  return match ? Number(match[1]) : null;
}

/**
 * The full `nutrition/info` panel for one bundled food, or undefined where the
 * store carries no nutrients for it.
 *
 * The store keeps USDA's own amounts under USDA's own units, so the panel is
 * built by handing the mapper the shape it reads (ADR-0047 §5): the id-keyed
 * amounts rejoined to the id dictionary's unit, then normalised by the app's one
 * normalisation. A stored amount alone cannot be read — 5 is 5 mg of calcium and
 * 5 µg of folate — which is what the dictionary is for.
 *
 * The one guard is on the food, because a caller can legitimately ask about an
 * id the store does not carry. The dictionary is NOT guarded, deliberately: the
 * generator builds it from the very records it then writes the amounts from, so
 * an amount under an unlisted id is a corrupt artifact rather than a case, and
 * `usda-bundle.test.ts` re-serialises the committed files byte for byte to keep
 * one from being hand-edited into existence.
 */
export function storedPanelFor(
  store: NutrientStore,
  fdcId: number
): NutritionInfo | undefined {
  const amounts = store.foods[String(fdcId)];
  if (!amounts) return undefined;
  const nutrients: FdcNutrient[] = Object.entries(amounts).map(
    ([id, value]) => ({
      nutrientId: Number(id),
      nutrientName: store.nutrients[id].name,
      value,
      unitName: store.nutrients[id].unit,
    })
  );
  return buildNutritionPanel(nutrients);
}

/**
 * Deepens a staged food's panel from the Nutrient store: the four macros a
 * search row renders become the whole panel the mapper builds, from the same
 * merged record the row was generated from (ADR-0047 §2).
 *
 * This is where the bundle earns its second artifact. A log freezes its own
 * macros (ADR-0022), so a food logged on the row's four fields would carry four
 * fields for ever — which is the reason ADR-0047 rejected keeping the API for
 * detail hydration rather than a reason to repeat it here. Nothing else about
 * the payload moves: identity, portions and `twin/raw_provenance` are the row's
 * (§7), and only the panel's depth changes.
 *
 * `load` is a parameter for the same reason search's is: the panel is asserted
 * against the committed artifact without a fetch. A food the store has no entry
 * for keeps the row's macros — a partial artifact degrades the panel, never the
 * user's ability to log the food.
 */
export async function completeStagedPanel(
  payload: EntityPayload,
  load: () => Promise<NutrientStore> = loadNutrientStore
): Promise<EntityPayload> {
  const fdcId = fdcIdFor(payload.entity);
  if (fdcId === null) return payload;
  const panel = storedPanelFor(await load(), fdcId);
  if (!panel) return payload;
  return {
    ...payload,
    attributes: { ...payload.attributes, [NUTRITION_INFO_ATTR]: panel },
  };
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

/**
 * The Search index, fetched, parsed and read into words once per session.
 *
 * A SUCCESS is what is memoised: a failed load is forgotten so the next search
 * tries again. Caching the rejection would be worse than not caching at all —
 * the likeliest way this fetch fails is a service worker that has not taken
 * control yet during the startup warm (see {@link warmUsdaCorpus}), and a cached
 * rejection would answer every search for the rest of the session.
 */
export function loadSearchCorpus(): Promise<SearchCorpus> {
  loadedCorpus ??= fetchArtifact<SearchIndex>(SEARCH_INDEX_URL)
    .then(buildSearchCorpus)
    .catch((error) => {
      loadedCorpus = null;
      throw error;
    });
  return loadedCorpus;
}

/**
 * The Nutrient store, fetched and parsed once per session — by
 * {@link completeStagedPanel}, once per staged food and never per keystroke.
 * Memoised, so the second stage of a session pays nothing, and warmed at idle
 * (see {@link warmUsdaCorpus}) so the first one usually pays nothing either.
 */
export function loadNutrientStore(): Promise<NutrientStore> {
  loadedNutrients ??= fetchArtifact<NutrientStore>(NUTRIENT_STORE_URL).catch(
    (error) => {
      // Forgotten on failure, for the reason {@link loadSearchCorpus} gives —
      // and here a cached rejection would quietly stage every food of the
      // session on four macros rather than on its panel.
      loadedNutrients = null;
      throw error;
    }
  );
  return loadedNutrients;
}

/**
 * Warms both artifacts, on the schedule ADR-0047 §2 sets: the index now, because
 * the food screen is the app's first and a search must not wait on a fetch; the
 * nutrient store at idle, because its parse belongs nowhere near first paint.
 * Staging is what reads it, and a stage is several seconds of typing and choosing
 * away, so warming at idle is what makes it already parsed when that stage comes.
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
