import type { EntityPayload } from "../ingestion/ingest";
import { mintEntity } from "../facets/entity-id";
import { NEVER_LOGGED, type Frecency } from "./frecency";
import {
  PER_100G,
  NUTRITION_INFO_ATTR,
  FOOD_PORTIONS_ATTR,
  type NutritionInfo,
  type Portion,
} from "./nutrition";
import { ArtifactUnreachableError } from "./bundled-artifact";
import { buildRawProvenance, type MergedSource } from "./provenance";
import {
  ADAPTER_VERSION,
  FDC_FOOD_BASE,
  buildNutritionPanel,
  type FdcNutrient,
} from "./usda-fdc";
import {
  bestOfNames,
  compileReferenceFoodQuery,
  compareRelevance,
  readReferenceFoodName,
  readRowRank,
  withoutStrayMentions,
  stemOf,
  wordsOf,
  type ReferenceFoodName,
  type ReferenceFoodQuery,
  type RelevanceKey,
  type RowRank,
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
  /**
   * The names this row also answers to: the descriptions USDA's twin records
   * carry that the merge discarded (#137). Search-only — the row is shown and
   * staged under `description`, never under one of these.
   */
  also?: string[];
  /**
   * True when USDA's own description of this record called it raw, the fifth of
   * `compareRelevance`'s twelve keys (ADR-0104 §6).
   *
   * It is not "is this food uncooked" — since ADR-0104 every row is. It is
   * whether USDA said so, which separates a whole fresh food from a processed
   * one that simply has not been cooked yet: `Potatoes, flesh and skin` said
   * raw and `Potatoes, hash brown, refrigerated` did not.
   *
   * Baked by the generator from the description as USDA published it, BEFORE
   * ADR-0056's strip takes the word, because the shipped name cannot carry the
   * fact any more — a corpus of uncooked foods says `raw` on every row or on
   * none. Omitted rather than emitted false, like every other absent field.
   */
  raw?: boolean;
  /**
   * True when a plainer twin of this food is in the corpus — some strict
   * qualifier-prefix of this description is itself a row (ADR-0055 §3).
   *
   * Baked by the generator rather than derived here: `plainSiblingsOf` needs
   * every description at once, and answering it at load measured 24 ms against
   * the 18.5 ms the whole read below costs. Omitted rather than emitted false,
   * like every other absent field on a row.
   */
  plain_sibling?: boolean;
}

/**
 * The hand-written half of the Vocabulary map (ADR-0049's #141 Amendment): the
 * everyday names OFF's taxonomy does not carry either.
 *
 * `gammon`, `mange tout`, `caster sugar` — seven British food names that name a
 * food this corpus holds and that neither the corpus nor OFF uses. It is a
 * SECTION of its own rather than seven more keys in `vocabulary_off`, and the
 * reason is the licence: the derived map is a substantial extraction from OFF
 * and so a derivative database under ODbL, and these words are nobody's
 * extraction. It carries a `source` and no `licence`, `url` or `sha256`, because
 * there is nothing upstream to pin and the absence is what says this half is not
 * the derivative.
 *
 * Every entry is admitted against four conditions, three of them re-measured at
 * every generation — the key retrieves nothing, `vocabulary_off` does not
 * already reach it, and the search leads with the exact row the entry recorded.
 * The evidence for each lives in `src/lib/food/food-vocabulary.ts` and stays
 * there: the artifact carries the map alone.
 */
