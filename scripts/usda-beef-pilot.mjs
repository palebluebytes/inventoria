#!/usr/bin/env node
/**
 * Does ADR-0103 survive contact with `Beef`? The measurement behind research
 * note #191.
 *
 *   pnpm usda:beef-pilot                     # measure, print the tables
 *   pnpm usda:beef-pilot --json              # ...as JSON
 *   pnpm usda:beef-pilot --emit <path>       # write the collapsed corpus and stop
 *
 * `Beef` is 950 of the corpus's 4,238 rows and the head that produced the #186
 * map. It is the WORST head, chosen so the rule fails visibly here rather than
 * fifteen hand-offs later.
 *
 * Four things are measured, and only the first is what the ticket went looking
 * for:
 *
 *   1  THE COLLAPSE — what ADR-0103 §2 and §3 do to the corpus and to `beef`,
 *      and what that does to #188's two pre-registered conditions. Run through
 *      `usda-consolidation-bar.mjs` against a collapsed index, so the numbers
 *      come from the shipped ranking rather than from a second opinion about it:
 *
 *        pnpm usda:beef-pilot --emit /tmp/collapsed.json
 *        USDA_INDEX_PATH=/tmp/collapsed.json pnpm usda:consolidation-bar
 *
 *   2  ELIGIBILITY — ADR-0103 §5 refuses a record that "positively states a
 *      non-preferred value on a collapsing axis" and never says which values are
 *      non-preferred. The four readings are measured side by side because the
 *      choice between them swings `Beef` from 64 coverage holes to none, and a
 *      hole blocked the head from shipping as §5 was originally written.
 *
 *   3  CUT DEPTH — the ticket's headline question, asked because the residue
 *      after the collapse is butchery cuts spelled three and four levels deep.
 *      Measured by truncation rather than argued.
 *
 *   4  SPELLING — §3's residual description is a string, and USDA's spelling of
 *      one cut is not stable. This is the axis nobody was looking at, and it is
 *      what manufactured the coverage hole ADR-0103 §5 was built around.
 *
 * The ROSTER below is read off `Beef`'s 202 distinct trailing segments, and it
 * is the pilot's roster rather than the shipped one: no shipped roster exists
 * yet, because ADR-0103 states the rule and deliberately does not deliver a
 * corpus. When the generator grows one, this file reads it instead of carrying
 * its own copy, and until then the duplication is the point — a roster written
 * here cannot silently become the answer.
 *
 * It asserts nothing and is not wired into `pnpm check`, for the reason
 * `usda-consolidation-bar.mjs` gives about itself.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  claim,
  groupingKey,
  residual,
  segments,
} from "./usda-collapse-roster.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");
const STORE_PATH = join(ROOT, "public", "usda", "nutrient-store.json");

const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));

/** §4.2, present-not-nonzero: a measured 0 g is a fuller panel than no figure. */
const panel = (row) => Object.keys(store.foods[row.fdcId] ?? {}).length;

/**
 * The strict reading of §5, kept only so the four readings can be priced against
 * each other. It designates the retail-standard value on the two axes the pilot
 * rules carry none — `trimmed to 1/8" fat` and `choice` — and refuses every
 * other value of them. Nothing else in this file uses it.
 */
