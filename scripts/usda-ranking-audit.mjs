#!/usr/bin/env node
/**
 * Does a food search reach the best record the corpus holds, and does it lead
 * with it? The measurement behind research note #130.
 *
 *   pnpm usda:ranking-audit --vocab     # re-derive the pinned query vocabulary
 *   pnpm usda:ranking-audit             # run the sweep, write the candidate set
 *   pnpm usda:ranking-audit --explain "napa"   # why is a record not in the corpus
 *
 * TWO failures, measured separately and never blended, because they have
 * different causes, different sizes and different harms:
 *
 *   RECALL   — is the best record in the result set at all. `green onion`
 *              returns ONE row, and `Onions, spring or scallions …` is not
 *              further down it: the record scores NO_MATCH and never enters.
 *   RANKING  — given it was retrieved, where did it land. This is #124's class,
 *              where `olive oil` puts the right record at rank 2 of a full list.
 *
 * The `qualifier` pass is #124's own pre-registration and reads differently from
 * the other four: it measures a CHANGE rather than a state, by ordering every
 * query twice — once under the shipped ranking and once under the four keys that
 * preceded the position key — and reporting both directions of the difference.
 * See {@link qualifierPass}.
 *
 * The query vocabulary is the hard part and the reason this file exists rather
 * than a handful of assertions. A recall miss is BY CONSTRUCTION a query whose
 * words the right record does not contain, so a query set derived from corpus
 * text cannot generate one — every such query trivially retrieves its own row.
 * A hand-written list is no better: it is a guess about a distribution nobody
 * has looked at, which is the objection #130 raises against fixing this from a
 * single example. So the vocabulary comes from OFF's ingredients taxonomy, an
 * independent source that has never seen this ranking, and each synonym group
 * carries its own oracle — when `wombok` retrieves nothing, a sibling member has
 * already named the record it should have reached.
 *
 * Node built-ins only, and the ranking is IMPORTED rather than restated: this
 * measures the code that ships or it measures nothing. That works because Node
 * strips the types itself and `reference-food-ranking.ts` imports nothing.
 *
 * It changes no ranking code and asserts nothing. It is a dated finding, not an
 * invariant, so it is deliberately not wired into `pnpm check` — a gate here
 * would fail on every legitimate ranking improvement and train people to
 * regenerate without reading. Cases worth locking get pinned as ordinary corpus
 * tests by the ticket that fixes them, the way #113 and #131 did.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readReferenceFoodName,
  compileReferenceFoodQuery,
  compareRelevance,
} from "../src/lib/food/reference-food-ranking.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");
const INPUTS_PATH = join(ROOT, "docs", "research", "130-audit-inputs.json");
const CANDIDATES_PATH = join(
  ROOT,
  "docs",
  "research",
  "130-ranking-audit.json"
);
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");

/**
 * OFF's ingredients taxonomy, the query vocabulary's source. The `.full`
 * variant, NOT the `ingredients.json` the app already fetches in
 * `off-taxonomy.ts` (ADR-0043 §4) — that one is 3.2 MB and carries `name` only.
 * Synonyms live in this file and nowhere else.
 */
const OFF_TAXONOMY_URL =
  "https://static.openfoodfacts.org/data/taxonomies/ingredients.full.json";

/** How many results a search shows, so "buried" and "absent" mean something. */
const RESULT_LIMIT = 50;

/** Head+qualifier pairs are #124's evidence, not this ticket's, so they sample. */
const PAIR_SAMPLE = 200;
const PAIR_SEED = 130;

// ── the corpus, ranked the way the app ranks it ────────────────────────────

const readIndex = () => JSON.parse(readFileSync(INDEX_PATH, "utf8"));

/** Every row read into words once, which is what `buildSearchCorpus` does. */
const buildCorpus = (index) =>
  index.foods.map((row) => ({
    description: row.description,
    name: readReferenceFoodName(row.description),
  }));

/**
 * The shipped result list for a query: `searchIndexRows` restated over the
 * plain-JSON row shape. Deliberately the same four steps in the same order —
 * score, drop tier 0, sort, truncate — so a divergence here is a bug rather
 * than a finding.
 */
