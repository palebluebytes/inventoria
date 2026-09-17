#!/usr/bin/env node
/**
 * #496's question, measured: WITHIN one declared state, how close does a wrong
 * row sit to the right one in energy — and does that distance track the harm a
 * wrong pairing would actually do?
 *
 * The second half is the one that answers the ticket. §1-§4 price an energy
 * band the way #489 framed it, by counting rows. §5 asks what those rows carry,
 * and finds the two axes anti-correlated: the rows a band refuses are the ones
 * that cost nothing, because a wrong row matching your label on energy is a
 * food resembling yours in MACROS, which is exactly the condition under which a
 * micronutrient can differ by 25x. Energy is a macro; a pairing spends micros.
 *
 * Everything it does is composed from the machinery #243 and #497 already ship:
 *
 *  - the population and the ceiling: `pairing-adjudication.mjs` (35 twins).
 *  - the as-bought state set: the committed `public/usda/search-index.json`
 *    (2,023 rows), read exactly as `pairing-census.mjs` reads it.
 *  - the cooked state set: `pairing-target-census.mjs`'s two arms, rebuilt from
 *    the committed archives with `isCookedForm` stubbed false, collapsed
 *    (1,182 rows).
 *  - the offer: the app's own `searchIndexRows`, asked the same queries #243
 *    asked (OFF `en:` categories, most specific first, first query that reaches
 *    anything), keeping EVERY hit rather than the top one. The app caps a
 *    search at SEARCH_RESULT_LIMIT = 50, so `hits` is literally what the list
 *    would show.
 *  - a second instrument for the twins the matcher cannot be asked: #497 §4's
 *    head-phrase siblings, applied within one state instead of across two.
 *  - the harm axis in §5: #243's own divergence instrument, the worst material
 *    metered micronutrient at a floor of 0.1 of the daily target.
 *
 * Usage: INVENTORIA_USDA_ARCHIVES=… pnpm veto:census
 */

import { mkdtemp, rm, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertAppExports, loadAppModule } from "./usda-app-module.mjs";
import {
  buildCorpus,
  bundleArchives,
  groupByIdentity,
  readBundleArchives,
} from "./usda-bundle.mjs";
import { applyShippedNames, applyVariantDrops } from "./usda-adjudication.mjs";
import { applyCollapsedNames, collapseCorpus } from "./usda-collapse.mjs";
import { buildArtifacts } from "./usda-artifacts.mjs";
import { ADJUDICATION } from "./pairing-adjudication.mjs";
import { resolve as resolveTs } from "./ts-resolve-hook.mjs";

registerHooks({ resolve: resolveTs });
const { BAKED_NUTRIENT_TARGETS_G } =
  await import("../src/lib/food/nutrition-targets.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_DIR =
  process.env.INVENTORIA_USDA_ARCHIVES ?? join(ROOT, ".usda-backup");
const EXPORT_PATH =
  process.env.INVENTORIA_LEDGER_EXPORT ??
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl");
const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");

/**
 * The three pairings #497 §3 added, adjudicated by hand there and reproduced
 * here by fdcId rather than re-derived. Each is a COOKED-state pairing: the
 * pack is sold cooked and the row is USDA's cooked assay.
 */
const COOKED_PAIRINGS = {
  4068263049675: 173740, // Alubia roja cocida -> Beans, kidney, dried, cooked, boiled
  8426967020677: 173735, // Frijoles negros    -> Beans, black, dried, cooked, boiled
  3379140130067: 174282, // Haricots chinois   -> Yardlong beans, dried, cooked, boiled
};

// ---------------------------------------------------------------------------
// Population (copied from pairing-census.mjs's fold; same HLC rule)
// ---------------------------------------------------------------------------

function readPopulation(path) {
  const latest = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!row.entity?.startsWith("gtin:")) continue;
    const stamp = [row.hlc_ms, row.hlc_ctr];
    const attrs = latest.get(row.entity) ?? new Map();
    const held = attrs.get(row.attribute);
    if (
      !held ||
      stamp[0] > held.stamp[0] ||
      (stamp[0] === held.stamp[0] && stamp[1] > held.stamp[1])
    )
      attrs.set(row.attribute, { stamp, value: JSON.parse(row.value) });
    latest.set(row.entity, attrs);
  }
  return [...latest].map(([entity, attrs]) => {
    const provenance =
      attrs.get("twin/raw_provenance")?.value ??
      attrs.get("provenance/raw")?.value;
    const product = provenance?.raw_data?.product ?? provenance?.product ?? {};
    return {
      gtin: entity.slice("gtin:".length),
      name: attrs.get("food/name")?.value ?? null,
      panel: attrs.get("nutrition/info")?.value ?? null,
      productName: product.product_name || null,
      categoriesTags: product.categories_tags ?? [],
    };
  });
}

