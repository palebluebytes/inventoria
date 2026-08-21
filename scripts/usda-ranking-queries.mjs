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
