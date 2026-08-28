#!/usr/bin/env node
/**
 * How much of the nutrition panel each USDA bulk dataset actually reports
 * (research note #108 §4, ADR-0045).
 *
 *   pnpm usda:coverage              # both datasets, from .usda-backup
 *   pnpm usda:coverage --dir path
 *
 * It reads local copies and never downloads: `pnpm usda:backup fetch` puts them
 * there, and pinning matters more than freshness here, because these figures are
 * published against the release the manifest names.
 *
 * Why this exists: the completeness table in research note #108 was measured
 * over a Foundation population of 394 records that the bulk distribution does
 * not contain and that cannot be reconstructed — the archive holds 363. A
 * percentage whose denominator is unknown cannot be re-derived or defended, so
 * the table is re-measured here against the mirrored archives, which
 * `pnpm usda:backup verify` already proves are the bytes the manifest describes.
 *
 * The presence rule is deliberately crude and stated wherever the numbers are
 * quoted: a record reports a field when its `foodNutrients` carries an entry for
 * one of the FDC nutrient ids that field is served by, with a non-null `amount`.
 * A reported zero counts. Presence, not quality — the note's own caveat.
 *
 * Node built-ins only, and never the whole document in memory: SR Legacy
 * inflates to 210 MB of JSON, so records arrive one at a time from
 * `usda-archive.mjs` and only the tallies survive them.
 */

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { countArchiveRecords } from "./usda-archive.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");

/**
 * The rows of the note's §4 table, with the FDC nutrient ids each is carried by.
 *
 * The ids mirror `PANEL_FIELDS` in `src/lib/food/usda-fdc.ts`, which is what the
 * app reads, and are restated rather than imported because that module is
 * TypeScript inside the app's bundle and this is a plain-Node ops script. Each
 * row names the panel field it measures so the two can be checked against each
 * other; `usda-coverage.test.ts` does exactly that, because a measurement that
 * quietly stopped describing what the app fills would be worse than none. The
 * rows are the note's, not the app's: §4 measures thirteen fields, the panel
 * carries twenty-three (`BUNDLE_PANEL` below).
 */
/** Energy ids in the order the app reads them (ADR-0045 §3). */
const ENERGY_IDS = [1008, 2047, 2048];

export const PANEL_ROWS = [
  // Foundation omits 1008 and reports energy as Atwater factors only, so a
  // single-id measurement would read most of the dataset as having no calories.
  { label: "Energy", field: "calories", ids: ENERGY_IDS },
  { label: "Protein", field: "protein_content", ids: [1003] },
  { label: "Carbohydrate", field: "carbohydrate_content", ids: [1005, 1050] },
  { label: "Fibre", field: "fiber_content", ids: [1079, 2033] },
  { label: "Saturated fat", field: "saturated_fat_content", ids: [1258] },
  { label: "Sodium", field: "sodium_content", ids: [1093] },
  { label: "Calcium", field: "calcium", ids: [1087] },
  { label: "Iron", field: "iron", ids: [1089] },
  { label: "Vitamin C", field: "vitamin_c", ids: [1162] },
  { label: "Vitamin D", field: "vitamin_d", ids: [1114] },
  { label: "Vitamin A", field: "vitamin_a", ids: [1106] },
  { label: "B12", field: "vitamin_b12", ids: [1178] },
  { label: "Folate", field: "folate", ids: [1177] },
];

/**
 * True when `food` reports a field carried by any of `ids`.
 *
 * The bulk archives nest the id under `nutrient.id`, where the search API this
 * project usually reads flattens it to `nutrientId`; the amount is `amount`
 * rather than `value`. Same data, different serialisation.
 */
export function reportsField(food, ids) {
  const nutrients = food.foodNutrients ?? [];
  return nutrients.some(
    (n) => ids.includes(n.nutrient?.id) && typeof n.amount === "number"
  );
}

/**
 * Running presence counts for one dataset: `{ records, present }`.
 *
 * Asks for the two fields it reads rather than for a whole `PANEL_ROWS` entry,
 * which also carries the `field` name only the report prints.
 *
 * @param {readonly { label: string, ids: number[] }[]} [rows]
 */
export function createCoverageTally(rows = PANEL_ROWS) {
  const present = Object.fromEntries(rows.map((row) => [row.label, 0]));
  let records = 0;
  return {
    add(food) {
      records++;
      for (const row of rows)
        if (reportsField(food, row.ids)) present[row.label]++;
    },
    total() {
      return { records, present };
    },
  };
}