/** #243's query construction, verbatim. */
function queriesFor(twin) {
  const tags = twin.categoriesTags
    .filter((tag) => tag.startsWith("en:"))
    .map((tag) => tag.slice(3).replaceAll("-", " ").toLowerCase())
    .reverse();
  return [...tags, twin.productName ?? twin.name].filter(Boolean);
}

// ---------------------------------------------------------------------------
// The two state sets
// ---------------------------------------------------------------------------

const manifest = JSON.parse(
  await readFile(join(ROOT, "scripts", "usda-backup.manifest.json"), "utf8")
);
const archives = bundleArchives(manifest);
const scratch = await mkdtemp(join(tmpdir(), "within-state-"));
const app = assertAppExports(await loadAppModule(scratch));
await rm(scratch, { recursive: true, force: true });
const liftedApp = { ...app, isCookedForm: () => false };

const entries = await readBundleArchives(manifest, ARCHIVE_DIR);
const groups = groupByIdentity(entries, app);
const baseBuilt = buildCorpus(groups, app);
const liftBuilt = buildCorpus(groups, liftedApp);
const shippedIds = new Set(baseBuilt.survivors.map((s) => s.food.fdcId));

function downstream(survivors, module) {
  const { survivors: filtered } = applyVariantDrops(survivors, module);
  const { survivors: named } = applyShippedNames(filtered, module);
  const collapse = collapseCorpus(named, module);
  const { survivors: final } = applyCollapsedNames(
    collapse.survivors,
    collapse.licensed,
    module
  );
  return final;
}

const lifted = downstream(liftBuilt.survivors, liftedApp);
const cookedSurvivors = lifted.filter((s) => !shippedIds.has(s.food.fdcId));

/** The shipped index, unmodified — the as-bought state set the app ships. */
const shippedIndex = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
const asBoughtCorpus = app.buildSearchCorpus(shippedIndex);

/**
 * The cooked state set as an index the same search can be asked.
 *
 * The vocabulary sections are the SHIPPED ones rather than re-derived, so the
 * two arms' searches differ only in their rows. The vocabulary fires only where
 * a literal search reached nothing, so this can add hits but never remove them.
 */
const cookedArtifacts = buildArtifacts(
  cookedSurvivors,
  archives,
  liftedApp,
  shippedIndex.vocabulary_off,
  shippedIndex.vocabulary_local
);
const cookedIndex = cookedArtifacts.index;
const cookedCorpus = app.buildSearchCorpus(cookedIndex);

const energyOf = new Map();
for (const row of shippedIndex.foods)
  if (row.macros?.calories) energyOf.set(row.fdcId, row.macros.calories);
for (const row of cookedIndex.foods)
  if (row.macros?.calories) energyOf.set(row.fdcId, row.macros.calories);
const nameOf = new Map();
for (const row of shippedIndex.foods) nameOf.set(row.fdcId, row.description);
for (const row of cookedIndex.foods) nameOf.set(row.fdcId, row.description);

console.log("## 0. The instrument\n");
console.log(
  `  as-bought state set (committed index)   ${shippedIndex.foods.length} rows`
);
console.log(
  `  cooked state set (rebuilt, collapsed)   ${cookedIndex.foods.length} rows`
);
console.log(
  `  overlap between the two sets           ${
    cookedIndex.foods.filter((r) => shippedIds.has(r.fdcId)).length
  } rows`
);

const population = readPopulation(EXPORT_PATH);
const twinByGtin = new Map(population.map((t) => [t.gtin, t]));

// ---------------------------------------------------------------------------
// 1. The right-pairing energy distribution, within state
// ---------------------------------------------------------------------------

