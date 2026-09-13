#!/usr/bin/env node
/**
 * Which of the ranking keys still moves an answer once the corpus stops being
 * duplicated? The measurement behind research note #192.
 *
 *   pnpm usda:key-census                     # run the census, print the tables
 *   pnpm usda:key-census --json              # ...as JSON
 *   pnpm usda:key-census --write             # ...and commit the artifact
 *
 * ADR-0100 removes duplication at source, and #192 asks whether the machinery
 * built to sort that duplication is doing anything afterwards. The method is
 * ADR-0061's #177 amendment: re-measure every key over the changed corpus, keep
 * what still moves a result, retire what moves nothing, and put the count on
 * record. A key retired without a measurement is the same mistake as a key added
 * without one.
 *
 * Four things shape this file, each answering a way this codebase has already
 * gone wrong:
 *
 *   THE RULER IS PINNED. The sweep is derived from corpus text, so it is 3,857
 *   queries off the shipped corpus and 3,767 off the collapsed one. Running each
 *   corpus against its own sweep attributes to the corpus what may be the ruler
 *   moving, so the SHIPPED corpus's sweep is the instrument for both.
 *
 *   THE ROW KEYS ARE READ. `usda-ranking-audit.mjs`'s `qualifierPass` scores
 *   `rank(name)` alone and sorts it with `compareRelevance`, so
 *   `b.plainSibling - a.plainSibling` is `NaN`, `NaN ||` is falsy, and ADR-0055's
 *   two row keys fall through unread. That is deliberate there — the pass is
 *   #124's frozen pre-registration — and fatal here, because those two keys are
 *   among the ten under test. Scoring goes through the same shape `scoreAll`
 *   uses: the name key spread with the row's rank (#156).
 *
 *   `plain_sibling` IS RE-DERIVED, NEVER READ. It is a corpus-relative fact
 *   baked into the index at generation time, and the pilot's collapsed corpus
 *   carries the SHIPPED corpus's flags forward unchanged. Stripping collapsing
 *   segments turns names into strict prefixes of each other, so the collapse
 *   CREATES plain-sibling relationships: 129 carried against 193 re-derived, 66
 *   rows disagreeing. A census reading the carried flag reports the key
 *   shrinking when it is growing.
 *
 *   THE KEY ORDER IS RESTATED AND THEN PROVED. `compareRelevance` expresses the
 *   order once and an ablation needs to remove one term from it, which no
 *   argument to that function can do. So {@link KEYS} restates the order and
 *   {@link assertOrderMatchesShipped} checks the restatement against the shipped
 *   comparator over every pair the sweep produces. A drift fails the run rather
 *   than quietly measuring a different ranking.
 *
 * It asserts nothing about the RESULT and is not wired into `pnpm check`, for
 * the reason `usda-ranking-audit.mjs` gives about itself: a gate here would fail
 * on every legitimate ranking change and train people to regenerate without
 * reading. The order check above is a different thing — it guards the
 * instrument, not the finding.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compareRelevance,
  compileReferenceFoodQuery,
  plainSiblingsOf,
  readReferenceFoodName,
  readRowRank,
  withoutStrayMentions,
} from "../src/lib/food/reference-food-ranking.ts";
import { sweepQueries } from "./usda-ranking-queries.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIPPED = join(ROOT, "public", "usda", "search-index.json");
const ACCOUNT = join(ROOT, "docs", "research", "192-key-census.json");

/**
 * The collapsed corpus, which no generator produces yet.
 *
 * ADR-0100 states the rule and deliberately delivers no corpus; what exists is
 * `usda-beef-pilot.mjs`'s emission, a roster read off one head and applied
 * corpus-wide. Every "after" number here is against THAT, and the note says so.
 * When the generator grows a roster this reads its output instead.
 */
const COLLAPSED = process.env.USDA_COLLAPSED_PATH ?? null;