function search(corpus, query) {
  const rank = compileReferenceFoodQuery(query);
  return corpus
    .map((food) => ({ description: food.description, key: rank(food.name) }))
    .filter(({ key }) => key.tier > 0)
    .sort((a, b) => compareRelevance(a.key, b.key))
    .slice(0, RESULT_LIMIT);
}

/**
 * The order this ranking produced BEFORE #124's position key: tier, rawness,
 * head-completeness, raw simplicity. The one place in this file that restates
 * ranking rather than importing it, because a diff needs a second ordering and
 * the code that ships only carries one. It reads the shipped key's own fields
 * and simply declines to consult `position`, so it cannot drift from the four
 * keys it names.
 */
const comparePreviousRelevance = (a, b) =>
  b.tier - a.tier ||
  b.raw - a.raw ||
  b.head - a.head ||
  b.simplicity - a.simplicity;

/** Where a known description landed, 1-based; 0 for absent from the window. */
const rankOf = (results, description) =>
  results.findIndex((r) => r.description === description) + 1;

/** Q6's harm buckets: what the user actually suffers, not a raw position. */
const harmOf = (rank) =>
  rank === 1
    ? "leads"
    : rank === 0
      ? "absent"
      : rank <= 5
        ? "visible"
        : "buried";

// ── the query vocabulary ───────────────────────────────────────────────────

/**
 * ~20 everyday British-usage queries, the one gap OFF's American-leaning
 * English structurally leaves. Fixed BEFORE the sweep ran and counted on their
 * own denominator — a hand-written list blended into a mechanical sweep would
 * make every percentage in the note uninterpretable.
 */