/**
 * The whole panel a bundled offline subset would have to carry, restated from
 * `PANEL_FIELDS` in `src/lib/food/usda-fdc.ts` for the same reason `PANEL_ROWS`
 * is — this is a plain-Node ops script and that is TypeScript inside the app's
 * bundle. `usda-coverage.test.ts` asserts the two are identical, key for key and
 * id for id, so a panel that grows in the app cannot leave a published bundle
 * size describing a narrower one.
 *
 * Twenty-three fields, where `PANEL_ROWS` measures thirteen: coverage asks how
 * much of the panel a dataset reports, and this asks what a bundle would weigh,
 * which is every field the app can fill.
 *
 * `sum` marks the one field with no single FDC id behind it: schema.org's
 * unsaturated fat is monounsaturated plus polyunsaturated, and the mapper adds
 * whichever of the two a record carries.
 */
export const BUNDLE_PANEL = [
  { key: "calories", ids: ENERGY_IDS },
  { key: "protein_content", ids: [1003] },
  { key: "fat_content", ids: [1004] },
  { key: "carbohydrate_content", ids: [1005, 1050] },
  { key: "fiber_content", ids: [1079, 2033] },
  { key: "saturated_fat_content", ids: [1258] },
  { key: "trans_fat_content", ids: [1257] },
  { key: "cholesterol_content", ids: [1253] },
  { key: "sodium_content", ids: [1093] },
  { key: "sugar_content", ids: [2000, 1063] },
  { key: "vitamin_d", ids: [1114] },
  { key: "calcium", ids: [1087] },
  { key: "iron", ids: [1089] },
  { key: "potassium", ids: [1092] },
  { key: "vitamin_a", ids: [1106] },
  { key: "vitamin_c", ids: [1162] },
  { key: "vitamin_e", ids: [1109] },
  { key: "vitamin_b6", ids: [1175] },
  { key: "vitamin_b12", ids: [1178] },
  { key: "folate", ids: [1177] },
  { key: "magnesium", ids: [1090] },
  { key: "zinc", ids: [1095] },
  { key: "unsaturated_fat_content", ids: [1292, 1293], sum: true },
];

/**
 * The twenty-one gram-valued nutrients of that panel: it less energy, which
 * USDA calculates rather than assays, and less the mono + poly sum, which is
 * two nutrients added together rather than one.
 *
 * This exists to size the "21-nutrient panel" ADR-0045's last consequence names.
 * Which twenty-one it meant is not written down anywhere and cannot be
 * recovered; these are the twenty-one a reader counting nutrients rather than
 * fields would arrive at, and both figures are published so the difference
 * between them can be seen rather than argued.
 */
export const NUTRIENT_MASS_PANEL = BUNDLE_PANEL.filter(
  (field) => field.key !== "calories" && !field.sum
);

/**
 * What one record would contribute to a bundle: `{ amount, unit }` per panel
 * field it reports, keyed by the app's field name and in panel order.
 *
 * Amounts are kept exactly as USDA publishes them, in the nutrient's own unit.
 * Normalising to grams is the mapper's job at read time and doing it here would
 * turn 0.3 mg into 0.00029999999999999997 and measure float noise as bytes.
 */
export function panelEntries(food) {
  const nutrients = food.foodNutrients ?? [];
  const find = (id) =>
    nutrients.find(
      (n) => n.nutrient?.id === id && typeof n.amount === "number"
    );
  /** @type {Record<string, { amount: number, unit: string }>} */
  const entries = {};
  for (const { key, ids, sum } of BUNDLE_PANEL) {
    const found = ids.map(find).filter((n) => n !== undefined);
    if (!found.length) continue;
    entries[key] = {
      // First id present wins, in the app's preference order; a summed field
      // takes every id it carries, and rounds as the mapper does to shed the
      // float noise the addition introduces.
      amount: sum
        ? Math.round(found.reduce((total, n) => total + n.amount, 0) * 1e6) /
          1e6
        : found[0].amount,
      unit: found[0].nutrient?.unitName ?? "",
    };
  }
  return entries;
}

/**
 * One record reduced to what a bundle would ship of it: its FDC id, its
 * description, and its panel values, with `ndbNumber` carried alongside for the
 * merge join and the units for the fixed-unit check. Neither is serialised.
 *
 * Always the whole panel: which fields a bundle would actually carry is a
 * question for `serialiseBundle`, so one pass over the archives sizes any trim.
 */
