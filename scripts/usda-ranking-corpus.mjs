#!/usr/bin/env node
/**
 * The bundled corpus, ranked the way the app ranks it: the one construction
 * every ranking instrument reads.
 *
 * Its own module because there is now more than one instrument. `--leads` and
 * the audit passes ask whether the ranking reaches the best record; the tie
 * census (`usda-ranking-ties.mjs`) asks what the ranking leaves UNDECIDED. Two
 * questions, one corpus, and the corpus is the part that must not be restated.
 *
 * That is not tidiness. A second instrument that builds its own corpus is how
 * #155's bug arrives: drop `readRowRank` and `compareRelevance` is handed a key
 * with two `undefined` fields, `undefined - undefined` is `NaN`, `NaN` is
 * falsy, and the `||` chain walks straight past both row keys. The run does not
 * fail — it measures a two-key-old ranking and reports it as today's. Split out
 * when #158's census needed the same six steps, and the audit was at 999 lines
 * against the ~1000 `CODING_STANDARDS.md` §4 draws, which is the same wall that
 * split `usda-ranking-queries.mjs` out for #142.
 *
 * The ranking itself is IMPORTED rather than restated, as it is everywhere
 * else here: this measures the code that ships or it measures nothing. Node
 * strips the types itself and `reference-food-ranking.ts` imports nothing.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readReferenceFoodName,
  compileReferenceFoodQuery,
  compareRelevance,
  readRowRank,
  retrievedByName,
} from "../src/lib/food/reference-food-ranking.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");

/** How many results a search shows, so "buried" and "absent" mean something. */
export const RESULT_LIMIT = 50;

export const readIndex = () => JSON.parse(readFileSync(INDEX_PATH, "utf8"));

/**
 * Every row read into names once, which is what `buildSearchCorpus` does — ALL
 * of a row's names, its own and the ones the twin merge discarded (#137), since
 * a keystroke reaches it by any of them — plus the row's own two ranking keys.
 *
 * `readRowRank` is not optional decoration. ADR-0055's `plainSibling` and
 * `designated` read the ROW rather than the name, so a corpus without them
 * hands `compareRelevance` a key missing two fields, and the way it fails is
 * silent: `undefined - undefined` is `NaN`, `NaN` is falsy, and the `||` chain
 * walks straight past both keys to the one after. A sweep run that way measures
 * a two-key-old ranking and says nothing about it (#155).
 */
export const buildCorpus = (index) =>
  index.foods.map((row) => ({
    description: row.description,
    rank: readRowRank(row),
    names: [row.description, ...(row.also ?? [])].map(readReferenceFoodName),
  }));

/**
 * Every row that answers a query, scored and ordered, with no window applied:
 * `searchIndexRows` restated over the plain-JSON row shape. Deliberately the
 * same four steps in the same order — score, drop tier 0, drop the rows the
 * typed words reached only past the food's own name (ADR-0062 §1), sort — so a
 * divergence here is a bug rather than a finding. A row scores as the BEST of
 * its names, which is the fifth thing that has to match and the reason `names`
 * is a list.
 *
 * The sixth is that a scored name carries its ROW's keys too, the way
 * `bestNameKey` spreads them: a restatement that drops them does not rank worse,
 * it ranks differently and quietly, for the `NaN`-is-falsy reason
 * {@link buildCorpus} gives.
 */
export function scoreAll(corpus, query) {
  const rank = compileReferenceFoodQuery(query);
  const scored = corpus
    .map((food) => ({
      description: food.description,
      key: food.names
        .map((name) => ({ ...rank(name), ...food.rank }))
        .reduce((best, key) => (compareRelevance(key, best) < 0 ? key : best)),
    }))
    .filter(({ key }) => key.tier > 0);
  return retrievedByName(scored).sort((a, b) => compareRelevance(a.key, b.key));
}

/**
 * The shipped result list: {@link scoreAll} truncated to the window a user
 * actually meets.
 *
 * The split is not cosmetic. #158's tie census needs the ordering BEFORE the
 * cut — `beef` tied 413 rows when it was written, and any tie past fifty reads
 * as a 50-way one through this window, so a census built on the truncated list
 * reports the window's size rather than the ranking's silence. Seven queries are
 * still past the window, `fish` deepest at 82. Everything asking what the USER
 * suffers wants this one; anything asking what the RANKING decided wants the
 * other.
 */
export const search = (corpus, query) =>
  scoreAll(corpus, query).slice(0, RESULT_LIMIT);
