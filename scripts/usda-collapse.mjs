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
 * **It also shortens the survivor's name** (#436). §5's strip is LICENSED by the
 * collapse having happened — `Beef, flank, steak, separable lean and fat,
 * trimmed to 0" fat, choice` ships as `Beef, flank, steak` because five records
 * of that cut collapsed onto it — so the permission is computed here, where the
 * groups are, and spent in `usda-shipped-name.ts`, where ADR-0056 §1's other
 * three rosters and the one answer to "are these two rows one name" already
 * live. Two assertions come with it, because §5 is a safety rule and a safety
 * rule that is assumed is not one: {@link assertNamesClaimNoLess} reads what
 * each shortened name lost, and {@link assertNoAxisHidesInAGloss} asks the
 * question a parenthetical has defeated three times on this map.
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
 * removed the cooked half is purely butchery, and almost every head phrase in
 * the corpus has nothing to collapse at all. **How many is not restated here.**
 * {@link collapseAccount} computes it and `docs/research/190-corpus-account.md`
 * carries it, gated against the shipped index — a count typed into a comment
 * beside a count that is derived is the drift #162 measured.
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
 * `licensed` is §5's strip permission, computed HERE because it is a fact about
 * a group rather than about a name: a representative may lose its collapsing
 * segments only where the group merged more than one row AND held a record
 * eligible to represent it. A group of one keeps its name whole — `Quinoa,
 * cooked` is the only quinoa USDA publishes, and stripping it would claim raw
 * quinoa over a cooked panel — and a group with no eligible record ships its
 * fullest panel under that record's whole, unstripped name. Both are the same
 * sentence from ADR-0103's 2026-09-12 Amendment: what a coverage hole forbids is
 * the strip, never the row.
 *
 * @template {Collapsible} Row
 * @param {Row[]} rows
 * @param {AppModule} app
 * @returns {{ survivors: Row[], collapsed: Map<number, { row: Row, into: Row }>, licensed: Set<number>, groups_merged: number, groups_shipped_whole: number }}
 */
export function collapseCorpus(rows, app) {
  /** @type {Map<number, { row: Row, into: Row }>} */
  const collapsed = new Map();
  const kept = [];
  /** @type {Set<number>} */
  const licensed = new Set();
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
    if (eligible.length) licensed.add(representative.food.fdcId);
    for (const row of group)
      if (row !== representative)
        collapsed.set(row.food.fdcId, { row, into: representative });
  }

  // Back into `fdcId` order, which is the order the artifacts are written in
  // (ADR-0047 §3): a representative is rarely the first row of its group, so
  // without this the diff of a regeneration would be a reshuffle.
  kept.sort((a, b) => a.food.fdcId - b.food.fdcId);
  return {
    survivors: kept,
    collapsed,
    licensed,
    groups_merged,
    groups_shipped_whole,
  };
}

/**
 * The survivors, under the names ADR-0103 §5 lets them ship: a merged group's
 * representative loses its collapsing segments, and every other row keeps the
 * name it had.
 *
 * The strip itself is `resolveCollapsedNames`, in `usda-shipped-name.ts` beside
 * ADR-0056 §1's other three rosters, because §5 writes no strip of its own — it
 * says §1's positional strip "gains this record's collapsing axes". This
 * function is the pass that applies the verdict to rows, in the shape the
 * generator and the drop census both hold them.
 *
 * `also` goes in, and it is not decoration. ADR-0062 §3's freedom check asks
 * whether any OTHER row could answer to the residual name, and an alias is a
 * name in every sense that matters — `bestNameKey` ranks a query against one
 * exactly as against a description.
 *
 * @template {Collapsible & { also?: readonly string[] }} Row
 * @param {Row[]} survivors
 * @param {ReadonlySet<number>} licensed
 * @param {AppModule} app
 * @returns {{ survivors: Row[], tally: { stripped: number, refused: number } }}
 */
export function applyCollapsedNames(survivors, licensed, app) {
  const { renamed, tally } = app.resolveCollapsedNames(
    survivors.map((row) => ({
      fdcId: row.food.fdcId,
      description: row.food.description,
      also: row.also,
    })),
    licensed
  );
  return {
    survivors: survivors.map((row) => {
      const description = renamed.get(row.food.fdcId);
      return description ? { ...row, food: { ...row.food, description } } : row;
    }),
    tally,
  };
}

