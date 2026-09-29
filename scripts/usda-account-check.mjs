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
 *   - `public/usda/pairing-index.json` and `docs/research/usda-pairing-collapse.json`,
 *     the same pair for ADR-0113 §11's Pairing arm, which §12 gives the account a
 *     second table for. The arm needs its own census for a reason the shipped one
 *     makes easy to miss: a collapse leaves nothing behind in the index it writes,
 *     so the 690 records it absorbed are as absent from the Pairing index as a
 *     dropped food is from the Search index, and the absorbed column would be
 *     unre-derivable without them. Joining the arm to the drop census's
 *     `cooked_form` rows instead is what #517 refused: 19 of those 1,744 leave by
 *     the variant and name rules before the collapse reads a name, so the join
 *     reports three head phrases (`Rice`, `Pasta`, `Noodles`) as collapsing where
 *     nothing collapsed.
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
 * **The shipped arm's three group counts ARE re-derived, deliberately, and that
 * is the one place two implementations are the point.** The generator counts
 * merged groups, coverage holes and refusals as it performs them;
 * `countSurvivorOutcomes` reads them back off the names that shipped. A gate
 * whose numbers came from the same pass that wrote them would agree with a wrong
 * account as readily as with a right one. The cost is honest and worth naming: if
 * the two ever disagree about a corpus that did not move, this gate fails and the
 * first differing line says which count — which is a real bug in one of them, and
 * the failure is how anyone finds out.
 *
 * **The pairing arm's counts are one implementation, and the generator asserts
 * the difference instead.** Nothing in that arm counts a group as it merges it —
 * `buildPairingTargets` runs the shipped passes over a wider corpus and the cooked
 * half is a subset of what they report — so `collapseFigures` derives all four
 * figures from the arm's census, on both sides of the comparison. What stands in
 * for the second counter is in `usda-bundle.mjs`: the lifted corpus's own group
 * tallies, minus the shipped arm's, have to equal the arm's, and they can only be
 * subtracted like that because `assertArmCollapseIsClosed` has proved no group
 * lies astride the two.
 *
 * It reads its four files relative to the working directory, the way
 * `docs-check.mjs` does, so `usda-account-check.test.ts` can run the real gate
 * against a throwaway tree and prove it fires. A gate nobody has seen fail is a
 * gate nobody has tested.
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertCollapseReach,
  collapseAccount,
  collapseFigures,
} from "./usda-collapse.mjs";
import { assertArmCollapseIsClosed } from "./usda-pairing-targets.mjs";
import { resolve as resolveTs } from "./ts-resolve-hook.mjs";

// ADR-0113 §12's salt entries read a cooking method out of `usda-food-kind.ts`
// rather than spelling one a second time, so the roster now has a neighbour and
// a plain Node import of it needs the extensionless-import hook. Registered
// before the dynamic import below, which is why that import is dynamic: a static
// one is hoisted above this line and resolves against the bare specifier.
registerHooks({ resolve: resolveTs });
const {
  COLLAPSING_AXES,
  claimingAxis,
  descriptionSegments,
  mayRepresentGroup,
  residualDescription,
  siblingsOf,
} = await import("../src/lib/food/usda-collapse-roster.ts");

const INDEX_PATH = join("public", "usda", "search-index.json");
const CENSUS_PATH = join("docs", "research", "usda-drop-census.json");
const ARM_INDEX_PATH = join("public", "usda", "pairing-index.json");
const ARM_CENSUS_PATH = join("docs", "research", "usda-pairing-collapse.json");
const ACCOUNT_PATH = join("docs", "research", "190-corpus-account.md");

/** The roster, in the shape the generator's passes ask for it. */
const app = {
  COLLAPSING_AXES,
  claimingAxis,
  descriptionSegments,
  residualDescription,
  mayRepresentGroup,
  siblingsOf,
};

/**
 * The account the four committed artifacts say the two corpora deserve.
 *
 * Exported for the test, which asks it of corpora small enough to read.
 *
 * @param {{ shipped: { index: { foods: { fdcId: number, description: string }[] }, census: { drops: { fdcId: number, description: string, stage: string, collapsed_into?: number }[] } }, arm: { index: { foods: { fdcId: number, description: string }[] }, census: { collapsed: { fdcId: number, description: string, collapsed_into: number }[] } } }} artifacts
 * @returns {string}
 */
export function accountFromArtifacts({ shipped, arm }) {
  // The one family of the census that still SHIPS: each of these records is the
  // same food as a row that survived, under that row's `fdcId`.
  const taken = shipped.census.drops.filter(
    (drop) => drop.stage === "collapse"
  );
  const names = new Map(
    shipped.index.foods.map((row) => [row.fdcId, row.description])
  );
  /** @type {Map<number, string>} */
  const survivors = new Map();
  for (const drop of taken) {
    const into = drop.collapsed_into;
    const description = names.get(into);
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
  const corpus = collapseFigures(shipped.index.foods, taken, survivors, app);
  // Named before the bytes are compared, so a head arriving or leaving reports
  // itself as the roster question it is rather than as a diff of a table. Asked
  // of the shipped arm alone: 93 head phrases move in the other one, which is a
  // table and not a roster (ADR-0113 §11).
  assertCollapseReach(corpus.reach);

  const armNames = new Map(
    arm.index.foods.map((row) => [row.fdcId, row.description])
  );
  return collapseAccount(
    corpus,
    collapseFigures(
      arm.index.foods,
      arm.census.collapsed,
      assertArmCollapseIsClosed(arm.census.collapsed, armNames),
      app
    )
  );
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
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  const index = read(INDEX_PATH);
  const arm = read(ARM_INDEX_PATH);
  const rebuilt = accountFromArtifacts({
    shipped: { index, census: read(CENSUS_PATH) },
    arm: { index: arm, census: read(ARM_CENSUS_PATH) },
  });

  let committed = null;
  try {
    committed = readFileSync(ACCOUNT_PATH, "utf8");
  } catch {
    throw new Error(
      `${ACCOUNT_PATH} does not exist, and ADR-0103 §9 commits it. The ` +
        "generator writes it beside the artifacts it accounts for: pnpm " +
        "usda:bundle."
    );
  }
  if (committed !== rebuilt)
    throw new Error(
      `${ACCOUNT_PATH} is not an account of the corpus that ships.` +
        firstDifference(committed, rebuilt) +
        "\n\n  Either the corpus moved and the account was not regenerated " +
        "with it — pnpm usda:bundle writes the account beside every artifact " +
        "it is an account of — or the account was edited " +
        "by hand, in which case the edit is the thing to undo. Every figure " +
        "in it is derived from the rows the two indexes ship and the records " +
        "the two censuses say a collapse took, so it is never the place to " +
        "correct a number."
    );
  console.log(
    `  ok  ${ACCOUNT_PATH} is the account of the ${index.foods.length.toLocaleString("en-GB")} ` +
      `rows that ship and the ${arm.foods.length.toLocaleString("en-GB")} the pairing arm holds`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
