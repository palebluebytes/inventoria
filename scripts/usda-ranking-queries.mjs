#!/usr/bin/env node
/**
 * The query vocabulary `usda-ranking-audit.mjs` sweeps with, and how it is
 * derived.
 *
 * Its own module because it is a different job on a different clock: it fetches
 * an external taxonomy, hashes it and writes `130-audit-inputs.json`, and it
 * changes when OFF's taxonomy or the group filter changes, never when a pass
 * does. The audit reads the pinned result and never this file, except under
 * `--vocab`. Split out when #142's carrier pass pushed the audit past the
 * ~1000-line line `CODING_STANDARDS.md` §4 draws, the same way #139 split
 * `usda-vocabulary.mjs` out of the generator.
 *
 * Why a derived vocabulary at all is argued in the audit's own header: a recall
 * miss is by construction a query whose words the right record does not carry,
 * so a query set drawn from corpus text cannot produce one.
 */

import { createHash } from "node:crypto";
import {
  qualifiersOf,
  readReferenceFoodName,
  wordsOf,
} from "../src/lib/food/reference-food-ranking.ts";

/**
 * OFF's ingredients taxonomy, the query vocabulary's source. The `.full`
 * variant, NOT the `ingredients.json` the app already fetches in
 * `off-taxonomy.ts` (ADR-0043 §4) — that one is 3.2 MB and carries `name` only.
 * Synonyms live in this file and nowhere else.
 */
const OFF_TAXONOMY_URL =
  "https://static.openfoodfacts.org/data/taxonomies/ingredients.full.json";

/**
 * ~20 everyday British-usage queries, the one gap OFF's American-leaning
 * English structurally leaves. Fixed BEFORE the sweep ran and counted on their
 * own denominator — a hand-written list blended into a mechanical sweep would
 * make every percentage in the note uninterpretable.
 */
export const BRITISH_QUERIES = [
  "courgette",
  "aubergine",
  "rocket",
  "coriander",
  "spring onion",
  "swede",
  "beetroot",
  "mange tout",
  "chickpeas",
  "prawns",
  "gammon",
  "mince",
  "porridge oats",
  "double cream",
  "natural yoghurt",
  "cornflour",
  "plain flour",
  "caster sugar",
  "sultanas",
  "jacket potato",
];

/**
 * Fetches OFF's taxonomy and keeps the English synonym groups that reach this
 * corpus at all. The filter is "at least one member retrieves something": a
 * group naming an additive or a manufacturing input touches no reference food,
 * and 1,370 of 1,919 groups are that. It is applied HERE, at derivation, so the
 * committed vocabulary is the set actually measured.
 *
 * Members are lowercased and de-duplicated because OFF's lists repeat entries in
 * different cases, which would otherwise inflate the member counts.
 *
 * `search` is passed in rather than imported: the derivation's whole question
 * is "does this phrase retrieve anything", and the answer has to come from the
 * same scorer the sweep then measures with.
 */
export async function deriveVocabulary(corpus, search) {
  const response = await fetch(OFF_TAXONOMY_URL);
  if (!response.ok)
    throw new Error(`OFF taxonomy fetch failed (${response.status}).`);
  const body = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(body).digest("hex");
  const taxonomy = JSON.parse(body.toString("utf8"));

  const groups = [];
  for (const [tag, entry] of Object.entries(taxonomy)) {
    const members = [
      ...new Set((entry.synonyms?.en ?? []).map((s) => s.toLowerCase().trim())),
    ].filter(Boolean);
    if (members.length < 2) continue;
    if (!members.some((m) => search(corpus, m).length > 0)) continue;
    groups.push({
      tag,
      members,
      // OFF's own cross-references, kept so the note can report whether a cheap
      // "is this a whole food" filter would have matched the hand judgement.
      usda_ndb_code: entry.usda_ndb_code?.en,
      ciqual_food_code: entry.ciqual_food_code?.en,
    });
  }
  return {
    source: {
      url: OFF_TAXONOMY_URL,
      sha256,
      bytes: body.length,
      fetched: new Date().toISOString().slice(0, 10),
      licence: "ODbL, Open Food Facts",
    },
    note: "Derived set: the English multi-synonym groups that reach the bundled corpus. The 6.4 MB source is not committed and never enters the app bundle; the sha256 above pins what was measured.",
    groups,
    british_queries: BRITISH_QUERIES,
  };
}

/**
 * Every query a lead sweep should ask of the corpus, from the corpus itself.
 *
 * The instrument #151 and #154 both had to hand-roll, and the reason it exists
 * here rather than in either ticket's scratch directory: the sweep ADR-0055 §2
 * quotes could not contain the cases the rule it priced was written for, twice
 * over. Its first form was every head phrase and every head word, so every
 * query of more than one word was outside it by construction — the Amendment
 * says so. Its 3,390-query replacement added `qualifier + head` pairs, and
 * still could not generate `red wine` or a bare `wine`, because for a
 * shelf-labelled row the head is `alcoholic beverage`: the pair it builds is
 * `wine alcoholic beverage`, which nobody types.
 *
 * So two of the four shapes anchor on where the food's OWN NAME starts rather
 * than on the head phrase, and `readReferenceFoodName` is asked where that is —
 * imported, never restated, so the roster deciding it has one home (ADR-0047
 * §4).
 *
 * - **head** — every head phrase, and every word of one.
 * - **name** — the bare word USDA files a shelf-labelled food under: `wine`,
 *   `tea`, `salmon`, `basil`. No earlier shape could produce these at all.
 * - **pair** — `adjective noun` over the food's own name, which is the shape
 *   #124 is about: `red wine` and `table wine`, not `wine alcoholic beverage`.
 *
 * Deliberately not wired into any pass. The passes photograph an ordering for
 * hand adjudication and their query sets are pinned by what they have already
 * measured; this answers a different question — what did a change MOVE — and is
 * read by `--leads`, which writes nothing and judges nothing.
 */
export function sweepQueries(descriptions) {
  const queries = new Set();
  for (const description of descriptions) {
    const parts = qualifiersOf(description);
    if (!parts.length) continue;
    queries.add(parts[0]);
    for (const word of wordsOf(parts[0])) queries.add(word);

    // Where the food's own name starts: past the shelf label, if there is one.
    const shelved = readReferenceFoodName(description).shelfLength > 0;
    const nameIndex = shelved ? 1 : 0;
    const nameWords = wordsOf(parts[nameIndex] ?? "");
    if (!nameWords.length) continue;
    if (shelved) for (const word of nameWords) queries.add(word);

    // The noun an adjective is put in front of is the last word of that part:
    // "wine" from `wine`, "vinegar" from `Vinegar`, "milk" from `Soy milk`.
    const noun = nameWords[nameWords.length - 1];
    for (let i = nameIndex + 1; i < parts.length; i++) {
      const adjective = wordsOf(parts[i])[0];
      if (adjective && adjective !== noun) queries.add(`${adjective} ${noun}`);
    }
  }
  return [...queries].sort();
}
