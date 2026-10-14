#!/usr/bin/env node
/**
 * #556's null hypothesis: before any model, how far does the search that
 * ALREADY SHIPS get if it is simply run automatically on the pack's own name?
 *
 * #243 measured `product_name` at 0 of 35 and diagnosed why in one sentence:
 * the ranking refuses a row the moment ONE typed word fails to land, and a
 * pack's name always carries a brand or a marketing word. `Pure sesame oil`
 * reaches 0 where `sesame oil` reaches 1.
 *
 * That diagnosis was never acted on, so the 0 has been read ever since as
 * "names do not work" when what it measures is "whole names do not work". This
 * script separates the two by varying ONLY the query and never the ranking —
 * `searchIndexRows` is imported, never restated (ADR-0047 §4).
 *
 * The strip is the minimal principled one: a token that prefix-matches no word
 * ANYWHERE in the corpus and whose stem is in no row's stems can never be part
 * of a query that matches anything, because `compileReferenceFoodQuery` requires
 * every token to satisfy one of those two. Dropping exactly those tokens cannot
 * change a query that already answers.
 *
 * Scored against `ADJUDICATION`, the same hand judgement #243 is graded on, so
 * the truth was fixed before this arm existed (#188).
 *
 * Usage: `node scripts/pairing-null-hypothesis.mjs [--verbose]`
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packQueries, readPackTwins } from "./ledger-fold.mjs";
import { ADJUDICATION } from "./pairing-adjudication.mjs";
import { resolve as resolveTs } from "./ts-resolve-hook.mjs";

registerHooks({ resolve: resolveTs });
const { buildSearchCorpus, searchIndexRows } =
  await import("../src/lib/food/usda-corpus.ts");
const { wordsOf, stemOf } =
  await import("../src/lib/food/reference-food-ranking.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");
const EXPORT_PATH =
  process.env.INVENTORIA_LEDGER_EXPORT ??
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl");
const VERBOSE = process.argv.includes("--verbose");

const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
const corpus = buildSearchCorpus(index);

// ---------------------------------------------------------------------------
// What the corpus can be asked at all
// ---------------------------------------------------------------------------

/**
 * Every word and every stem any name in the corpus carries, aliases included.
 *
 * Built off the SAME `ReferenceFoodName` the ranking scores against, rather
 * than off the raw descriptions, so a token judged reachable here is reachable
 * by the predicate that actually runs.
 */
const corpusWords = new Set();
const corpusStems = new Set();
for (const food of corpus.foods) {
  for (const name of [food.name, ...food.also]) {
    for (const w of name.words) corpusWords.add(w);
    for (const s of name.stems) corpusStems.add(s);
  }
}
const sortedWords = [...corpusWords];

/** Could this token ever satisfy `prefixed` or `wholeWords` on any row? */
function reachable(token) {
  if (corpusStems.has(stemOf(token))) return true;
  return sortedWords.some((w) => w.startsWith(token));
}

/** The pack's name with every unreachable token removed. */
function strippedName(name) {
  if (!name) return "";
  const kept = wordsOf(name).filter(reachable);
  return kept.join(" ");
}

/**
 * The same strip, minus the function words a European pack name is mostly made
 * of once its content words have gone.
 *
 * Arm B measured why this is needed and it is the finding, not a tweak: a token
 * is kept by {@link reachable} if ANY row anywhere carries it, so `de` survives
 * on the strength of `Dulce de Leche` while `almendra` goes. The strip then
 * inverts the signal — it keeps exactly the words with no meaning and discards
 * the ones with all of it.
 */
function contentfulName(name) {
  if (!name) return "";
  return wordsOf(name)
    .filter((t) => t.length >= 3 && reachable(t))
    .join(" ");
}

/**
 * Every contiguous window of the name, longest first.
 *
 * This is what reaches the **Vocabulary map** at all. `expandThroughVocabulary`
 * refuses a key SHORTER than the query (`keyWords.length < typed.length`), and
 * it matches positionally from the first token — so `panko breadcrumbs` never
 * reaches the `breadcrumbs` key the map already carries. A window does.
 */
function windowsOf(name) {
  const tokens = wordsOf(name ?? "");
  const out = [];
  for (let len = tokens.length; len >= 1; len--)
    for (let i = 0; i + len <= tokens.length; i++)
      out.push(tokens.slice(i, i + len).join(" "));
  return out;
}

/** The first window that answers anything. Consults no adjudication. */
function byWindow(name) {
  for (const w of windowsOf(name)) {
    const hit = top(w);
    if (hit) return hit;
  }
  return null;
}

/**
 * Greedy back-off: the longest query that answers anything, dropping one token
 * at a time, never consulting the adjudication.
 */
function backOff(name) {
  let tokens = wordsOf(name).filter((t) => t.length >= 3 && reachable(t));
  while (tokens.length > 0) {
    const hit = top(tokens.join(" "));
    if (hit) return hit;
    tokens = tokens.slice(0, -1);
  }
  return null;
}

