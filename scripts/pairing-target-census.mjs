#!/usr/bin/env node
/**
 * #497's measurement: what does admitting USDA's cooked records as pairing
 * targets actually buy, and what does it cost?
 *
 *   pnpm targets:census                 # every section
 *   INVENTORIA_LEDGER_EXPORT=… pnpm targets:census
 *
 * The question is NOT #489's. #489 refused a pairing that COMPUTES a cooked
 * composition from a dried record, because ADR-0048 §3 forbids that rescale.
 * This asks whether the records USDA already measured — and the corpus drops at
 * `rule: cooked_form` — can be reached as pairing targets. Nothing is computed;
 * the records simply do not ship.
 *
 * **The corpus is rebuilt, never guessed.** Both arms run `usda-bundle.mjs`'s
 * own passes over the same archives, and the only difference between them is
 * `isCookedForm`, stubbed to `false` in the lifted arm. That is what makes the
 * byte figures a measurement rather than the row-count extrapolation #497 was
 * filed with: the baseline arm reproduces the committed
 * `public/usda/nutrient-store.json` byte for byte (1,737,610 B), so the lifted
 * arm's bytes are the same instrument reading a different corpus.
 *
 * Nothing here writes an artifact. `public/usda/` is untouched.
 *
 * **Why the pipeline is re-assembled here rather than `main()` being called
 * with a flag.** `usda-bundle.mjs`'s `main()` carries a dozen assertions
 * calibrated to the shipped corpus — the collapse's reach, the vocabulary's
 * retrieval counts, the twin ledger. Every one of them would fail on a corpus
 * holding 1,182 rows nobody adjudicated, and they would fail for the right
 * reason: this is not a corpus anybody proposed to ship as the search index.
 * So the passes are composed directly and the assertions are left out, which is
 * safe precisely because nothing is written.
 *
 * The energy figure is read through `buildIndexRow`, never off nutrient 1008.
 * Foundation rows carry 2047/2048 and no 1008 — eight shipped rows read as
 * having no energy at all if you ask for 1008, and `Spinach, mature` is one of
 * them, which is how a first cut of this census reported a x0.00 ratio.
 */