/**
 * Refuses a generation in which a shipped name claims less than its panel
 * measures — ADR-0103 §5's safety rule, asserted rather than assumed.
 *
 * §5 is one sentence and §4's eligibility is its consequence, so the assertion
 * has to read them together. It asks three things of every row whose name the
 * strip shortened, and each is a way the strip could quietly become a lie:
 *
 * - **The row was licensed.** A name shortened without a group behind it is
 *   `Quinoa, raw` over a cooked panel.
 * - **What it lost is exactly its residual description.** Not "fewer segments"
 *   — the same segments, in the same order, spelled the same way, so a strip
 *   that took a word out of the middle of a kept segment is caught.
 * - **Every segment it lost is claimed by a PREFERRED axis.** A non-preferred
 *   value struck out of a name is the `separable lean only` case §5 names: a
 *   whole steak claimed over a panel that measured a fraction of one.
 *
 * @param {Collapsible[]} before - the rows as the collapse received them.
 * @param {Collapsible[]} after - the rows as they will ship.
 * @param {ReadonlySet<number>} licensed
 * @param {AppModule} app
 * @returns {number} how many shortened names were checked
 */
export function assertNamesClaimNoLess(before, after, licensed, app) {
  const was = new Map(
    before.map((row) => [row.food.fdcId, row.food.description])
  );
  let checked = 0;
  for (const row of after) {
    const published = was.get(row.food.fdcId);
    const shipped = row.food.description;
    if (published === undefined || published === shipped) continue;
    checked++;
    const refuse = (why) => {
      throw new Error(
        `"${published}" (${row.food.fdcId}) ships as "${shipped}", and ${why}. ` +
          "ADR-0103 §5: a name may never claim less than its panel measures, " +
          "and the strip is licensed by the collapse having happened. Re-read " +
          "the roster in src/lib/food/usda-collapse-roster.ts."
      );
    };
    if (!licensed.has(row.food.fdcId))
      refuse(
        "its group merged nothing, or held no record eligible to represent it"
      );
    if (app.residualDescription(published) !== shipped)
      refuse(
        `its residual description is "${app.residualDescription(published)}"`
      );
    const kept = new Set(app.descriptionSegments(shipped).tail);
    for (const segment of app.descriptionSegments(published).tail) {
      if (kept.has(segment)) continue;
      const entry = app.claimingAxis(segment);
      if (!entry) refuse(`no roster entry claims the segment "${segment}"`);
      if (!entry.preferred)
        refuse(
          `"${segment}" is a non-preferred value on the ${entry.axis} axis`
        );
    }
  }
  return checked;
}

/**
 * Refuses a generation in which a parenthetical hides a collapsing segment from
 * the roster.
 *
 * §10 calls the positional rule the whole safety argument and then states its
 * cost: **a segment may carry more than one fact**. This map has been bitten by
 * that three times, every time in the same shape — a bracket welded to the end
 * of a segment, so a whole-segment pattern walks past a word it was written to
 * take. ADR-0056's designation tag left 41 rows carrying a state word every
 * other row had lost; the Food Distribution Program gloss hid six more; `(may
 * have been previously frozen)` hid a seventh.
 *
 * So the strip is proved against the names that actually SHIP rather than the
 * names USDA published: for every segment the roster walks past, ask what it
 * would say if the trailing bracket were not there. A segment that answers
 * differently is a fact the roster was meant to read and cannot.
 *
 * It found one on the day it was written — `Pork, cured, separable fat (from ham
 * and arm picnic)` — which is why the separation entry admits a gloss.
 *
 * @param {Collapsible[]} rows - the names the collapse groups on.
 * @param {AppModule} app
 * @returns {number} how many segments were read
 */
