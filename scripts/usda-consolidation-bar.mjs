#!/usr/bin/env node
/**
 * Does the food search clear the bar #188 pre-registered? The measurement behind
 * research note #188.
 *
 *   pnpm usda:consolidation-bar            # measure, print the table
 *   pnpm usda:consolidation-bar --json     # ...as JSON, for a note or a diff
 *
 * TWO conditions, asking two different questions and never blended:
 *
 *   C1  GOLD IN TOP 3  — is the row a diarist means near the top. The
 *       user-facing question, and the one a ranking change can move.
 *   C2  RESULT-SET CAP — does a query answer with at most 25 rows. This exists
 *       ONLY to stop C1 being passed dishonestly: a ninth ranking key could lift
 *       ground beef into the top 3 while `beef` still answers with 954 rows, and
 *       the map's destination — one row per ingredient — would be missed with
 *       every condition green. Result-set size is the one number ranking cannot
 *       move. Reorder 954 rows and there are still 954.
 *
 * The gold set is HAND-WRITTEN and keyed by `fdcId`, never by description. That
 * is not fussiness: ADR-0056's shipped-name work renames rows, so a
 * description-keyed gold set reports a renamed row as missing and the rename —
 * the intended change — looks like a regression. Three false "not in corpus"
 * readings were produced exactly this way while the set was being written.
 *
 * It asserts nothing and is deliberately NOT wired into `pnpm check`, for the
 * reason `usda-ranking-audit.mjs` gives about itself: a gate here would fail on
 * every legitimate corpus change and train people to regenerate without reading.
 * It is a dated finding, re-run by the ticket that changes the corpus.
 *
 * It also writes no artifact of its own. #156 is the record of what regenerating
 * a measurement's committed artifact as a side effect costs: the ranking audit
 * went blind. The registered bar in `188-consolidation-bar.json` is an INPUT
 * here and is never written back.
 *
 * The search is BORROWED rather than restated — `searchIndexRows` through
 * `usda-app-module.mjs`, so the vocabulary fallback, both matching tiers and all
 * eight ranking keys are the ones that ship. That needs esbuild, reached from
 * the PATH or through `nix shell`, as the audit's own sweep already does.
 *
 * Where this file lives is deliberately unsettled (#188 Q5). It earns a home
 * once the rule it measures exists; until then it sits beside the other USDA
 * instruments and reads the same corpus they do.
 */

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RESULT_LIMIT,
  readIndex,
  buildCorpus,
  scoreAll,
} from "./usda-ranking-corpus.mjs";
import { loadAppModule } from "./usda-app-module.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BAR_PATH = join(ROOT, "docs", "research", "188-consolidation-bar.json");

/** How deep C1 looks. Three, because a phone shows about that above the fold. */
const TOP_N = 3;

/**
 * One query measured against its gold row.
 *
 * `rank` is 0 for a gold row past the 50-row page cap, which is a DIFFERENT harm
 * from a bad rank and is reported as such: the row is not merely low, it is
 * unreachable by typing that word. Three of the roster's gold rows are in that
 * state at registration.
 *
 * `total` comes from {@link scoreAll} rather than from the shipped search,
 * because the shipped search truncates at the page cap and C2 asks how many rows
 * the query ANSWERS with, not how many it shows.
 */
const measure = (app, searchCorpus, corpus, entry, cap) => {
  const { phrases, hits } = app.searchIndexRows(searchCorpus, entry.query);
  const rank = hits.map((hit) => hit.row.fdcId).indexOf(entry.fdc_id) + 1;
  // C2 asks how many rows the query ANSWERS with, and `searchIndexRows` stops at
  // the 50-row page cap — so the count comes from the uncapped scorer instead.
  // Over `phrases` rather than over the typed query, because a query the
  // vocabulary answered (`minced beef` reaches no row literally) would otherwise
  // count zero while the user is looking at a full screen of results.
  const reached = new Set();
  for (const phrase of phrases)
    for (const row of scoreAll(corpus, phrase)) reached.add(row.description);
  const total = reached.size;
  return {
    query: entry.query,
    fdc_id: entry.fdc_id,
    description: entry.description,
    rank,
    total,
    // Rank 0 means the gold row is not on the screen at all, and the two reasons
    // are different harms: PAST THE PAGE CAP is a row buried under duplicates,
    // ABSENT is a row the query does not retrieve at any depth (ADR-0062's
    // stray-mention rule does this to `ham`, which returns one row that is not
    // the gold one). Reported apart so a pilot cannot read one as the other.
    unreached:
      rank === 0 ? (total > RESULT_LIMIT ? "past cap" : "absent") : null,
    c1: rank >= 1 && rank <= TOP_N,
    c2: total <= cap,
    note: entry.note,
  };
};