/**
 * The ceiling on ANYTHING built out of this pack's own name: over every subset
 * of its tokens, is the adjudicated row ever reachable, and ever at top-1?
 *
 * It consults the answer deliberately — it is an upper bound, not a proposer.
 * What it bounds is every future query builder, carrier-word list and
 * query-emitting model at once: none of them can beat the best subset.
 */
function nameCeiling(name, wanted) {
  const tokens = wordsOf(name ?? "").slice(0, 8);
  let best = { top1: false, inList: false, rank: -1, query: null };
  const total = 1 << tokens.length;
  for (let mask = 1; mask < total; mask++) {
    const chosen = tokens.filter((_, i) => mask & (1 << i));
    const hit = top(chosen.join(" "));
    if (!hit) continue;
    const rank = hit.hits.indexOf(wanted);
    if (rank === -1) continue;
    if (rank === 0)
      return { top1: true, inList: true, rank: 1, query: hit.query };
    if (!best.inList || rank < best.rank)
      best = { top1: false, inList: true, rank: rank + 1, query: hit.query };
  }
  return best;
}

// ---------------------------------------------------------------------------
// The arms
// ---------------------------------------------------------------------------

const top = (query) => {
  if (!query || !query.trim()) return null;
  const { hits } = searchIndexRows(corpus, query);
  if (hits.length === 0) return null;
  return {
    query,
    fdcId: hits[0].row.fdcId,
    description: hits[0].row.description,
    hits: hits.map((h) => h.row.fdcId),
  };
};

const firstOf = (...proposals) => proposals.find((p) => p !== null) ?? null;

const population = readPackTwins(EXPORT_PATH).sort(
  (a, b) => a.captured - b.captured
);

