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
 * carries twenty-four.
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

/** Running presence counts for one dataset: `{ records, present }`. */
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
  });
  if (!counted.found)
    throw new Error(
      `${archive.file}: no "${archive.root_key}" array inside; the archive's shape has changed`
    );
  return {
    total: tally.total(),
    profiles,
    energy,
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
