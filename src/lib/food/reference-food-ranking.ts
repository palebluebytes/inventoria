/**
 * ADR-0042's reference-food ranking: how a free-text query orders the foods it
 * reaches. Its own module because it outlives its first caller — the FDC search
 * API built it, and the bundled corpus (ADR-0047) is what runs it now, over
 * 4,491 rows per keystroke rather than over one page of API results.
 */

/**
 * A reference food's name, read the way ranking reads it: as words rather than
 * as a string, with the query-independent half of the score already settled.
 *
 * Separated from the description because the corpus a keystroke ranks is now the
 * whole 4,491-row Search index (ADR-0047 §4). Re-splitting every description on
 * every keystroke measured 17 ms; splitting each once and comparing the words
 * costs 1.4 ms, and the split does not depend on what was typed.
 */
export interface ReferenceFoodName {
  /** Every word of the description, lowercased. */
  words: string[];
  /** Those words with a trailing "s" dropped, so "grapes" answers "grape". */
  stems: string[];
  /**
   * How many leading words belong to the head phrase — the part before the first
   * comma, which is the food itself in USDA's "Food, qualifier" naming. A count
   * rather than a second array: the comma is a word separator too, so the head's
   * words are exactly the first `headLength` of `words`.
   */
  headLength: number;
  /** Characters across the head phrase's words, for head-completeness. */
  headChars: number;
  /** 1 for a raw food, 0 otherwise — the base-ingredient preference. */
  raw: number;
  /** Raw simplicity: "Bananas, raw" (3) over "Bananas, overripe, raw" (2). */
  simplicity: number;
}

/** Drops a trailing plural "s", the whole of the stemming this ranking does. */
const stemOf = (word: string): string =>
  word.endsWith("s") ? word.slice(0, -1) : word;

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Reads a description into the shape ranking compares. Pure, and cheap enough to
 * call per search hit; the bundled corpus calls it once per row at load instead.
 */
export function readReferenceFoodName(description: string): ReferenceFoodName {
  const words = wordsOf(description);
  const head = wordsOf(description.split(",")[0] ?? "");
  const lower = description.toLowerCase().trim();
  // Base-ingredient preference: someone searching a food wants the raw base
  // form, so raw ("… raw" anywhere in the name) outranks every processed form.
  const raw = /\braw\b/.test(lower) ? 1 : 0;
  // Simplicity tiebreak among raw foods: "Bananas, raw" (3) over "Bananas,
  // overripe, raw" (2) over anything merely containing "raw" (1) over the rest.
  const simplicity = lower.endsWith(", raw")
    ? (lower.match(/,/g) || []).length === 1
      ? 3
      : 2
    : raw;
  return {
    words,
    stems: words.map(stemOf),
    headLength: head.length,
    headChars: head.reduce((n, w) => n + w.length, 0),
    raw,
    simplicity,
  };
}

/**
 * How well one name answers a query, as the ordered keys the ranking sorts on.
 * Larger is better in every field, and each is only consulted when the one
 * before it ties.
 */
export interface RelevanceKey {
  /**
   * Structural relevance, strongest first: the head phrase IS the query (40) >
   * every token is a whole word (20) > every token merely prefix-matches (10) >
   * no match at all (0). Each tier's floor clears the one below plus the maximum
   * `simplicity` (3), so a stronger match never loses to a weaker one on
   * raw-ness alone.
   */
  tier: number;
  /** The name's raw-ness, carried through so one comparison reads one key. */
  raw: number;
  /** How completely the query fills the head phrase; negative chars-to-go. */
  head: number;
  /** The name's raw simplicity, carried through for the same reason. */
  simplicity: number;
}

/** A name that does not answer the query at all — every later key is moot. */
const NO_MATCH: RelevanceKey = { tier: 0, raw: 0, head: 0, simplicity: 0 };

/** A head phrase the query does not cover, ranked below every one it does. */
const HEAD_UNMATCHED = -1e6;