import { mkdtemp, rm, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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
import {
  buildArtifacts,
  buildIndexRow,
  measure,
  serialiseIndex,
  serialiseNutrientStore,
} from "./usda-artifacts.mjs";
import { ADJUDICATION } from "./pairing-adjudication.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_DIR =
  process.env.INVENTORIA_USDA_ARCHIVES ?? join(ROOT, ".usda-backup");
const EXPORT_PATH =
  process.env.INVENTORIA_LEDGER_EXPORT ??
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl");

/** The band the precache gate allows either side of a declared figure. */
const PRECACHE_BAND = 0.05;
/** What each Facet declares today (`src/lib/facets/registry.ts`). */
const DECLARED = { root: 8_618_886, rations: 7_124_621 };

/** The twelve metered micronutrients (`nutrition-targets.ts`). */
const METERED = [
  1089, 1090, 1092, 1087, 1095, 1098, 1101, 1106, 1162, 1109, 1114, 1177,
];

// ---------------------------------------------------------------------------
// The two corpora
// ---------------------------------------------------------------------------

/** Everything `main()` does after `buildCorpus`, minus the assertions. */
function downstream(survivors, app) {
  const { survivors: filtered } = applyVariantDrops(survivors, app);
  const { survivors: named } = applyShippedNames(filtered, app);
  const collapse = collapseCorpus(named, app);
  const { survivors: final } = applyCollapsedNames(
    collapse.survivors,
    collapse.licensed,
    app
  );
  return { afterVariants: filtered, afterNames: named, final };
}

const manifest = JSON.parse(
  await readFile(join(ROOT, "scripts", "usda-backup.manifest.json"), "utf8")
);
const archives = bundleArchives(manifest);
const scratch = await mkdtemp(join(tmpdir(), "pairing-targets-"));
const app = assertAppExports(await loadAppModule(scratch));
await rm(scratch, { recursive: true, force: true });
/** The one rule this census lifts, and the only difference between the arms. */
const liftedApp = { ...app, isCookedForm: () => false };

const entries = await readBundleArchives(manifest, ARCHIVE_DIR);
const groups = groupByIdentity(entries, app);
const baseBuilt = buildCorpus(groups, app);
const liftBuilt = buildCorpus(groups, liftedApp);
const shippedIds = new Set(baseBuilt.survivors.map((s) => s.food.fdcId));

const baseline = downstream(baseBuilt.survivors, app);
const lifted = downstream(liftBuilt.survivors, liftedApp);
const isCooked = (s) => !shippedIds.has(s.food.fdcId);
const cooked = lifted.final.filter(isCooked);
const cookedUncollapsed = lifted.afterNames.filter(isCooked);

const energy = (survivor, module) =>
  buildIndexRow(survivor, module).macros?.calories ?? null;
const nutrientOf = (food, id) =>
  food.foodNutrients.find((n) => n.nutrientId === id)?.value ?? null;

// ---------------------------------------------------------------------------
// 1. Which rules lift, and what each stage keeps
// ---------------------------------------------------------------------------

console.log("## 1. One rule lifted, stage by stage\n");
const admitted = new Set(
  liftBuilt.survivors.filter(isCooked).map((s) => s.food.fdcId)
);
const keptAt = (rows) => rows.filter((s) => admitted.has(s.food.fdcId)).length;
console.log(
  `  fire \`cooked_form\`                        ${baseBuilt.dropped.cooked_form}`
);
console.log(`  past the other food-kind rules            ${admitted.size}`);
console.log(
  `  past ADR-0061's variant drops             ${keptAt(lifted.afterVariants)}`
);
console.log(
  `  past the ADR-0056/0062 name rules         ${keptAt(lifted.afterNames)}`
);
console.log(`  past ADR-0103's collapse                  ${cooked.length}`);
console.log(
  `\n  shipped corpus, baseline arm             ${baseline.final.length}`
);
console.log(
  `  shipped corpus, lifted arm               ${lifted.final.length}`
);

const shippedNames = new Map(
  baseline.final.map((s) => [s.food.fdcId, s.food.description])
);
const liftedNames = new Map(
  lifted.final.map((s) => [s.food.fdcId, s.food.description])
);
let vanished = 0;
let renamed = 0;
for (const [id, name] of shippedNames) {
  if (!liftedNames.has(id)) vanished++;
  else if (liftedNames.get(id) !== name) renamed++;
}
console.log(`\n  shipped rows the lift removes            ${vanished}`);
console.log(`  shipped rows the lift renames            ${renamed}`);

// ---------------------------------------------------------------------------
// 2. The byte cost, measured
// ---------------------------------------------------------------------------

console.log("\n## 2. Bytes, measured rather than extrapolated\n");
const NO_VOCABULARY = { source: "none", expansions: {} };
const OFF_VOCABULARY = {
  licence: "",
  source: "",
  url: "",
  sha256: "",
  expansions: {},
};
const artifactsOf = (rows) =>
  buildArtifacts(rows, archives, app, OFF_VOCABULARY, NO_VOCABULARY);
const sized = (rows) => {
  const built = artifactsOf(rows);
  return {
    store: measure(serialiseNutrientStore(built.nutrientStore)),
    index: measure(serialiseIndex(built.index)),
  };
};
const b = sized(baseline.final);
const l = sized(lifted.final);
const only = sized(cooked);
const onlyUncollapsed = sized(cookedUncollapsed);
const row = (label, m) =>
  console.log(
    `  ${label.padEnd(38)} ${String(m.raw).padStart(9)}  ${String(m.gzip).padStart(8)}  ${String(m.brotli).padStart(8)}`
  );
console.log(
  `  ${"".padEnd(38)} ${"raw".padStart(9)}  ${"gzip".padStart(8)}  ${"brotli".padStart(8)}`
);
row("nutrient store, shipped corpus", b.store);
row("nutrient store, one bundled corpus", l.store);
row(`cooked alone, collapsed (${cooked.length})`, only.store);
row(
  `cooked alone, uncollapsed (${cookedUncollapsed.length})`,
  onlyUncollapsed.store
);
row("search index, shipped corpus", b.index);
row("search index, one bundled corpus", l.index);
row(`cooked alone, collapsed (${cooked.length})`, only.index);
console.log(
  `\n  The vocabulary sections are stubbed out in both arms, so the deltas are\n` +
    `  comparable and the absolute index figures sit below the committed file.\n` +
    `  The store carries no vocabulary, so its baseline IS the committed file.`
);

console.log("\n### What that does to the two precache bands\n");
const storeDelta = l.store.raw - b.store.raw;
const indexDelta = l.index.raw - b.index.raw;
const band = (name, declared, added) => {
  const ceiling = Math.round(declared * (1 + PRECACHE_BAND));
  const landed = declared + added;
  console.log(
    `  ${name.padEnd(10)} declared ${declared}  ceiling ${ceiling}  would land ${landed}  ` +
      (landed > ceiling
        ? `OVER by ${landed - ceiling}`
        : `inside by ${ceiling - landed}`)
  );
};
console.log(
  `  search index grows ${indexDelta} B; nutrient store grows ${storeDelta} B\n`
);
band("root", DECLARED.root, indexDelta);
band("rations", DECLARED.rations, indexDelta + storeDelta);
console.log(
  `\n  The root precaches the index alone (ADR-0077 §5); Rations owes both.\n` +
    `  A pairing set fetched on demand moves neither number.`
);

// ---------------------------------------------------------------------------
// 3. Coverage over #241's real population
// ---------------------------------------------------------------------------

/** Every `gtin:` twin's latest panel, folded by HLC stamp as the app folds it. */
function readPanels(path) {
  const latest = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const datom = JSON.parse(line);
    if (!datom.entity?.startsWith("gtin:")) continue;
    const stamp = [datom.hlc_ms, datom.hlc_ctr];
    const attrs = latest.get(datom.entity) ?? new Map();
    const held = attrs.get(datom.attribute);
    if (
      !held ||
      stamp[0] > held.stamp[0] ||
      (stamp[0] === held.stamp[0] && stamp[1] > held.stamp[1])
    )
      attrs.set(datom.attribute, { stamp, value: JSON.parse(datom.value) });
    latest.set(datom.entity, attrs);
  }
  return new Map(
    [...latest].map(([entity, attrs]) => [
      entity.slice("gtin:".length),
      attrs.get("nutrition/info")?.value ?? null,
    ])
  );
}

