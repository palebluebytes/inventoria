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
  stemOf,
  wordsOf,
  type ReferenceFoodName,
  type RelevanceKey,
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

/**
 * The Vocabulary map derived from Open Food Facts' ingredients taxonomy
 * (ADR-0049 §3): a phrase the corpus does not use, mapped to the phrases it does.
 *
 * The key is `vocabulary_off` rather than `vocabulary` because the section names
 * WHERE its words came from: ADR-0049 leaves room for a hand-written
 * `vocabulary_local` beside it, outside the ODbL derivative.
 *
 * `aubergine` names a food this corpus holds and retrieves nothing, because the
 * rows say `Eggplant`. Every key is such a phrase and every key has at least one
 * target that retrieves, both asserted where the map is generated.
 *
 * It rides inside the Search index rather than beside it so drift between the
 * map and the corpus it was validated against is structurally impossible, and it
 * is a SECTION of its own rather than folded into the rows for a licensing
 * reason: the map is a substantial extraction from OFF and therefore a
 * derivative database under ODbL, and keeping it distinct and self-describing
 * makes this file a collective work with one ODbL component (ADR-0049 §4).
 */
export interface VocabularyMap {
  licence: string;
  source: string;
  url: string;
  /** The digest of the taxonomy the map was derived from. OFF publishes no releases. */
  sha256: string;
  /** Phrase that retrieves nothing -> the phrases in its OFF group that do. */
  expansions: Record<string, string[]>;
}