/**
 * The twelve terms {@link compareRelevance} reads, in its order.
 *
 * `recent` and `frequent` are #165's frecency keys, and over a corpus with no
 * ledger behind it they are 0 on every row and tie uniformly — so this census
 * measures them at zero moved leads by construction, which is the property that
 * made them safe to adopt rather than a finding about them.
 *
 * A restatement, and the only one in this file. It exists because an ablation
 * has to remove one term and the shipped comparator takes no argument that could
 * express that. {@link assertOrderMatchesShipped} is what keeps it honest.
 *
 * `named` is deliberately absent: it decides what a query RETRIEVES, in
 * `withoutStrayMentions`, and no comparison reads it. It is measured here as a
 * retrieval rule rather than as a key.
 */
const KEYS = [
  "tier",
  "recent",
  "frequent",
  "raw",
  "head",
  "accounted",
  "position",
  "plainSibling",
  "plain",
  "wholeness",
  "simplicity",
  "designated",
];

/**
 * The couples that can mask each other, and the whole reason a pairwise pass
 * exists.
 *
 * These keys are not independent — `raw` and `plain` both demote a cooked row,
 * `head` and `accounted` ask the same question at two scopes, `plain` and
 * `plainSibling` ask it of the name and of the corpus. Ablated singly, each can
 * report zero because the other is still doing the work, and both then look
 * retirable when removing either alone is safe and removing both is not. Mutual
 * masking is the one way this census can be wrong in the direction that deletes
 * code.
 */
const COUPLES = [
  ["raw", "plain"],
  ["plain", "wholeness"],
  ["head", "accounted"],
  ["plain", "plainSibling"],
];

/** An ordering that reads every key but the named ones, in the shipped order. */
const comparatorWithout = (dropped) => {
  const kept = KEYS.filter((key) => !dropped.includes(key));
  return (a, b) => {
    for (const key of kept) {
      const diff = b[key] - a[key];
      if (diff) return diff;
    }
    return 0;
  };
};

/** The full restatement — every key, nothing dropped. */
const restated = comparatorWithout([]);

/**
 * Does the restatement above order a pair exactly as the shipped comparator
 * does? Checked on every pair the sweep scores, not on a sample.
 *
 * The failure this catches is a key added to `compareRelevance` and not to
 * {@link KEYS}: the census would then measure a nine-key ranking and report it
 * as the shipped one, which is #156's blindness arriving by a different route.
 */
const assertOrderMatchesShipped = (scored, query) => {
  for (let i = 1; i < scored.length; i++) {
    const a = scored[i - 1].key;
    const b = scored[i].key;
    if (Math.sign(restated(a, b)) !== Math.sign(compareRelevance(a, b)))
      throw new Error(
        `KEYS does not restate compareRelevance — "${query}" orders ` +
          `"${scored[i - 1].description}" against "${scored[i].description}" ` +
          `differently. A key was added to the ranking and not to this census.`
      );
  }
};

/**
 * The corpus in the shape a query is scored against, with `plain_sibling`
 * re-derived rather than read.
 *
 * Shaped like `usda-ranking-corpus.mjs`'s `buildCorpus` and not imported from it
 * for one reason: that one reads `row.plain_sibling` off the index, which is
 * exactly the stale field this census may not trust. Everything else about the
 * shape — `also` aliases as further names, `readRowRank` for the two row keys —
 * is the same because a census measuring a different corpus than the app
 * searches measures nothing.
 */
const buildCorpus = (index) => {
  const descriptions = index.foods.map((row) => row.description);
  const derived = plainSiblingsOf(descriptions);
  const carried = index.foods.filter((row) => row.plain_sibling).length;
  const stale = index.foods.filter(
    (row, i) => !!row.plain_sibling !== derived[i]
  ).length;
  return {
    corpus: index.foods.map((row, i) => ({
      fdcId: row.fdcId,
      description: row.description,
      names: [row.description, ...(row.also ?? [])].map(readReferenceFoodName),
      rank: readRowRank({ ...row, plain_sibling: derived[i] }),
    })),
    plain_sibling: { carried, derived: derived.filter(Boolean).length, stale },
  };
};

/**
 * Every ablation's lead for one query, scored once.
 *
 * The keys do not depend on the comparator, so a query is scored once and then
 * read by fifteen orderings. Scoring is the expensive half — 4,238 rows against
 * 3,857 queries — and sorting is not needed at all: an ablation's verdict is its
 * LEAD, so each ordering takes a single minimum rather than a sort.
 */