const rightPairings = [];
for (const [gtin, adj] of Object.entries(ADJUDICATION)) {
  const twin = twinByGtin.get(gtin);
  const label = twin?.panel?.calories ?? null;
  if (adj.verdict === "paired" && adj.fdcId) {
    const kcal = energyOf.get(adj.fdcId) ?? null;
    rightPairings.push({
      gtin,
      state: "as-bought",
      name: adj.name,
      fdcId: adj.fdcId,
      row: nameOf.get(adj.fdcId),
      label,
      kcal,
      ratio: label && kcal ? kcal / label : null,
    });
  }
  if (COOKED_PAIRINGS[gtin]) {
    const fdcId = COOKED_PAIRINGS[gtin];
    const kcal = energyOf.get(fdcId) ?? null;
    rightPairings.push({
      gtin,
      state: "cooked",
      name: adj.name,
      fdcId,
      row: nameOf.get(fdcId),
      label,
      kcal,
      ratio: label && kcal ? kcal / label : null,
    });
  }
}

console.log("\n## 1. The right pairings, each within its own declared state\n");
const withRatio = rightPairings.filter((p) => p.ratio !== null);
const sorted = [...withRatio].sort((a, b) => a.ratio - b.ratio);
for (const p of sorted)
  console.log(
    `  ${p.state.padEnd(10)} x${p.ratio.toFixed(2).padStart(5)}  ${p.name.padEnd(34)} ` +
      `${String(p.label).padStart(4)} kcal -> ${String(p.kcal).padStart(4)}  ${p.row}`
  );
const noRatio = rightPairings.filter((p) => p.ratio === null);
for (const p of noRatio)
  console.log(
    `  ${p.state.padEnd(10)} NO RATIO  ${p.name.padEnd(34)} label ${p.label} kcal, row ${p.kcal} kcal (${p.row})`
  );
const ratios = sorted.map((p) => p.ratio);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
console.log(
  `\n  n=${ratios.length} of ${rightPairings.length}  min x${ratios[0].toFixed(2)}  ` +
    `median x${median(ratios).toFixed(2)}  max x${ratios.at(-1).toFixed(2)}`
);
console.log(
  `  right pairings above 2.5x: ${ratios.filter((r) => r > 2.5).length}; ` +
    `below 0.7x: ${ratios.filter((r) => r < 0.7).length}; below 0.4x: ${ratios.filter((r) => r < 0.4).length}`
);

// ---------------------------------------------------------------------------
// 2. The offer set, within state
// ---------------------------------------------------------------------------

/** Every hit of the first query that reaches anything — what the list shows. */
function offer(corpus, twin) {
  for (const query of queriesFor(twin)) {
    const { hits } = app.searchIndexRows(corpus, query);
    if (hits.length > 0) return { query, hits: hits.map((h) => h.row) };
  }
  return null;
}

const band = { lo: ratios[0], hi: ratios.at(-1) };
console.log(
  `\n## 2. What the shipped search offers inside one state\n\n` +
    `  Band admitting every right pairing: x${band.lo.toFixed(2)} .. x${band.hi.toFixed(2)}\n`
);

const wrongRows = [];
let askable = 0;
let unaskable = 0;
for (const p of withRatio) {
  const twin = twinByGtin.get(p.gtin);
  const corpus = p.state === "cooked" ? cookedCorpus : asBoughtCorpus;
  const offered = offer(corpus, twin);
  if (!offered) {
    unaskable++;
    console.log(
      `  ${p.state.padEnd(10)} ${p.name.padEnd(34)} the search cannot be asked (no query reaches a row)`
    );
    continue;
  }
  askable++;
  const rows = offered.hits.map((row) => ({
    fdcId: row.fdcId,
    description: row.description,
    kcal: row.macros?.calories ?? null,
    right: row.fdcId === p.fdcId,
  }));
  const rightOffered = rows.some((r) => r.right);
  const wrong = rows
    .filter((r) => !r.right && r.kcal)
    .map((r) => ({
      ...r,
      ratio: r.kcal / p.label,
      twin: p.name,
      state: p.state,
    }));
  const inside = wrong.filter((w) => w.ratio >= band.lo && w.ratio <= band.hi);
  wrongRows.push(...wrong);
  console.log(
    `  ${p.state.padEnd(10)} ${p.name.padEnd(34)} q="${offered.query}" offers ${String(rows.length).padStart(2)}` +
      `  right row offered: ${rightOffered ? "yes" : "NO "}` +
      `  wrong-with-energy ${String(wrong.length).padStart(2)}  inside band ${String(inside.length).padStart(2)}`
  );
}
console.log(
  `\n  twins the search can be asked: ${askable}; silent: ${unaskable}` +
    ` (of ${withRatio.length} right pairings)`
);