export function assertNoAxisHidesInAGloss(rows, app) {
  let read = 0;
  for (const row of rows)
    for (const segment of app.descriptionSegments(row.food.description).tail) {
      read++;
      if (app.claimingAxis(segment)) continue;
      const bare = app.withoutTrailingGloss(segment);
      const hidden = bare === segment ? null : app.claimingAxis(bare);
      if (!hidden) continue;
      throw new Error(
        `"${row.food.description}" (${row.food.fdcId}) carries the segment ` +
          `"${segment}", which the roster walks past — and "${bare}" is a ` +
          `${hidden.axis} segment it claims. A bracket welded to a segment is ` +
          "how the designation tag, the Food Distribution Program gloss and " +
          '"(may have been previously frozen)" each hid a word from a ' +
          "positional strip. Widen the entry in " +
          "src/lib/food/usda-collapse-roster.ts, or say in ADR-0103 why the " +
          "gloss makes it a different segment."
      );
    }
  return read;
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
 * How many head phrases a corpus holds.
 *
 * The denominator {@link collapseReach}'s answer is read against, and its own
 * function for the reason the account gives about itself: "four heads move" is
 * only an account of the rule's reach beside the number of heads it could have
 * moved. Exported because two callers need the same denominator — the generator,
 * which has the corpus the collapse read, and `usda-account-check.mjs`, which
 * reconstructs it from the shipped rows and the census — and a denominator
 * spelled twice is the count-in-three-files drift #162 measured.
 *
 * @param {Collapsible[]} rows
 * @param {AppModule} app
 * @returns {number}
 */
export function headPhraseCount(rows, app) {
  return new Set(
    rows.map((row) => app.descriptionSegments(row.food.description).head)
  ).size;
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
 * **Every figure it states is one the shipped artifacts can prove on their own**
 * (#437). That is a constraint on this function rather than a property of it:
 * `scripts/usda-account-check.mjs` rebuilds the whole text from
 * `public/usda/search-index.json` and the census's `collapse` stage and compares
 * it byte for byte, so a figure only the archives can reach would be a figure
 * the gate has to skip — and a gate that skips a number is how the ranking audit
 * went blind (#156). The strip's own tally is the one that went: `stripped`
 * counts NAMES that moved, and no committed artifact carries the name a survivor
 * had before the strip, so the account counts the GROUPS shipping under a
 * residual name instead. The generator still holds the two to each other, in
 * `usda-bundle.mjs`, where both numbers exist.
 *
 * @param {{ head: string, rows: number, after: number, absorbed: number }[]} reach
 * @param {{ before: number, after: number, heads: number, groups_merged: number, groups_shipped_whole: number, names_refused: number }} corpus
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
      `The other ${n(corpus.groups_merged - corpus.groups_shipped_whole - corpus.names_refused)} ship ` +
        "their representative under its RESIDUAL name, which is §5's strip, " +
        "and a flank steak therefore reads `Beef, flank, steak` rather than " +
        '`Beef, flank, steak, separable lean and fat, trimmed to 0" fat, ' +
        "choice`. It is a count of groups rather than of names, because a group " +
        "that merged on §3's punctuation clause alone has nothing to strike out " +
        "and ships under the name it already had. " +
        (corpus.names_refused === 0
          ? "No strip was refused for want of a free name (ADR-0062 §3), and a " +
            "refused one would leave the row under the name it had rather than " +
            "dropping either side."
          : `A further ${n(corpus.names_refused)} are not among them, because ` +
            "the residual name was not free (ADR-0062 §3): another row already " +
            "answers to it, so the strip was not made and neither row dropped.")
    ),
    "",
    wrap(
      `${reach.length} of the corpus's ${n(corpus.heads)} head phrases move, and ` +
        "what is left after ADR-0104 removed the cooked half is purely " +
        "butchery: separation, trim and grade. " +
        `The other ${n(corpus.heads - reach.length)} have nothing to collapse ` +
        "and are not listed, because a table of them would be that many zeroes " +
        "padding the rows above. `scripts/usda-collapse.mjs` names the heads " +
        "that move, and the generation stops if another arrives."
    ),
    "",
    wrap(
      "Every figure above is re-derived from `public/usda/search-index.json` " +
        "and `usda-drop-census.json` by `scripts/usda-account-check.mjs`, which " +
        "`pnpm check` runs: the per-head counts off the shipped rows, the " +
        'absorbed counts off the census\'s `"stage": "collapse"` rows, and this ' +
        "file rebuilt from them and compared byte for byte. A committed " +
        "artifact makes a change visible to a reviewer; only the gate makes a " +
        "STALE one visible, and #156 is the case where the second half was " +
        "missing."
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