const rows = population.map((twin) => {
  const truth = ADJUDICATION[twin.gtin] ?? { verdict: "unknown", fdcId: null };
  const { tags, name } = packQueries(twin);
  const rawName = top(name);
  const stripped = top(strippedName(name));
  const byCategory = firstOf(...tags.map((t) => top(t)).filter(Boolean), null);
  return {
    twin,
    truth,
    name,
    strippedQuery: strippedName(name),
    arms: {
      "A. product_name, whole (#243)": rawName,
      "B. product_name, stripped": stripped,
      "C. categories → stripped name": firstOf(byCategory, stripped),
      "D. stripped name → categories": firstOf(stripped, byCategory),
      "E. categories only (the matcher)": byCategory,
      "F. name, content words, back-off": backOff(name),
      "G. categories → back-off": firstOf(byCategory, backOff(name)),
      "H. name windows, longest first": byWindow(name),
      "I. categories → name windows": firstOf(byCategory, byWindow(name)),
    },
    contentful: contentfulName(name),
    ceiling: truth.fdcId !== null ? nameCeiling(name, truth.fdcId) : null,
  };
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pairable = rows.filter((r) => r.truth.verdict === "paired");

console.log(`\n# The null hypothesis (#556)\n`);
console.log(
  `Corpus      : ${index.foods.length} rows, schema ${index.schema_version}`
);
console.log(
  `Population  : ${rows.length} gtin: twins, ${pairable.length} adjudicated pairable`
);
console.log(
  `Bar (#247 clause 1): top-1 for 15 of ${pairable.length} pairable twins`
);
console.log(
  `Bar (#247 clause 2): adjudicated row inside a 120-row candidate list for 20 of ${pairable.length}\n`
);

const ARMS = Object.keys(rows[0].arms);
console.log(
  "arm".padEnd(34) +
    "offers  agrees  wrong  (wrong over silence)  top-1 of pairable"
);
for (const arm of ARMS) {
  const pick = (r) => r.arms[arm];
  const offered = rows.filter((r) => pick(r) !== null);
  const right = rows.filter((r) => pick(r) && pick(r).fdcId === r.truth.fdcId);
  const bad = rows.filter((r) => pick(r) && pick(r).fdcId !== r.truth.fdcId);
  const overSilence = bad.filter((r) => r.truth.fdcId === null);
  const pairedRight = pairable.filter(
    (r) => pick(r) && pick(r).fdcId === r.truth.fdcId
  );
  console.log(
    arm.padEnd(34) +
      String(offered.length).padStart(5) +
      String(right.length).padStart(8) +
      String(bad.length).padStart(7) +
      String(overSilence.length).padStart(16) +
      `${String(pairedRight.length).padStart(19)}/${pairable.length}`
  );
}

// Clause 2: is the adjudicated row anywhere in what the search hands back?
console.log(`\n## Clause 2 — the adjudicated row inside the candidate list\n`);
for (const arm of ARMS) {
  const inList = pairable.filter((r) => {
    const p = r.arms[arm];
    return p && p.hits.includes(r.truth.fdcId);
  });
  const depths = pairable
    .map((r) => {
      const p = r.arms[arm];
      return p ? p.hits.indexOf(r.truth.fdcId) : -1;
    })
    .filter((d) => d >= 0);
  console.log(
    `  ${arm.padEnd(34)} ${String(inList.length).padStart(2)}/${pairable.length} within the returned list` +
      (depths.length ? `   (ranks ${depths.map((d) => d + 1).join(", ")})` : "")
  );
}

// ---------------------------------------------------------------------------
// Clause 2 proper: a RETRIEVER filling a 120-row candidate list
// ---------------------------------------------------------------------------
//
// The arms above each ask ONE query and read its top 50. Clause 2 asks a
// different question — whether a candidate list of 120 rows can be built that
// CONTAINS the adjudicated row, by any means short of a model. So this unions
// every query the pack itself affords: each English category tag, the whole
// name, the stripped name, and each single content word of the name.
//
// It is the most generous retriever the pack's own data permits, and its list
// size is reported beside its coverage because a retriever that returns 400
// rows has not filled a 120-row list.
console.log(
  `\n## Clause 2 proper — a union retriever, and what its list costs\n`
);
const unionRows = pairable.map((r) => {
  const { tags, name } = packQueries(r.twin);
  const words = wordsOf(name ?? "").filter(
    (t) => t.length >= 3 && reachable(t)
  );
  const queries = [
    ...tags,
    name,
    strippedName(name),
    contentfulName(name),
    ...words,
  ];
  const seen = [];
  for (const q of queries) {
    const hit = top(q);
    if (!hit) continue;
    for (const id of hit.hits) if (!seen.includes(id)) seen.push(id);
  }
  return { row: r, list: seen, has: seen.includes(r.truth.fdcId) };
});
const covered = unionRows.filter((u) => u.has);
const within120 = unionRows.filter(
  (u) =>
    u.has &&
    u.list.indexOf(u.truth === undefined ? -1 : u.row.truth.fdcId) < 120
);
const sizes = unionRows.map((u) => u.list.length).sort((a, b) => a - b);
console.log(
  `  adjudicated row anywhere in the union   ${String(covered.length).padStart(2)}/${pairable.length}   (bar: 20)`
);
console.log(
  `  ... and inside the first 120 of it      ${String(within120.length).padStart(2)}/${pairable.length}`
);
console.log(
  `  union list size: median ${sizes[Math.floor(sizes.length / 2)]}, max ${sizes[sizes.length - 1]}, ` +
    `${unionRows.filter((u) => u.list.length === 0).length} packs return nothing at all`
);
// Where the union DOES reach the row, is the ranking the thing in the way?
const ranks = covered
  .map((u) => u.list.indexOf(u.row.truth.fdcId) + 1)
  .sort((a, b) => a - b);
console.log(
  `\n  Of the ${covered.length} it reaches, the adjudicated row sits at rank ` +
    `${ranks.filter((r) => r === 1).length} times first, median ${ranks[Math.floor(ranks.length / 2)]}, worst ${ranks[ranks.length - 1]}`
);
console.log(`  full rank list: ${ranks.join(", ")}`);
console.log(
  `\n  The ${pairable.length - covered.length} the union cannot reach, and what the pack gave it:\n`
);
for (const u of unionRows.filter((x) => !x.has)) {
  const t = u.row.twin;
  const { tags, name } = packQueries(t);
  console.log(
    `    ${(name ?? "—").slice(0, 34).padEnd(36)} wanted ${u.row.truth.fdcId}`
  );
  console.log(
    `      OFF record: ${t.hasOffRecord ? "yes" : "NO — hand-typed from the label"}` +
      `, english category tags: ${tags.length ? tags.join(" | ") : "none"}`
  );
  console.log(`      list it did build: ${u.list.length} rows`);
}

// ---------------------------------------------------------------------------
// The ceiling on anything name-based
// ---------------------------------------------------------------------------
const withCeiling = pairable.filter((r) => r.ceiling);
const ceilTop1 = withCeiling.filter((r) => r.ceiling.top1);
const ceilInList = withCeiling.filter((r) => r.ceiling.inList);
console.log(`\n## The ceiling on anything built from the pack's own name\n`);
console.log(
  `  best subset puts it at top-1   ${String(ceilTop1.length).padStart(2)}/${pairable.length}   (bar: 15)`
);
console.log(
  `  best subset puts it in the list ${String(ceilInList.length).padStart(2)}/${pairable.length}   (bar: 20)`
);
console.log(
  `\n  This consults the answer. It bounds every query builder, carrier-word`
);
console.log(
  `  list and query-emitting model at once: none can beat the best subset.`
);

if (VERBOSE) {
  console.log(`\n## Per pack — what the stripped name did\n`);
  for (const r of rows) {
    if (r.truth.verdict !== "paired") continue;
    const b = r.arms["B. product_name, stripped"];
    const mark = b && b.fdcId === r.truth.fdcId ? "✓" : b ? "✗" : "·";
    console.log(`  ${mark} ${(r.name ?? "—").slice(0, 36).padEnd(38)}`);
    console.log(`      stripped : "${r.strippedQuery}"`);
    console.log(
      `      wanted   : ${r.truth.fdcId} ${r.truth.why ? r.truth.why.split(".")[0] : ""}`
    );
    console.log(
      `      got      : ${b ? `${b.fdcId} ${b.description}` : "nothing"}`
    );
  }
}
console.log();
