#!/usr/bin/env node
/**
 * Deriving the search vocabulary ADR-0049 ships inside the search index.
 *
 * `aubergine` retrieves nothing, and so do 432 other phrases naming a food the
 * corpus holds under a name it does not use. #130 measured 236 such misses, and
 * 17 of 20 everyday British queries returning nothing at all. The remedy is a map
 * from each phrase that retrieves nothing to the phrases that do, DERIVED from
 * Open Food Facts\' ingredients taxonomy rather than written by hand: a hand list
 * would need 236 entries to match a file that already exists, and nobody would
 * have written the right 236 (ADR-0049 Context).
 *
 * This module owns the derivation. `usda-bundle.mjs` calls it, and calls it AFTER
 * the corpus is final, because both of ADR-0049 §3\'s filters ask what the
 * FINISHED corpus retrieves: a group whose members all agree cannot change an
 * answer, and "all agree" is a fact about the 4,238 rows that survived ADR-0048
 * §5\'s drops and the ADR-0045 §2 merge, not about the archives they came from.
 *
 * Two properties are load-bearing, and both are the bundle\'s own.
 *
 * **Nothing here restates the search.** "Does this phrase retrieve anything?" is a
 * question only the shipped ranking can answer, and it is asked through the same
 * esbuild seam the reference-food filters come through. A second implementation
 * would decide a key belongs in the map by rules the app does not use, and every
 * disagreement would ship as a key that already answers or a miss that never got
 * one.
 *
 * **The map is committed, so the diff is the review gate.** OFF publishes the
 * taxonomy at one unversioned URL and rewrites it in place, so a taxonomy that
 * moves has to arrive as changed phrases in a pull request rather than as changed
 * behaviour in production.
 *
 * Nothing in the app reads the map yet: the retrieval fallback ADR-0049 §1
 * describes is #140.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The share of the corpus above which a target phrase is not a synonym.
 *
 * MEASURED, not chosen. ADR-0049 §3 names three cases the guard has to catch —
 * `salt` matches 427 of the 4,238 rows, `whole` 209, `beans` 115 — and
 * `wholemeal -> [whole, whole grain]` is the entry that shows why: expanding to
 * a word 217 unrelated descriptions happen to contain answers with a page of
 * arbitrary rows rather than with wholemeal bread.
 *
 * The value is picked from a PLATEAU rather than a preference. Sorted by breadth,
 * the surviving targets step 424, 217, 116, 116, 89, 88, 83, 77, 57, 44, 43, and
 * every threshold between 44 and 56 rows (1.0% to 1.26% of the corpus) therefore
 * produces the identical map. 1.1% sits in the middle of that band, so a corpus
 * that moves by a tenth does not move the vocabulary with it. Each run prints
 * what the guard dropped and the widest phrase it kept, so the measurement is
 * restated rather than remembered.
 *
 * Tightening it to reproduce ADR-0049's own 425 keys would need ~0.61%, which
 * additionally drops `yoghurt -> yogurt`, `soya bean -> soybean`,
 * `minced beef -> ground beef` and `milk cream -> cream`. Those are synonyms by
 * any reading, and losing them would defeat the record's own purpose.
 */
export const VOCABULARY_TARGET_SHARE = 0.011;

/**
 * Every English synonym group OFF names more than one way.
 *
 * Members are lower-cased, trimmed and de-duplicated because OFF's own lists
 * repeat names in different cases; left alone that would mint two keys the
 * search cannot tell apart. A single-member group is dropped here rather than
 * later: it has nothing to expand and nothing to expand to.
 *
 * @param {Record<string, { synonyms?: Record<string, string[]> }>} taxonomy
 * @returns {{ tag: string, members: string[] }[]}
 */
export function readTaxonomyGroups(taxonomy) {
  const groups = [];
  for (const [tag, entry] of Object.entries(taxonomy)) {
    const members = [
      ...new Set(
        (entry.synonyms?.en ?? []).map((name) => name.toLowerCase().trim())
      ),
    ].filter(Boolean);
    if (members.length > 1) groups.push({ tag, members });
  }
  return groups;
}