export interface LocalVocabularyMap {
  source: string;
  /** Phrase that retrieves nothing -> the phrases a human found that do. */
  expansions: Record<string, string[]>;
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
 *
 * It is the hand-written shape plus the three fields a derivative owes: the
 * licence it is offered under, the url it came from, and the digest of the bytes
 * it was derived from. Composed rather than restated, so what separates the two
 * halves is exactly those three fields.
 */
export interface VocabularyMap extends LocalVocabularyMap {
  licence: string;
  url: string;
  /** The digest of the taxonomy the map was derived from. OFF publishes no releases. */
  sha256: string;
}

/** The committed Search index artifact. */
export interface SearchIndex {
  artifact: "usda-search-index";
  schema_version: number;
  generated_from: ArchiveSource[];
  /**
   * Every spelling of the uncooked state the generator struck out of the names
   * below (ADR-0104, and `STATE_QUALIFIERS` in `usda-shipped-name.ts`), carried
   * here so the search can strike them out of a typed query too (ADR-0049's
   * #464 Amendment).
   *
   * It rides inside the index rather than beside it for the reason
   * `vocabulary_off` does, and a sharper one: these are the words that make the
   * corpus's names differ from USDA's, so a roster that disagreed with the rows
   * it shipped with would be a query rule pointed at a corpus that never
   * existed. Nothing in `src/` may import the strip itself — the rename stays
   * out of the app's bundle (ADR-0047 §4) — so the artifact is the only way the
   * two can be the same list.
   *
   * Phrases, not words: USDA writes `raw or frozen` as one segment, so the
   * roster holds it as one entry and the query strip reads it as one.
   */
  state_qualifiers: string[];
  vocabulary_off: VocabularyMap;
  vocabulary_local: LocalVocabularyMap;
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
 * the corpus's: a bare "b" still hands back 422 rows once ADR-0062 §1 has taken
 * the mentions out of them, and rendering an option per row would cost far more
 * than the search itself.
 *
 * That figure is pinned in `usda-corpus.test.ts`, because the one it replaced
 * rotted through four regenerations with nothing to catch it.
 */
export const SEARCH_RESULT_LIMIT = 50;

/** One Search index row with its name already read the way ranking reads it. */
export interface SearchableFood {
  row: UsdaIndexRow;
  name: ReferenceFoodName;
  /**
   * The row's aliases, read the same way — one name each, not a bag of extra
   * words. Every NAME key derives from a description and its word order, so an
   * alias only earns its `tier`, `plain` and `wholeness` by being read as the
   * name it is. The row keys below are not among them: they are the same for
   * every name a row answers to. Empty for all but the twinned rows.
   */
  also: ReferenceFoodName[];
  /**
   * The four keys that read the ROW rather than one of its names — whether USDA
   * described it raw (ADR-0104 §6), whether the roster names it the canonical
   * row for its head (#165), whether a plainer twin of it exists, and whether
   * USDA published it for a designated population (ADR-0055 §5). Read once here
   * for the same reason the names are: none of them depends on what was typed.
   *
   * The two frecency slots ride along at 0, the value {@link readRowRank}
   * defaults them to. They are facts about this device's ledger rather than
   * about the artifact, and `bestNameKey` spreads today's over these.
   */
  rank: RowRank;
}

/**
 * The Search index in the form a keystroke searches: every description split
 * into words once, at load, rather than 4,238 times per keystroke, beside the
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
   * The artifact's own `schema_version`, carried through unread by the search
   * itself. #149's search log stores it beside every capture, because the
   * vocabulary re-derives on every corpus change and a flag computed against one
   * version has to say which version that was (ADR-0053 §4).
   */
  schema_version: number;
  /**
   * ADR-0049's Vocabulary map, in the form the fallback reads it: a phrase this
   * corpus retrieves nothing for, mapped to the phrases it does. Both halves of
   * it — the derived section and the hand-written one — merged, because the
   * fallback reads one map. Carried here rather than looked up separately
   * because it ships inside the same artifact and was validated against these
   * very rows (ADR-0049 §4).
   */
  vocabulary: VocabularyMap["expansions"];
  /**
   * The artifact's {@link SearchIndex.state_qualifiers}, split into words once
   * and ordered longest first — the form {@link withoutStateQualifiers} reads.
   *
   * Split here for the reason the names are: it does not depend on what was
   * typed. Ordered here because the order is load-bearing rather than
   * cosmetic — `raw or frozen` has to be tried before `raw`, or the strip
   * leaves `or frozen` behind and the query is worse than the one typed.
   */
  state_qualifiers: string[][];
}

/**
 * Reads a parsed Search index into the searchable corpus. Pure.
 *
 * The two vocabulary sections become ONE map, which is the whole of what the
 * hand-written half costs the reader: they are kept apart in the artifact for a
 * licensing reason (ADR-0049 §4) and the fallback has no business knowing which
 * half a key came from. The derived keys go in first, so a phrase both halves
 * offered would be named by OFF's key — a collision the generator forbids
 * outright, since a hand entry is admitted only where the derived map reaches
 * nothing.
 */
export function buildSearchCorpus(index: SearchIndex): SearchCorpus {
  return {
    foods: index.foods.map((row) => ({
      row,
      name: readReferenceFoodName(row.description),
      also: (row.also ?? []).map(readReferenceFoodName),
      rank: readRowRank(row),
    })),
    schema_version: index.schema_version,
    vocabulary: {
      ...index.vocabulary_off.expansions,
      ...index.vocabulary_local.expansions,
    },
    state_qualifiers: readStateQualifiers(index.state_qualifiers),
  };
}

/**
 * {@link SearchIndex.state_qualifiers} in the form {@link withoutStateQualifiers}
 * reads: each phrase split into words, longest first.
 *
 * Exported because the vocabulary derivation needs the same form before there is
 * an index to build a corpus from, and a second spelling of the sort would be
 * free to disagree about the one thing that matters — that `raw or frozen` is
 * tried before `raw`.
 */
export function readStateQualifiers(phrases: readonly string[]): string[][] {
  return phrases
    .map(wordsOf)
    .filter((words) => words.length > 0)
    .sort((a, b) => b.length - a.length);
}

/**
 * The typed query with every spelling of the uncooked state taken out of it, as
 * a phrase — `raw aubergine` becomes `aubergine`, and a query naming no state
 * comes back as the words it was typed with.
 *
 * **This is the repair for a defect ADR-0104 created and #464 measured.** The
 * corpus is ingredients as bought, so `raw` was struck from every shipped name;
 * 1,047 rows carry it as a fact and not one carries it as a word. A typed token
 * matching against name text alone therefore had nothing to reach, and the
 * conjunction took the whole query down with it: `raw X` returned nothing for
 * **62 of 62** foods in the vocabulary's single-word subset, and so did the
 * remaining three carriers #142 was measured over. The word is not wrong, it is
 * merely no longer said — so the query stops saying it too.
 *
 * Phrase-wise and longest-first, so USDA's one `raw or frozen` comes off as one
 * segment rather than leaving `or frozen` behind. Positional in neither
 * direction: `chicken raw` is as much a way of typing it as `raw chicken`, and
 * unlike a vocabulary key a state word names no position.
 *
 * **`null` for a query naming no state**, which is almost every query, rather
 * than the words it was typed with. The distinction is what both callers
 * actually ask: the search wants to know whether a second phrase is worth
 * ranking, and the vocabulary derivation wants to know whether a key can ever be
 * typed at the fallback at all. A returned string is always a query this changed.
 *
 * The result can be EMPTY, for a query that was nothing BUT state words. It
 * costs nothing: `searchIndexRows` declines to rank an empty phrase, so typing
 * `raw` alone still reaches `Seeds, sesame butter, tahini, from raw and stone
 * ground kernels` — the only row in 2,023 still holding the word, and the only
 * one meaning something else by it.
 */
export function withoutStateQualifiers(
  query: string,
  stateQualifiers: readonly (readonly string[])[]
): string | null {
  const typed = wordsOf(query);
  const kept: string[] = [];
  for (let i = 0; i < typed.length; ) {
    const struck = stateQualifiers.find((words) =>
      words.every((word, k) => typed[i + k] === word)
    );
    if (struck) i += struck.length;
    else kept.push(typed[i++]);
  }
  return kept.length === typed.length ? null : kept.join(" ");
}

/**
 * One phrase the vocabulary offered in a typed query's place, and the key that
 * offered it.
 *
 * The alias travels with the phrase because it is what the user is shown: a food
 * reached this way is displayed under its own name AND the name that reached it,
 * "Eggplant, raw (aubergine)", so a search that quietly answered with another word
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
 * not (ADR-0049 Consequences, as corrected by its own #142 Amendment).
 *
 * **That is still true of this function and no longer true of a search.**
 * `searchIndexRows` strips the state words out of the query before it gets here,
 * so what arrives for a typed `raw aubergine` is `aubergine`, which is a key
 * (ADR-0049's #464 Amendment). The rule below is unchanged: it is the caller
 * that stopped handing it the carrier.
 *
 * #142 asked for the other repair — a per-token tier that SUBSTITUTES the food
 * word inside the phrase — and it is closed, refuted. Measured over the 62
 * single-word keys and four carriers it rescued **0 of 248**, because the
 * blocker was never the synonym. Its own earlier figure of 72 rescues in 348 was
 * measured against a 4,238-row corpus that no longer exists, and 18 of those
 * came through a `cooked X` carrier ADR-0104 has since emptied. The numbers are
 * in `docs/research/407-when-a-typed-word-reaches-a-food.md` §2;
 * `docs/research/142-carrier-phrase-sweep.md` is the superseded measurement and
 * is not a corpus this branch ships.
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
  /**
   * The DISCARDED name this row was reached through, where one out-scored the
   * row's own — a name the twin merge threw away, or one a hand rename left
   * behind (#137, ADR-0104's amendments). Absent whenever the row answered under
   * the name it ships as, which is almost every search.
   *
   * **Not the same thing as {@link alias}, and it must never be treated as one.**
   * An alias is another NAME FOR the food and is shown to the user as part of the
   * name — `Eggplant (aubergine)`. This is retrieval scaffolding: USDA's filing,
   * or the losing half of a merge. `Eggs, Grade A, Large, egg whole` is a real
   * reason a row surfaced and is emphatically not what the food should be called
   * in somebody's diary, so it is reported HERE rather than handed to
   * {@link searchResultName}, and `usda-corpus.test.ts` holds that line as an
   * invariant over every aliased row in the corpus.
   *
   * Read by `docs/food-search.html`, which explains why a row surfaced, and
   * deliberately by nothing in the app, which only has to answer.
   */
  reachedVia?: string;
}