/** The committed Search index artifact. */
export interface SearchIndex {
  artifact: "usda-search-index";
  schema_version: number;
  generated_from: ArchiveSource[];
  vocabulary_off: VocabularyMap;
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
 * into words once, at load, rather than 4,429 times per keystroke, beside the
 * Vocabulary map the retrieval fallback reads.
 *
 * The reading is what makes the corpus an index rather than a list, and it is
 * measured rather than assumed. Reading the names costs 18.5 ms once and takes a
 * search from 17 ms to 0.6–1.5 ms, and the splitting does not depend on what was
 * typed, so paying it once is the whole of the difference.
 */
export interface SearchCorpus {
  foods: SearchableFood[];
  /**
   * ADR-0049's Vocabulary map, in the form the fallback reads it: a phrase this
   * corpus retrieves nothing for, mapped to the phrases it does. Carried here
   * rather than looked up separately because it ships inside the same artifact
   * and was validated against these very rows (ADR-0049 §4).
   */
  vocabulary: VocabularyMap["expansions"];
}

/** Reads a parsed Search index into the searchable corpus. Pure. */
export function buildSearchCorpus(index: SearchIndex): SearchCorpus {
  return {
    foods: index.foods.map((row) => ({
      row,
      name: readReferenceFoodName(row.description),
    })),
    vocabulary: index.vocabulary_off.expansions,
  };
}

/**
 * One phrase the vocabulary offered in a typed query's place, and the key that
 * offered it.
 *
 * The alias travels with the phrase because it is what the user is shown: a food
 * reached this way is displayed under its own name AND the name that reached it,
 * "Eggplant, raw, aubergine", so a search that quietly answered with another word
 * says which word it answered with (see {@link mapIndexRowToPayload}).
 */
export interface VocabularyExpansion {
  /** The vocabulary key the typed query reached — the name to show the food under. */
  alias: string;
  /** A phrase the corpus DOES use, to rank against in the typed query's place. */
  phrase: string;
}

/**
 * The vocabulary phrases a typed query expands to, or none for a query the map
 * has no key for. Pure, and the whole of what reads the map.
 *
 * Two tiers, the shape `curatedMatches` (ADR-0046 §1) already uses, and for the
 * same reason — a key has to be reachable while it is still being typed. An
 * EXACT hit is a query whose words are the key's words, modulo plural; failing
 * that, a PREFIX hit is one where every typed word starts the key word in the
 * same position, so `aubergin` reaches `aubergine` rather than answering
 * "No food found" until the final keystroke. Exact hits win outright: where a
 * key is squarely typed, the keys it merely prefixes have nothing to add.
 *
 * The query is read with `wordsOf`/`stemOf` and so is every key, because a key
 * must never be compared against tokens some other function produced — the
 * defect #136 fixed, where a typed hyphen produced a token no word could equal.
 *
 * Matching is POSITIONAL, which is what keeps the map phrase-keyed: `flax seed`
 * is a key and `seed flax` is not a way of typing it. It also means a key longer
 * than the query can still be reached mid-phrase while a key SHORTER than the
 * query is never reached at all, so `aubergine` expands and `raw aubergine` does
 * not (ADR-0049 Consequences — deliberate, and unmeasured rather than unwanted).
 *
 * That is the ONE place this parts company with `curatedMatches`, whose partial
 * tier is position-free, and the difference is the tables': a stand-in's aliases
 * are unordered names for one product, while a vocabulary key IS a phrase.
 * ADR-0049 §6 keeps them apart for that reason — "which a vocabulary table has
 * no way to express".
 */
export function expandThroughVocabulary(
  vocabulary: VocabularyMap["expansions"],
  query: string
): VocabularyExpansion[] {
  const typed = wordsOf(query);
  if (typed.length === 0) return [];
  const typedStems = typed.map(stemOf);
  const exact: VocabularyExpansion[] = [];
  const prefixed: VocabularyExpansion[] = [];
  for (const [alias, phrases] of Object.entries(vocabulary)) {
    const keyWords = wordsOf(alias);
    if (keyWords.length < typed.length) continue;
    const reached =
      keyWords.length === typed.length &&
      keyWords.every((word, i) => stemOf(word) === typedStems[i])
        ? exact
        : typed.every((token, i) => keyWords[i].startsWith(token))
          ? prefixed
          : null;
    if (reached) for (const phrase of phrases) reached.push({ alias, phrase });
  }
  // One phrase, one alias. Two keys can offer the same phrase — `soy beans` and
  // `soya bean` both offer `soybean` — and a row can only be shown under one
  // name, so the first key in the map's own order takes it.
  const byPhrase = new Map<string, VocabularyExpansion>();
  for (const reached of exact.length > 0 ? exact : prefixed)
    if (!byPhrase.has(reached.phrase)) byPhrase.set(reached.phrase, reached);
  return [...byPhrase.values()];
}

/**
 * What one search ran over: the typed query, followed by any vocabulary
 * expansions of it (ADR-0049 §1). Empty only for an empty query.
 *
 * Part of every search's answer because a second path reads it — ADR-0049 §6
 * hands these same phrases to curated matching, so the two cannot disagree about
 * what the search was for.
 *
 * The typed query STAYS in the list when the fallback fires, even though it is
 * by definition the phrase that just retrieved nothing. Ranking is indifferent
 * to it for exactly that reason, and the curated table is not: dropping it would
 * take the cacao-nibs stand-in away from a typed "cacao b", which answers today.
 */
export interface SearchedPhrases {
  phrases: string[];
}

/** One reference food a search reached, and the name that reached it. */
export interface SearchHit {
  row: UsdaIndexRow;
  /**
   * The vocabulary key this row answered, on the searches where the typed word
   * reached nothing and the vocabulary offered another (ADR-0049 §1). Absent on
   * every search that answered literally, which is what keeps the widened name
   * off every food that never needed one.
   */
  alias?: string;
}

/** A finished search over the index: the phrases, and the foods they reached. */
export interface IndexSearch extends SearchedPhrases {
  hits: SearchHit[];
}

/**
 * The reference foods answering `phrases`, best first (ADR-0042 §5), capped at
 * one page.
 *
 * Each row is scored against EVERY phrase and keeps its best key, and the whole
 * set is sorted once. Concatenating one ranked list per phrase would let the
 * order a key happens to list its values in decide the ordering; keeping the
 * best key makes the values unordered data, which is what they are. The winning
 * phrase comes back with the row because it is also what NAMES the row: it is
 * the one of the k phrases this food actually answered.
 *
 * There is no filter step. The reference-food filters ran once at generation
 * time and the index holds only their 4,429 survivors (ADR-0047 §4, widened by
 * ADR-0048 §5), so re-running them per keystroke would be work over a corpus
 * that cannot fail them.
 */
function rankAgainst(
  foods: SearchableFood[],
  phrases: string[]
): { row: UsdaIndexRow; phrase: string }[] {
  const ranks = phrases.map(compileReferenceFoodQuery);
  const scored: { row: UsdaIndexRow; phrase: string; key: RelevanceKey }[] = [];
  for (const food of foods) {
    let best: RelevanceKey | undefined;
    let bestPhrase = "";
    for (let i = 0; i < ranks.length; i++) {
      const key = ranks[i](food.name);
      if (key.tier > 0 && (!best || compareRelevance(key, best) < 0)) {
        best = key;
        bestPhrase = phrases[i];
      }
    }
    if (best) scored.push({ row: food.row, phrase: bestPhrase, key: best });
  }
  return scored
    .sort((a, b) => compareRelevance(a.key, b.key))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ row, phrase }) => ({ row, phrase }));
}

