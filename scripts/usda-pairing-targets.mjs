/**
 * The Pairing target set: USDA's cooked records, re-admitted as a second corpus
 * (ADR-0113 §11).
 *
 * ADR-0104's shopper test keeps a record USDA cooked before it measured it out
 * of the Search index, and the shipped index says cooked on zero rows. That is
 * the right corpus for a food search and the wrong one for the jar this map was
 * chartered on, whose label matches a boiled kidney bean exactly. So the cooked
 * records ship as their own two artifacts, reached only after a person declares
 * the pack cooked, and never returned by the food search.
 *
 * **This arm writes no rule of its own.** It runs the shipped passes — ADR-0061's
 * variant drops, ADR-0056/0062's names, ADR-0103's collapse and §5's strip — over
 * the corpus `buildCorpus` yields with `isCookedForm` lifted, and keeps what the
 * shipped corpus never held. Every judgement about what a food IS therefore
 * holds corpus-wide, which is `CONTEXT.md`'s rule and the reason the set is 1,035
 * collapsed rows rather than 1,725: not collapsing here would assert that a trim
 * and a grade distinguish a food when you pair but not when you shop.
 *
 * **What it does write is one assertion**, {@link assertShippedRowsUnmoved}. The
 * two indexes describe one corpus between them, and the lift is only sound
 * because nothing it re-admits reaches back into the rows that ship.
 *
 * The passes' own assertions are deliberately NOT run here: `assertCollapseReach`
 * and the tallies beside it are calibrated to the corpus that ships, and the four
 * head phrases the collapse moves there are a measurement of a set with the
 * cooked half removed. The account of where the rule lands in THIS arm is
 * `docs/research/190-corpus-account.md`'s second table (ADR-0113 §12), which is
 * owed once these artifacts are committed and is not this module's.
 *
 * A library, not a command: `usda-bundle.mjs` is the only entry point, and it is
 * what holds the two arms to one reading of the archives. Node built-ins only —
 * in fact none at all — like every script beside it.
 */

import { applyShippedNames, applyVariantDrops } from "./usda-adjudication.mjs";
import { applyCollapsedNames, collapseCorpus } from "./usda-collapse.mjs";

/**
 * The cooked records, run through every pass the shipped corpus runs through.
 *
 * `survivors` is what `buildCorpus` returns with `isCookedForm` stubbed to
 * `false` — the only difference between the two arms, and the reason the caller
 * rather than this module lifts it: `buildCorpus` is the pass that reads the
 * rule, and a module that reached in and stubbed it would be a second place the
 * lift is written.
 *
 * `app` is the app's own logic unstubbed, because no pass below reads
 * `isCookedForm`: the rule fires once, in `buildCorpus`, and everything after it
 * asks what a name says rather than what kind of record it is.
 *
 * @param {Survivor[]} survivors - `buildCorpus`'s survivors, cooked rules lifted
 * @param {ReadonlySet<number>} shipped - every `fdcId` the shipped arm admitted
 * @param {AppModule} app
 * @returns {{ corpus: Survivor[], targets: Survivor[] }} the whole lifted corpus,
 *   and the rows of it the Search index never held
 */
export function buildPairingTargets(survivors, shipped, app) {
  const { survivors: filtered } = applyVariantDrops(survivors, app);
  const { survivors: named } = applyShippedNames(filtered, app);
  const collapse = collapseCorpus(named, app);
  const { survivors: corpus } = applyCollapsedNames(
    collapse.survivors,
    collapse.licensed,
    app
  );
  return {
    corpus,
    targets: corpus.filter((row) => !shipped.has(row.food.fdcId)),
  };
}

/**
 * Refuses a generation in which re-admitting the cooked records moved a row that
 * ships.
 *
 * The lift is a widening, and a widening that reached back into the Search index
 * would be a silent one: a cooked record can only touch a shipped row through
 * ADR-0103's collapse, by absorbing it into a group or by handing its
 * representative a shorter residual name, and both are changes nobody asked for
 * to an artifact this arm is not allowed to write. The two files would then
 * disagree about the same food, and the diff of the one that moved would look
 * like ordinary corpus drift.
 *
 * It is measured rather than assumed for the reason every tally in this
 * generator is: the census that priced this set found the answer to be zero on
 * both counts, and a zero nobody re-measures is the shape #156 already cost this
 * repo once.
 *
 * @param {Survivor[]} shipped - the shipped arm's finished rows
 * @param {Survivor[]} corpus - the lifted arm's finished rows
 * @returns {number} how many shipped rows were checked
 */
export function assertShippedRowsUnmoved(shipped, corpus) {
  const lifted = new Map(corpus.map((s) => [s.food.fdcId, s.food.description]));
  for (const { food } of shipped) {
    const found = lifted.get(food.fdcId);
    if (found === undefined)
      throw new Error(
        `re-admitting the cooked records removed fdcId ${food.fdcId} ` +
          `(${food.description}) from the corpus. A cooked record has absorbed ` +
          "a row the Search index ships; read ADR-0113 §11 and ADR-0103 §4 " +
          "before either artifact is written."
      );
    if (found !== food.description)
      throw new Error(
        `re-admitting the cooked records renamed fdcId ${food.fdcId} from ` +
          `"${food.description}" to "${found}". A cooked record has joined the ` +
          "collapse group of a row the Search index ships, and the two " +
          "artifacts would name one food twice."
      );
  }
  return shipped.length;
}