const leadsFor = (corpus, query, orderings) => {
  const rank = compileReferenceFoodQuery(query);
  const scored = corpus
    .map((food) => ({
      fdcId: food.fdcId,
      description: food.description,
      key: food.names
        .map((name) => ({ ...rank(name), ...food.rank }))
        .reduce((best, key) => (compareRelevance(key, best) < 0 ? key : best)),
    }))
    .filter(({ key }) => key.tier > 0);
  const kept = withoutStrayMentions(scored);
  if (kept.length === 0) return null;
  const sorted = [...kept].sort((a, b) => compareRelevance(a.key, b.key));
  assertOrderMatchesShipped(sorted, query);
  return {
    rows: kept.length,
    kept,
    leads: orderings.map(
      ({ compare }) =>
        kept.reduce((best, row) =>
          compare(row.key, best.key) < 0 ? row : best
        ).description
    ),
  };
};

/**
 * The two pinned sets an ablation is checked against, and why both.
 *
 * **ADR-0055 §2** binds every rule this map adopts: no change may break a lead
 * already measured correct. `143-gold-set.json` holds 50 adjudicated heads, of
 * which **19 carry `verdict: "correct"`** — those, and not the 28 misses, are
 * the leads §2 protects. (ADR-0100 §11 calls this "the 29 adjudicated cases",
 * which is neither number.)
 *
 * **#188's bar** is the other direction: 44 hand-judged queries keyed by
 * `fdcId`, where C1 asks whether the gold row is in the top 3. A key whose
 * removal costs a C1 is load-bearing whatever its sweep tally says.
 *
 * Nothing here retires anything — it is the positive half of the evidence. A key
 * that moves leads AND holds a pinned one is alive twice over.
 */
const goldPass = (corpus, orderings, gold143, gold188) => {
  const broken = orderings.map(() => 0);
  const c1_lost = orderings.map(() => 0);

  for (const gold of gold143) {
    const result = leadsFor(corpus, gold.head, orderings);
    if (result === null) continue;
    const [shipped] = result.leads;
    // Only a head this corpus still leads correctly can have its lead broken:
    // where the collapse has renamed the row, §2 has nothing pinned to protect.
    if (shipped !== gold.lead_today) continue;
    result.leads.forEach((lead, i) => {
      if (lead !== shipped) broken[i]++;
    });
  }

  for (const gold of gold188) {
    const result = leadsFor(corpus, gold.query, orderings);
    if (result === null) continue;
    const inTop3 = (compare) =>
      [...result.kept]
        .sort((a, b) => compare(a.key, b.key))
        .slice(0, 3)
        .some((row) => row.fdcId === gold.fdc_id);
    if (!inTop3(orderings[0].compare)) continue;
    orderings.forEach(({ compare }, i) => {
      if (!inTop3(compare)) c1_lost[i]++;
    });
  }

  return { broken, c1_lost };
};

/**
 * One corpus, swept.
 *
 * `Array.prototype.reduce` picks the minimum rather than `sort` picking the
 * first, and the difference matters: both are stable in encounter order, so a
 * tie falls to the row the corpus lists first under BOTH, which is the `fdcId`
 * accident the ranking already has. A census is not entitled to a different
 * tiebreak from the app.
 */
function sweep(label, index, queries, gold143, gold188) {
  const { corpus, plain_sibling } = buildCorpus(index);
  const orderings = [
    { name: "shipped", compare: comparatorWithout([]) },
    ...KEYS.map((key) => ({ name: key, compare: comparatorWithout([key]) })),
    ...COUPLES.map((pair) => ({
      name: pair.join("+"),
      compare: comparatorWithout(pair),
    })),
  ];
  const moved = orderings.map(() => 0);
  const examples = orderings.map(() => []);
  let answered = 0;
  let empty = 0;

  for (const query of queries) {
    const result = leadsFor(corpus, query, orderings);
    if (result === null) {
      empty++;
      continue;
    }
    answered++;
    const [shipped] = result.leads;
    result.leads.forEach((lead, i) => {
      if (lead === shipped) return;
      moved[i]++;
      if (examples[i].length < 5)
        examples[i].push({ query, shipped, without: lead });
    });
  }

  const gold = goldPass(corpus, orderings, gold143, gold188);

  return {
    label,
    rows: index.foods.length,
    names: corpus.reduce((n, food) => n + food.names.length, 0),
    queries: queries.length,
    answered,
    empty,
    plain_sibling,
    gold_leads_held: gold143.length,
    ablations: orderings.slice(1).map((o, i) => ({
      key: o.name,
      moved: moved[i + 1],
      gold_leads_broken: gold.broken[i + 1],
      c1_lost: gold.c1_lost[i + 1],
      examples: examples[i + 1],
    })),
  };
}