/**
 * The taxonomy groups reduced to the map ADR-0049 §3 ships: a phrase that
 * retrieves nothing, mapped to the phrases in its group that do.
 *
 * `countMatches` is a parameter rather than a corpus, so the derivation is
 * asserted against a handful of stated retrieval counts instead of against 4,238
 * rows — and so the one impure, expensive step stays in one place.
 *
 * The steps, in this order:
 *
 *   EFFECT FILTER   keep a group only if a member retrieves nothing AND a member
 *                   retrieves something. A group whose members all agree cannot
 *                   change an answer, whichever way they agree.
 *   DENY-LIST       drop the groups that name nothing a person types.
 *   INVERT          miss -> the members that answer. Phrases, never `fdcId`s:
 *                   freezing rows here would pin the ranking #124 exists to
 *                   change, and a corpus refresh would silently redirect a key.
 *   STOPWORD GUARD  drop a target broader than {@link VOCABULARY_TARGET_SHARE},
 *                   and with it any key that guard leaves with nothing to reach.
 *   SORT            by key, so a regeneration diffs as changed entries.
 *
 * The two properties the map has to hold are checked by
 * {@link assertVocabularyHolds} rather than here, because a check that shares
 * this function's cache can only agree with it.
 *
 * Targets keep OFF's own member order rather than being sorted: the taxonomy
 * lists a group's canonical name first, and that is information a later reader
 * of the map can use. It is deterministic either way, which is what the stable
 * diff needs.
 *
 * @param {{ tag: string, members: string[] }[]} groups
 * @param {{ denied: readonly string[], countMatches: (phrase: string) => number, corpusSize: number }} options
 */
export function deriveVocabulary(groups, { denied, countMatches, corpusSize }) {
  const deniedTags = new Set(denied);
  const limit = VOCABULARY_TARGET_SHARE * corpusSize;

  let effective_groups = 0;
  let denied_groups = 0;
  /** @type {Map<string, Set<string>>} */
  const inverted = new Map();
  for (const group of groups) {
    const counts = group.members.map(countMatches);
    if (!counts.some((rows) => rows === 0)) continue;
    if (!counts.some((rows) => rows > 0)) continue;
    effective_groups++;
    if (deniedTags.has(group.tag)) {
      denied_groups++;
      continue;
    }
    const misses = group.members.filter((_, at) => counts[at] === 0);
    const targets = group.members.filter((_, at) => counts[at] > 0);
    for (const key of misses) {
      const reached = inverted.get(key) ?? new Set();
      for (const target of targets) reached.add(target);
      inverted.set(key, reached);
    }
  }

  /** @type {{ phrase: string, rows: number }[]} */
  const dropped_targets = [];
  const orphaned_keys = [];
  const kept = new Map();
  for (const [key, targets] of inverted) {
    const within = [];
    for (const target of targets) {
      const rows = countMatches(target);
      if (rows <= limit) within.push(target);
      else if (!dropped_targets.some((d) => d.phrase === target))
        dropped_targets.push({ phrase: target, rows });
    }
    if (within.length) kept.set(key, within);
    else orphaned_keys.push(key);
  }

  /** @type {Record<string, string[]>} */
  const expansions = {};
  for (const key of [...kept.keys()].sort()) expansions[key] = kept.get(key);

  dropped_targets.sort((a, b) => b.rows - a.rows);
  const widest = [...kept.values()]
    .flat()
    .map((phrase) => ({ phrase, rows: countMatches(phrase) }))
    .sort((a, b) => b.rows - a.rows)[0];
  return {
    expansions,
    effective_groups,
    denied_groups,
    dropped_targets,
    orphaned_keys: orphaned_keys.sort(),
    widest_target: widest ?? null,
    limit,
  };
}

