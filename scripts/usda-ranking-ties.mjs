#!/usr/bin/env node
/**
 * What does the ranking leave UNDECIDED? The measurement behind research note
 * #158.
 *
 *   pnpm usda:ranking-ties             # the census, as JSON on stdout
 *   pnpm usda:ranking-ties --query tea # one query: the tie at its top, in full
 *
 * A different question from `usda-ranking-audit.mjs`, which is why it is a
 * different file. The audit asks whether a search REACHES the best record and
 * where it lands; this asks how often the ten keys run out and hand the answer
 * to `Array.prototype.sort`'s stability, which is to say to `fdcId` order.
 * Every such lead is an accident — sometimes a lucky one, and #158 found four
 * pinned leads that are exactly that.
 *
 * Two numbers, and the second is the one that matters. The CENSUS counts the
 * ties. The HARM distribution prices them, as the calorie spread across the
 * tied rows: a query whose tied rows all carry the same panel costs a user
 * nothing whichever wins, and a query whose tied rows run 77 to 854 kcal costs
 * them the difference. #158's `tea` was a 1 kcal tie and its `beef` a 777 kcal
 * one, and no count that omits the panel can tell them apart. #162 then took
 * `beef` to 94 kcal without emptying the tie, which is the shape a key change
 * makes here: the count barely moves and the harm distribution does.
 *
 * Deliberately not wired into `pnpm check`, for the reason the audit's own
 * header gives: it is a dated finding rather than an invariant, and a gate here
 * would fail on every legitimate ranking change. Cases worth locking get pinned
 * as ordinary corpus tests by the ticket that finds them.
 *
 * It writes nothing. The corpus and the search come from
 * `usda-ranking-corpus.mjs` rather than being restated here, which is that
 * module's whole reason for existing.
 */

import {
  RESULT_LIMIT,
  buildCorpus,
  readIndex,
  scoreAll,
} from "./usda-ranking-corpus.mjs";
import { sweepQueries } from "./usda-ranking-queries.mjs";
import { compareRelevance } from "../src/lib/food/reference-food-ranking.ts";

/**
 * The rows at the top of a result list that no key separates.
 *
 * `compareRelevance` returning 0 IS the definition — a restatement comparing
 * fields by hand would drift from the shipped order the first time a key is
 * added, and the whole point of this instrument is to find where that order
 * stops speaking.
 *
 * The list is already sorted, so the tie is a prefix and the scan stops at the
 * first row that differs. Asked of the UNTRUNCATED ordering, deliberately: the
 * question is how many rows the keys failed to separate, and when #158 ran this
 * `beef` failed to separate 413 of them. Through the 50-row window that reads
 * as a 50-way tie, which measures the window rather than the ranking. Seven
 * queries are still past the window and 86 still tie ten rows or more.
 */
function tieAtTop(results) {
  let n = 1;
  while (
    n < results.length &&
    compareRelevance(results[0].key, results[n].key) === 0
  )
    n++;
  return results.slice(0, n);
}

/** Spread bands in kcal/100 g, so "how big is the tie" is asked of the panel. */
const bandOf = (spread) =>
  spread === 0
    ? "0"
    : spread <= 10
      ? "1-10"
      : spread <= 50
        ? "11-50"
        : spread <= 100
          ? "51-100"
          : spread <= 200
            ? "101-200"
            : "200+";

const index = readIndex();
const corpus = buildCorpus(index);
const calories = new Map(
  index.foods.map((row) => [row.description, row.macros?.calories])
);

/** One query's tie, priced: who leads, who else tied, and what it costs. */
function measure(query) {
  const tied = tieAtTop(scoreAll(corpus, query));
  if (tied.length < 2) return null;
  const members = tied.map((r) => r.description);
  const cals = members
    .map((d) => calories.get(d))
    .filter((c) => typeof c === "number");
  const lo = Math.min(...cals);
  const hi = Math.max(...cals);
  return {
    query,
    tied: members.length,
    // How much of the tie the user actually meets. Where this is below `tied`
    // the rest of the tie is off the end of the list, so the accident decides
    // among rows some of which were never on offer.
    tied_shown: Math.min(members.length, RESULT_LIMIT),
    lead: members[0],
    lead_calories: calories.get(members[0]),
    calories_low: lo,
    calories_high: hi,
    spread: hi - lo,
    members,
  };
}

const args = process.argv.slice(2);

if (args.includes("--query")) {
  const query = args[args.indexOf("--query") + 1];
  const results = scoreAll(corpus, query);
  const tied = tieAtTop(results);
  console.log(`query      ${JSON.stringify(query)}`);
  console.log(`retrieved  ${results.length}`);
  console.log(
    `tied       ${tied.length} (${Math.min(tied.length, RESULT_LIMIT)} of them shown)`
  );
  console.log(`key        ${JSON.stringify(results[0]?.key ?? null)}`);
  for (const row of tied.slice(0, RESULT_LIMIT))
    console.log(
      `  ${String(calories.get(row.description) ?? "?").padStart(6)}  ${row.description}`
    );
} else {
  const queries = sweepQueries(index.foods.map((f) => f.description));
  const ties = queries.map(measure).filter(Boolean);

  const sizes = {};
  const bands = {
    0: 0,
    "1-10": 0,
    "11-50": 0,
    "51-100": 0,
    "101-200": 0,
    "200+": 0,
  };
  for (const tie of ties) {
    const bucket = tie.tied >= 10 ? "10+" : String(tie.tied);
    sizes[bucket] = (sizes[bucket] ?? 0) + 1;
    bands[bandOf(tie.spread)]++;
  }

  console.log(
    JSON.stringify(
      {
        measured: {
          // What a later run needs to tell "the ranking changed" from "the
          // corpus changed" — the two a bare diff cannot distinguish. The same
          // pair the audit stamps, for the same reason.
          index_rows: index.foods.length,
          index_generated_from: index.generated_from,
          queries: queries.length,
        },
        counts: {
          queries_tied_at_top: ties.length,
          tie_sizes: sizes,
          spread_bands_kcal: bands,
        },
        // The head of the harm distribution, which is where a ticket should
        // start. Twenty-five rather than all of them: the tail is thousands of
        // rows long and the note quotes the bands, not the list.
        worst: [...ties]
          .sort((a, b) => b.spread - a.spread)
          .slice(0, 25)
          .map(({ members, ...rest }) => rest),
      },
      null,
      2
    )
  );
}
