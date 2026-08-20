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
                : null,
      });
    });
  }
  await rm(scratch, { recursive: true, force: true });
  return hits;
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
  const cases = [
    ...synonymPass(corpus, inputs.groups),
    ...headPass(corpus, index),
    ...pairPass(corpus, index),
    ...britishPass(corpus, inputs.british_queries),
  ];
  const tally = (pass) => cases.filter((c) => c.pass === pass).length;
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
    },
    cases,
  };
  writeFileSync(CANDIDATES_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify(output.counts, null, 2));
}
