#!/usr/bin/env node
/**
 * Is `docs/research/190-corpus-account.md` still the account of the corpus that
 * actually ships? Run with `pnpm check:account`; also chained into `pnpm check`.
 *
 * ADR-0103 §9's third requirement is a COMMITTED account of what the collapse
 * removed, and #437 is the half that requirement does not carry on its own. A
 * committed artifact makes a change visible to whoever reads the diff; it says
 * nothing at all when the artifact stops matching the thing it describes. That
 * is #156 exactly — the ranking audit's numbers were regenerated as a side
 * effect and nobody re-derived them, so the audit went blind while every file in
 * it still looked plausible — and this map has since watched a landing-zone
 * figure survive unchallenged and a count restated in three files drift (#162).
 * A stale account has to FAIL rather than mislead.
 *
 * **It rebuilds the account and compares the bytes.** Not a parse of the numbers
 * out of the prose: the sentences interpolate their figures, so a hand-edit that
 * "fixes" a number is exactly the edit a number-reading gate would bless, and
 * the prose is where the account explains what the numbers mean. The whole file
 * is generated, so the whole file is the claim.
 *
 * **It reads only what a clone has.** `docs/food-search.html`'s gate re-runs its
 * generator, which it can afford because that generator reads committed inputs.
 * This account is written from the archives in `.usda-backup`, which CI does not
 * have and a contributor need not — so the rebuild comes instead from the two
 * committed artifacts the account is an account OF:
 *
 *   - `public/usda/search-index.json`, the rows that ship, which is where the
 *     per-head "after" and the corpus total come from.
 *   - `docs/research/usda-drop-census.json`, whose `"stage": "collapse"` rows
 *     are the records the collapse absorbed and the survivor each went into.
 *
 * Between them they carry every figure the account states, which is a property
 * of the account rather than a lucky one: `collapseAccount` is written to state
 * nothing else, and the strip's own `stripped` tally left the file for this
 * reason (#437).
 *
 * **The prose and the per-head table are the generator's own**, not a second
 * spelling of them: `collapseReach`, `headPhraseCount` and `collapseAccount` are
 * imported from `usda-collapse.mjs`, and the roster is the app's, imported
 * straight from `src/lib/food/usda-collapse-roster.ts` the way
 * `food-search-explainer.mjs` imports the ranking — the one seam
 * `usda-app-module.mjs` offers needs esbuild, which a gate chained into
 * `pnpm check` should not. A gate that re-wrote the account's sentences would
 * pass on the day its copy and the generator's agreed with each other and
 * disagreed with the corpus.
 *
 * **The three group counts ARE re-derived, deliberately, and that is the one
 * place two implementations are the point.** The generator counts merged groups,
 * coverage holes and refusals as it performs them; {@link countSurvivorOutcomes}
 * reads them back off the names that shipped. A gate whose numbers came from the
 * same pass that wrote them would agree with a wrong account as readily as with
 * a right one. The cost is honest and worth naming: if the two ever disagree
 * about a corpus that did not move, this gate fails and the first differing line
 * says which count — which is a real bug in one of them, and the failure is how
 * anyone finds out.
 *
 * It reads its three files relative to the working directory, the way
 * `docs-check.mjs` does, so `usda-account-check.test.ts` can run the real gate
 * against a throwaway tree and prove it fires. A gate nobody has seen fail is a
 * gate nobody has tested.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertCollapseReach,
  collapseAccount,
  collapseReach,
  headPhraseCount,
} from "./usda-collapse.mjs";
import {
  descriptionSegments,
  mayRepresentGroup,
  residualDescription,
} from "../src/lib/food/usda-collapse-roster.ts";

const INDEX_PATH = join("public", "usda", "search-index.json");
const CENSUS_PATH = join("docs", "research", "usda-drop-census.json");
const ACCOUNT_PATH = join("docs", "research", "190-corpus-account.md");

/** The roster, in the shape the generator's passes ask for it. */
const app = { descriptionSegments, residualDescription, mayRepresentGroup };

/**
 * A row in the shape {@link collapseReach} reads: a name, and an identity.
 *
 * The panel is empty and unread. §4's chain has already run — this gate looks at
 * a finished corpus and never picks a representative — so filling the array
 * would be a fixture pretending to a question nobody asks here.
 */
const collapsible = (fdcId, description) => ({
  food: { fdcId, description, foodNutrients: [] },
});

/**
 * How each collapse group's survivor ended up named, read off the corpus rather
 * than off the pass that produced it.
 *
 * Two of the three counts the account's "And why" section states — the third,
 * the groups shipping under a residual name, is what is left once these are
 * taken off the merged total. Each is a question about the SHIPPED name of a
 * group's representative:
 *
 * - **A name with no collapsing segment left in it** is a group that shipped
 *   under its residual. Either §5's strip took the segments, or the group merged
 *   on §3's punctuation clause and had none to take — which is why the account
 *   counts groups here and not names (the generator holds the two to each other,
 *   where both numbers exist).
 * - **A representative that could not have stood for its group** is §5's
 *   coverage hole: every record in the group states a non-preferred value, so
 *   the fullest panel ships under its own whole name.
 * - **A representative that WAS eligible and still carries its segments** is
 *   ADR-0062 §3's refusal: the residual name was taken, so the strip was not
 *   made. A refusal leaves the corpus byte-for-byte as it was, which is the
 *   whole reason it is counted rather than inferred.
 *
 * @param {Map<number, string>} survivors - each group's representative, by `fdcId`.
 * @returns {{ groups_shipped_whole: number, names_refused: number }}
 */