/**
 * The substance each twin #243 could not pair actually IS, written by hand.
 *
 * A regex over the cooked set rather than a search, and deliberately so: #247
 * measured that the shipped search cannot reach a foreign pack's food from its
 * name, so asking it here would measure the search again instead of the corpus.
 * What this asks is the ceiling question — IS the row there — which is the only
 * question a coverage census can answer without a person in the loop.
 */
const SUBSTANCE = {
  4068263049675: /^Beans, kidney, all types, dried, cooked/i,
  8426967020677: /^Beans, black, dried, cooked/i,
  3379140130067: /^Yardlong beans, dried, cooked/i,
  6901089041097: /cellophane|mung bean.*starch|^Noodles/i,
  3379141822848: /rice paper|^Rice, white.*cooked/i,
  8423352106213: /rice.*(beverage|drink|milk)/i,
  5400706613279: /cocoa|cacao/i,
  8852646172007: /chili paste|holy basil/i,
  6921804720304: /chil(l)?i oil/i,
  6902253111721: /konjac|shirataki/i,
  8414100382003: /tonic/i,
  8414100382027: /tonic/i,
  8424790113009: /(?!)/,
};

/**
 * Whether the best row the cooked set offers is one this session would accept,
 * read by hand against the pack — the same act `pairing-adjudication.mjs`
 * performs, extended to the rows that corpus could not hold.
 *
 * Kept apart from the energy check on purpose. The veto admits five of these
 * and a person accepts three, and the two it waves through are not noise: they
 * are the reverse error §5 measures, caught here on the live population. A
 * census that reported the veto's five as coverage would be laundering exactly
 * the mistake this ticket was asked to price.
 */
const ACCEPTED = {
  4068263049675:
    "the map's motivating jar; kidney beans boiled, the state the pack is sold in",
  8426967020677:
    "black beans boiled; the jar is in sauce and drains to about this",
  3379140130067:
    "yardlong beans DRIED then boiled — the mature seed, not the green pod #243 measured. " +
    "#243 read this as the macro veto refusing a wrong food; it was the right food in a state the corpus did not hold",
};
const REFUSED = {
  3379141822848:
    "rice paper is a dried sheet at 341 kcal; `Rice, white, cooked` is 130 kcal of mostly water. " +
    "Right grain, inverted state — the veto is silent because the error lands low",
  6901089041097:
    "mung bean STARCH against a wheat-and-egg noodle, and dried against cooked. " +
    "Two errors compounding, both on the blind side",
};