/**
 * Re-measures a finished map and refuses it unless both of ADR-0049's properties
 * hold: every key retrieves nothing, and every key reaches something that does.
 *
 * `countMatches` must be a counter this map was NOT built with. Handed the
 * derivation's own memoised counter it would read back the cached answers that
 * admitted each phrase in the first place and could never fail — which is a
 * restatement, not a check. Given a fresh one it measures the map that is about
 * to be written against the corpus that is about to be written beside it.
 *
 * The properties are worth a generation that stops rather than a test that goes
 * red later. A key that already answers would put an expansion in front of a
 * literal match, which ADR-0049 §1's zero-results trigger exists to prevent; a
 * key that reaches nothing would answer "No food found" twice, more slowly.
 *
 * @param {Record<string, string[]>} expansions
 * @param {(phrase: string) => number} countMatches
 */
export function assertVocabularyHolds(expansions, countMatches) {
  for (const [key, targets] of Object.entries(expansions)) {
    if (countMatches(key) !== 0)
      throw new Error(
        `"${key}" retrieves rows of its own and cannot be a vocabulary key`
      );
    if (!targets.some((target) => countMatches(target) > 0))
      throw new Error(`"${key}" expands to nothing that retrieves`);
  }
  return expansions;
}

/**
 * What a derivation did, in two lines, printed by every regeneration.
 *
 * The stopword guard's threshold is measured rather than chosen, and this is
 * where the measurement is restated instead of remembered: what the guard
 * dropped and how wide each of those was, which keys went with them, and how
 * much daylight there is between the widest phrase kept and the narrowest one
 * refused. A threshold nobody can see the evidence for is a threshold picked by
 * taste one refresh later.
 *
 * @param {ReturnType<typeof deriveVocabulary>} vocabulary
 */
export function describeVocabulary(vocabulary) {
  const keys = Object.keys(vocabulary.expansions);
  const targets = new Set(Object.values(vocabulary.expansions).flat());
  const describe = ({ phrase, rows }) => `${phrase} ${rows}`;
  return (
    `  vocabulary: ${keys.length} phrases that retrieve nothing reach ` +
    `${targets.size} that do, from ${vocabulary.effective_groups} OFF groups ` +
    `that could change an answer (${vocabulary.denied_groups} denied)\n` +
    `  guard at ${(VOCABULARY_TARGET_SHARE * 100).toFixed(1)}% of the corpus ` +
    `(${vocabulary.limit.toFixed(0)} rows) dropped ` +
    `${vocabulary.dropped_targets.length} targets ` +
    `[${vocabulary.dropped_targets.map(describe).join(", ")}] and with them ` +
    `${vocabulary.orphaned_keys.length} keys ` +
    `[${vocabulary.orphaned_keys.join(", ")}]; widest kept ` +
    `${vocabulary.widest_target ? describe(vocabulary.widest_target) : "none"}`
  );
}