const BRITISH_QUERIES = [
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
 */
async function deriveVocabulary(corpus) {
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

// ── the three passes ───────────────────────────────────────────────────────

/** Deterministic sampling: a seeded LCG, so a re-run draws the same pairs. */
function seededPick(items, count, seed) {
  let state = seed;
  const pool = [...items];
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    state = (state * 1103515245 + 12345) % 2147483648;
    picked.push(pool.splice(state % pool.length, 1)[0]);
  }
  return picked;
}

/** Top rows plus their keys — enough for a human to check the machine's work. */
const summarise = (results) =>
  results.slice(0, 5).map((r) => ({
    description: r.description,
    tier: r.key.tier,
    raw: r.key.raw,
    head: r.key.head,
    position: r.key.position,
  }));

/**
 * The recall+ranking pass. Each member is searched; the group's own members
 * supply the candidate answers, and the disagreement between them is the signal.
 * The two flags are counted INDEPENDENTLY — a group can both disagree and have a
 * member retrieving nothing, and `en:chinese-cabbage` is exactly that.
 */
function synonymPass(corpus, groups) {
  const cases = [];
  for (const group of groups) {
    const members = group.members.map((query) => {
      const results = search(corpus, query);
      return {
        query,
        found: results.length,
        top: results[0]?.description ?? null,
        results: summarise(results),
      };
    });
    const reached = members.filter((m) => m.top);
    if (reached.length === 0) continue;
    const distinctTops = new Set(reached.map((m) => m.top));
    const disagrees = distinctTops.size > 1;
    const someEmpty = members.some((m) => !m.top);
    if (!disagrees && !someEmpty) continue;

    // Where each member's top row lands in every OTHER member's list. This is
    // what separates the two failures: an `absent` here is a recall miss and a
    // number is a ranking miss saying how far down the right answer was.
    //
    // Ranks are keyed by POSITION in `tops` rather than repeated as strings.
    // The same matrix written out longhand cost 137 KB, which is why it looks
    // like this and not like a list of {description, rank} objects.
    const tops = [...distinctTops];
    const ranks = {};
    for (const member of members) {
      const results = search(corpus, member.query);
      ranks[member.query] = tops.map((d) => rankOf(results, d));
    }

    cases.push({
      pass: "synonym",
      tag: group.tag,
      disagrees,
      some_member_retrieves_nothing: someEmpty,
      usda_ndb_code: group.usda_ndb_code ?? null,
      ciqual_food_code: group.ciqual_food_code ?? null,
      members,
      harm: { tops, ranks },
      verdict: null,
      cause: null,
      note: null,
    });
  }
  return cases;
}

/**
 * The contested-head pass: of the rows sharing a head phrase, does the generic
 * query lead with the canonical one. 272 heads carry more than one row and 257
 * carry exactly one, and the latter win their own name vacuously, so only the
 * contested ones are emitted.
 */
function headPass(corpus, index) {
  const byHead = new Map();
  for (const food of index.foods) {
    const head = (food.description.split(",")[0] ?? "").trim().toLowerCase();
    if (!byHead.has(head)) byHead.set(head, []);
    byHead.get(head).push(food.description);
  }
  const cases = [];
  for (const [head, rows] of byHead) {
    if (rows.length < 2) continue;
    const results = search(corpus, head);
    cases.push({
      pass: "head",
      query: head,
      row_count: rows.length,
      results: summarise(results),
      verdict: null,
      cause: null,
      note: null,
    });
  }
  return cases;
}

/**
 * The head+qualifier pass, which is #124's `olive oil` shape: USDA writes the
 * food as "Oil, olive, …", so the everyday phrasing puts the qualifier first.
 * Sampled, because these are evidence handed to #124 rather than the set #130's
 * own thresholds are judged against.
 *
 * Kept as #130 committed it, and superseded as #124's evidence by
 * {@link qualifierPass}, which sweeps the same query shape exhaustively and
 * diffs the two orderings instead of photographing one.
 */
function pairPass(corpus, index) {
  const pairs = new Set();
  for (const food of index.foods) {
    const parts = food.description
      .split(",")
      .map((p) => p.trim().toLowerCase());
    const qualifier = parts[1]?.split(/\s+/)[0];
    if (parts.length > 1 && qualifier) pairs.add(`${qualifier} ${parts[0]}`);
  }
  const sampled = seededPick([...pairs].sort(), PAIR_SAMPLE, PAIR_SEED);
  return sampled.map((query) => ({
    pass: "pair",
    query,
    results: summarise(search(corpus, query)),
    verdict: null,
    cause: null,
    note: null,
  }));
}

/**
 * #124's pre-registered pass: what did the position key move, in both
 * directions?
 *
 * The other four passes photograph one ordering. This one measures a CHANGE, so
 * it orders every query twice — under the shipped comparator, and under
 * {@link comparePreviousRelevance}, the four keys that preceded the position
 * key — and diffs them. There is no adjudicator anywhere in it: the query set,
 * the answer set and both orderings are structural, so every number below is a
 * count rather than a judgement. A pre-registration whose failure mode is
 * invisible is what produced the sizing #124 had to overturn.
 *
 * QUERIES are the everyday phrasing USDA's naming inverts: it writes a food
 * "Noun, adjective, …" and English says "adjective noun", so each row admits
 * `<its first qualifier word> <its head phrase>` — "olive oil" from
 * "Oil, olive, …", "cheddar cheese" from "Cheese, cheddar, …". A qualifier word
 * already in the head is skipped, since it would ask nothing new.
 *
 * ANSWERS are every row that legitimately serves the query: same head phrase,
 * with that qualifier word somewhere past it. Wider than the one row the query
 * was generated from, deliberately — "bacon pork" is served by every cured
 * bacon in the corpus, and a pass that only watched the generating row could
 * not see the other five move.
 *
 * BOTH DIRECTIONS then fall out. An answer that rises is `improved`, one that
 * falls is `worsened`, and the columns are counted independently because one
 * query routinely does both: `bacon pork` lifts "Pork, bacon, rendered fat,
 * cooked" over five cured-bacon records, which is the cost #124 accepted in
 * advance rather than guarded against. Preferring a whole food over its rendered
 * fat is the reserved-slot key (#143), not this one.
 *
 * The headline the ticket asks for is `lead_beaten_on_position`: how many
 * queries lead with a row that some candidate below it beats on summed token
 * index. That is the defect stated as a number, before and after.
 */
function qualifierPass(corpus) {
  const headOf = (description) => {
    const name = readReferenceFoodName(description.split(",")[0] ?? "");
    return name.words.join(" ");
  };

  const queries = new Set();
  for (const food of corpus) {
    const parts = food.description.split(",");
    if (parts.length < 2) continue;
    const head = headOf(food.description);
    const qualifier = readReferenceFoodName(parts[1]).words[0];
    if (!head || !qualifier || head.split(" ").includes(qualifier)) continue;
    queries.add(`${qualifier} ${head}`);
  }

  const cases = [];
  let leadBeatenBefore = 0;
  let leadBeatenAfter = 0;
  let improved = 0;
  let worsened = 0;

  for (const query of [...queries].sort()) {
    const [qualifier, ...headWords] = query.split(" ");
    const head = headWords.join(" ");
    const answers = new Set(
      corpus
        .filter(
          (food) =>
            headOf(food.description) === head &&
            food.name.words.slice(food.name.headLength).includes(qualifier)
        )
        .map((food) => food.description)
    );

    const rank = compileReferenceFoodQuery(query);
    const scored = corpus
      .map((food) => ({ description: food.description, key: rank(food.name) }))
      .filter(({ key }) => key.tier > 0);
    if (scored.length === 0) continue;

    const after = [...scored].sort((a, b) => compareRelevance(a.key, b.key));
    const before = [...scored].sort((a, b) =>
      comparePreviousRelevance(a.key, b.key)
    );
    // "The leading row is beaten on summed token index by a candidate below it"
    // — the defect, counted rather than described.
    const leadBeaten = (order) =>
      order.some((r) => r.key.position > order[0].key.position);
    if (leadBeaten(before)) leadBeatenBefore++;
    if (leadBeaten(after)) leadBeatenAfter++;

    // Counted over EVERY query, before the lead-changed filter below: an answer
    // can rise or fall while the row above it stays put, and a count that only
    // watched the leads would report a smaller sweep than it ran.
    const moved = [...answers]
      .map((description) => ({
        description,
        before: rankOf(before, description),
        after: rankOf(after, description),
      }))
      .filter((a) => a.before !== a.after);
    const rose = moved.filter((a) => a.after < a.before).length;
    const fell = moved.filter((a) => a.after > a.before).length;
    improved += rose;
    worsened += fell;

    // Only the queries whose LEAD moved are emitted as cases. The rest moved
    // rows nobody was looking at first, and 1,328 records of that would bury the
    // 76 that a reader has to check.
    if (before[0].description === after[0].description) continue;

    cases.push({
      pass: "qualifier",
      query,
      answers: answers.size,
      led_before: before[0].description,
      leads_after: after[0].description,
      improved: rose,
      worsened: fell,
      moved,
      verdict: null,
      cause: null,
      note: null,
    });
  }

  return {
    cases,
    queries: queries.size,
    leadBeatenBefore,
    leadBeatenAfter,
    improved,
    worsened,
  };
}

/** The British-usage list, on its own denominator (see {@link BRITISH_QUERIES}). */
const britishPass = (corpus, queries) =>
  queries.map((query) => ({
    pass: "british",
    query,
    results: summarise(search(corpus, query)),
    verdict: null,
    cause: null,
    note: null,
  }));

// ── absence post-mortem ────────────────────────────────────────────────────

/**
 * Why a record is not in the corpus: our own filter dropped it, or USDA never
 * had it. Only the archives can tell those apart, and the distinction matters
 * because #131 and #133 both tightened those filters on 2026-08-20.
 *
 * Separate mode rather than part of the sweep: it is needed only where
 * adjudication concludes the right record is absent entirely, which the group's
 * own members usually disprove.
 */
async function explainAbsence(term) {
  const { countArchiveRecords } = await import("./usda-archive.mjs");
  // The filters live in `usda-fdc.ts`, which Node's type-stripping cannot load
  // directly the way it loads the ranking: that module imports its siblings
  // extensionless, and bare Node will not resolve those. `usda-bundle.mjs`
  // already solved this for the same filters, so borrow its loader rather than
  // keep a second copy of the answer.
  const { loadAppModule } = await import("./usda-bundle.mjs");
  const scratch = await mkdtemp(join(tmpdir(), "ranking-audit-"));
  const app = await loadAppModule(scratch);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const needle = term.toLowerCase();
  const shipped = new Set(readIndex().foods.map((f) => f.description));
  const hits = [];

  for (const archive of manifest.archives) {
    if (archive.dataset === "Survey (FNDDS)") continue;
    const zip = readFileSync(join(ROOT, ".usda-backup", archive.file));
    // Same contract as `usda:coverage`: prove the bytes are the ones the
    // manifest describes before quoting a figure derived from them.
    const sha256 = createHash("sha256").update(zip).digest("hex");
    if (sha256 !== archive.sha256)
      throw new Error(`${archive.file}: sha256 mismatch against the manifest.`);

    await countArchiveRecords(zip, archive.root_key, (text) => {
      const food = JSON.parse(text);
      if (!food?.description?.toLowerCase().includes(needle)) return;
      hits.push({
        dataset: archive.dataset,
        description: food.description,
        shipped: shipped.has(food.description),
        // The ADR-0042 filters in the order `usda-bundle.mjs` applies them, so
        // the answer names the FIRST rule that would have taken the record —
        // which is the one that actually did.
        dropped_by: app.isBrandSpecific(food.description)
          ? "brand_specific"
          : app.isProcessedProduct(food.description)
            ? "processed"
            : app.isPreparedProduct(food.foodCategory, food.description)
              ? "prepared"
              : app.isDryBasisRecord(food.description)
                ? "dry_basis"
                : app.isManufacturingInput(food.description)
                  ? "manufacturing_input"
                  : null,
      });
    });
  }
  await rm(scratch, { recursive: true, force: true });
  return hits;
}

// ── prior adjudications ────────────────────────────────────────────────────

/**
 * Identity of a case across runs: the thing that was judged, not the judgement.
 * A synonym case is a taxonomy group; every other pass is one query.
 */
const identityOf = (kase) => `${kase.pass}:${kase.tag ?? kase.query}`;

/**
 * Carries the hand adjudications forward onto a fresh sweep.
 *
 * #130 judged 914 cases by hand, and the note's whole claim to be arguable rests
 * on those judgements being in the file "so they can be disagreed with
 * individually rather than taken on trust". A plain regenerate silently resets
 * every one of them to null, which is what happened when #124's pass was first
 * added — the ranking work destroyed the record it was measured against. So the
 * previous file is read back and its verdicts are re-attached by identity.
 *
 * A verdict was made against the ordering of its own run, so a carried one can
 * be stale. Rather than pretend otherwise, a case whose leading row has moved
 * since is flagged `verdict_stale`, which says exactly what a re-reader has to
 * look at again. The flag is sticky, because the next regenerate compares
 * against the run that already moved the row and would otherwise read false.
 * Cases the sweep no longer emits — a synonym group whose members now agree —
 * take their verdicts with them, and the count is reported.
 */
function carryVerdicts(cases, previousPath) {
  let previous;
  try {
    previous = JSON.parse(readFileSync(previousPath, "utf8"));
  } catch {
    return { carried: 0, stale: 0, dropped: 0 };
  }
  const judged = new Map(
    previous.cases
      .filter((kase) => kase.verdict !== null)
      .map((kase) => [identityOf(kase), kase])
  );
  // The leading row a judgement was looking at, however the pass records it.
  const leadOf = (kase) =>
    kase.pass === "synonym"
      ? (kase.members ?? []).map((m) => m.top ?? "").join("|")
      : (kase.results?.[0]?.description ?? null);

  let carried = 0;
  let stale = 0;
  for (const kase of cases) {
    const before = judged.get(identityOf(kase));
    if (!before) continue;
    kase.verdict = before.verdict;
    kase.cause = before.cause;
    kase.note = before.note;
    // Sticky. A second regenerate compares against the run that already moved
    // the row, so a freshly-computed flag would read false and the doubt would
    // quietly disappear. It clears when a human re-judges the case, not when the
    // script runs again.
    kase.verdict_stale =
      (before.verdict_stale ?? false) || leadOf(kase) !== leadOf(before);
    carried++;
    if (kase.verdict_stale) stale++;
    judged.delete(identityOf(kase));
  }
  return { carried, stale, dropped: judged.size };
}

// ── entry point ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const index = readIndex();
const corpus = buildCorpus(index);

if (args.includes("--vocab")) {
  const vocabulary = await deriveVocabulary(corpus);
  writeFileSync(INPUTS_PATH, JSON.stringify(vocabulary, null, 2) + "\n");
  console.log(
    `Pinned ${vocabulary.groups.length} applicable groups from ${vocabulary.source.url}`
  );
  console.log(`  sha256 ${vocabulary.source.sha256}`);
} else if (args.includes("--explain")) {
  const term = args[args.indexOf("--explain") + 1];
  for (const hit of await explainAbsence(term)) {
    const state = hit.shipped
      ? "SHIPPED"
      : `dropped by ${hit.dropped_by ?? "no_energy (ADR-0048) or the twin merge"}`;
    console.log(`${state.padEnd(34)} ${hit.description}`);
  }
} else {
  const inputs = JSON.parse(readFileSync(INPUTS_PATH, "utf8"));
  const qualifier = qualifierPass(corpus);
  const cases = [
    ...synonymPass(corpus, inputs.groups),
    ...headPass(corpus, index),
    ...pairPass(corpus, index),
    ...britishPass(corpus, inputs.british_queries),
    ...qualifier.cases,
  ];
  const tally = (pass) => cases.filter((c) => c.pass === pass).length;
  // Before anything is written: the hand judgements this file already carries.
  const adjudications = carryVerdicts(cases, CANDIDATES_PATH);
  const output = {
    measured: {
      // What a later run needs to tell "the ranking changed" from "the corpus
      // changed" — the two explanations a bare diff cannot distinguish.
      index_rows: index.foods.length,
      index_generated_from: index.generated_from,
      vocabulary_sha256: inputs.source.sha256,
      vocabulary_groups: inputs.groups.length,
      result_limit: RESULT_LIMIT,
      pair_sample: PAIR_SAMPLE,
      pair_seed: PAIR_SEED,
    },
    // #130's hand judgements, re-attached to this sweep. `stale` are the ones
    // whose leading row has moved since they were made and which therefore need
    // re-reading; `dropped` are cases this sweep no longer emits, whose verdicts
    // went with them.
    adjudications,
    // Q6's harm distribution over every (member, candidate) pair the synonym
    // pass produced. Aggregated here rather than stamped on each case: per case
    // it is a one-line map of `harm.ranks`, but the distribution is the metric
    // the finding actually quotes.
    harm: cases
      .filter((c) => c.pass === "synonym")
      .flatMap((c) => Object.values(c.harm.ranks).flat())
      .reduce((acc, r) => {
        const bucket = harmOf(r);
        acc[bucket] = (acc[bucket] ?? 0) + 1;
        return acc;
      }, {}),
    counts: {
      synonym_flagged: tally("synonym"),
      synonym_disagree: cases.filter((c) => c.disagrees).length,
      synonym_some_empty: cases.filter((c) => c.some_member_retrieves_nothing)
        .length,
      contested_heads: tally("head"),
      pairs_sampled: tally("pair"),
      british: tally("british"),
      // #124's pass. Only the queries whose LEAD moved are emitted as cases, so
      // this count is smaller than the query set the two counters below span.
      qualifier_queries: qualifier.queries,
      qualifier_lead_changed: tally("qualifier"),
      // The defect, before and after: a leading row that something below it
      // beats on summed token index.
      qualifier_lead_beaten_on_position_before: qualifier.leadBeatenBefore,
      qualifier_lead_beaten_on_position_after: qualifier.leadBeatenAfter,
      // Both directions, over every row that legitimately answers any of the
      // queries above — not only the ones whose lead moved. A query routinely
      // appears in both columns; `bacon pork` is the pre-named example, and #124
      // accepted it in advance.
      qualifier_answers_improved: qualifier.improved,
      qualifier_answers_worsened: qualifier.worsened,
    },
    cases,
  };
  writeFileSync(CANDIDATES_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output.counts, null, 2));
  console.log(
    `carried ${adjudications.carried} hand verdicts (${adjudications.stale} now stale, ${adjudications.dropped} dropped with their case)`
  );
}