// ---------------------------------------------------------------------------
// 2b. #497 §4's instrument: head-phrase siblings, within one state
// ---------------------------------------------------------------------------

const head = (d) => d.toLowerCase().split(",")[0].trim();
const byHeadAsBought = new Map();
for (const row of shippedIndex.foods) {
  const k = head(row.description);
  if (!byHeadAsBought.has(k)) byHeadAsBought.set(k, []);
  byHeadAsBought.get(k).push(row);
}
const byHeadCooked = new Map();
for (const row of cookedIndex.foods) {
  const k = head(row.description);
  if (!byHeadCooked.has(k)) byHeadCooked.set(k, []);
  byHeadCooked.get(k).push(row);
}

console.log(
  "\n## 2b. Head-phrase siblings inside the same state (#497 §4's instrument)\n"
);
const siblingWrong = [];
for (const p of withRatio) {
  const table = p.state === "cooked" ? byHeadCooked : byHeadAsBought;
  const mine = nameOf.get(p.fdcId);
  const siblings = (table.get(head(mine)) ?? []).filter(
    (r) => r.fdcId !== p.fdcId && r.macros?.calories
  );
  const wrong = siblings.map((r) => ({
    fdcId: r.fdcId,
    description: r.description,
    kcal: r.macros.calories,
    ratio: r.macros.calories / p.label,
    twin: p.name,
    state: p.state,
  }));
  siblingWrong.push(...wrong);
  const inside = wrong.filter((w) => w.ratio >= band.lo && w.ratio <= band.hi);
  console.log(
    `  ${p.state.padEnd(10)} ${p.name.padEnd(34)} siblings ${String(wrong.length).padStart(2)}` +
      `  inside band ${String(inside.length).padStart(2)}  head="${head(mine)}"`
  );
}

// ---------------------------------------------------------------------------
// 3 & 4. Where the wrong rows land, and what a band would cost
// ---------------------------------------------------------------------------

function bins(rows, label) {
  const b = {
    "below 0.4 (mirror of 2.5)": rows.filter((r) => r.ratio < 0.4).length,
    "0.4 .. 0.7": rows.filter((r) => r.ratio >= 0.4 && r.ratio < 0.7).length,
    "0.7 .. 1/1.43": rows.filter((r) => r.ratio >= 0.7 && r.ratio < 1 / 1.43)
      .length,
    "1/1.43 .. 1.43": rows.filter((r) => r.ratio >= 1 / 1.43 && r.ratio <= 1.43)
      .length,
    "1.43 .. 2.5": rows.filter((r) => r.ratio > 1.43 && r.ratio <= 2.5).length,
    "above 2.5": rows.filter((r) => r.ratio > 2.5).length,
  };
  console.log(`\n### ${label} (n=${rows.length})\n`);
  for (const [k, v] of Object.entries(b))
    console.log(`  ${k.padEnd(28)} ${String(v).padStart(4)}`);
  console.log(
    `  ${"below 0.7 (the blind side)".padEnd(28)} ${String(rows.filter((r) => r.ratio < 0.7).length).padStart(4)}`
  );
  console.log(
    `  ${"above 2.5 (the veto catches)".padEnd(28)} ${String(rows.filter((r) => r.ratio > 2.5).length).padStart(4)}`
  );
  console.log(
    `  ${"inside the right-pairing band".padEnd(28)} ${String(
      rows.filter((r) => r.ratio >= band.lo && r.ratio <= band.hi).length
    ).padStart(4)}`
  );
}

console.log("\n## 3. Where the in-state wrong rows land");
bins(wrongRows, "Offered by the shipped search, in state");
bins(siblingWrong, "Head-phrase siblings, in state");

const worst = (rows, n = 12) =>
  [...rows]
    .sort((a, b) => Math.abs(Math.log(a.ratio)) - Math.abs(Math.log(b.ratio)))
    .slice(0, n);
console.log(
  "\n### The wrong rows closest to the label in energy (search-offered)\n"
);
for (const w of worst(wrongRows))
  console.log(
    `  x${w.ratio.toFixed(2).padStart(5)}  ${w.state.padEnd(10)} ${w.twin.padEnd(26)} ${w.description}`
  );