/** A finished search over the index: the phrases, and the foods they reached. */
export interface IndexSearch extends SearchedPhrases {
  hits: SearchHit[];
}

/**
 * How well one row answers a query, over every name it has: its own, and any the
 * twin merge discarded (#137).
 *
 * The BEST key of all of them — {@link bestOfNames}, which is where that
 * collapse is written and where `named` is taken as the best rung any of the
 * names reached (#465). What this function adds is the row: the four row keys,
 * the two frecency ones, and the alias TEXT a caller can show, which the ranking
 * itself has no handle on.
 *
 * The alias path is skipped entirely for the 1,950 rows that have no alias — no
 * array, no collapse, the row's own key straight back — so a keystroke pays for
 * aliases only where USDA held two names for one food. Pinned in
 * `usda-corpus.test.ts` beside the search limit's figure, for the same reason.
 * That is also why the single-name case does not route through `bestOfNames`:
 * over one key it returns that key, which `reference-food-ranking.test.ts` pins
 * rather than leaves as prose.
 *
 * The row's own four keys join each name's key here, which is the ONE place a
 * finished `RelevanceKey` is built: `rank` scores a name and returns a
 * `NameKey`, so a query scorer has no way to invent a row fact. They decide
 * nothing between a row's own names, being the same for all of them — what they
 * decide is this row against every other.
 */
