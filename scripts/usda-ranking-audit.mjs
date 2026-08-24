#!/usr/bin/env node
/**
 * Does a food search reach the best record the corpus holds, and does it lead
 * with it? The measurement behind research note #130.
 *
 *   pnpm usda:ranking-audit --vocab     # re-derive the pinned query vocabulary
 *   pnpm usda:ranking-audit             # run the sweep, write the candidate set
 *   pnpm usda:ranking-audit --explain "napa"   # why is a record not in the corpus
 *   pnpm usda:ranking-audit --leads     # one line per query: what leads it today
 *   pnpm usda:ranking-audit --leads q.txt      # ...asking the queries in a file
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
 * The `carrier` pass is #142's, and is the one that asks about RETRIEVAL rather
 * than about order: the vocabulary fallback is phrase-keyed, so `aubergine`
 * expands and `raw aubergine` does not, and the pass measures what a single
 * per-token substitution would have filled. See {@link carrierPass}.
 *
 * No dependencies of its own, and the ranking is IMPORTED rather than restated:
 * this measures the code that ships or it measures nothing. That works because
 * Node strips the types itself and `reference-food-ranking.ts` imports nothing.
 *
 * The `carrier` pass needs the SEARCH rather than the ranking, and that one
 * cannot be imported bare — `usda-corpus.ts` imports its siblings extensionless.
 * So a plain sweep bundles the app through `usda-app-module.mjs` and needs
 * esbuild, reached from the PATH or through `nix shell`, as `--explain` already
 * did. Node built-ins only remains true of everything else here.
 *
 * It changes no ranking code and asserts nothing. It is a dated finding, not an
 * invariant, so it is deliberately not wired into `pnpm check` — a gate here
 * would fail on every legitimate ranking improvement and train people to
 * regenerate without reading. Cases worth locking get pinned as ordinary corpus
 * tests by the ticket that fixes them, the way #113 and #131 did.
 *
 * The committed `130-ranking-audit.json` is OLDER than the tool that writes it.
 * It was last regenerated before ADR-0055, and #155 fixed the row-key bug
 * {@link buildCorpus} describes without regenerating it, because
 * {@link carryVerdicts} would have stuck a sticky `verdict_stale` on every one
 * of #130's hand judgements whose lead had moved — destroying the record as a
 * side effect of a ranking change, which is the exact thing that function was
 * written to prevent. Regenerating and re-judging it is its own ticket.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveVocabulary, sweepQueries } from "./usda-ranking-queries.mjs";
import {
  readReferenceFoodName,
  compileReferenceFoodQuery,
  compareRelevance,
  readRowRank,
  wordsOf,
  stemOf,
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

/** How many results a search shows, so "buried" and "absent" mean something. */
const RESULT_LIMIT = 50;

/** Head+qualifier pairs are #124's evidence, not this ticket's, so they sample. */
const PAIR_SAMPLE = 200;
const PAIR_SEED = 130;

// ── the corpus, ranked the way the app ranks it ────────────────────────────

const readIndex = () => JSON.parse(readFileSync(INDEX_PATH, "utf8"));

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
const buildCorpus = (index) =>
  index.foods.map((row) => ({
    description: row.description,
    rank: readRowRank(row),
    names: [row.description, ...(row.also ?? [])].map(readReferenceFoodName),
  }));

/**
 * The shipped result list for a query: `searchIndexRows` restated over the
 * plain-JSON row shape. Deliberately the same four steps in the same order —
 * score, drop tier 0, sort, truncate — so a divergence here is a bug rather
 * than a finding. A row scores as the BEST of its names, which is the fifth
 * thing that has to match and the reason `names` is a list.
 *
 * The sixth is that a scored name carries its ROW's keys too, the way
 * `bestNameKey` spreads them: a restatement that drops them does not rank worse,
 * it ranks differently and quietly, for the `NaN`-is-falsy reason
 * {@link buildCorpus} gives.
 */