const digest = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);

// ── report ─────────────────────────────────────────────────────────────────

const shippedIndex = JSON.parse(readFileSync(SHIPPED, "utf8"));

/** ADR-0055 §2's protected leads: the 19 heads #143 measured as already correct. */
const gold143 = JSON.parse(
  readFileSync(join(ROOT, "docs", "research", "143-gold-set.json"), "utf8")
).cases.filter((c) => c.verdict === "correct");

/** #188's bar: 44 hand-judged queries keyed by `fdcId`. */
const gold188 = JSON.parse(
  readFileSync(
    join(ROOT, "docs", "research", "188-consolidation-bar.json"),
    "utf8"
  )
).one_word;

/** §6's ruler: the SHIPPED corpus's sweep, used against both corpora. */
const queries = sweepQueries(shippedIndex.foods.map((f) => f.description));

const runs = [sweep("shipped", shippedIndex, queries, gold143, gold188)];
if (COLLAPSED)
  runs.push(
    sweep(
      "collapsed",
      JSON.parse(readFileSync(COLLAPSED, "utf8")),
      queries,
      gold143,
      gold188
    )
  );

const account = {
  artifact: "192-key-census",
  schema_version: 1,
  ticket: "https://github.com/palebluebytes/inventoria/issues/192",
  map: "https://github.com/palebluebytes/inventoria/issues/186",
  ruler: `sweepQueries over the shipped corpus — ${queries.length} queries, pinned and used against both corpora`,
  corpora: {
    shipped: `public/usda/search-index.json sha256:${digest(SHIPPED)}`,
    ...(COLLAPSED
      ? {
          collapsed: `usda-beef-pilot --emit sha256:${digest(COLLAPSED)} (a roster read off one head; ADR-0100 delivers no corpus)`,
        }
      : {}),
  },
  gold_sets: {
    143: `${gold143.length} of 50 adjudicated heads carry verdict "correct" — the leads ADR-0055 §2 protects`,
    188: `${gold188.length} hand-judged one-word queries, C1 = gold row in the top 3`,
  },
  keys: KEYS,
  couples: COUPLES.map((c) => c.join("+")),
  runs,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(account, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  for (const run of runs) {
    console.log(
      `\n${run.label}: ${run.rows} rows, ${run.names} names; ` +
        `${run.answered} of ${run.queries} queries answer, ${run.empty} retrieve nothing`
    );
    console.log(
      `  plain_sibling: ${run.plain_sibling.carried} carried, ` +
        `${run.plain_sibling.derived} re-derived, ${run.plain_sibling.stale} disagreeing`
    );
    console.log(
      `  ${pad("ablation", 22)}${num("leads moved", 12)}${num("#143 broken", 13)}${num("#188 C1 lost", 14)}`
    );
    for (const a of run.ablations)
      console.log(
        `  ${pad(a.key, 22)}${num(a.moved, 12)}${num(a.gold_leads_broken, 13)}${num(a.c1_lost, 14)}`
      );
  }
  if (!COLLAPSED)
    console.log(
      `\nNo collapsed corpus. Emit one and point this at it:\n` +
        `  pnpm usda:beef-pilot --emit /tmp/collapsed.json\n` +
        `  USDA_COLLAPSED_PATH=/tmp/collapsed.json pnpm usda:key-census`
    );
}

if (process.argv.includes("--write")) {
  writeFileSync(ACCOUNT, `${JSON.stringify(account, null, 2)}\n`);
  console.log(`\nwritten: ${ACCOUNT}`);
}