/**
 * How many rows a phrase reaches, memoised, asked the way a keystroke asks it.
 *
 * The two filters ask the same question of thousands of phrases and of the same
 * phrase from several groups, so the names are read once and the answers are
 * kept. It counts rather than ranks: the map only ever needs "nothing" against
 * "something", and `SEARCH_RESULT_LIMIT` would hide the breadth the stopword
 * guard measures.
 *
 * A row is read as ALL of its names — its description and any alias the twin
 * merge left it (#137) — because that is what a keystroke reaches it by. A
 * counter that modelled descriptions alone would measure a corpus the app no
 * longer searches, and both of ADR-0049 §3's filters are stated over what the
 * finished corpus retrieves.
 *
 * **It counts the rows a phrase SCORES, and ADR-0062 §1's cut is deliberately
 * not applied.** Since #176 the app also discards a row whose every typed token
 * landed past the food's own name, where some row answers on a strictly higher
 * rung — so this is a wider count than a search returns, and #177 measured both
 * of the questions above against the narrower one before leaving it out:
 *
 *   EFFECT FILTER   the cut CANNOT change the answer. `withoutStrayMentions`
 *                   sets its bar from a row that is `named`, and a `named` row
 *                   always clears it, so a non-empty set can never come back
 *                   empty (pinned in `reference-food-ranking.test.ts`). "Does
 *                   this phrase retrieve anything?" is the same question either
 *                   way, which is why teaching the derivation the rule prunes
 *                   no key at all — the regeneration that tried it ADDED two.
 *   STOPWORD GUARD  the cut makes it measure the wrong thing. The guard asks
 *                   whether a target is a word unrelated descriptions merely
 *                   CONTAIN, and the cut narrows which of those a search
 *                   returns without making the word any more of a synonym:
 *                   under it `whole` reaches five rows rather than 209, and
 *                   `wholemeal -> [whole, whole grain]` — the entry
 *                   {@link VOCABULARY_TARGET_SHARE} names as the reason the
 *                   guard exists — is readmitted and leads with
 *                   `Turkey from whole, light meat, …`.
 *
 * @param {{ description: string, also?: string[] }[]} rows
 * @param {{ readReferenceFoodName: (description: string) => object, compileReferenceFoodQuery: (query: string) => (name: object) => { tier: number } }} app
 */
export function retrievalCounter(rows, app) {
  const namesPerRow = rows.map((row) =>
    [row.description, ...(row.also ?? [])].map((description) =>
      app.readReferenceFoodName(description)
    )
  );
  const counted = new Map();
  return (phrase) => {
    const known = counted.get(phrase);
    if (known !== undefined) return known;
    const rank = app.compileReferenceFoodQuery(phrase);
    let reached = 0;
    for (const names of namesPerRow)
      if (names.some((name) => rank(name).tier > 0)) reached++;
    counted.set(phrase, reached);
    return reached;
  };
}

/**
 * The `vocabulary_off` section as the artifact carries it (ADR-0049 §4): the map
 * under its own licence, source, url and digest.
 *
 * Self-describing, and a section of its own rather than folded into `foods`, for
 * a licensing reason as much as a tidiness one. The map is a substantial
 * extraction from OFF and so a derivative database under ODbL; keeping it
 * distinct makes `search-index.json` a collective work with one ODbL component
 * rather than an ODbL artifact, and leaves room for a future hand-written
 * `vocabulary_local` outside the derivative.
 *
 * @param {Record<string, string[]>} expansions
 * @param {{ url: string, sha256: string, licence: string, source: string }} pinned
 */
export function buildVocabularySection(expansions, pinned) {
  return {
    licence: pinned.licence,
    source: pinned.source,
    url: pinned.url,
    sha256: pinned.sha256,
    expansions,
  };
}

// ---------------------------------------------------------------------------
// The hand-written section (ADR-0049's #141 Amendment)
// ---------------------------------------------------------------------------

/**
 * The `vocabulary_local` section as the artifact carries it: the same
 * phrase→phrases map the derived section ships, and nothing else.
 *
 * A section of its own rather than eight more keys in `vocabulary_off`, and the
 * reason is the licence ADR-0049 §4 wrote it in for. The derived map is a
 * substantial extraction from OFF and therefore a derivative database under
 * ODbL; these words are nobody's extraction, and folding them in would put them
 * inside an obligation they do not owe. It carries no `url` and no `sha256`
 * because there is nothing upstream to pin, and no `licence` because declaring
 * one here is the mistake — the absence is what says this half is not the
 * derivative.
 *
 * `landsOn` and `why` do not travel. They are what a generation and a reviewer
 * hold an entry to, and shipping them would put a paragraph per entry in a file
 * every user downloads to say something no reader of it can act on.
 *
 * @param {{ key: string, targets: readonly string[] }[]} entries
 */