function search(corpus, query) {
  const rank = compileReferenceFoodQuery(query);
  return corpus
    .map((food) => ({
      description: food.description,
      key: food.names
        .map((name) => ({ ...rank(name), ...food.rank }))
        .reduce((best, key) => (compareRelevance(key, best) < 0 ? key : best)),
    }))
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

// ── the passes ─────────────────────────────────────────────────────────────

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
    // A row's OWN name, not the best of its names. This pass is #124's frozen
    // pre-registration and it diffs two orderings of one key; letting #137's
    // aliases into it would fold a second change into a difference the whole
    // pass exists to attribute. `twinPass` is where the aliases are measured.
    const ownName = (food) => food.names[0];
    const answers = new Set(
      corpus
        .filter((food) => {
          const name = ownName(food);
          return (
            headOf(food.description) === head &&
            name.words.slice(name.headLength).includes(qualifier)
          );
        })
        .map((food) => food.description)
    );

    const rank = compileReferenceFoodQuery(query);
    const scored = corpus
      .map((food) => ({
        description: food.description,
        key: rank(ownName(food)),
      }))
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

/**
 * The British-usage list, on its own denominator — see `BRITISH_QUERIES` in
 * `usda-ranking-queries.mjs`, which is where the list is fixed.
 */
const britishPass = (corpus, queries) =>
  queries.map((query) => ({
    pass: "british",
    query,
    results: summarise(search(corpus, query)),
    verdict: null,
    cause: null,
    note: null,
  }));

/**
 * The app's own filters, merge, ranking and search, bundled and imported.
 *
 * Two modes here need it — `--explain` re-runs the generator and the `carrier`
 * pass borrows the shipped search — and both need it exactly once, so the
 * scratch directory it is built in is opened and removed here rather than twice
 * over. `usda-app-module.mjs` is the seam itself; this is only how this script
 * holds it.
 */
async function borrowApp() {
  const { loadAppModule } = await import("./usda-app-module.mjs");
  const scratch = await mkdtemp(join(tmpdir(), "ranking-audit-"));
  try {
    return await loadAppModule(scratch);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/**
 * The carrier shapes #142's sweep types each substitutable vocabulary key
 * inside, and the word each is priced on.
 *
 * The first three are the ticket's own, kept verbatim. Two of them name a word
 * the corpus barely holds — 3 rows carry `chopped` and 10 carry `salad` — so a
 * sweep over those alone would return a null about the word rather than about
 * the mechanism; the last three are added for reach. Every one of the six is
 * priced against the corpus in the output, so a reader can see which carrier
 * could have indicted anything (research note #142 §4).
 *
 * The carrier's POSITION is not varied, because it cannot change the answer:
 * retrieval asks only whether every typed token matches somewhere and is blind
 * to where, so `courgette salad` and `salad courgette` retrieve the same rows
 * and differ only in the ordering `position` gives them.
 */
const CARRIERS = [
  { word: "raw", carry: (name) => `raw ${name}` },
  { word: "chopped", carry: (name) => `chopped ${name}` },
  { word: "salad", carry: (name) => `${name} salad` },
  { word: "cooked", carry: (name) => `cooked ${name}` },
  { word: "fresh", carry: (name) => `fresh ${name}` },
  { word: "dried", carry: (name) => `dried ${name}` },
];

/**
 * The vocabulary keys a single substitution could safely replace anywhere in a
 * query: one token in, one token out.
 *
 * Counted with the app's own `wordsOf` rather than on whitespace, because that
 * is what a per-token substitution would replace. The two differ: `crêpe` and
 * `jícama` hold no ASCII-alphanumeric run across the accent, so the tokeniser
 * reads them as two tokens each and four keys that look single-word are not.
 * They lose nothing by it today — a typed query goes through the same function,
 * so both halves line up on both sides — but they are not this mechanism's.
 */
const substitutableEntries = (vocabulary) =>
  Object.entries(vocabulary).filter(
    ([key, phrases]) =>
      wordsOf(key).length === 1 &&
      phrases.every((phrase) => wordsOf(phrase).length === 1)
  );

/**
 * The carrier pass (#142): the vocabulary expands `aubergine` and not
 * `raw aubergine`, so how much is that costing?
 *
 * Pre-registered in `docs/research/142-carrier-phrase-sweep.md`, whose §3 is the
 * reason this measures what it does. That every probe returns nothing is a
 * PROOF, not a finding: retrieval admits a row only when every typed token
 * matches it, a vocabulary key is in the map precisely because no row answers
 * its token, and adding a carrier word cannot make that token match. So the
 * number that decides the ticket is not how many probes are empty — all of them
 * are — but how many one substitution would FILL, which is the objection the
 * ticket raises against itself and the count it asks for does not answer.
 *
 * It runs the probes anyway, to check that proof against the shipped code and
 * because `expandThroughVocabulary` has a second tier the proof does not cover:
 * it also matches a key LONGER than the query, so a probe could in principle be
 * answered by a two-word key whose first word starts with `raw`. Any probe that
 * answers is a finding about that tier.
 *
 * Alone among the passes here it borrows the app's own `searchIndexRows` rather
 * than the restated {@link search}, through the same seam ADR-0047 §4's
 * import-don't-copy rule already provides. The restated helper knows nothing of
 * the vocabulary, which is right for every other pass and wrong for this one:
 * the vocabulary is the whole subject, and a bare key retrieves NOTHING
 * literally, so scoring it here would measure a search the app does not run.
 * The cost is that a plain sweep now needs esbuild, as `--explain` already did.
 */
async function carrierPass(index, corpus) {
  const app = await borrowApp();
  // The MERGED map, which is what a keystroke reads: the derived section and
  // #141's hand-written one, joined by the app rather than by this file. The
  // ticket and its triage comment both size the subset against `vocabulary_off`
  // alone, and the merge moves the denominator.
  const searchable = app.buildSearchCorpus(index);
  const entries = substitutableEntries(searchable.vocabulary);
  const hitsFor = (query) => app.searchIndexRows(searchable, query).hits;
  // The one statement of what a rescue is. Both the per-case count and the
  // per-shape tallies below read it, so the two cannot drift apart.
  const rescues = (carrier) =>
    carrier.probe_found === 0 && carrier.expansion_found > 0;

  const cases = entries.map(([key, phrases]) => {
    const carriers = CARRIERS.map(({ carry }) => {
      const probe = carry(key);
      const probeHits = hitsFor(probe);
      // Each value in turn, first one that retrieves wins — exactly the k-capped
      // candidate list the deferred mechanism would build, one substitution deep.
      let expansion = carry(phrases[0]);
      let expansionHits = [];
      for (const candidate of phrases) {
        const hits = hitsFor(carry(candidate));
        if (hits.length > 0) {
          expansion = carry(candidate);
          expansionHits = hits;
          break;
        }
      }
      return {
        shape: carry("X"),
        probe,
        probe_found: probeHits.length,
        expansion,
        expansion_found: expansionHits.length,
        expansion_top: expansionHits[0]?.row.description ?? null,
      };
    });
    return {
      pass: "carrier",
      query: key,
      expands_to: phrases,
      // What the bare key leads with today, through the fallback this ticket
      // would extend — the context a rescue has to be read against. Descriptions
      // only, because the shipped search returns rows rather than keys; the field
      // keeps the name every other pass uses so {@link carryVerdicts} can see the
      // lead move.
      results: hitsFor(key)
        .slice(0, 5)
        .map((hit) => ({ description: hit.row.description })),
      carriers,
      rescued: carriers.filter(rescues).length,
      verdict: null,
      cause: null,
      note: null,
    };
  });

  // The per-shape tallies, folded OUT of the cases rather than accumulated while
  // building them: the cases are the measurement and these are a view of it, so
  // reading them back is what keeps the two from disagreeing.
  const shapes = CARRIERS.map(({ word, carry }, i) => {
    const column = cases.map((kase) => kase.carriers[i]);
    return {
      shape: carry("X"),
      // Rows carrying the carrier word at all. A carrier the corpus does not use
      // cannot indict the vocabulary: `chopped courgette` retrieves nothing, and
      // so does `chopped zucchini`.
      corpus_reach: corpus.filter((food) =>
        food.names.some((name) => name.stems.includes(stemOf(word)))
      ).length,
      probes: column.length,
      answering: column.filter((c) => c.probe_found > 0).length,
      rescued: column.filter(rescues).length,
    };
  });

  // Every key emitted, none filtered. The other passes filter to the interesting
  // cases because they emit hundreds; 58 is small enough to read whole, and a
  // filtered emission would hide exactly the unrescued keys a null verdict rests
  // on.
  return { cases, shapes };
}

/**
 * The twin pass (#137): for each name the merge discarded, what does typing it
 * reach now, and what did the row lose by shipping under the other name.
 *
 * It reads the shipped `also` rather than the archives, deliberately. The
 * archives are where the population is DECIDED and `usda-bundle.mjs` asserts
 * against them at generation; what this measures is the outcome, over the same
 * corpus every other pass here runs on, so a case can be compared against a
 * `head` or `qualifier` case without one of them describing a different file.
 *
 * `lost` is the substantive half of the finding: which words of the archived
 * name the surviving one does not have. It is stated in stems, because that is
 * what retrieval compares, and it is what separates "the row is unreachable"
 * from "the row is merely mis-ordered".
 */
function twinPass(corpus, index) {
  const cases = [];
  for (const food of index.foods) {
    if (!food.also) continue;
    const own = new Set(readReferenceFoodName(food.description).stems);
    for (const alias of food.also) {
      const results = search(corpus, alias);
      cases.push({
        pass: "twin",
        query: alias,
        ships_as: food.description,
        lost: readReferenceFoodName(alias).stems.filter((w) => !own.has(w)),
        rank: rankOf(results, food.description),
        results: summarise(results),
        verdict: null,
        cause: null,
        note: null,
      });
    }
  }
  return cases;
}

// ── absence post-mortem ────────────────────────────────────────────────────

/**
 * Why a record is not in the corpus: our own filter dropped it, the twin merge
 * filed it under another name, or USDA never had it. Only the archives can tell
 * those apart, and the distinction matters because #131, #133 and #144 all
 * tightened those filters.
 *
 * Separate mode rather than part of the sweep: it is needed only where
 * adjudication concludes the right record is absent entirely, which the group's
 * own members usually disprove.
 *
 * It answers by RE-RUNNING the generator over the same archives, one identity at
 * a time, rather than by matching descriptions against the shipped index. Two
 * defects made that necessary (#137). It read all three archives, including the
 * Survey release the bundle never consumes, so 5,432 records that were never
 * eligible were reported as our casualties. And it asked the filters about each
 * raw record, where the generator asks them about the merged identity — so it
 * could name a filter that never ran, and it had no way at all to say that a
 * record left because its twin's name won, which is what a residual bucket
 * reading "no_energy or the twin merge" was hiding.
 */
async function explainAbsence(term) {
  // The filters live in `usda-food-kind.ts` and the merge in `usda-fdc.ts`,
  // neither of which Node's type-stripping can load directly the way it loads
  // the ranking: those modules import their siblings extensionless, and bare
  // Node will not resolve those. `usda-app-module.mjs`
  // is the one place that solves it, for every script that borrows the app's
  // own logic rather than keeping a second copy of the answer (ADR-0047 §4).
  const { readBundleArchives, groupByIdentity, buildCorpus } =
    await import("./usda-bundle.mjs");
  const app = await borrowApp();
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const entries = await readBundleArchives(
    manifest,
    join(ROOT, ".usda-backup")
  );

  const needle = term.toLowerCase();
  const verdicts = [];
  for (const [key, group] of groupByIdentity(entries, app)) {
    const hits = group.filter((entry) =>
      entry.food.description.toLowerCase().includes(needle)
    );
    if (hits.length === 0) continue;
    // One group at a time through the REAL generator, so the verdict is the
    // decision that actually shipped rather than a restatement of it: exactly
    // one of the six tallies is 1 for a group nobody kept, and it names the
    // filter that took the merged identity.
    const { survivors, dropped } = buildCorpus(new Map([[key, group]]), app);
    const shipped = survivors[0]?.food.description ?? null;
    const filter = Object.entries(dropped).find(([, count]) => count > 0);
    // A group that neither survives nor files a tally would mean `buildCorpus`
    // had grown a drop path that counts nothing, which is a bug in the thing
    // this mode exists to explain rather than a verdict about a record.
    if (!shipped && !filter)
      throw new Error(
        `identity ${key} ships nothing and no filter claims it; buildCorpus has ` +
          "a drop path that files no tally"
      );
    const dropped_by = shipped ? null : filter[0];
    for (const hit of hits)
      verdicts.push({
        dataset: hit.food.dataType,
        description: hit.food.description,
        shipped: hit.food.description === shipped,
        merged_into: shipped === hit.food.description ? null : shipped,
        dropped_by,
      });
  }
  return verdicts;
}

// ── prior adjudications ────────────────────────────────────────────────────

/**
 * Identity of a case across runs: the thing that was judged, not the judgement.
 * A synonym case is a taxonomy group; every other pass is one query.
 */
const identityOf = (kase) => `${kase.pass}:${kase.tag ?? kase.query}`;

/**
 * Verdicts a moved leading row cannot put in doubt.
 *
 * `verdict_stale` asks "was this judgement made against an ordering that has
 * since changed", which presumes the judgement was ABOUT the ordering. One is
 * not. `implausible-query` says nobody types this into a food search —
 * `cooked beef meat`, `anti-foaming agent`, `nigari` — and the note the research
 * file carries for each says so in those words. It is a claim about the QUERY,
 * the cases are excluded from every rate the note computes, and no reordering of
 * an answer nobody asked for can make it wrong.
 *
 * Measured on #156: 41 of the 128 flags a regenerate raised were this, a third
 * of the set, every one of them a judgement re-reading could only reaffirm. A
 * flag that cannot be cleared by looking is noise on the thirty-nine that can.
 */
const ORDERING_INDEPENDENT_VERDICTS = new Set(["implausible-query"]);

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
 * look at again, EXCEPT where the verdict was never about the ordering — see
 * {@link ORDERING_INDEPENDENT_VERDICTS}. The flag is sticky, because the next
 * regenerate compares against the run that already moved the row and would
 * otherwise read false.
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
      !ORDERING_INDEPENDENT_VERDICTS.has(kase.verdict) &&
      ((before.verdict_stale ?? false) || leadOf(kase) !== leadOf(before));
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
  const vocabulary = await deriveVocabulary(corpus, search);
  writeFileSync(INPUTS_PATH, JSON.stringify(vocabulary, null, 2) + "\n");
  console.log(
    `Pinned ${vocabulary.groups.length} applicable groups from ${vocabulary.source.url}`
  );
  console.log(`  sha256 ${vocabulary.source.sha256}`);
} else if (args.includes("--leads")) {
  // What did a ranking change MOVE? The passes cannot answer that: they
  // photograph one ordering for hand adjudication, and #124's `qualifier` pass
  // measures its own pre-registered pair of orderings and no other. This writes
  // nothing and judges nothing — run it on both sides of a change and diff the
  // two outputs, which is what #151 and #154 each built by hand and threw away.
  //
  // The query set is `sweepQueries`, whose shapes reach a shelf-labelled row.
  // ADR-0055 §2's sweep could not: for `Alcoholic beverage, wine, table, red`
  // it builds `wine alcoholic beverage`, so the three cases §3 was adopted to
  // fix were outside the measurement that priced it.
  //
  // A file of queries can be given instead, and for a diff it must be. The
  // shapes ask `readReferenceFoodName` where a food's own name starts, so a
  // change to the shelf-label roster changes the QUESTIONS as well as the
  // answers — measured across #154, 836 of them — and two runs of the derived
  // set would silently compare different sweeps. Generate once, ask both sides:
  //
  //     pnpm usda:ranking-audit --leads | cut -f1 > /tmp/q.txt
  //     git stash && pnpm usda:ranking-audit --leads /tmp/q.txt > /tmp/before
  const given = args[args.indexOf("--leads") + 1];
  const queries = given
    ? readFileSync(given, "utf8").split("\n").filter(Boolean)
    : sweepQueries(index.foods.map((f) => f.description));
  for (const query of queries) {
    const lead = search(corpus, query)[0]?.description ?? "";
    console.log(`${query}\t${lead}`);
  }
} else if (args.includes("--explain")) {
  const term = args[args.indexOf("--explain") + 1];
  for (const hit of await explainAbsence(term)) {
    const state = hit.shipped
      ? "SHIPPED"
      : hit.merged_into
        ? `merged into "${hit.merged_into}"`
        : `dropped by ${hit.dropped_by}`;
    console.log(`${state.padEnd(38)} ${hit.description}`);
  }
} else {
  const inputs = JSON.parse(readFileSync(INPUTS_PATH, "utf8"));
  const qualifier = qualifierPass(corpus);
  const carrier = await carrierPass(index, corpus);
  const cases = [
    ...synonymPass(corpus, inputs.groups),
    ...headPass(corpus, index),
    ...pairPass(corpus, index),
    ...britishPass(corpus, inputs.british_queries),
    ...twinPass(corpus, index),
    ...qualifier.cases,
    ...carrier.cases,
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
    // #142's pass, per carrier shape: what the corpus holds of the carrier word,
    // how many probes it answers today, and how many one substitution rescues.
    // Beside `harm` rather than in `counts` for the same reason — the per-shape
    // breakdown is the finding, and a flat total would hide that a carrier the
    // corpus has three rows of rescues nothing because it can rescue nothing.
    carrier: carrier.shapes,
    counts: {
      synonym_flagged: tally("synonym"),
      synonym_disagree: cases.filter((c) => c.disagrees).length,
      synonym_some_empty: cases.filter((c) => c.some_member_retrieves_nothing)
        .length,
      contested_heads: tally("head"),
      pairs_sampled: tally("pair"),
      british: tally("british"),
      // #142's pass. `carrier_keys` is the substitutable subset — one token in,
      // one token out — and the probes are that times the six carrier shapes.
      // `carrier_probes_answering` is expected to be 0 and is measured anyway:
      // the proof that a carrier phrase cannot retrieve covers the literal pass
      // and not the fallback's prefix tier (research note #142 §3).
      carrier_keys: tally("carrier"),
      carrier_probes: carrier.shapes.reduce((n, s) => n + s.probes, 0),
      carrier_probes_answering: carrier.shapes.reduce(
        (n, s) => n + s.answering,
        0
      ),
      carrier_rescued: carrier.shapes.reduce((n, s) => n + s.rescued, 0),
      // #137's pass: one case per name the twin merge discarded. `not_led` is
      // the number where typing the archived name does not put the row that
      // took its identity first, and `absent` those where it is not in the 50
      // shown — the same window every other pass here reports against, and what
      // the aliases exist to keep at zero. The generator's own assertion is the
      // stricter one, over `tier` rather than over a page.
      twin_names: tally("twin"),
      twin_not_led: cases.filter((c) => c.pass === "twin" && c.rank !== 1)
        .length,
      twin_absent: cases.filter((c) => c.pass === "twin" && c.rank === 0)
        .length,
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