const index = readIndex();
const corpus = buildCorpus(index);
const bar = JSON.parse(readFileSync(BAR_PATH, "utf8"));
const cap = bar.conditions.c2_result_set_cap.cap;

const scratch = await mkdtemp(join(tmpdir(), "consolidation-bar-"));
let app;
try {
  app = await loadAppModule(scratch);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
const searchCorpus = app.buildSearchCorpus(index);

// Every gold row is checked to EXIST before it is ranked. A gold id absent from
// the corpus is a broken bar, not a failing search, and the two must never be
// reported as the same thing.
const present = new Set(index.foods.map((food) => food.fdcId));
const missing = [...bar.one_word, ...bar.multi_word].filter(
  (entry) => !present.has(entry.fdc_id)
);

const gating = bar.one_word.map((e) =>
  measure(app, searchCorpus, corpus, e, cap)
);
const multi = bar.multi_word.map((e) =>
  measure(app, searchCorpus, corpus, e, cap)
);
const british = bar.british_tripwire.map((entry) => {
  const rows = app.searchIndexRows(searchCorpus, entry.query).hits.length;
  return {
    query: entry.query,
    rows,
    at_registration: entry.rows_at_registration,
    // The tripwire fires on ONE transition only: a query that answered now
    // answers with nothing. Fewer rows is the rule working, not a breakage.
    broke: entry.rows_at_registration > 0 && rows === 0,
  };
});

const tally = (rows) => ({
  c1: rows.filter((r) => r.c1).length,
  c2: rows.filter((r) => r.c2).length,
  past_cap: rows.filter((r) => r.unreached === "past cap").length,
  absent: rows.filter((r) => r.unreached === "absent").length,
  n: rows.length,
});

const result = {
  measured: {
    index_rows: index.foods.length,
    index_generated_from: index.generated_from,
    schema_version: index.schema_version,
    cap,
    top_n: TOP_N,
    registered: bar.registered,
  },
  gold_rows_missing_from_corpus: missing.map((e) => e.fdc_id),
  gating: tally(gating),
  multi_word: tally(multi),
  british_broken: british.filter((b) => b.broke).map((b) => b.query),
  corpus_size_sanity: bar.conditions.corpus_size.expected_range,
  rows: { gating, multi_word: multi, british },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const pad = (value, width) => String(value).padEnd(width);
  const line = (r) =>
    `  ${pad(r.query, 16)}${pad(r.unreached ?? r.rank, 10)}${pad(r.total, 8)}${pad(r.c1 ? "PASS" : "fail", 7)}${pad(r.c2 ? "PASS" : "fail", 7)}${r.description}`;
  const header = `  ${pad("query", 16)}${pad("gold@", 10)}${pad("rows", 8)}${pad("C1", 7)}${pad("C2", 7)}gold row`;

  if (missing.length > 0) {
    console.log("BROKEN BAR — gold ids not in the corpus:");
    for (const entry of missing)
      console.log(`  fdc:${entry.fdc_id}  ${entry.query}`);
    console.log("");
  }

  console.log(`Gating roster — one-word (cap ${cap}, top ${TOP_N})\n`);
  console.log(header);
  for (const r of gating) console.log(line(r));
  console.log(
    `\n  C1 gold in top ${TOP_N}: ${result.gating.c1}/${result.gating.n}` +
      `   C2 at or under ${cap} rows: ${result.gating.c2}/${result.gating.n}` +
      `   gold past the page cap: ${result.gating.past_cap}` +
      `   gold not retrieved at all: ${result.gating.absent}`
  );

  console.log(`\nMulti-word — watched, not gating\n`);
  console.log(header);
  for (const r of multi) console.log(line(r));
  console.log(
    `\n  C1: ${result.multi_word.c1}/${result.multi_word.n}   C2: ${result.multi_word.c2}/${result.multi_word.n}`
  );

  const broke = british.filter((b) => b.broke);
  console.log(
    `\nBritish tripwire — ${broke.length === 0 ? "intact" : "BROKEN: " + broke.map((b) => b.query).join(", ")}` +
      ` (${british.filter((b) => b.rows > 0).length}/${british.length} answer)`
  );
  console.log(
    `\nCorpus: ${index.foods.length} rows. Sanity zone ${bar.conditions.corpus_size.expected_range.join("-")} (no pass/fail).`
  );
}