console.log("\n### The wrong rows furthest from the label (search-offered)\n");
for (const w of [...wrongRows]
  .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))
  .slice(0, 10))
  console.log(
    `  x${w.ratio.toFixed(2).padStart(6)}  ${w.state.padEnd(10)} ${w.twin.padEnd(26)} ${w.description}`
  );

// ---------------------------------------------------------------------------
// 4. The cost curve
// ---------------------------------------------------------------------------

console.log("\n## 4. What a band would refuse, and what it would cost\n");
function cost(rows, label) {
  const sortedRight = [...ratios].sort((a, b) => a - b);
  const table = [];
  // Tightest band refusing zero right pairings: exactly [min, max].
  const zero = { lo: sortedRight[0], hi: sortedRight.at(-1) };
  // Refusing one right pairing: drop whichever extreme buys more wrong rows.
  const dropLow = { lo: sortedRight[1], hi: sortedRight.at(-1) };
  const dropHigh = { lo: sortedRight[0], hi: sortedRight.at(-2) };
  const refused = (b) =>
    rows.filter((r) => r.ratio < b.lo || r.ratio > b.hi).length;
  table.push(["one-sided 2.5x (#489, today)", { lo: 0, hi: 2.5 }, 0]);
  table.push(["two-sided, refuses 0 right", zero, 0]);
  table.push(["two-sided, drops the lowest right", dropLow, 1]);
  table.push(["two-sided, drops the highest right", dropHigh, 1]);
  table.push([
    "symmetric 0.4 .. 2.5",
    { lo: 0.4, hi: 2.5 },
    ratios.filter((r) => r < 0.4 || r > 2.5).length,
  ]);
  table.push([
    "symmetric 0.7 .. 1.43",
    { lo: 0.7, hi: 1.43 },
    ratios.filter((r) => r < 0.7 || r > 1.43).length,
  ]);
  console.log(`\n### ${label}\n`);
  for (const [name, b, rightCost] of table)
    console.log(
      `  ${name.padEnd(36)} band x${b.lo.toFixed(2)}..x${b.hi.toFixed(2)}  ` +
        `refuses ${String(refused(b)).padStart(4)}/${rows.length} wrong  and ${rightCost} right`
    );
}
cost(wrongRows, "Search-offered wrong rows");
cost(siblingWrong, "Head-phrase sibling wrong rows");

// ---------------------------------------------------------------------------
// 5. The axis §1-§4 cannot see: what does a wrong row COST?
//
// Counting rows prices a band's reach. It says nothing about whether the rows
// it reaches are the ones worth refusing. #243's divergence instrument answers
// that: the worst metered micronutrient on which the wrong row and the right
// one disagree, ignoring any pair where both sit under a tenth of the daily
// target (without that floor the worst ratio is always a trace nutrient).
// ---------------------------------------------------------------------------

const store = JSON.parse(
  readFileSync(join(ROOT, "public", "usda", "nutrient-store.json"), "utf8")
);

/** The twelve metered micronutrients, by USDA nutrient id. */
const METERED = {
  1114: "vitamin_d",
  1087: "calcium",
  1089: "iron",
  1092: "potassium",
  1106: "vitamin_a",
  1109: "vitamin_e",
  1175: "vitamin_b6",
  1178: "vitamin_b12",
  1177: "folate",
  1090: "magnesium",
  1095: "zinc",
  1079: "fiber_content",
};
const TO_GRAMS = { g: 1, mg: 1e-3, µg: 1e-6, ug: 1e-6 };
const MATERIAL = 0.1;

/** #243's instrument, verbatim: worst material metered divergence, or null. */
function divergence(wrongId, rightId) {
  const a = store.foods[String(wrongId)] ?? {};
  const b = store.foods[String(rightId)] ?? {};
  let worst = null;
  for (const [id, field] of Object.entries(METERED)) {
    const scale = TO_GRAMS[store.nutrients[id]?.unit];
    const target = BAKED_NUTRIENT_TARGETS_G[field];
    if (!scale || !target) continue;
    const x = (a[id] ?? 0) * scale;
    const y = (b[id] ?? 0) * scale;
    if (Math.max(x, y) < target * MATERIAL) continue;
    const ratio = y === 0 ? Infinity : x / y;
    const magnitude = ratio === 0 ? Infinity : Math.max(ratio, 1 / ratio);
    if (worst === null || magnitude > worst.magnitude)
      worst = { field, ratio, magnitude };
  }
  return worst;
}