export function bundleFood(food) {
  const entries = panelEntries(food);
  const values = {};
  const units = {};
  for (const [key, entry] of Object.entries(entries)) {
    values[key] = entry.amount;
    units[key] = entry.unit;
  }
  return {
    ndbNumber: food.ndbNumber,
    id: food.fdcId,
    description: food.description,
    values,
    units,
  };
}

/**
 * ADR-0045 §2 and §3 at bundle scale: the twin fills only the panel fields the
 * base does not carry, and the base's identity is untouched, so the merged food
 * still answers to `fdc:<foundation id>`.
 *
 * Returns the merged record and the fields it borrowed.
 */
export function mergeBundleFoods(base, twin) {
  const values = { ...base.values };
  const filled = [];
  for (const [key, amount] of Object.entries(twin.values)) {
    if (key in values) continue;
    values[key] = amount;
    filled.push(key);
  }
  return { record: { ...base, values }, filled };
}

/**
 * The population a bundle would actually carry: every Foundation record filled
 * from its SR Legacy twin, then every SR Legacy food with no Foundation
 * counterpart — 7,974 distinct foods, not the 8,156 that counts each twinned
 * food once per dataset.
 *
 * A record with no `ndbNumber` is unjoinable and is kept whole rather than
 * matched against every other record that lacks one, as `pairTwins` drops them.
 */
export function buildBundle(foundation, srLegacy) {
  const joinable = (record) =>
    record.ndbNumber !== undefined && record.ndbNumber !== null;
  const twins = new Map();
  for (const record of srLegacy)
    if (joinable(record)) twins.set(record.ndbNumber, record);
  const claimed = new Set(
    foundation.filter(joinable).map((record) => record.ndbNumber)
  );

  const records = [];
  let twinned = 0;
  let filled = 0;
  for (const base of foundation) {
    const twin = joinable(base) ? twins.get(base.ndbNumber) : undefined;
    if (!twin) {
      records.push(base);
      continue;
    }
    twinned++;
    const merged = mergeBundleFoods(base, twin);
    filled += merged.filled.length;
    records.push(merged.record);
  }
  for (const record of srLegacy)
    if (!joinable(record) || !claimed.has(record.ndbNumber))
      records.push(record);
  return { records, twinned, filled };
}

/**
 * The bytes the size is taken over: identity plus every field the record
 * reports, written in panel order.
 *
 * The order is fixed rather than whatever the merge happened to produce,
 * because a borrowed field arrives last and two records with the same fields in
 * different orders compress worse than they should. An unreported field is
 * omitted, not written as null: "not measured" is the panel's own distinction
 * and null costs bytes to say nothing.
 */
export function serialiseBundle(records, fields = BUNDLE_PANEL) {
  return JSON.stringify(
    records.map((record) => {
      const out = { id: record.id, description: record.description };
      for (const { key } of fields)
        if (record.values[key] !== undefined) out[key] = record.values[key];
      return out;
    })
  );
}

/**
 * Gzipped size in bytes, at level 9.
 *
 * Level is stated because it is a choice: a bundle is compressed once at build
 * time and served many times, so the best ratio the format offers is the honest
 * one to quote for a shipped asset.
 */
export function gzippedBytes(text) {
  return gzipSync(Buffer.from(text, "utf8"), { level: 9 }).length;
}

/**
 * The distinct units each panel field is published in, across a set of bundle
 * records: field -> `Set` of unit names.
 *
 * A bundle that ships published amounts rather than normalised grams is only
 * readable if the unit is a property of the field rather than of the record, so
 * that is measured here rather than assumed.
 */
export function unitsByField(records) {
  const units = new Map();
  for (const record of records)
    for (const [key, unit] of Object.entries(record.units ?? {})) {
      if (!units.has(key)) units.set(key, new Set());
      units.get(key).add(unit);
    }
  return units;
}

/**
 * The twinned foods between two datasets, joined on `ndbNumber` as ADR-0045 §2
 * merges them: `{ pairs, untwinned }`, where each pair carries both
 * descriptions and `untwinned` counts the base dataset's unpaired foods.
 *
 * `base` and `twin` are `ndbNumber` -> record-profile maps. A record with no
 * `ndbNumber` is unjoinable and is dropped rather than matched against every
 * other record that lacks one.
 */
