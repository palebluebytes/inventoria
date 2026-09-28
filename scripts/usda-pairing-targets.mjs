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
 * `docs/research/190-corpus-account.md`'s second table (ADR-0113 §12), and the
 * row-level half of it is {@link serialisePairingCollapse}: the collapse in this
 * arm is invisible in the Pairing index, because §5 strikes the claimed segments
 * out of the survivor's name and the absorbed record is simply absent, so without
 * a committed census of it the account could not state an absorbed count that
 * `usda-account-check.mjs` could re-derive. It is the same file the drop census is
 * for the corpus that ships, for the one stage that arm has.
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
 * `absorbed` is the arm's own collapse, and it is filtered by the same predicate
 * `targets` is: a record the shipped arm already admitted was absorbed by the
 * shipped collapse too, and the census above accounts for it. What is left is the
 * cooked half's, which is the half no committed artifact carries.
 *
 * @param {Survivor[]} survivors - `buildCorpus`'s survivors, cooked rules lifted
 * @param {ReadonlySet<number>} shipped - every `fdcId` the shipped arm admitted
 * @param {AppModule} app
 * `tally` is the LIFTED corpus's own group counts, both arms together, and it is
 * returned for one purpose: {@link assertArmFiguresAddUp} subtracts the shipped
 * arm's from it and holds the remainder to what the account says about this one.
 *
 * @returns {{ corpus: Survivor[], targets: Survivor[], absorbed: { row: Survivor, into: Survivor }[], tally: import("./usda-collapse.mjs").GroupCounts }}
 *   the whole lifted corpus, the rows of it the Search index never held, the
 *   records this arm's collapse took from among them, and what the collapse
 *   counted over both arms at once
 */