export function buildLocalVocabularySection(entries) {
  /** @type {Record<string, string[]>} */
  const expansions = {};
  for (const entry of [...entries].sort((a, b) => a.key.localeCompare(b.key)))
    expansions[entry.key] = [...entry.targets];
  return {
    source:
      "Inventoria, hand-written — not derived from Open Food Facts, and so " +
      "outside the ODbL derivative beside it (ADR-0049 §4)",
    expansions,
  };
}

/**
 * Refuses the hand list unless every one of ADR-0049's #141 admissions holds.
 *
 * Three of the four are mechanical, and each is the SAME question asked over a
 * different vocabulary — which is what makes them three admissions rather than
 * one opinion:
 *
 *   ADMISSION 1  over NO vocabulary, the key must lead with nothing. A phrase
 *                that already answers is one §1's zero-results trigger would
 *                never reach.
 *   ADMISSION 3  over the DERIVED map, the key must still lead with nothing. A
 *                word OFF knows is not a word to spend a hand-written line on,
 *                and an entry shadowing a derived one would leave two maps
 *                disagreeing with the merge order deciding.
 *   ADMISSION 2  over the ENTRY ALONE, the key must lead with the row the entry
 *                names. This is the one the whole list waited on #143 for: it
 *                pins a claim about the finished corpus AND the shipped ranking,
 *                so a refresh that moves the answer fails the build instead of
 *                silently redirecting `caster sugar`.
 *
 * Admission 4 — that the key is a name in everyday use rather than a brand or a
 * dish — no machine can check, so what is enforced is that a human wrote a
 * reason down.
 *
 * `leads` is a parameter rather than a corpus, the arrangement
 * {@link deriveVocabulary} uses for `countMatches` and for the same two reasons:
 * the admissions are asserted against a handful of stated answers instead of
 * 4,238 rows, and the one impure, expensive step stays in
 * {@link leadingRowReader}.
 *
 * The ceiling comes in with the entries because it is recorded beside them, in
 * `food-vocabulary.ts`, where the human adding a ninth reads it. A generator
 * that owned the number would let the list and its limit drift apart.
 *
 * @param {{ key: string, targets: readonly string[], landsOn: string, why: string }[]} entries
 * @param {{ derived: Record<string, string[]>, leads: (query: string, vocabulary: Record<string, string[]>) => string | null, ceiling: number }} options
 */
export function assertLocalVocabularyHolds(
  entries,
  { derived, leads, ceiling }
) {
  if (entries.length > ceiling)
    throw new Error(
      `the hand-written vocabulary is ${entries.length} entries, over its ` +
        `ceiling of ${ceiling}. The ceiling is not a cap to ` +
        "raise: reaching it says the vocabulary problem is bigger than a hand " +
        "list and wants re-deriving (ADR-0049's #141 Amendment)."
    );
  const seen = new Set();
  for (const { key } of entries) {
    if (seen.has(key))
      throw new Error(`"${key}" appears twice in the hand list`);
    seen.add(key);
  }

  for (const { key, targets, landsOn, why } of entries) {
    if (!why.trim())
      throw new Error(
        `"${key}" records no reason for being a name in everyday use. That is ` +
          "the one admission no machine can check, so it is the one a human " +
          "has to write down."
      );
    const literal = leads(key, {});
    if (literal !== null)
      throw new Error(
        `"${key}" already retrieves — it leads with "${literal}". The fallback ` +
          "runs only on zero results, so nothing would ever reach this entry."
      );
    const already = leads(key, derived);
    if (already !== null)
      throw new Error(
        `"${key}" is already reached by the derived vocabulary, which leads ` +
          `with "${already}". A word OFF's taxonomy knows is not one to write ` +
          "by hand."
      );
    const led = leads(key, { [key]: [...targets] });
    if (led === null)
      throw new Error(
        `"${key}" reaches nothing: none of [${targets.join(", ")}] retrieves.`
      );
    if (led !== landsOn)
      throw new Error(
        `"${key}" leads with "${led}", not "${landsOn}" as its entry records. ` +
          "Either the corpus moved under the entry or the ranking did; " +
          "re-measure and re-choose rather than restating what it now does."
      );
  }
  return entries;
}