export function pairTwins(base, twin) {
  const pairs = [];
  let untwinned = 0;
  for (const [ndbNumber, description] of base) {
    if (ndbNumber === undefined || ndbNumber === null) continue;
    if (twin.has(ndbNumber))
      pairs.push({ ndbNumber, base: description, twin: twin.get(ndbNumber) });
    else untwinned++;
  }
  return { pairs, untwinned };
}

/**
 * A description cut into the tokens the varietal comparison runs over:
 * lowercased, split on everything that is not a letter or a digit, and stripped
 * of tokens under three characters, which are units and conjunctions rather
 * than varietal signal.
 */
export function descriptionTokens(description) {
  return new Set(
    description
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3)
  );
}

/** Shared tokens over all of them; 0 for two empty sets rather than NaN. */
export function jaccard(a, b) {
  const union = new Set([...a, ...b]).size;
  if (!union) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  return shared / union;
}

/**
 * How sound the `ndbNumber` link looks across every pair, which is the evidence
 * behind ADR-0045's varietal residual.
 *
 * The median is reported as the mean of the two middle scores when the count is
 * even, and `belowHalf` and `noSharedToken` are reported beside it because a
 * median alone hides the tail: the pairs that need Decision 4's auditability are
 * exactly the ones it averages away.
 */
export function summarisePairSimilarity(pairs) {
  const scored = pairs
    .map((pair) => ({
      ...pair,
      score: jaccard(
        descriptionTokens(pair.base.description),
        descriptionTokens(pair.twin.description)
      ),
    }))
    .sort((a, b) => a.score - b.score);
  const middle = scored.length >> 1;
  return {
    pairs: scored.length,
    median: !scored.length
      ? 0
      : scored.length % 2
        ? scored[middle].score
        : (scored[middle - 1].score + scored[middle].score) / 2,
    identical: scored.filter((p) => p.base.description === p.twin.description)
      .length,
    belowHalf: scored.filter((p) => p.score < 0.5).length,
    noSharedToken: scored.filter((p) => p.score === 0).length,
    weakest: scored.slice(0, 5),
  };
}

/**
 * What one record says about its own calories, small enough to keep for every
 * food in a 210 MB archive.
 *
 * Energy is the one panel field USDA never measures: every value in both bulk
 * archives carries derivation code `NC`, Calculated. It is the macros times a
 * factor system, and the macros are themselves derived — protein from nitrogen,
 * carbohydrate by difference from water, protein, fat, ash and alcohol. `basis`
 * names the nutrient id the panel would read, in the app's preference order.
 */
export function energyProfile(food) {
  const entryOf = (id) =>
    (food.foodNutrients ?? []).find((x) => x.nutrient?.id === id);
  const amountOf = (id) => {
    const n = entryOf(id);
    return typeof n?.amount === "number" ? n.amount : undefined;
  };
  const published = ENERGY_IDS.filter((id) => amountOf(id) !== undefined);
  const [basis = null] = published;
  const factors = (food.nutrientConversionFactors ?? []).find(
    (f) => f.type === ".CalorieConversionFactor"
  );
  return {
    description: food.description,
    // What the record carries, against what the panel would read from it: a
    // Foundation food publishing both Atwater systems is read as general, so a
    // count of bases alone would report specific factors as absent.
    published,
    basis,
    // How USDA says it arrived at the figure. `NC` is Calculated; the rest are
    // imputed or taken from another food, which is why some records state an
    // energy their own macros do not produce.
    derivation:
      basis === null
        ? null
        : (entryOf(basis)?.foodNutrientDerivation?.code ?? "unstated"),
    kcal: basis === null ? undefined : amountOf(basis),
    protein: amountOf(1003),
    fat: amountOf(1004),
    carbohydrate: amountOf(1005) ?? amountOf(1050),
    factors: factors
      ? {
          proteinValue: factors.proteinValue,
          fatValue: factors.fatValue,
          carbohydrateValue: factors.carbohydrateValue,
        }
      : null,
  };
}

/** The macros times a factor system: Atwater general unless `factors` are given. */
function atwater({ protein, fat, carbohydrate }, factors) {
  if ([protein, fat, carbohydrate].some((v) => v === undefined))
    return undefined;
  const f = factors ?? { proteinValue: 4, fatValue: 9, carbohydrateValue: 4 };
  return (
    f.proteinValue * protein +
    f.fatValue * fat +
    f.carbohydrateValue * carbohydrate
  );
}

