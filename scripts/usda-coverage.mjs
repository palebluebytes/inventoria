#!/usr/bin/env node
/**
 * How much of the nutrition panel each USDA bulk dataset actually reports
 * (research note #108 §4, ADR-0045).
 *
 *   node scripts/usda-coverage.mjs            # both datasets, from .usda-backup
 *   node scripts/usda-coverage.mjs --dir path
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
 * TypeScript inside the app's bundle and this is a plain-Node ops script. The
 * rows are the note's, not the app's: §4 measures thirteen fields, the panel
 * carries twenty-four.
 */
export const PANEL_ROWS = [
  // Foundation omits 1008 and reports energy as Atwater factors only, so a
  // single-id measurement would read most of the dataset as having no calories.
  { label: "Energy", ids: [1008, 2047, 2048] },
  { label: "Protein", ids: [1003] },
  { label: "Carbohydrate", ids: [1005, 1050] },
  { label: "Fibre", ids: [1079, 2033] },
  { label: "Saturated fat", ids: [1258] },
  { label: "Sodium", ids: [1093] },
  { label: "Calcium", ids: [1087] },
  { label: "Iron", ids: [1089] },
  { label: "Vitamin C", ids: [1162] },
  { label: "Vitamin D", ids: [1114] },
  { label: "Vitamin A", ids: [1106] },
  { label: "B12", ids: [1178] },
  { label: "Folate", ids: [1177] },
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
 * The twinned pairs between two datasets: `{ pairs, untwinned }`, counted over
 * distinct `ndbNumber`s, which is the key ADR-0045 §2 merges on. `untwinned`
 * counts the first dataset's unpaired foods, Foundation being the base record.
 */
export function countSharedNdbNumbers(a, b) {
  const has = (values) =>
    new Set(values.filter((ndb) => ndb !== undefined && ndb !== null));
  const first = has([...a]);
  const second = has([...b]);
  let pairs = 0;
  for (const ndb of first) if (second.has(ndb)) pairs++;
  return { pairs, untwinned: first.size - pairs };
}

/** The measured columns as a markdown table, denominators in the headings. */
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

/** Measures one archive: its coverage tally and every `ndbNumber` it carries. */
async function measureArchive(archive, dir) {
  const zip = await readFile(join(dir, archive.file));
  const tally = createCoverageTally();
  const ndb_numbers = [];
  const counted = await countArchiveRecords(zip, archive.root_key, (text) => {
    const food = JSON.parse(text);
    tally.add(food);
    ndb_numbers.push(food.ndbNumber);
  });
  if (!counted.found)
    throw new Error(
      `${archive.file}: no "${archive.root_key}" array inside; the archive's shape has changed`
    );
  return { total: tally.total(), ndb_numbers, counted };
}

async function main() {
  const args = process.argv.slice(2);
  const flagAt = args.indexOf("--dir");
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

  for (const { archive, counted } of measured)
    console.log(
      `\n${archive.dataset} ${archive.release}: ${counted.records} records, ` +
        `${counted.null_entries} null slots (manifest says ${archive.records} and ${archive.null_entries})`
    );

  console.log(
    `\n${formatCoverageTable(
      measured.map(({ archive, total }) => ({
        name: `USDA ${archive.dataset === "Foundation Foods" ? "Foundation" : archive.dataset}`,
        total,
      }))
    )}`
  );

  const [foundation, sr_legacy] = measured;
  const { pairs, untwinned } = countSharedNdbNumbers(
    foundation.ndb_numbers,
    sr_legacy.ndb_numbers
  );
  console.log(
    `\ntwinned by ndbNumber: ${pairs} pairs, ${untwinned} Foundation foods untwinned, ` +
      `${foundation.total.records + sr_legacy.total.records - pairs} merged records`
  );
}

// Only when run, never on import: the tallies above are unit-tested, and reading
// 210 MB of JSON is not something a test suite should be made to do.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