/** Orders two relevance keys best-first, for `Array.prototype.sort`. */
export function compareRelevance(a: RelevanceKey, b: RelevanceKey): number {
  return (
    b.tier - a.tier ||
    b.raw - a.raw ||
    b.head - a.head ||
    b.simplicity - a.simplicity
  );
}

/**
 * A free-text query compiled once: scores one reference-food name, with `tier` 0
 * meaning the name does not answer the query at all.
 */
export type ReferenceFoodQuery = (name: ReferenceFoodName) => RelevanceKey;

/**
 * Compiles a query into the ADR-0042 scorer, the ONE place the ordering of a
 * food search lives.
 *
 * A prefix query returns lookalikes — "grape*" reaches grapefruit, grape-nuts
 * and grape soda, and "soy milk" reaches foods matching only one word
 * ("Beverages, rice milk") — and a source's own relevance floats those above the
 * real thing. So the order is re-derived from how *exactly* the name matches:
 * head-phrase, then whole-word, then mere prefix; then the raw base-ingredient
 * preference; then how completely the query fills the head phrase; then raw
 * simplicity. Sorting is stable, so the candidate order breaks any remaining tie.
 *
 * It scores each name once rather than comparing two, because a comparator
 * re-derives both sides on every one of the ~n log n comparisons — 205 ms for a
 * bare "b" over the bundled corpus, against 5 ms for scoring then sorting.
 *
 * An empty query has no tokens, so every test over them passes vacuously and no
 * head word can be one: every name lands in the whole-word tier, undifferentiated.
 * Callers that treat an empty query as "no search" guard it before compiling.
 */
export function compileReferenceFoodQuery(query: string): ReferenceFoodQuery {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/\*+$/, ""))
    .filter(Boolean);
  const tokenStems = tokens.map(stemOf);
  const queryChars = tokens.reduce((n, t) => n + t.length, 0);

  return ({ words, stems, headLength, headChars, raw, simplicity }) => {
    // Within a structural tier, prefer the food whose head phrase is fully
    // prefix-matched by the query and shortest. This is what orders results
    // while the user is still mid-word: for "grap", the stems can't yet match
    // "grapes", so every grape food collapses into the prefix tier — and this
    // floats "Grapes, …" (head "grapes", 2 chars past the query) above
    // "Grapefruit, …" (6 past) and "Grape leaves, …" (unmatched 2nd head word),
    // which the raw-food preference would otherwise rank first.
    const headScore = (): number => {
      if (headLength === 0) return HEAD_UNMATCHED;
      for (let i = 0; i < headLength; i++)
        if (!tokens.some((t) => words[i].startsWith(t))) return HEAD_UNMATCHED;
      return -(headChars - queryChars);
    };

    // Weakest signal: every token prefix-matches some word (mirrors the "*"
    // search). This is what lets grapefruit in for a "grape" query.
    const prefixed = tokens.every((t) => words.some((w) => w.startsWith(t)));

    // Strongest: the head phrase IS the query — every head word is a query token
    // — so the food's name is exactly what was searched. Separates "Grapes, red,
    // seedless, raw" (head "grapes") from "Grape leaves, raw" (head "grape
    // leaves") and "Grapefruit, raw" (head "grapefruit"). Reached only through
    // the prefix match, so a "green grape" query can't head-match red grapes.
    if (prefixed && headLength > 0) {
      let headIsQuery = true;
      for (let i = 0; i < headLength && headIsQuery; i++)
        headIsQuery = tokenStems.includes(stems[i]);
      if (headIsQuery) return { tier: 40, raw, head: headScore(), simplicity };
    }

    // Stronger than a bare prefix: every token equals some whole word (modulo
    // plural) — "grape" is really present as a word, not just as the head of a
    // longer one.
    const tier = tokenStems.every((t) => stems.includes(t))
      ? 20
      : prefixed
        ? 10
        : 0;
    if (tier === 0) return NO_MATCH;
    return { tier, raw, head: headScore(), simplicity };
  };
}