/**
 * Whether a record's stated energy is what its own macros produce, judged under
 * the factor system its `basis` names: 2047 is general by definition, 2048 is
 * the record's published specific factors, and 1008 is specific where a record
 * publishes factors and general where it does not.
 *
 * `undefined` where the question cannot be asked — no energy, or no full macro
 * set to ask it against. The tolerance is a point either way, because the
 * archives publish three significant figures and the arithmetic is done behind
 * them.
 */
export function reconcilesWithMacros(profile) {
  if (profile.basis === null) return undefined;
  const system = profile.basis === 2047 ? null : profile.factors;
  const computed = atwater(profile, system);
  if (computed === undefined) return undefined;
  return Math.abs(profile.kcal - computed) <= Math.max(1, 0.01 * computed);
}

/** How a whole dataset states its calories. */
export function summariseEnergy(profiles) {
  const summary = {
    records: profiles.length,
    basis: { 1008: 0, 2047: 0, 2048: 0, none: 0 },
    publishing: { 1008: 0, 2047: 0, 2048: 0 },
    derivations: {},
    energyWithoutFullMacros: 0,
    reconciling: 0,
    measurable: 0,
  };
  for (const profile of profiles) {
    summary.basis[profile.basis ?? "none"]++;
    for (const id of profile.published) summary.publishing[id]++;
    if (profile.derivation !== null)
      summary.derivations[profile.derivation] =
        (summary.derivations[profile.derivation] ?? 0) + 1;
    const complete = [profile.protein, profile.fat, profile.carbohydrate].every(
      (v) => v !== undefined
    );
    if (profile.basis !== null && !complete) summary.energyWithoutFullMacros++;
    const reconciles = reconcilesWithMacros(profile);
    if (reconciles !== undefined) {
      summary.measurable++;
      if (reconciles) summary.reconciling++;
    }
  }
  return summary;
}

/**
 * What ADR-0045 §2's fill-only merge does to a calorie.
 *
 * The failure worth counting is `macroBorrowedUnderEnergy`: a panel showing the
 * base record's energy over a macro taken from the twin states a calorie that
 * its own grams do not produce. `energyBorrowed` is the milder inverse, where
 * the calorie comes from the twin and the macros beside it may not be the ones
 * it was calculated from.
 */
export function summariseMergedEnergy(pairs) {
  const MACROS = ["protein", "fat", "carbohydrate"];
  const summary = {
    pairs: pairs.length,
    energyBorrowed: 0,
    macroBorrowedUnderEnergy: 0,
    coherenceMeasurable: 0,
    coherenceUnchanged: 0,
  };
  const gap = (profile) => {
    const general = atwater(profile, null);
    if (general === undefined || profile.kcal === undefined) return undefined;
    return general === 0 ? 0 : Math.abs((profile.kcal - general) / general);
  };
  for (const { base, twin } of pairs) {
    const merged = { kcal: base.kcal ?? twin.kcal };
    for (const macro of MACROS) merged[macro] = base[macro] ?? twin[macro];
    if (base.kcal === undefined && twin.kcal !== undefined)
      summary.energyBorrowed++;
    else if (
      base.kcal !== undefined &&
      MACROS.some((m) => base[m] === undefined && twin[m] !== undefined)
    )
      summary.macroBorrowedUnderEnergy++;
    const before = gap(base);
    const after = gap(merged);
    if (before === undefined || after === undefined) continue;
    summary.coherenceMeasurable++;
    if (Math.abs(after - before) <= 0.001) summary.coherenceUnchanged++;
  }
  return summary;
}

/**
 * The measured columns as a markdown table, denominators in the headings.
 *
 * Precondition: every column was tallied over the same rows, which holds because
 * every tally is created from `PANEL_ROWS`. The first column names them.
 */
export function formatCoverageTable(columns) {
  const rows = Object.keys(columns[0].total.present);
  const percent = (n, total) =>
    total ? `${Math.round((n / total) * 100)}%` : "—";
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [
    line([
      "Field",
      ...columns.map(
        (c) => `${c.name} (${c.total.records.toLocaleString("en-GB")})`
      ),
    ]),
    line(["---", ...columns.map(() => "---")]),
    ...rows.map((label) =>
      line([
        label,
        ...columns.map((c) => percent(c.total.present[label], c.total.records)),
      ])
    ),
  ].join("\n");
}