export function buildPairingTargets(survivors, shipped, app) {
  const { survivors: filtered } = applyVariantDrops(survivors, app);
  const { survivors: named } = applyShippedNames(filtered, app);
  const collapse = collapseCorpus(named, app);
  const { survivors: corpus, tally } = applyCollapsedNames(
    collapse.survivors,
    collapse.licensed,
    app
  );
  return {
    corpus,
    targets: corpus.filter((row) => !shipped.has(row.food.fdcId)),
    absorbed: [...collapse.collapsed.values()].filter(
      ({ row }) => !shipped.has(row.food.fdcId)
    ),
    tally: {
      groups_merged: collapse.groups_merged,
      groups_shipped_whole: collapse.groups_shipped_whole,
      names_refused: tally.refused,
    },
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

/**
 * Refuses an arm whose collapse reached out of it, and hands back each group's
 * survivor under the name that ships.
 *
 * ADR-0051 §2's survivor assertion, asked of the second corpus, and it carries a
 * second claim the first does not need: **every survivor is a Pairing target**.
 * That is what lets `docs/research/190-corpus-account.md` account for the two
 * arms in two tables rather than one — a cooked record absorbed into a row the
 * Search index ships would put a group astride both corpora, and the arm's
 * absorbed count would be an account of neither.
 *
 * Written over plain rows rather than over survivors so this arm's generator and
 * its gate ask it once between them: the generator has the collapse map and the
 * gate has the committed census, and a claim spelled twice is the drift #162
 * measured. The shipped arm asks a map-lookup-or-throw of the same shape inline in
 * `usda-account-check.mjs` and is deliberately not folded in here — it claims
 * something else (that an index and a census were committed from one run) and
 * names a different remedy, and the mechanics they share are the most generic two
 * lines in the file.
 *
 * @param {{ fdcId: number, description: string, collapsed_into: number }[]} absorbed
 * @param {Map<number, string>} targets - `fdcId` → the name the row ships under
 * @returns {Map<number, string>} each group's survivor, by `fdcId`
 */
export function assertArmCollapseIsClosed(absorbed, targets) {
  /** @type {Map<number, string>} */
  const survivors = new Map();
  for (const row of absorbed) {
    const description = targets.get(row.collapsed_into);
    if (description === undefined)
      throw new Error(
        `"${row.description}" (${row.fdcId}) collapsed into ` +
          `${row.collapsed_into} in the Pairing arm, and no target row carries ` +
          "that fdcId. Either a collapse became a deletion, or a cooked record " +
          "was absorbed into a row the Search index ships — which would put " +
          "one collapse group across both corpora and make the arm's account " +
          "an account of neither (ADR-0113 §11)."
      );
    survivors.set(row.collapsed_into, description);
  }
  return survivors;
}

/**
 * The arm's collapse census: every cooked record this arm's collapse absorbed,
 * and the target row it went into.
 *
 * `survivors` is {@link assertArmCollapseIsClosed}'s answer, taken as an argument
 * rather than asked for here, so the assertion is made once by the caller and the
 * same map answers both this census's names and the account's group counts.
 *
 * The survivor's name in it is the FINISHED one rather than the representative as
 * the collapse map held it, because the map holds that row before §5's strip
 * shortened it. A census answering with the pre-strip name would name a row
 * `public/usda/pairing-index.json` does not hold, which is the mistake
 * `usda-drop-census.mjs` documents having had to avoid.
 *
 * @param {{ fdcId: number, description: string, collapsed_into: number }[]} absorbed
 * @param {Map<number, string>} survivors - each group's survivor, by `fdcId`
 * @param {{ schema_version: number, generated_from: unknown[], targets: number }} provenance
 */
export function pairingCollapseCensus(absorbed, survivors, provenance) {
  const collapsed = [...absorbed]
    .sort((a, b) => a.fdcId - b.fdcId)
    .map((row) => ({
      fdcId: row.fdcId,
      description: row.description,
      collapsed_into: row.collapsed_into,
      collapsed_into_description: survivors.get(row.collapsed_into),
    }));
  return {
    artifact: "usda-pairing-collapse",
    schema_version: provenance.schema_version,
    generated_from: provenance.generated_from,
    targets: provenance.targets,
    absorbed: collapsed.length,
    collapsed,
  };
}

/**
 * Refuses a generation in which the arm's figures do not account for the
 * difference between the two collapses.
 *
 * Nothing in this arm counts a group as it merges one: the passes run over the
 * whole lifted corpus and report both arms at once, so the account's four figures
 * for the cooked half are derived from the census rather than counted twice, and
 * the shipped arm's second counter has no counterpart here.
 *
 * This is what stands in for it. The lifted corpus's own tallies minus the shipped
 * arm's must be the arm's, and that subtraction is only legitimate because
 * {@link assertArmCollapseIsClosed} has proved no group lies astride the two
 * corpora — a cooked record absorbed into a shipped row would put one group in
 * both columns and make the remainder mean nothing.
 *
 * @param {import("./usda-collapse.mjs").GroupCounts} lifted - both arms at once
 * @param {import("./usda-collapse.mjs").GroupCounts} shipped - the corpus that ships
 * @param {import("./usda-collapse.mjs").GroupCounts} arm - what the arm's census says
 * @returns {number} the groups the arm's collapse merged
 */
export function assertArmFiguresAddUp(lifted, shipped, arm) {
  for (const figure of [
    "groups_merged",
    "groups_shipped_whole",
    "names_refused",
  ]) {
    const remainder = lifted[figure] - shipped[figure];
    if (remainder !== arm[figure])
      throw new Error(
        `the lifted corpus counts ${lifted[figure]} ${figure} and the corpus ` +
          `that ships counts ${shipped[figure]}, leaving ${remainder} for the ` +
          `Pairing arm; its census says ${arm[figure]}. Either a collapse group ` +
          "lies astride the two corpora or the arm's census is not the census " +
          "of this generation — read ADR-0113 §11 before either artifact is " +
          "written."
      );
  }
  return arm.groups_merged;
}

/**
 * The arm's collapse census as bytes: one absorbed record per line.
 *
 * Per line for the reason every generated artifact in this repo is — the unit of a
 * reviewable diff is one food (ADR-0047 §3) — which is also why
 * `.prettierignore` names the file: Prettier would expand each record over six
 * lines, and the account's second table is only readable beside a diff that says
 * which records moved.
 */
export function serialisePairingCollapse(census) {
  const { collapsed, ...head } = census;
  return `${JSON.stringify({ ...head, collapsed: "@@ROWS@@" }).replace(
    '"@@ROWS@@"',
    `[\n${collapsed.map((row) => JSON.stringify(row)).join(",\n")}\n]`
  )}\n`;
}