console.log("\n## 3. Coverage over #241's population\n");
const panels = readPanels(EXPORT_PATH);
const unreached = Object.entries(ADJUDICATION).filter(
  ([, a]) => a.verdict !== "paired"
);
let closes = 0;
let wavedThrough = 0;
for (const [gtin, adjudication] of unreached) {
  const label = panels.get(gtin)?.calories ?? null;
  const hits = cooked
    .filter((s) => SUBSTANCE[gtin]?.test(s.food.description))
    .map((s) => ({
      fdcId: s.food.fdcId,
      name: s.food.description,
      kcal: energy(s, liftedApp),
      nutrients: s.food.foodNutrients.length,
    }))
    .filter((h) => h.kcal !== null)
    .sort(
      (x, y) =>
        Math.abs(Math.log(x.kcal / label)) - Math.abs(Math.log(y.kcal / label))
    );
  const best = hits[0];
  // The veto #489 settled: one-sided, refusing above ~2.5x and silent below.
  const vetoAdmits = Boolean(best && label && best.kcal / label <= 2.5);
  const accepted = gtin in ACCEPTED;
  if (accepted) closes++;
  if (vetoAdmits && !accepted) wavedThrough++;
  const mark = accepted ? "PAIRS  " : vetoAdmits ? "WAVED  " : "       ";
  console.log(
    `  ${mark}${adjudication.name.padEnd(36)} [${adjudication.verdict}] ` +
      `label ${label ?? "-"} kcal` +
      (best
        ? `  ->  ${best.fdcId} x${(best.kcal / label).toFixed(2)} (${best.nutrients} nut) ${best.name}`
        : "  ->  nothing in the cooked set")
  );
  if (accepted) console.log(`          why: ${ACCEPTED[gtin]}`);
  if (vetoAdmits && !accepted)
    console.log(`          refused by hand: ${REFUSED[gtin]}`);
}
const pairedToday = Object.values(ADJUDICATION).filter(
  (a) => a.verdict === "paired"
).length;
console.log(
  `\n  ${closes} of ${unreached.length} unreached twins gain a target a person accepts; ` +
    `the population goes ${pairedToday} -> ${pairedToday + closes} of ${Object.keys(ADJUDICATION).length}.`
);
console.log(
  `  The energy veto would have admitted ${closes + wavedThrough}: it waves through ${wavedThrough} ` +
    `the hand refuses, both on the low side. That is §5's error, on the live population.`
);

// ---------------------------------------------------------------------------
// 4. What the cooked set puts BESIDE the rows that already pair
// ---------------------------------------------------------------------------

console.log("\n## 4. Wrong neighbours added to the 22 that already pair\n");
const head = (description) => description.toLowerCase().split(",")[0].trim();
const shippedById = new Map(baseline.final.map((s) => [s.food.fdcId, s]));
let closer = 0;
let neighbours = 0;
for (const [gtin, adjudication] of Object.entries(ADJUDICATION)) {
  if (adjudication.verdict !== "paired") continue;
  const current = shippedById.get(adjudication.fdcId);
  const label = panels.get(gtin)?.calories;
  if (!current || !label) continue;
  const currentEnergy = energy(current, app);
  if (!currentEnergy) continue;
  const siblings = cooked
    .filter((s) => head(s.food.description) === head(current.food.description))
    .map((s) => ({ s, ratio: energy(s, liftedApp) / label }))
    .filter((x) => Number.isFinite(x.ratio))
    .sort((x, y) => Math.abs(Math.log(x.ratio)) - Math.abs(Math.log(y.ratio)));
  if (!siblings.length) continue;
  const currentRatio = currentEnergy / label;
  const improves =
    Math.abs(Math.log(siblings[0].ratio)) <
    Math.abs(Math.log(currentRatio)) - 0.1;
  const wrong = siblings.filter(
    (x) => Math.abs(Math.log(x.ratio)) > Math.log(1.5)
  );
  if (improves) closer++;
  neighbours += wrong.length;
  console.log(
    `  ${improves ? "CLOSER " : "       "}${adjudication.name.padEnd(24)} x${currentRatio.toFixed(2)} ` +
      `${current.food.description}\n` +
      `          best cooked x${siblings[0].ratio.toFixed(2)} ${siblings[0].s.food.description}` +
      `  | wrong neighbours ${wrong.length}/${siblings.length}`
  );
}
console.log(
  `\n  materially closer row for ${closer} of 22; ${neighbours} rows added under the same head that are >1.5x off.`
);

