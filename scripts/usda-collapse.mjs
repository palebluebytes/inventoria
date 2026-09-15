/**
 * What ADR-0103's COLLAPSE does to a finished corpus: one row per food, and
 * every row it takes names the row it collapsed into.
 *
 * A pass of its own beside `usda-adjudication.mjs` for that file's reason,
 * inverted. Those two carry judgements a rule cannot reach, recorded one row at
 * a time, and they move when somebody READS a row. This one carries no
 * judgement at all: §3's grouping is mechanical, §4's chain is three ordered
 * comparisons, and the whole of the editorial content is the roster in
 * `src/lib/food/usda-collapse-roster.ts`, which moves when an AXIS IS CLASSIFIED
 * (§9). Nothing here restates it — the roster arrives as `app` through the same
 * esbuild seam everything else does (ADR-0047 §4).
 *
 * **It runs last**, after the name passes, and that position is load-bearing in
 * one direction: the residual description is computed from the name the row will
 * actually SHIP under, so the segments a rename has already taken cannot come
 * back to split a group. `Lamb, New Zealand, imported, loin` and its domestic
 * twin are one food only after ADR-0056's origin strip has run, which is the
 * same argument `applyShippedNames` gives for putting the frozen-mirror rule
 * where it is.
 *
 * **What it does NOT do is shorten a name.** §5's strip — `Beef, flank, steak`
 * for `Beef, flank, steak, separable lean and fat, trimmed to 0" fat, choice` —
 * is licensed by the collapse having happened and is #436's. A survivor here
 * ships under the name USDA published, which over-states nothing and under-reads
 * badly; the two halves are separate tickets because the strip creates name
 * collisions that need resolving and this does not.
 *
 * @import { AppModule } from "./usda-bundle.mjs"
 */

/**
 * What a row has to carry to be collapsed: the name §3 groups on, the panel §4
 * counts, and the identity §9's assertion follows.
 *
 * Stated as its own shape, and the passes below are GENERIC over it rather than
 * typed to `Survivor`, for the reason `bundleArchives` gives about itself:
 * constraining rather than narrowing is what lets a function ask for the three
 * fields it reads and hand the row back WHOLE. The generator passes a
 * `Survivor`, the drop census passes the rows it has reconstructed from the
 * archives, and neither has to pretend to a shape the question never reads —
 * which is what would let the two diverge on the day §4's chain reads a fourth
 * field.
 *
 * @typedef {{ food: { fdcId: number, description: string, foodNutrients: unknown[] } }} Collapsible
 */

/**
 * The head phrases the collapse MOVES, and the whole of them.
 *
 * Moves, not reaches, and the two are different counts. **Seven** heads carry a
 * segment the roster claims — `Beef` 374, `Lamb` 97, `Pork` 94, `Veal` 30,
 * `Game meat` 6, `Pork loin` 1, `Chicken` 1 — and only four hold a group of more
 * than one row, so only four lose anything. `Game meat` states a separation on
 * six bison records and no two of them share a residual description.
 *
 * §6 fires the collapse corpus-wide — its worst case is a wrong representative,
 * which is visible and recoverable, where a drop's worst case is quinoa — so
 * this roster is not a gate on where the rule may run. It is a MEASUREMENT of
 * where it lands, held to by {@link assertCollapseReach}, because a rule whose
 * reach nobody measured is a hole nobody can see: what is left after ADR-0104
 * removed the cooked half is purely butchery, and 484 of the 488 head phrases
 * have nothing to collapse at all.
 *
 * ADR-0103's hand-off named six. `Nuts` and `Seeds` are not here because the
 * only thing that moved them was the preparation axis, which left the roster
 * with ADR-0104 (#434): the eight roasted nut and seed rows are ingredients as
 * bought, and collapsing a roasted chestnut onto a raw one would have deleted a
 * row ADR-0104 argued for.
 */
export const HEADS_THE_COLLAPSE_MOVES = ["Beef", "Lamb", "Pork", "Veal"];

/**
 * How full a record's panel is, present-not-nonzero (§4.2).
 *
 * A measured 0 g of fat is a fuller panel than a fat figure USDA never published
 * (ADR-0048), and `projectArchiveFood` has already dropped every nutrient with
 * no numeric amount — so counting what is there IS the present-not-nonzero
 * reading, and there is no second rule to write.
 */