function bestNameKey(
  rank: ReferenceFoodQuery,
  food: SearchableFood,
  frecency: Frecency
): { key: RelevanceKey; reachedVia?: string } {
  // Spread LAST, over the zeros `buildSearchCorpus` baked in. The other four
  // row keys are read once at load — two of them facts the artifact carries
  // (`raw`, `plain_sibling`) and two computed from it (`canonical`,
  // `designated`); these two are facts about this device's ledger and change
  // with every meal logged, so they cannot be baked and are handed in per
  // search instead.
  const row = { ...food.rank, ...frecency };
  const own: RelevanceKey = { ...rank(food.name), ...row };
  if (food.also.length === 0) return { key: own };
  const { key, via } = bestOfNames([
    own,
    ...food.also.map((name): RelevanceKey => ({ ...rank(name), ...row })),
  ]);
  // Which name won, as an INDEX rather than a string: `ReferenceFoodName` keeps
  // words and stems, never the text it was read from, and `buildSearchCorpus`
  // builds `also` by mapping `row.also` one for one — so the index is the only
  // handle back to the words a person actually typed at. Index 0 is the row's
  // own name, and an alias sits one past its place in `also`.
  return via === 0 ? { key } : { key, reachedVia: food.row.also?.[via - 1] };
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
 * The reference-food filters are NOT among the steps: they ran once at
 * generation time and the index holds only their 4,238 survivors (ADR-0047 §4,
 * widened by ADR-0048 §5), so re-running them per keystroke would be work over a
 * corpus that cannot fail them. The one filter here is about the QUERY rather
 * than the row — a row the typed words reach only past the food's own name, in
 * a set where some row answers on a higher rung, is not an answer (ADR-0062 §1).
 *
 * That filter runs PER PHRASE, and the difference only shows where a vocabulary
 * key expands to several. A phrase is a query, so the rung another phrase
 * reached is not evidence about this one: over the 155 multi-phrase keys the map
 * ships, one bar across the union drops 21 keys' rows that a phrase of their own
 * names — `cacao butter` loses `Oil, cocoa butter` to a cocoa powder — and hands
 * `mandarine` a tangerine where a mandarin answers. Per phrase it keeps
 * everything the union keeps, and those rows besides.
 */
type Scored = {
  row: UsdaIndexRow;
  phrase: string;
  key: RelevanceKey;
  reachedVia?: string;
};

function rankAgainst(
  foods: SearchableFood[],
  phrases: string[],
  frecency: ReadonlyMap<string, Frecency>
): { row: UsdaIndexRow; phrase: string; reachedVia?: string }[] {
  const kept = new Map<UsdaIndexRow, Scored>();
  for (const phrase of phrases) {
    const rank = compileReferenceFoodQuery(phrase);
    const scored: Scored[] = [];
    for (const food of foods) {
      const { key, reachedVia } = bestNameKey(
        rank,
        food,
        frecency.get(mintEntity("fdc:", food.row.fdcId)) ?? NEVER_LOGGED
      );
      if (key.tier > 0) scored.push({ row: food.row, phrase, key, reachedVia });
    }
    for (const hit of withoutStrayMentions(scored)) {
      const held = kept.get(hit.row);
      if (!held || compareRelevance(hit.key, held.key) < 0)
        kept.set(hit.row, hit);
    }
  }
  return [...kept.values()]
    .sort((a, b) => compareRelevance(a.key, b.key))
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(({ row, phrase, reachedVia }) => ({ row, phrase, reachedVia }));
}

/**
 * The reference foods answering `query`, best first. Pure — the corpus is passed
 * in — so the ordering is asserted against the committed artifact rather than
 * through a fetch.
 *
 * Three phrases at most, in two passes.
 *
 * The first pass ranks the typed query AND the same query with every spelling of
 * the uncooked state struck out of it (ADR-0049's #464 Amendment). That second
 * phrase is UNCONDITIONAL, unlike the vocabulary below, and it can be because it
 * is strictly additive: `rankAgainst` keeps each row's best key across the
 * phrases it is given, so a phrase can add rows and improve a row's rung but can
 * never remove one. The population where it changes a query that answers today
 * is one row — a query would have to hold a state word and still match, which
 * only `Seeds, sesame butter, tahini, from raw and stone ground kernels` allows,
 * the last row in 2,023 saying a word the corpus stopped saying.
 *
 * The second pass runs only when the first returns NOTHING (ADR-0049 §1). That
 * gate is the whole of the vocabulary's integration: an expansion can never
 * reorder, displace or truncate a result that exists today, because it does not
 * run when one does, which makes the no-regression property structural rather
 * than disciplinary. It is also why the ranking gains no key, no tier and no
 * clause for the vocabulary — there is never a literal match present for an
 * expanded one to rank against.
 *
 * **The strip runs BEFORE the expansion, and the order is the whole of the
 * rescue.** The map is phrase-keyed and positional, so a key shorter than the
 * query is never reached: `aubergine` expands and `raw aubergine` did not.
 * Stripping first hands the fallback `aubergine`, which is a key, so
 * `raw aubergine` now reaches `Eggplant` under the alias that answered it. That
 * is #142's motivating case, closed by removing a word rather than by
 * substituting one — the substitution repaired the half that was not broken, and
 * `docs/research/407-when-a-typed-word-reaches-a-food.md` §2 has the 0-of-248.
 *
 * Takes the three fields it reads rather than a whole {@link SearchCorpus},
 * which also carries the `schema_version` only #149's log asks for. That is not
 * tidiness: `usda-vocabulary.mjs` swaps the vocabulary on a fixed set of foods
 * per question and hands this exactly those fields, so a whole-corpus parameter
 * would be describing a caller that does not exist.
 */
export function searchIndexRows(
  corpus: Pick<SearchCorpus, "foods" | "vocabulary" | "state_qualifiers">,
  query: string,
  frecency: ReadonlyMap<string, Frecency> = new Map()
): IndexSearch {
  if (!query.trim()) return { phrases: [], hits: [] };
  // `null` for the overwhelming majority of queries, which name no state, and
  // empty for one that was nothing BUT state words. Neither is worth a second
  // phrase: the first would rank the typed query twice and the second would rank
  // an empty query against every row in the corpus.
  const asked = withoutStateQualifiers(query, corpus.state_qualifiers);
  const typedPhrases = asked ? [query, asked] : [query];
  const literal = rankAgainst(corpus.foods, typedPhrases, frecency);
  if (literal.length > 0)
    return {
      phrases: typedPhrases,
      hits: literal.map(({ row, reachedVia }) => ({ row, reachedVia })),
    };
  // What the vocabulary is asked is what the strip left, so a carrier word can
  // no longer hide a key from it. `asked` is empty only where the query was all
  // state words, and the map has no key for that.
  const expanded = expandThroughVocabulary(corpus.vocabulary, asked ?? query);
  if (expanded.length === 0) return { phrases: typedPhrases, hits: [] };
  // The typed query rides along, and costs the ranking nothing: the pass above
  // just proved it matches no row, so it can never be any row's best key. What
  // it buys is the curated table still seeing what was typed (see
  // {@link SearchedPhrases}) — and, for the same reason, a row that somehow won
  // on it carries no alias, because there is no other name to show it under.
  const aliasOf = new Map(expanded.map((e) => [e.phrase, e.alias]));
  const phrases = [...typedPhrases, ...expanded.map((e) => e.phrase)];
  return {
    phrases,
    hits: rankAgainst(corpus.foods, phrases, frecency).map(
      ({ row, phrase, reachedVia }) => ({
        row,
        alias: aliasOf.get(phrase),
        reachedVia,
      })
    ),
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
 * The name comes from {@link searchResultName}, which is the one place the rule
 * lives — `food/name` rather than a sibling attribute because several
 * INDEPENDENT readers show a food's name and only this one goes through here:
 * the consumption fold names a logged event off the twin, the recent list and
 * the recipe ingredient resolver each read their own, and the stager's edit form
 * seeds from it again.
 *
 * `provenance/raw.raw_data` keeps USDA's untouched row, so the widened name
 * never masquerades as USDA's own (ADR-0045 §4) — and `deriveNovaVerdict` reads
 * the description back out of it rather than off this name, because nineteen
 * vocabulary keys carry one of its deny-substrings. Anything else deciding
 * something ABOUT a food has to read it the same way.
 */
/**
 * The name a user sees for a search hit: the row's own, widened by the
 * vocabulary key that reached it.
 *
 * "Eggplant" becomes "Eggplant (aubergine)" (ADR-0049's #140 Amendment). **A
 * user who searched a word deserves to see that word wherever the food turns
 * up**, not only in the results list — so this is the name itself rather than a
 * marker beside it, and it follows the food into the log, the recent list and
 * the recipe resolver.
 *
 * **Parenthesised, not comma-appended.** A comma made the key read as one more
 * of USDA's qualifiers, and 211 of the 452 keys that lead somewhere share a word
 * with the name they land on — `Cabbage, chinese (pe-tsai), raw, napa cabbage`.
 * Stripping the shared word was measured and refused: no alias is fully
 * redundant, so what is left is often the generic half, and `arrowroot powder`
 * becomes `Arrowroot flour, powder` and `beet root` becomes `Beets, raw, root`.
 * Brackets keep the whole key, which is never misleading, and stop it scanning
 * as another qualifier.
 *
 * Its own export, and not inlined into {@link mapIndexRowToPayload}, because
 * `docs/food-search.html` shows search results too and had restated the rule —
 * so the page rendered a bare `Eggplant` beside a separate "reached as" line
 * while the app rendered `Eggplant (aubergine)`. A page that exists to show what
 * the app answers has to call what the app calls (ADR-0047 §4).
 */
export function searchResultName(description: string, alias?: string): string {
  return alias ? `${description} (${alias})` : description;
}

export function mapIndexRowToPayload(
  row: UsdaIndexRow,
  alias?: string
): EntityPayload {
  const attributes: EntityPayload["attributes"] = {
    "food/name": searchResultName(row.description, alias),
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
  attributes["provenance/raw"] = buildRawProvenance({
    adapter: "fdc",
    adapter_version: ADAPTER_VERSION,
    source_uri: `${FDC_FOOD_BASE}/${row.fdcId}`,
    raw_data: row,
    merged_from: row.merged_from,
  });
  return { entity: mintEntity("fdc:", row.fdcId), attributes };
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
 * the payload moves: identity, portions and `provenance/raw` are the row's
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
  /**
   * Whether the typed query retrieved nothing and ADR-0049's vocabulary answered
   * in its place — true exactly when a returned food was reached through a
   * vocabulary key rather than through what was typed.
   *
   * It rides on the answer because it is knowable only here: by the time a
   * caller has the foods, the key that reached them is inside a name. #149's
   * search log is what reads it, and ADR-0053 §3 is why — a rescued query never
   * showed "No food found", so it is recorded under its own outcome and left out
   * of the §7 denominator.
   */
  rescued_by_vocabulary: boolean;
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
  load: () => Promise<SearchCorpus> = loadSearchCorpus,
  frecency: ReadonlyMap<string, Frecency> = new Map()
): Promise<UsdaSearch> {
  if (!query.trim())
    return { phrases: [], foods: [], rescued_by_vocabulary: false };
  const { phrases, hits } = searchIndexRows(await load(), query, frecency);
  return {
    phrases,
    foods: hits.map(({ row, alias }) => mapIndexRowToPayload(row, alias)),
    // A hit carries an alias only on the searches where the typed word reached
    // nothing and the vocabulary offered another, so asking the hits is asking
    // the fallback itself rather than re-deciding what it did.
    rescued_by_vocabulary: hits.some(({ alias }) => alias !== undefined),
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const SEARCH_INDEX_URL = "/usda/search-index.json";
const NUTRIENT_STORE_URL = "/usda/nutrient-store.json";

/**
 * Fetches one bundled artifact, keeping the two ways it can fail apart.
 *
 * **Nothing answered at all** is an offline user (#307). ADR-0077 §5 takes the
 * Nutrient store out of Inventoria's precache — it is read when a food is
 * staged, seconds after launch, where the Search index is what the user is
 * looking at before they do anything — so a cold offline root reaches this with
 * no network and nothing cached, and the caller is handed something it can turn
 * into a sentence naming the network.
 *
 * **A response that is not `ok`** is the other one: the file is on the origin,
 * something served it, and its status is worth reading. That stays the plain
 * error naming the file that this has always thrown. **In Rations both are a
 * broken build or a broken service worker rather than an offline user** — that
 * Facet precaches all three USDA artifacts and owes ADR-0047 §11's promise
 * whole (ADR-0077 §4) — which is why the user-facing half of this is the
 * caller's and not decided here.
 *
 * Say which file either way, because the two artifacts fail for the same
 * reasons and read alike.
 */
async function fetchArtifact<T>(subject: string, url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (cause) {
    throw new ArtifactUnreachableError(subject, url, cause);
  }
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
  loadedCorpus ??= fetchArtifact<SearchIndex>(
    "The food search",
    SEARCH_INDEX_URL
  )
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
  loadedNutrients ??= fetchArtifact<NutrientStore>(
    "The full nutrition panel",
    NUTRIENT_STORE_URL
  ).catch((error) => {
    // Forgotten on failure, for the reason {@link loadSearchCorpus} gives —
    // and here a cached rejection would quietly stage every food of the
    // session on four macros rather than on its panel.
    loadedNutrients = null;
    throw error;
  });
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