/**
 * What a phrase leads with over this corpus and a given vocabulary, or `null`
 * for a phrase that answers nothing. The one impure, expensive step behind
 * {@link assertLocalVocabularyHolds}.
 *
 * It asks the app's OWN search — the fallback, the two matching tiers, the six
 * ranking keys and the alias scoring, none of them restated here — because
 * admission 2 is a claim about what a user typing the key SEES, and only the
 * shipped search can answer that. `retrievalCounter` beside it cannot: the map's
 * derivation needs "nothing" against "something" and deliberately does not rank.
 *
 * The names are read ONCE, off the finished index, and the vocabulary is swapped
 * on the corpus per question. Rebuilding the corpus per call would re-read 4,238
 * descriptions to change one field.
 *
 * @param {object} index the finished search index, as it is about to be written
 * @param {{ buildSearchCorpus: (index: object) => { foods: object[] }, searchIndexRows: (corpus: object, query: string) => { hits: { row: { description: string } }[] } }} app
 */
export function leadingRowReader(index, app) {
  const { foods } = app.buildSearchCorpus(index);
  return (query, vocabulary) =>
    app.searchIndexRows({ foods, vocabulary }, query).hits[0]?.row
      .description ?? null;
}

/**
 * The hand list held to its admissions against the finished index, and the one
 * line the run reports about it.
 *
 * The check and its report together, where the derived map keeps them apart in
 * {@link assertVocabularyHolds} and {@link describeVocabulary}. The split there
 * earns its keep because a derivation has a measurement to restate — what the
 * stopword guard dropped, and by how much. A hand list has none: what passed IS
 * the report.
 *
 * It is asked of the FINISHED index rather than of the survivors, because every
 * admission is a claim about what a user typing the key sees — the fallback and
 * the ranking the app ships, over the rows about to be written beside them.
 *
 * @param {object} index the finished search index, as it is about to be written
 * @param {Parameters<typeof leadingRowReader>[1] & { LOCAL_VOCABULARY: readonly { key: string }[], LOCAL_VOCABULARY_CEILING: number }} app
 */
export function admitLocalVocabulary(index, app) {
  const entries = assertLocalVocabularyHolds(app.LOCAL_VOCABULARY, {
    derived: index.vocabulary_off.expansions,
    leads: leadingRowReader(index, app),
    ceiling: app.LOCAL_VOCABULARY_CEILING,
  });
  return (
    `  hand-written: ${entries.length} of ${app.LOCAL_VOCABULARY_CEILING} ` +
    `entries OFF's taxonomy does not carry, each leading with the row it ` +
    `records [${entries.map((entry) => entry.key).join(", ")}]`
  );
}

/**
 * The pinned vocabulary source, read from the local copy and checked against the
 * manifest digest (ADR-0049 §2).
 *
 * It reads and never downloads, the rule the archives beside it follow, and for
 * the sharper reason: OFF publishes this file at one unversioned URL and rewrites
 * it in place, so a generation that fetched would derive the map from whatever
 * happened to be served that minute and the committed diff would stop meaning
 * anything. `pnpm usda:backup fetch` is where a refresh happens, deliberately.
 */
export async function readVocabularySource(pinned, dir) {
  const path = join(dir, pinned.file);
  const body = await readFile(path).catch(() => null);
  if (body === null)
    throw new Error(
      `${pinned.file} is not in ${dir}. Run \`pnpm usda:backup fetch\` first.`
    );
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (sha256 !== pinned.sha256)
    throw new Error(
      `${pinned.file}: sha256 ${sha256}, manifest says ${pinned.sha256}. The ` +
        "artifact states the digest it was derived from, so generating from " +
        "undescribed bytes would publish a provenance claim that is false."
    );
  return JSON.parse(body.toString("utf8"));
}