const rightOf = new Map(withRatio.map((p) => [p.name, p.fdcId]));
const harmed = [];
for (const w of wrongRows) {
  if (w.state !== "as-bought") continue; // the store ships as-bought rows only
  const right = rightOf.get(w.twin);
  if (!right) continue;
  const d = divergence(w.fdcId, right);
  harmed.push({
    ...w,
    harm: d ? d.magnitude : 1,
    field: d ? d.field : "nothing material",
  });
}

console.log("\n## 5. Does the band separate the wrong rows that MATTER?\n");
const atLeast = (rows, k) => rows.filter((r) => r.harm >= k).length;
const insideBand = harmed.filter(
  (r) => r.ratio >= band.lo && r.ratio <= band.hi
);
const outsideBand = harmed.filter(
  (r) => r.ratio < band.lo || r.ratio > band.hi
);
console.log(
  `  as-bought wrong rows with a nutrient-store entry: ${harmed.length}\n`
);
for (const [label, rows] of [
  [
    `inside the zero-cost band x${band.lo.toFixed(2)}..x${band.hi.toFixed(2)}`,
    insideBand,
  ],
  ["outside it (what a band refuses)", outsideBand],
])
  console.log(
    `  ${label.padEnd(40)} n=${String(rows.length).padStart(3)}  ` +
      `harm>=2x: ${atLeast(rows, 2)}  >=5x: ${atLeast(rows, 5)}  >=10x: ${atLeast(rows, 10)}  ` +
      `infinite: ${rows.filter((r) => !Number.isFinite(r.harm)).length}`
  );

console.log(
  "\n### The worst-harm wrong rows, and whether an energy band sees them\n"
);
const showHarm = (h) => (Number.isFinite(h) ? h.toFixed(2) : "inf").padStart(6);
for (const r of [...harmed].sort((a, b) => b.harm - a.harm).slice(0, 12))
  console.log(
    `  harm x${showHarm(r.harm)} ${r.field.padEnd(14)} energy x${r.ratio.toFixed(2).padStart(5)} ` +
      `${r.ratio >= band.lo && r.ratio <= band.hi ? "ADMITTED" : "refused "} ` +
      `${r.twin.padEnd(26)} ${r.description}`
  );

// The plausible subset: a row the search offered AND under the same head
// phrase — the rows a person could actually tap yes to by mistake.
const sibKey = new Set(siblingWrong.map((s) => `${s.twin}|${s.fdcId}`));
const plausible = harmed.filter((r) => sibKey.has(`${r.twin}|${r.fdcId}`));
console.log(
  `\n### The plausible subset: offered by the search AND a head-phrase sibling (n=${plausible.length})\n`
);
const refusedBy = (r, lo, hi) => r.ratio < lo || r.ratio > hi;
for (const [label, lo, hi] of [
  ["one-sided 2.5x (#489, today)", 0, 2.5],
  [
    `zero-cost x${band.lo.toFixed(2)}..x${band.hi.toFixed(2)}`,
    band.lo,
    band.hi,
  ],
  ["symmetric 0.4 .. 2.5", 0.4, 2.5],
  ["symmetric 0.7 .. 1.43", 0.7, 1.43],
]) {
  const caught = plausible.filter((r) => refusedBy(r, lo, hi));
  const missedBad = plausible.filter(
    (r) => !refusedBy(r, lo, hi) && r.harm >= 2
  );
  console.log(
    `  ${label.padEnd(30)} catches ${String(caught.length).padStart(2)} ` +
      `(of which ${caught.filter((r) => r.harm >= 2).length} carry >=2x material harm); ` +
      `misses ${missedBad.length} that do`
  );
}

console.log("\n### Every plausible wrong row, harm against energy\n");
for (const r of [...plausible].sort((a, b) => b.harm - a.harm))
  console.log(
    `  harm x${showHarm(r.harm)} ${r.field.padEnd(14)} energy x${r.ratio.toFixed(2).padStart(5)}  ` +
      `${r.twin.padEnd(26)} ${r.description}`
  );