/**
 * The reference foods answering `query`, best first. Pure — the corpus is passed
 * in — so the ordering is asserted against the committed artifact rather than
 * through a fetch.
 *
 * Two passes, and the second runs only when the first returns NOTHING
 * (ADR-0049 §1). That gate is the whole of the vocabulary's integration: an
 * expansion can never reorder, displace or truncate a result that exists today,
 * because it does not run when one does, which makes the no-regression property
 * structural rather than disciplinary. It is also why the ranking gains no key,
 * no tier and no clause for the vocabulary — there is never a literal match
 * present for an expanded one to rank against.
 */
export function searchIndexRows(
  corpus: SearchCorpus,
  query: string
): IndexSearch {
  if (!query.trim()) return { phrases: [], hits: [] };
  const literal = rankAgainst(corpus.foods, [query]);
  if (literal.length > 0)
    return { phrases: [query], hits: literal.map(({ row }) => ({ row })) };
  const expanded = expandThroughVocabulary(corpus.vocabulary, query);
  if (expanded.length === 0) return { phrases: [query], hits: [] };
  // The typed query rides along, and costs the ranking nothing: the pass above
  // just proved it matches no row, so it can never be any row's best key. What
  // it buys is the curated table still seeing what was typed (see
  // {@link SearchedPhrases}) — and, for the same reason, a row that somehow won
  // on it carries no alias, because there is no other name to show it under.
  const aliasOf = new Map(expanded.map((e) => [e.phrase, e.alias]));
  const phrases = [query, ...expanded.map((e) => e.phrase)];
  return {
    phrases,
    hits: rankAgainst(corpus.foods, phrases).map(({ row, phrase }) => ({
      row,
      alias: aliasOf.get(phrase),
    })),
  };
}

/**
 * Maps one Search index row to the food twin payload the app ingests — the same
 * attributes `mapFdcFoodToPayload` emits from a live search hit, since the row
 * was generated by running that mapper over the archives.
 *
 * The panel carries the four macros the row holds. The rest of USDA's nutrients
 * live in the Nutrient store and are read when the food is staged (ADR-0047 §2).
 *
 * `alias` is the vocabulary key a search needed to reach this row, and it is
 * appended to the NAME — "Eggplant, raw" becomes "Eggplant, raw, aubergine"
 * (ADR-0049's #140 Amendment). `food/name` rather than a sibling attribute
 * because several INDEPENDENT readers show a food's name and only this one goes
 * through here: the consumption fold names a logged event off the twin, the
 * recent list and the recipe ingredient resolver each read their own, and the
 * stager's edit form seeds from it again. A user who searched a word deserves to
 * see that word wherever the food turns up, not only in the results list.
 *
 * `twin/raw_provenance.raw_data` keeps USDA's untouched row, so the widened name
 * never masquerades as USDA's own (ADR-0045 §4) — and `deriveNovaVerdict` reads
 * the description back out of it rather than off this name, because nineteen
 * vocabulary keys carry one of its deny-substrings. Anything else deciding
 * something ABOUT a food has to read it the same way.
 */
export function mapIndexRowToPayload(
  row: UsdaIndexRow,
  alias?: string
): EntityPayload {
  const attributes: EntityPayload["attributes"] = {
    "food/name": alias ? `${row.description}, ${alias}` : row.description,
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

/** A finished search over the bundled corpus: {@link IndexSearch} in twins. */
export interface UsdaSearch extends SearchedPhrases {
  foods: EntityPayload[];
}

/**
 * Searches the bundled corpus and maps the matches to food twin payloads.
 *
 * The phrases come back with the foods because curated matching reads them too
 * (ADR-0049 §6): when the vocabulary fallback fires, both paths must be looking
 * for the same thing.
 *
 * `load` is a parameter so the search is testable against a fixture without a
 * fetch, matching how the rest of the app injects its impure edges.
 */
export async function searchUsdaCorpus(
  query: string,
  load: () => Promise<SearchCorpus> = loadSearchCorpus
): Promise<UsdaSearch> {
  if (!query.trim()) return { phrases: [], foods: [] };
  const { phrases, hits } = searchIndexRows(await load(), query);
  return {
    phrases,
    foods: hits.map(({ row, alias }) => mapIndexRowToPayload(row, alias)),
  };
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