/**
 * Measures one archive: its coverage tally and its `ndbNumber` -> description map.
 *
 * The digest is checked first, and this is not a duplicate of
 * `usda:backup verify`. Every figure printed here is published in a record that
 * states which bytes it was taken over, so measuring bytes the manifest does not
 * describe would produce exactly the kind of unreproducible number the whole
 * exercise exists to retire. Nothing is downloaded: fetching is `usda:backup`'s
 * job, and a measurement that silently re-fetched would measure whatever USDA
 * serves today rather than the release the manifest pins.
 */
async function measureArchive(archive, dir) {
  const zip = await readFile(join(dir, archive.file)).catch(() => null);
  if (zip === null)
    throw new Error(
      `${archive.file} is not in ${dir}. Run \`pnpm usda:backup fetch\` first ` +
        `(it downloads all three archives and verifies them against the manifest).`
    );
  const sha256 = createHash("sha256").update(zip).digest("hex");
  if (sha256 !== archive.sha256)
    throw new Error(
      `${archive.file}: sha256 ${sha256}, manifest says ${archive.sha256}. ` +
        `Measuring undescribed bytes would publish a number nobody can reproduce.`
    );
  const tally = createCoverageTally();
  const profiles = new Map();
  const energy = [];
  // One trimmed record per food, which is what a bundle would ship of it: 363 +
  // 7,793 of these fit in memory where the archives they come from do not.
  const bundle = [];
  // A dataset mapping one ndbNumber to two records would make the join ambiguous
  // and the map would silently keep the last one, so it is counted, not assumed.
  let repeatedNdbNumbers = 0;
  const counted = await countArchiveRecords(zip, archive.root_key, (text) => {
    const food = JSON.parse(text);
    tally.add(food);
    if (profiles.has(food.ndbNumber)) repeatedNdbNumbers++;
    // One small projection per record serves both the twin join and the energy
    // audit; keeping the records themselves would mean holding 210 MB.
    const profile = energyProfile(food);
    profiles.set(food.ndbNumber, profile);
    energy.push(profile);
    bundle.push(bundleFood(food));
  });
  if (!counted.found)
    throw new Error(
      `${archive.file}: no "${archive.root_key}" array inside; the archive's shape has changed`
    );
  return {
    total: tally.total(),
    profiles,
    energy,
    bundle,
    repeatedNdbNumbers,
    counted,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flagAt = args.indexOf("--dir");
  if (flagAt !== -1 && !args[flagAt + 1])
    throw new Error("--dir needs a path after it");
  const dir = resolve(ROOT, flagAt === -1 ? ".usda-backup" : args[flagAt + 1]);
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const wanted = ["Foundation Foods", "SR Legacy"];
  const archives = wanted.map((dataset) => {
    const archive = manifest.archives.find((a) => a.dataset === dataset);
    if (!archive) throw new Error(`no "${dataset}" archive in the manifest`);
    return archive;
  });

  const measured = [];
  for (const archive of archives) {
    process.stdout.write(`  .. ${archive.file}\n`);
    measured.push({ archive, ...(await measureArchive(archive, dir)) });
  }

  for (const { archive, counted, repeatedNdbNumbers } of measured)
    console.log(
      `\n${archive.dataset} ${archive.release}: ${counted.records} records, ` +
        `${counted.null_entries} null slots (manifest says ${archive.records} and ${archive.null_entries}), ` +
        `${repeatedNdbNumbers} repeated ndbNumbers`
    );

  console.log(
    `\n${formatCoverageTable(
      measured.map(({ archive, total }) => ({
        name: `USDA ${archive.dataset === "Foundation Foods" ? "Foundation" : archive.dataset}`,
        total,
      }))
    )}`
  );

  const [foundation, srLegacy] = measured;
  const { pairs, untwinned } = pairTwins(
    foundation.profiles,
    srLegacy.profiles
  );
  console.log(
    `\ntwinned by ndbNumber: ${pairs.length} pairs, ${untwinned} Foundation foods untwinned, ` +
      `${foundation.total.records + srLegacy.total.records - pairs.length} merged records`
  );

  // The varietal residual ADR-0045 accepts: how alike a pair's two descriptions
  // are is the only evidence that one ndbNumber names one food.
  const similarity = summarisePairSimilarity(pairs);
  console.log(
    `description token-Jaccard: median ${similarity.median.toFixed(2)}, ` +
      `${similarity.identical} identical, ${similarity.belowHalf} below 0.5, ` +
      `${similarity.noSharedToken} with no shared token`
  );
  for (const pair of similarity.weakest)
    console.log(
      `  ${pair.score.toFixed(2)} ${pair.ndbNumber}  ${pair.base.description} || ${pair.twin.description}`
    );

  // Energy is calculated rather than measured, so a merged panel could state a
  // calorie its own grams do not produce. This is the check that it does not.
  console.log("\nenergy, by the id the panel reads (and what is published):");
  for (const { archive, energy } of measured) {
    const e = summariseEnergy(energy);
    console.log(
      `  ${archive.dataset.padEnd(17)} reads 1008 ${e.basis[1008]}, general 2047 ${e.basis[2047]}, ` +
        `none ${e.basis.none} (published: 1008 ${e.publishing[1008]}, 2047 ${e.publishing[2047]}, ` +
        `specific 2048 ${e.publishing[2048]}); ` +
        `${e.reconciling}/${e.measurable} reconcile with their own macros; ` +
        `${e.energyWithoutFullMacros} state energy without a full macro set`
    );
    console.log(
      `                    derivations: ${Object.entries(e.derivations)
        .sort((a, b) => b[1] - a[1])
        .map(([code, n]) => `${code} ${n}`)
        .join(", ")}`
    );
  }
  const merged = summariseMergedEnergy(pairs);
  console.log(
    `  merge: ${merged.energyBorrowed} pairs borrow the calorie itself, ` +
      `${merged.macroBorrowedUnderEnergy} borrow a macro under the base's own energy, ` +
      `${merged.coherenceUnchanged}/${merged.coherenceMeasurable} unchanged in coherence`
  );

  // What a bundled offline subset would weigh (ADR-0045's last consequence,
  // re-taken over the merged population for #120). Two panels are sized: the
  // one the app fills today, and the twenty-one nutrient masses inside it,
  // because the original estimate said "21-nutrient panel" and did not say
  // which twenty-one.
  const bundle = buildBundle(foundation.bundle, srLegacy.bundle);
  // Order is a free variable in any compressed size, so both are printed rather
  // than one being left as an unstated assumption: alphabetical order groups
  // like descriptions together and gzip pays less for them.
  const sorted = [...bundle.records].sort((a, b) =>
    a.description < b.description ? -1 : a.description > b.description ? 1 : 0
  );
  const kib = (bytes) => `${Math.round(bytes / 1024)} KiB`;
  const printSize = (label, fields) => {
    const text = serialiseBundle(bundle.records, fields);
    const gzipped = gzippedBytes(text);
    const alphabetical = gzippedBytes(serialiseBundle(sorted, fields));
    console.log(
      `  ${label.padEnd(22)} ${Buffer.byteLength(text).toLocaleString("en-GB")} B JSON, ` +
        `${gzipped.toLocaleString("en-GB")} B gzipped (${kib(gzipped)}); ` +
        `sorted by description ${kib(alphabetical)}`
    );
  };
  console.log(
    `\nbundle: ${bundle.records.length.toLocaleString("en-GB")} distinct foods ` +
      `(${bundle.twinned} twinned, ${bundle.filled} panel fields borrowed)`
  );
  printSize(`${BUNDLE_PANEL.length}-field panel`, BUNDLE_PANEL);
  printSize(`${NUTRIENT_MASS_PANEL.length}-nutrient trim`, NUTRIENT_MASS_PANEL);
  // The floor the panel is added to: a bundle has to name its foods whatever
  // else it drops, so this is how much of the weight is not nutrition at all.
  printSize("identity only", []);
  const multiUnit = [
    ...unitsByField([...foundation.bundle, ...srLegacy.bundle]),
  ]
    .filter(([, units]) => units.size > 1)
    .map(([field, units]) => `${field} (${[...units].join("/")})`);
  console.log(
    `  units: ${multiUnit.length ? multiUnit.join(", ") : "one per panel field, across both archives"}`
  );
}

// Only when run, never on import: the tallies above are unit-tested, and reading
// 210 MB of JSON is not something a test suite should be made to do.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  // A missing or wrong archive is an operator problem with a known remedy, not a
  // crash: say what to run, and keep the stack for genuine bugs.
  await main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