function countSurvivorOutcomes(survivors) {
  let groups_shipped_whole = 0;
  let names_refused = 0;
  for (const description of survivors.values()) {
    if (residualDescription(description) === description) continue;
    if (mayRepresentGroup(description)) names_refused++;
    else groups_shipped_whole++;
  }
  return { groups_shipped_whole, names_refused };
}

/**
 * The account the two committed artifacts say the corpus deserves.
 *
 * Exported for the test, which asks it of a corpus small enough to read.
 *
 * @param {{ foods: { fdcId: number, description: string }[] }} index
 * @param {{ drops: { fdcId: number, description: string, stage: string, collapsed_into?: number }[] }} census
 * @returns {string}
 */
export function accountFromArtifacts(index, census) {
  const after = index.foods.map((row) =>
    collapsible(row.fdcId, row.description)
  );
  // The one family of the census that still SHIPS: each of these records is the
  // same food as a row that survived, under that row's `fdcId`.
  const taken = census.drops.filter((drop) => drop.stage === "collapse");
  // The corpus as the collapse received it: what survived, plus what it took.
  // Stated this way round because the archives are the one input this gate does
  // not have, and the census is a record of the difference between the two.
  const before = [
    ...after,
    ...taken.map((drop) => collapsible(drop.fdcId, drop.description)),
  ];

  const shipped = new Map(
    index.foods.map((row) => [row.fdcId, row.description])
  );
  /** @type {Map<number, string>} */
  const survivors = new Map();
  for (const drop of taken) {
    const into = drop.collapsed_into;
    const description = shipped.get(into);
    // ADR-0051 §2's survivor assertion, asked a second time and from the other
    // side. The generator asks it of the rows it is about to write; this asks it
    // of the rows that were written, so a corpus and a census committed out of
    // step cannot quietly turn 381 collapses into 381 deletions on the way to
    // being compared.
    if (description === undefined)
      throw new Error(
        `${CENSUS_PATH} says ${drop.fdcId} ("${drop.description}") collapsed ` +
          `into ${into}, and no row of ${INDEX_PATH} carries that fdcId. A ` +
          "collapse always leaves a survivor — that is the whole ground on " +
          "which it fires under head phrases nobody has read — so the two " +
          "artifacts were committed out of step. Regenerate both: pnpm " +
          "usda:bundle, then pnpm usda:drop-census."
      );
    survivors.set(into, description);
  }

  const reach = collapseReach(before, after, app);
  // Named before the bytes are compared, so a head arriving or leaving reports
  // itself as the roster question it is rather than as a diff of a table.
  assertCollapseReach(reach);
  return collapseAccount(reach, {
    before: before.length,
    after: after.length,
    heads: headPhraseCount(before, app),
    groups_merged: survivors.size,
    ...countSurvivorOutcomes(survivors),
  });
}

/**
 * Where two texts first differ, as a line number and the two lines.
 *
 * A gate that says only "out of date" over a generated file makes the reader
 * diff it by hand against a file they cannot generate without the archives. The
 * first differing line is usually the whole answer: one number moved, and the
 * sentence it moved in says which.
 */
function firstDifference(committed, rebuilt) {
  const was = committed.split("\n");
  const now = rebuilt.split("\n");
  for (let at = 0; at < Math.max(was.length, now.length); at++)
    if (was[at] !== now[at])
      return (
        `\n  line ${at + 1}\n` +
        `  committed: ${JSON.stringify(was[at] ?? "(end of file)")}\n` +
        `  corpus:    ${JSON.stringify(now[at] ?? "(end of file)")}`
      );
  return "";
}

function main() {
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
  const rebuilt = accountFromArtifacts(index, census);

  let committed = null;
  try {
    committed = readFileSync(ACCOUNT_PATH, "utf8");
  } catch {
    throw new Error(
      `${ACCOUNT_PATH} does not exist, and ADR-0103 §9 commits it. The ` +
        "generator writes it beside the two artifacts: pnpm usda:bundle."
    );
  }
  if (committed !== rebuilt)
    throw new Error(
      `${ACCOUNT_PATH} is not an account of the corpus that ships.` +
        firstDifference(committed, rebuilt) +
        "\n\n  Either the corpus moved and the account was not regenerated " +
        "with it — pnpm usda:bundle writes both — or the account was edited " +
        "by hand, in which case the edit is the thing to undo. Every figure " +
        "in it is derived from public/usda/search-index.json and the census's " +
        '"stage": "collapse" rows, so it is never the place to correct a ' +
        "number."
    );
  console.log(
    `  ok  ${ACCOUNT_PATH} is the account of the ${index.foods.length.toLocaleString("en-GB")} rows that ship`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