// ---------------------------------------------------------------------------
// 5. The reverse error
// ---------------------------------------------------------------------------

console.log("\n## 5. The reverse error, and what catches it\n");
const stateless = (description) =>
  description
    .toLowerCase()
    .replace(
      /,?\s*(dried|raw|uncooked|cooked|boiled|drained|with salt|without salt|with added salt|without added salt)\b/g,
      ""
    )
    .replace(/[,\s]+/g, " ")
    .trim();
const cookedByStem = new Map();
for (const s of cooked) {
  const key = stateless(s.food.description);
  if (!cookedByStem.has(key)) cookedByStem.set(key, []);
  cookedByStem.get(key).push(s);
}
const confusions = [];
for (const s of baseline.final) {
  const hits = cookedByStem.get(stateless(s.food.description));
  const shippedEnergy = energy(s, app);
  if (!hits || !shippedEnergy) continue;
  for (const c of hits) {
    const cookedEnergy = energy(c, liftedApp);
    if (!cookedEnergy) continue;
    confusions.push({
      shipped: s.food.description,
      cooked: c.food.description,
      ratio: cookedEnergy / shippedEnergy,
    });
  }
}
const blind = confusions.filter((c) => c.ratio < 0.7);
const caught = confusions.filter((c) => c.ratio > 2.5);
console.log(
  `  shipped rows gaining a same-substance cooked row  ${new Set(confusions.map((c) => c.shipped)).size}`
);
console.log(
  `  (shipped, cooked) confusions available            ${confusions.length}`
);
console.log(
  `  land below 0.7 — the side #489 measured as blind  ${blind.length}`
);
console.log(
  `  land above 2.5 — the veto refuses them            ${caught.length}`
);
console.log(
  `  in between                                        ${confusions.length - blind.length - caught.length}`
);
const worst = [...blind].sort((a, b) => a.ratio - b.ratio).slice(0, 4);
for (const w of worst)
  console.log(`    x${w.ratio.toFixed(2)}  ${w.shipped}  ->  ${w.cooked}`);

// ---------------------------------------------------------------------------
// 6. The salt axis
// ---------------------------------------------------------------------------

console.log(
  "\n## 6. `with salt` / `without salt`, on the twelve that are spent\n"
);
const saltKey = (d) =>
  d
    .replace(/,?\s*with(out)? salt/i, "")
    .trim()
    .toLowerCase();
const bySaltKey = new Map();
for (const s of cooked) {
  const key = saltKey(s.food.description);
  if (!bySaltKey.has(key)) bySaltKey.set(key, []);
  bySaltKey.get(key).push(s);
}
const saltPairs = [...bySaltKey.values()]
  .filter(
    (group) =>
      group.length === 2 &&
      group.some((s) => /\bwith salt\b/i.test(s.food.description)) &&
      group.some((s) => /\bwithout salt\b/i.test(s.food.description))
  )
  .map((group) =>
    /\bwithout salt\b/i.test(group[0].food.description)
      ? group
      : [group[1], group[0]]
  );
let indistinguishable = 0;
for (const [without, withSalt] of saltPairs) {
  let worstSpread = 0;
  for (const id of METERED) {
    const a = nutrientOf(without.food, id);
    const c = nutrientOf(withSalt.food, id);
    if (a === null || c === null) continue;
    const magnitude = Math.max(Math.abs(a), Math.abs(c));
    if (magnitude === 0) continue;
    worstSpread = Math.max(worstSpread, Math.abs(a - c) / magnitude);
  }
  if (worstSpread <= 0.1) indistinguishable++;
}
console.log(
  `  with/without-salt pairs in the cooked set                 ${saltPairs.length}`
);
console.log(
  `  within 10% on every metered micronutrient                 ${indistinguishable}`
);
console.log(
  `\n  #495 forbids a pairing supplying sodium at all, so on the nutrients a\n` +
    `  pairing may actually spend these pairs are two names for one answer.`
);