const STRICT = [
  { axis: "trim", re: /^trimmed to 1\/8" ?fat$/i },
  { axis: "grade", re: /^(usda )?choice$/i },
];

const eligibleUnder =
  (refusing, strict = false) =>
  (row) =>
    segments(row.description).tail.every((segment) => {
      const entry = claim(segment);
      if (!entry || !refusing.has(entry.axis)) return true;
      if (!strict) return entry.preferred;
      const designated = STRICT.find((s) => s.axis === entry.axis);
      return designated ? designated.re.test(segment) : entry.preferred;
    });

const REFUSING = new Set(["preparation", "separation"]);
const eligible = eligibleUnder(REFUSING);

const collapse = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const key = groupingKey(row.description);
    if (!groups.has(key))
      groups.set(key, { residual: residual(row.description), rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
};

const byPanelThenId = (a, b) => panel(b) - panel(a) || a.fdcId - b.fdcId;

/**
 * §4's chain, with the pilot's amendment to §5 in force: a group with no
 * eligible record does not block its head. It ships its fullest-panel record
 * under that record's WHOLE name, which is the treatment §5 already gives a
 * group of one — `Quinoa, cooked` ships, true name over true panel.
 */
const represent = (group) => {
  if (group.rows.length === 1) return { row: group.rows[0], merged: false };
  const pool = group.rows.filter(eligible);
  if (pool.length === 0)
    return {
      row: [...group.rows].sort(byPanelThenId)[0],
      merged: false,
      hole: true,
    };
  return { row: [...pool].sort(byPanelThenId)[0], merged: true };
};

const collapsedCorpus = () => {
  const foods = [];
  let mergedGroups = 0;
  let holes = 0;
  for (const group of collapse(index.foods)) {
    const { row, merged, hole } = represent(group);
    if (group.rows.length > 1) mergedGroups += 1;
    if (hole) holes += 1;
    if (!merged) {
      foods.push(row);
      continue;
    }
    // §5: the strip is licensed by the collapse having happened. Every name the
    // group carried stays reachable as a twin alias, so no keystroke that found
    // a row today finds nothing tomorrow.
    const also = [
      ...new Set(group.rows.flatMap((r) => [r.description, ...(r.also ?? [])])),
    ].filter((name) => name !== group.residual);
    foods.push({ ...row, description: group.residual, also });
  }
  return { corpus: { ...index, foods }, mergedGroups, holes };
};

const emitAt = process.argv.indexOf("--emit");
if (emitAt !== -1) {
  const target = process.argv[emitAt + 1];
  const { corpus, mergedGroups, holes } = collapsedCorpus();
  writeFileSync(target, JSON.stringify(corpus));
  console.error(
    `${index.foods.length} rows -> ${corpus.foods.length}` +
      `  (${mergedGroups} groups merged, ${holes} shipped whole for want of an eligible record)`
  );
  process.exit(0);
}

const beef = index.foods.filter((row) => /^beef\b/i.test(row.description));
const beefGroups = collapse(beef);
const { corpus, mergedGroups, holes } = collapsedCorpus();

// --- 2. eligibility: the four readings of §5's "non-preferred value" ---------
const READINGS = [
  ["every axis refuses", ["preparation", "separation", "trim", "grade"], true],
  ["preparation + separation", ["preparation", "separation"], false],
  ["preparation alone", ["preparation"], false],
  ["nothing refuses", [], false],
];
const eligibility = READINGS.map(([name, axes, strict]) => {
  const test = eligibleUnder(new Set(axes), strict);
  let holeGroups = 0;
  let stranded = 0;
  for (const group of beefGroups) {
    if (group.rows.length === 1) continue;
    if (!group.rows.some(test)) {
      holeGroups += 1;
      stranded += group.rows.length;
    }
  }
  return { reading: name, holes: holeGroups, rows_stranded: stranded };
});

// --- 3. cut depth -----------------------------------------------------------
const depth = [2, 3, 4].map((n) => ({
  segments: n,
  rows: new Set(
    beefGroups.map((g) =>
      g.residual
        .split(",")
        .map((s) => s.trim())
        .slice(0, n)
        .join(", ")
        .toLowerCase()
    )
  ).size,
}));

// --- 4. spelling ------------------------------------------------------------
// What the normalisation clause merged, and what a wider one would merge next.
const rawKey = (d) => residual(d).toLowerCase();
const distinctRaw = new Set(beef.map((r) => rawKey(r.description))).size;
const boneless = (d) =>
  groupingKey(d)
    .split(" ")
    .filter((w) => !["boneless", "bone", "in", "lip", "on", "off"].includes(w))
    .join(" ");
const distinctBoneless = new Set(beef.map((r) => boneless(r.description))).size;

// --- what the pilot declined: §7's no-survivor candidates --------------------
const FRACTIONS =
  /\b(external fat|seam fat|intermuscular fat|subcutaneous fat|suet|separable fat|carcass|retail cuts|mechanically separated)\b/i;
const ORGANS =
  /\b(brain|liver|heart|lungs|kidneys|pancreas|spleen|thymus|tongue|tripe|sweetbread)\b/i;
const tally = (re) => {
  const hit = beefGroups.filter((g) => re.test(g.residual));
  return {
    groups: hit.length,
    rows: hit.reduce((n, g) => n + g.rows.length, 0),
  };
};

const result = {
  measured: {
    index_rows: index.foods.length,
    schema_version: index.schema_version,
    beef_rows: beef.length,
  },
  collapse: {
    corpus_rows_after: corpus.foods.length,
    groups_merged: mergedGroups,
    groups_shipped_whole: holes,
    beef_groups: beefGroups.length,
  },
  eligibility,
  cut_depth: depth,
  spelling: {
    residuals_unnormalised: distinctRaw,
    residuals_normalised: beefGroups.length,
    if_bone_and_lip_words_ignored: distinctBoneless,
  },
  declined_drops: { fractions: tally(FRACTIONS), organs: tally(ORGANS) },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const pad = (v, w) => String(v).padEnd(w);
  console.log(
    `Corpus ${index.foods.length} rows, of which Beef is ${beef.length}.\n` +
      `Collapsed corpus: ${corpus.foods.length} rows ` +
      `(${mergedGroups} groups merged, ${holes} shipped whole).\n` +
      `Beef: ${beef.length} rows -> ${beefGroups.length} collapse groups.\n`
  );

  console.log(
    "ADR-0103 §5 eligibility — four readings of a non-preferred value\n"
  );
  console.log(`  ${pad("reading", 28)}${pad("holes", 8)}rows stranded`);
  for (const r of eligibility)
    console.log(`  ${pad(r.reading, 28)}${pad(r.holes, 8)}${r.rows_stranded}`);
  console.log(
    `\n  A hole blocked its head under §5 as written, so the reading is the\n` +
      `  difference between Beef needing 71 curated stand-ins and needing none.\n`
  );

  console.log("A cut-depth lever, measured by truncating the residual\n");
  for (const d of depth)
    console.log(`  ${pad(d.segments + " segments", 28)}${d.rows} rows`);
  console.log(
    `\n  The cap is 25. Depth-2 also merges every ground-beef fat ratio into one\n` +
      `  row — the gold row's 80/20 among them — and still leaves \`rib eye\`,\n` +
      `  \`rib eye steak\` and \`ribeye\` as three.\n`
  );

  console.log("Spelling\n");
  console.log(`  ${pad("residual as a raw string", 40)}${distinctRaw} groups`);
  console.log(
    `  ${pad("+ punctuation normalised", 40)}${beefGroups.length} groups`
  );
  console.log(
    `  ${pad("+ bone and lip words ignored", 40)}${distinctBoneless} groups\n`
  );

  console.log("Declined under §7 — reported, not dropped\n");
  console.log(
    `  ${pad("dissected fractions, non-retail", 40)}${result.declined_drops.fractions.groups} groups, ${result.declined_drops.fractions.rows} rows`
  );
  console.log(
    `  ${pad("organ meats", 40)}${result.declined_drops.organs.groups} groups, ${result.declined_drops.organs.rows} rows`
  );
  console.log(
    `\nFor C1 and C2, emit a collapsed corpus and point the bar at it:\n` +
      `  pnpm usda:beef-pilot --emit /tmp/collapsed.json\n` +
      `  USDA_INDEX_PATH=/tmp/collapsed.json pnpm usda:consolidation-bar`
  );
}