const panelFullness = (row) => row.food.foodNutrients.length;

/**
 * §4's chain, as a comparator: the fuller panel, then the lowest `fdcId`.
 *
 * `dataType` is deliberately absent. Preferring Foundation to SR Legacy is
 * provenance rather than a claim about the record, and ADR-0055 §1 admits only
 * the second kind — ADR-0045 §2's Foundation-first merge is a different
 * operation on a different key and is untouched by this. The `fdcId` tiebreak is
 * what makes the answer stable across regenerations rather than a function of
 * the order the archives were read in.
 */
const byPanelThenId = (a, b) =>
  panelFullness(b) - panelFullness(a) || a.food.fdcId - b.food.fdcId;

/**
 * The corpus grouped by §3's key, in arrival order within each group and between
 * them.
 *
 * Its own function rather than a loop inside {@link collapseCorpus} because §3
 * and §4 are two decisions — which records are one food, and which of them
 * ships — and the first is the one the roster owns.
 *
 * @template {Collapsible} Row
 * @param {Row[]} rows
 * @param {AppModule} app
 * @returns {Map<string, Row[]>}
 */
function collapseGroups(rows, app) {
  const groups = new Map();
  for (const row of rows) {
    const key = app.collapseGroupKey(row.food.description);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/**
 * One record per collapse group, and a map from every row taken to the row it
 * collapsed into.
 *
 * The representative is a record USDA published and the panel that ships is that
 * record's, whole (§4). Not a mean: a mean is a number USDA never measured, no
 * row can be pointed at to explain it, and the ledger stores `fdc:<id>` entities
 * — so a meaned row would need an identity that is not a USDA record.
 *
 * A group with no eligible record does not block its head. It ships its
 * fullest-panel record under that record's whole name, exactly as a group of one
 * does — `Quinoa, cooked` is the only quinoa USDA publishes, nothing is stripped,
 * and it ships. The asymmetry the record originally had between the two had no
 * argument behind it and cost a head (ADR-0103's 2026-09-12 Amendment).
 *
 * `collapsed` is §9's second requirement made material: every collapsed row
 * names the row it collapsed into, which is what {@link assertCollapsedRowsShip}
 * holds to the shipped index and what the drop census commits one line per row.
 * It carries both rows WHOLE rather than a pair of ids, so neither caller has to
 * build a second map back from `fdcId` to a name it already had.
 *
 * @template {Collapsible} Row
 * @param {Row[]} rows
 * @param {AppModule} app
 * @returns {{ survivors: Row[], collapsed: Map<number, { row: Row, into: Row }>, groups_merged: number, groups_shipped_whole: number }}
 */
export function collapseCorpus(rows, app) {
  /** @type {Map<number, { row: Row, into: Row }>} */
  const collapsed = new Map();
  const kept = [];
  let groups_merged = 0;
  let groups_shipped_whole = 0;

  for (const group of collapseGroups(rows, app).values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    groups_merged++;
    const eligible = group.filter((row) =>
      app.mayRepresentGroup(row.food.description)
    );
    if (eligible.length === 0) groups_shipped_whole++;
    const [representative] = [...(eligible.length ? eligible : group)].sort(
      byPanelThenId
    );
    kept.push(representative);
    for (const row of group)
      if (row !== representative)
        collapsed.set(row.food.fdcId, { row, into: representative });
  }

  // Back into `fdcId` order, which is the order the artifacts are written in
  // (ADR-0047 §3): a representative is rarely the first row of its group, so
  // without this the diff of a regeneration would be a reshuffle.
  kept.sort((a, b) => a.food.fdcId - b.food.fdcId);
  return { survivors: kept, collapsed, groups_merged, groups_shipped_whole };
}

/**
 * Refuses a generation in which a collapsed row's survivor is not in the shipped
 * index.
 *
 * ADR-0051 §2's survivor assertion, inherited whole (§9). A collapse always
 * leaves a survivor — that is the entire ground on which §6 lets it fire under
 * head phrases nobody has read — so a survivor that is not shipping means the
 * collapse has silently become a deletion, which is what ADR-0055 §1 forbids and
 * what no rule in this pipeline has leave to do.
 *
 * Asked of the FINISHED index rather than of this pass's own output, and the
 * distinction is the point: today the collapse runs last and picks its
 * representative out of the group it is collapsing, so nothing between here and
 * the artifact can take one. The assertion is for the pipeline this file does
 * not control — a filter, a rename or a drop added after the collapse would take
 * a survivor and leave a dozen rows pointing at nothing, and the generation has
 * to stop rather than publish that. `assertSupersededSurvive` guards a written
 * drop list from the same direction for the same reason.
 *
 * @param {{ fdcId: number }[]} indexRows - the index rows, as they will be written.
 * @param {ReadonlyMap<number, { row: Collapsible, into: Collapsible }>} collapsed
 * @returns {number} how many collapsed rows were checked
 */
export function assertCollapsedRowsShip(indexRows, collapsed) {
  const shipped = new Set(indexRows.map((row) => row.fdcId));
  for (const { row, into } of collapsed.values())
    if (!shipped.has(into.food.fdcId))
      throw new Error(
        `"${row.food.description}" (${row.food.fdcId}) collapsed into ` +
          `${into.food.fdcId}, and that row is not in the shipped index. A ` +
          "collapse always leaves a survivor — that is the whole ground on " +
          "which it fires under head phrases nobody has read — so a pass after " +
          "the collapse has turned it into a deletion. Re-read the order in " +
          "usda-bundle.mjs."
      );
  return collapsed.size;
}

/**
 * What the collapse did to each head phrase, in absorbed order.
 *
 * The head phrase is the first comma-segment, which is what the group is a group
 * OF (§3), so this is the account §9 asks for at the granularity the hand-off
 * was written in: rows in, rows out, per head.
 *
 * @param {Collapsible[]} before
 * @param {Collapsible[]} after
 * @param {AppModule} app
 * @returns {{ head: string, rows: number, after: number, absorbed: number }[]}
 */
export function collapseReach(before, after, app) {
  const count = (rows) => {
    const heads = new Map();
    for (const row of rows) {
      const { head } = app.descriptionSegments(row.food.description);
      heads.set(head, (heads.get(head) ?? 0) + 1);
    }
    return heads;
  };
  const was = count(before);
  const now = count(after);
  return [...was]
    .map(([head, rows]) => ({
      head,
      rows,
      after: now.get(head) ?? 0,
      absorbed: rows - (now.get(head) ?? 0),
    }))
    .filter((entry) => entry.absorbed > 0)
    .sort((a, b) => b.absorbed - a.absorbed || a.head.localeCompare(b.head));
}

/**
 * ADR-0103 §9's committed account, as Markdown.
 *
 * §9 asks for three things and this is the third: **generation emits a per-head
 * account — rows in, rows out, and why — and the account is committed**. Written
 * by the generator beside the two artifacts, for ADR-0047 §3's reason applied to
 * an account: a clone reads what the rule removed with no archives and no
 * network, and a roster change arrives as a reviewable diff rather than as a
 * number in a build log nobody kept.
 *
 * It stops at the head. The row-level answer — which `fdcId` each collapsed
 * record went into — is `docs/research/usda-drop-census.json`, and restating 381
 * rows here would be a second copy of it to drift from.
 *
 * @param {{ head: string, rows: number, after: number, absorbed: number }[]} reach
 * @param {{ before: number, after: number, groups_merged: number, groups_shipped_whole: number }} corpus
 * @returns {string} the file's whole text
 */
export function collapseAccount(reach, corpus) {
  const n = (v) => v.toLocaleString("en-GB");
  // Padded to the column, which is what Prettier does to a Markdown table. The
  // file is generated AND committed, so emitting it any other way would mean
  // either a `.prettierignore` entry or a formatter fight on every commit.
  const table = (header, rows) => {
    const all = [header, ...rows];
    const width = header.map((_, at) =>
      Math.max(3, ...all.map((cells) => cells[at].length))
    );
    const line = (cells, pad) =>
      `| ${cells.map((cell, at) => pad(cell, width[at], at)).join(" | ")} |`;
    return [
      line(header, (cell, w, at) => (at ? cell.padStart(w) : cell.padEnd(w))),
      line(
        header.map(() => ""),
        (_, w, at) => (at ? `${"-".repeat(w - 1)}:` : "-".repeat(w))
      ),
      ...rows.map((cells) =>
        line(cells, (cell, w, at) => (at ? cell.padStart(w) : cell.padEnd(w)))
      ),
    ];
  };
  // Wrapped here rather than written pre-wrapped, because the prose carries
  // interpolated counts: a hand-wrapped line goes ragged the moment a number
  // gains a digit, and the file is committed, so the ragged line is the diff.
  const wrap = (text) => {
    const lines = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      if (line && `${line} ${word}`.length > 80) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines.join("\n");
  };

  return `${[
    "# The collapse account",
    "",
    "<!-- Generated by `pnpm usda:bundle`. Do not edit by hand: your edit is the",
    "     next regeneration's diff. -->",
    "",
    wrap(
      "ADR-0103 §9's third requirement: generation emits a per-head account — " +
        "rows in, rows out, and why — and the account is committed. It is " +
        "checked in rather than left in a build log because " +
        "[#156](https://github.com/palebluebytes/inventoria/issues/156) is the " +
        "trap, regenerating an audit's artifact as a side effect being how the " +
        'ranking audit went blind. A committed account makes "this rule ' +
        'removed forty foods" a thing a diff shows moving.'
    ),
    "",
    wrap(
      "It stops at the head. The row-level answer — which `fdcId` each collapsed " +
        "record went into — is `usda-drop-census.json`, under " +
        '`"stage": "collapse"`.'
    ),
    "",
    "## Rows in, rows out",
    "",
    ...table(
      ["head", "rows", "after", "absorbed"],
      [
        ...reach.map((entry) => [
          `\`${entry.head}\``,
          n(entry.rows),
          n(entry.after),
          n(entry.absorbed),
        ]),
        [
          "**corpus**",
          `**${n(corpus.before)}**`,
          `**${n(corpus.after)}**`,
          `**${n(corpus.before - corpus.after)}**`,
        ],
      ]
    ),
    "",
    "## And why",
    "",
    wrap(
      `${n(corpus.groups_merged)} groups hold more than one record, and the rest ` +
        `of the corpus is ${n(corpus.after - corpus.groups_merged)} groups of ` +
        "one, which no rule here touches. A collapse group is the records " +
        "sharing one residual description (§3) — the name with every segment §2 " +
        "calls a collapsing axis struck out — so what merges is one cut written " +
        "out at every trim, grade and separation USDA assayed it at, and " +
        "nothing else."
    ),
    "",
    wrap(
      `${n(corpus.groups_shipped_whole)} of those groups hold no record eligible ` +
        "to represent them (§5). They ship their fullest panel under its own " +
        "whole, unstripped name, exactly as a group of one does — what a " +
        "coverage hole forbids is the strip, never the row."
    ),
    "",
    wrap(
      `${reach.length} head phrases move, and what is left after ADR-0104 removed ` +
        "the cooked half is purely butchery: separation, trim and grade. " +
        "`scripts/usda-collapse.mjs` names the four and the generation stops if " +
        "a fifth arrives."
    ),
  ].join("\n")}\n`;
}

/**
 * Refuses a generation in which the collapse moves a head phrase
 * {@link HEADS_THE_COLLAPSE_MOVES} does not name.
 *
 * Not a gate on where the rule fires — §6 fires it corpus-wide and this cannot
 * stop it — but a claim about where it LANDS, of the same species as the tallies
 * `usda-bundle.mjs` prints beside every other filter. A head arriving or leaving
 * this list is the corpus telling somebody that a mirror refresh, a roster entry
 * or an earlier filter has changed what the rule reaches, and it is worth a
 * sentence in an ADR rather than a silent diff of 400 rows.
 *
 * @param {{ head: string }[]} reach - {@link collapseReach}'s answer.
 * @returns {number} how many head phrases moved
 */
export function assertCollapseReach(reach) {
  const moved = reach.map((entry) => entry.head).sort();
  const expected = [...HEADS_THE_COLLAPSE_MOVES].sort();
  if (moved.join("|") !== expected.join("|"))
    throw new Error(
      `the collapse moves ${moved.length} head phrase${moved.length === 1 ? "" : "s"} ` +
        `(${moved.join(", ") || "none"}), and scripts/usda-collapse.mjs names ` +
        `${expected.length} (${expected.join(", ")}). What the rule reaches has ` +
        "changed; measure it, say so in ADR-0103, and move the roster."
    );
  return moved.length;
}
