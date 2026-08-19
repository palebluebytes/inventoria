#!/usr/bin/env node
/**
 * Generating the bundled USDA search index and nutrient store (ADR-0047).
 *
 *   pnpm usda:bundle              # regenerate both artifacts into public/usda/
 *   pnpm usda:bundle --report     # measure and print, write nothing
 *
 * Flags: --dir <path> (archives, default .usda-backup), --out <path>.
 *
 * Why this exists: ADR-0047 retires the FoodData Central API and ships USDA's
 * own bulk distribution instead, so food search works with no key, no quota and
 * no network. The two artifacts this writes are COMMITTED (§3) — a clone builds
 * with no archives, no network and no credentials, and a mirror refresh arrives
 * as a reviewable diff rather than a silent rebuild.
 *
 * Two properties are load-bearing and everything below is shaped by them.
 *
 * **Nothing here restates app logic.** The ADR-0042 reference-food filters, the
 * ADR-0045 §2 twin merge, the nutrition panel and the portion mapping all come
 * out of `src/lib/food/usda-fdc.ts` itself, loaded through esbuild (see
 * `loadAppModule`). A bundled row is therefore exactly the row a live search
 * would have produced, and a filter retune cannot leave the artifact behind.
 *
 * **The output is stable so the diff is readable** (§3): one array sorted by
 * `fdcId`, nutrients as an id-keyed object with sorted keys, one food per line,
 * and no generation timestamp anywhere. Regenerating from the same archives is a
 * no-op diff; a mirror refresh diffs as changed values plus added and removed
 * foods.
 *
 * It reads local copies and never downloads: `pnpm usda:backup fetch` puts the
 * archives there, and every archive is checked against its manifest digest
 * first, because an artifact generated from undescribed bytes is one nobody can
 * reproduce.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { countArchiveRecords } from "./usda-archive.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");
const APP_MODULE = join(ROOT, "src", "lib", "food", "usda-fdc.ts");

/** Bumped when either artifact's shape changes, so a reader can refuse an old one. */
export const SCHEMA_VERSION = 1;

/**
 * The datasets the corpus is built from, in the manifest's own naming. Survey is
 * deliberately absent: search has never read it (ADR-0045) and bundling it would
 * ship 5,432 composite dishes the ADR-0042 filters exist to drop.
 */
export const BUNDLE_DATASETS = ["Foundation Foods", "SR Legacy"];

/**
 * Everything this script borrows from the app, by name.
 *
 * The list is exported so `usda-bundle.test.ts` can assert every one of these is
 * a real export of `usda-fdc.ts` — the same lock `usda-coverage.test.ts` puts on
 * `PANEL_FIELDS`. A rename in the app then fails a test rather than failing a
 * regeneration months later.
 */
export const APP_EXPORTS = [
  "isBrandSpecific",
  "isProcessedProduct",
  "isPreparedProduct",
  "resolveFdcGroup",
  "mapFdcFoodToPayload",
  "mapFdcPortions",
];

/**
 * The panel fields a search result row renders, which is the whole of what the
 * index carries about nutrition (ADR-0047 §2). Everything else is in the
 * nutrient store, parsed only when a food is staged.
 *
 * Keys, not nutrient ids: the values are read off the payload
 * `mapFdcFoodToPayload` builds, so the ids behind them, the energy preference
 * order and the mg/µg normalisation are all the app's and none of them is
 * restated here.
 */
export const ROW_MACRO_KEYS = [
  "calories",
  "protein_content",
  "fat_content",
  "carbohydrate_content",
];

// ---------------------------------------------------------------------------
// The shapes the artifacts are written in
//
// Stated as typedefs rather than left to inference because these are a
// published contract: #113 reads a row to rank and render it, #114 reads the
// store to fill a staged twin's panel, and both read a file this script wrote
// months earlier. A shape nobody can look up is a shape that drifts.
// ---------------------------------------------------------------------------

/**
 * One household measure as `food/portions` carries it (ADR-0030 §5).
 *
 * @typedef {object} Portion
 * @property {string} label   Human-readable measure, e.g. "1 cup, sliced".
 * @property {number} amount  How many of `unit` this portion is.
 * @property {string} unit    The unit the measure is expressed in.
 * @property {number} grams   What the portion weighs.
 */

/**
 * The record that filled gaps in a merged food, as `twin/raw_provenance` names
 * it (ADR-0045 §4).
 *
 * @typedef {object} MergedSource
 * @property {string} source_uri
 * @property {string} description
 * @property {string} [data_type]
 * @property {string[]} filled_fields
 */

/**
 * One search index row (ADR-0047 §2): identity, the fields ADR-0042 ranks on,
 * the macros a result row renders, the portions, and the twin reference.
 *
 * @typedef {object} IndexRow
 * @property {number} fdcId
 * @property {string} description
 * @property {string} dataType
 * @property {string} [foodCategory]
 * @property {string} [scientificName]
 * @property {Record<string, number>} macros
 * @property {Portion[]} [portions]
 * @property {MergedSource[]} [merged_from]
 */

/**
 * One archive record in the shape the app's search path reads (`FdcFood`).
 *
 * @typedef {object} BundleFood
 * @property {number} fdcId
 * @property {string} description
 * @property {string} dataType
 * @property {number} [ndbNumber]
 * @property {string} [foodCategory]
 * @property {string} [scientificName]
 * @property {{ nutrientId: number, nutrientName: string, value: number, unitName: string }[]} foodNutrients
 */

/**
 * A food on its way into the artifacts: merged, filtered, with the base
 * record's raw portions still to be mapped.
 *
 * @typedef {object} Survivor
 * @property {BundleFood} food
 * @property {MergedSource[]} merged_from
 * @property {{ amount: number, gramWeight: number, modifier?: string, portionDescription?: string, measureUnit?: { name?: string }, sequenceNumber?: number }[]} foodPortions
 */

// ---------------------------------------------------------------------------
// Reaching the app's own logic
// ---------------------------------------------------------------------------

/**
 * Bundles `usda-fdc.ts` to a temporary ES module and imports it, so this plain-
 * Node script can call the app's TypeScript directly.
 *
 * Copying the filter lists was the alternative and is what this exists to avoid:
 * they are ~200 lines of editorial judgement (brand acronym stoplist, sweetener
 * and baked-staple head words, the salad-versus-salad-oil rule) tuned against
 * the corpus, and a second copy would drift silently — the artifact would keep
 * shipping foods the app had learned to drop, or drop foods it had learned to
 * keep, with nothing to notice.
 *
 * esbuild is reached the way `AGENTS.md` §1 reaches any one-off binary: from the
 * PATH if the shell already has it, else through `nix shell nixpkgs#esbuild`.
 * The entry re-exports only {@link APP_EXPORTS}, so the bundle tree-shakes to
 * ~12 kB and pulls in no browser API this script would have to stub.
 */
export async function loadAppModule(scratchDir) {
  const entry = join(scratchDir, "app-entry.ts");
  const out = join(scratchDir, "app-bundle.mjs");
  await writeFile(
    entry,
    `export { ${APP_EXPORTS.join(", ")} } from ${JSON.stringify(APP_MODULE)};\n`
  );

  const argv = [
    entry,
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${out}`,
  ];
  const attempts = [
    ["esbuild", argv],
    ["nix", ["shell", "nixpkgs#esbuild", "-c", "esbuild", ...argv]],
  ];
  let last = null;
  for (const [command, args] of attempts) {
    last = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
    if (last.status === 0) {
      // The temp module has to be imported before it is removed, so the entry
      // goes now and the bundle goes with the scratch directory afterwards.
      await rm(entry, { force: true });
      return await import(pathToFileURL(out).href);
    }
  }
  throw new Error(
    "could not bundle the app's filters with esbuild. It is reached from the " +
      "PATH or through `nix shell nixpkgs#esbuild`; install Nix, or put esbuild " +
      `on the PATH, and re-run.\n${last?.stderr ?? last?.error?.message ?? ""}`
  );
}

/** Fails unless the app module exports everything {@link APP_EXPORTS} names. */
export function assertAppExports(app) {
  const missing = APP_EXPORTS.filter((name) => typeof app[name] !== "function");
  if (missing.length)
    throw new Error(
      `src/lib/food/usda-fdc.ts no longer exports ${missing.join(", ")}. ` +
        "The bundle is generated from the app's own filters and merge, so a " +
        "rename there has to be followed here rather than forked."
    );
  return app;
}

// ---------------------------------------------------------------------------
// Archive record -> the shape the app reads
// ---------------------------------------------------------------------------

/**
 * One archive record projected onto the `FdcFood` the app's search path works
 * with, plus the raw `foodPortions[]` beside it.
 *
 * The two serialisations differ in three places and this is the only code that
 * knows it: the archives nest a nutrient's id and unit under `nutrient` where
 * the API flattens them to `nutrientId`/`unitName`, they carry `foodCategory` as
 * an object rather than the API's plain string, and their `foodPortions` arrive
 * in `sequenceNumber` order that nothing guarantees the array preserves.
 *
 * A nutrient with no numeric `amount` is absence, not a zero, and is dropped —
 * the same rule `usda-coverage.mjs` measures presence by.
 *
 * @returns {{ food: BundleFood, foodPortions: Survivor["foodPortions"] }}
 */
export function projectArchiveFood(record) {
  /** @type {BundleFood["foodNutrients"]} */
  const foodNutrients = [];
  for (const entry of record.foodNutrients ?? []) {
    const id = entry.nutrient?.id;
    if (typeof id !== "number" || typeof entry.amount !== "number") continue;
    foodNutrients.push({
      nutrientId: id,
      nutrientName: entry.nutrient?.name ?? "",
      value: entry.amount,
      unitName: entry.nutrient?.unitName ?? "",
    });
  }

  const food = {
    fdcId: record.fdcId,
    description: record.description,
    dataType: record.dataType,
    foodNutrients,
  };
  if (record.ndbNumber !== undefined && record.ndbNumber !== null)
    food.ndbNumber = record.ndbNumber;
  const category = record.foodCategory?.description ?? record.foodCategory;
  if (typeof category === "string" && category) food.foodCategory = category;
  if (record.scientificName) food.scientificName = record.scientificName;

  const foodPortions = [...(record.foodPortions ?? [])].sort(
    (a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)
  );
  return { food, foodPortions };
}

/**
 * The key one USDA food identity is collected under, mirroring `searchFdc`
 * exactly: `ndbNumber` where a record carries one, else the description behind a
 * `desc:` prefix so a numeric id and a description can never collide.
 *
 * This is what pairs a Foundation re-sample with its SR Legacy twin, whose
 * free-text descriptions USDA rewrites between the two datasets.
 */
export function identityKey(food) {
  return food.ndbNumber ?? `desc:${food.description.toLowerCase().trim()}`;
}

/** Groups projected records by {@link identityKey}, preserving arrival order. */
export function groupByIdentity(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = identityKey(entry.food);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

/**
 * The distinct nutrient ids across every record, as `id -> { name, unit }`.
 *
 * A dictionary is only sound if a nutrient id means one unit everywhere, so that
 * is checked rather than assumed: measured over both archives on 2026-08-19, all
 * 246 ids are single-unit, and a record that ever broke that would make every
 * stored amount ambiguous. Failing loudly is the only safe response.
 */
export function collectNutrientDictionary(foods) {
  const dictionary = new Map();
  for (const food of foods)
    for (const nutrient of food.foodNutrients) {
      const known = dictionary.get(nutrient.nutrientId);
      if (!known) {
        dictionary.set(nutrient.nutrientId, {
          name: nutrient.nutrientName,
          unit: nutrient.unitName,
        });
        continue;
      }
      if (known.unit !== nutrient.unitName)
        throw new Error(
          `nutrient ${nutrient.nutrientId} is reported in both "${known.unit}" and ` +
            `"${nutrient.unitName}"; the store keys units by nutrient id and cannot ` +
            "carry two"
        );
    }
  return dictionary;
}

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

/**
 * Every food identity merged and filtered, sorted by `fdcId`: the population
 * both artifacts describe (ADR-0047 §4).
 *
 * The merge is the app's `resolveFdcGroup` — Foundation is the base by data
 * type rather than by arrival, so the result does not depend on the order the
 * archives were read in, and the twin fills only the panel fields the base is
 * silent about. Portions come from the base record alone, since a borrowed
 * gram weight would describe a different sample than the description names.
 *
 * `dropped` counts each filter's own casualties in the order they are applied,
 * so the three tallies sum to the foods removed rather than double-counting a
 * food two filters agree on.
 *
 * @returns {{ survivors: Survivor[], dropped: Record<string, number>, twinned: number, identities: number }}
 */
export function buildCorpus(groups, app) {
  /** @type {Survivor[]} */
  const survivors = [];
  const dropped = { brand_specific: 0, processed: 0, prepared: 0 };
  let twinned = 0;

  for (const group of groups.values()) {
    if (group.length > 1) twinned++;
    const { food, merged_from } = app.resolveFdcGroup(group.map((e) => e.food));
    if (app.isBrandSpecific(food.description)) {
      dropped.brand_specific++;
      continue;
    }
    if (app.isProcessedProduct(food.description)) {
      dropped.processed++;
      continue;
    }
    if (app.isPreparedProduct(food.foodCategory, food.description)) {
      dropped.prepared++;
      continue;
    }
    const base = group.find((e) => e.food.fdcId === food.fdcId);
    survivors.push({ food, merged_from, foodPortions: base.foodPortions });
  }

  survivors.sort((a, b) => a.food.fdcId - b.food.fdcId);
  return { survivors, dropped, twinned, identities: groups.size };
}

// ---------------------------------------------------------------------------
// The two artifacts
// ---------------------------------------------------------------------------

/**
 * What the artifacts say about where they came from (ADR-0047 §12): the release
 * each archive names, and the digest that pins the exact bytes behind it.
 *
 * There is deliberately no generation timestamp. One would change every byte of
 * both files on every run and turn §3's reviewable diff into a diff nobody
 * reads.
 */
export function generatedFrom(archives) {
  return archives.map((archive) => ({
    dataset: archive.dataset,
    release: archive.release,
    file: archive.file,
    sha256: archive.sha256,
  }));
}

/**
 * One search index row: identity, the fields ADR-0042 ranks on, the macros the
 * results list shows, the household portions, and the twin reference where the
 * food merged (ADR-0047 §2 and §8).
 *
 * `merged_from` rides inline because with hydration retired there is no other
 * carrier for it, and ADR-0045 §4 requires that a merged panel never present
 * itself as one record USDA served. It is omitted rather than emitted empty:
 * three of the 190 twinned pairs borrow nothing, and a food whose panel is
 * entirely its own did not merge.
 *
 * Every absent field is omitted for the same reason — "not measured" is a
 * distinction the panel makes, and `null` costs bytes to say nothing.
 *
 * @param {Survivor} survivor
 * @param {Record<string, Function>} app
 * @returns {IndexRow}
 */
export function buildIndexRow({ food, merged_from, foodPortions }, app) {
  const payload = app.mapFdcFoodToPayload(food, merged_from);
  const panel = payload.attributes["nutrition/info"];
  const macros = {};
  for (const key of ROW_MACRO_KEYS)
    if (panel[key] !== undefined) macros[key] = panel[key];

  const row = {
    fdcId: food.fdcId,
    description: food.description,
    dataType: food.dataType,
  };
  if (food.foodCategory) row.foodCategory = food.foodCategory;
  if (food.scientificName) row.scientificName = food.scientificName;
  row.macros = macros;
  const portions = app.mapFdcPortions(foodPortions);
  if (portions.length) row.portions = portions;
  if (merged_from.length) row.merged_from = merged_from;
  return row;
}

/**
 * One nutrient-store entry: every nutrient the merged record reports, keyed by
 * id and sorted by it, in USDA's own published unit.
 *
 * No coverage gate (ADR-0047 §5) — sparse columns compress to almost nothing, so
 * a gate would save ~60 KiB brotli at its most aggressive and leave a judgement
 * for somebody to re-litigate. Amounts are USDA's, not normalised to grams:
 * normalising here would turn 0.3 mg into 0.00029999999999999997 and store float
 * noise, and the mapper normalises at read time anyway.
 *
 * @param {Survivor} survivor
 * @returns {Record<string, number>}
 */
export function buildNutrientEntry({ food }) {
  /** @type {Record<string, number>} */
  const entry = {};
  for (const nutrient of [...food.foodNutrients].sort(
    (a, b) => a.nutrientId - b.nutrientId
  ))
    entry[nutrient.nutrientId] = nutrient.value;
  return entry;
}

/**
 * A JSON collection with one entry per line, which is the shape ADR-0047 §3 asks
 * for and neither of `JSON.stringify`'s two modes produces. Pretty-printing
 * would put every nutrient on its own line and diff 4.7 MB as half a million of
 * them; compact printing would put the whole corpus on one line and diff as a
 * single changed line nobody can read.
 */
function linePerEntry(open, close, lines) {
  return lines.length
    ? `${open}\n${lines.join(",\n")}\n${close}`
    : open + close;
}

/** The search index, serialised as one food per line, sorted by `fdcId` (§3). */
export function serialiseIndex(artifact) {
  return (
    [
      "{",
      `"artifact": "usda-search-index",`,
      `"schema_version": ${artifact.schema_version},`,
      `"generated_from": ${linePerEntry(
        "[",
        "]",
        artifact.generated_from.map((a) => JSON.stringify(a))
      )},`,
      `"foods": ${linePerEntry(
        "[",
        "]",
        artifact.foods.map((row) => JSON.stringify(row))
      )}`,
      "}",
    ].join("\n") + "\n"
  );
}

/** The nutrient store, serialised as one food per line, keyed by `fdcId` (§3). */
export function serialiseNutrientStore(artifact) {
  const pair = ([key, value]) =>
    `${JSON.stringify(String(key))}: ${JSON.stringify(value)}`;
  return (
    [
      "{",
      `"artifact": "usda-nutrient-store",`,
      `"schema_version": ${artifact.schema_version},`,
      `"generated_from": ${linePerEntry(
        "[",
        "]",
        artifact.generated_from.map((a) => JSON.stringify(a))
      )},`,
      `"nutrients": ${linePerEntry("{", "}", Object.entries(artifact.nutrients).map(pair))},`,
      `"foods": ${linePerEntry("{", "}", Object.entries(artifact.foods).map(pair))}`,
      "}",
    ].join("\n") + "\n"
  );
}

/** Both artifacts, built over one corpus. */
export function buildArtifacts(survivors, archives, app) {
  const dictionary = collectNutrientDictionary(survivors.map((s) => s.food));
  const generated_from = generatedFrom(archives);
  const nutrients = {};
  for (const id of [...dictionary.keys()].sort((a, b) => a - b))
    nutrients[id] = dictionary.get(id);
  const foods = {};
  for (const survivor of survivors)
    foods[survivor.food.fdcId] = buildNutrientEntry(survivor);

  return {
    index: {
      schema_version: SCHEMA_VERSION,
      generated_from,
      foods: survivors.map((survivor) => buildIndexRow(survivor, app)),
    },
    nutrientStore: {
      schema_version: SCHEMA_VERSION,
      generated_from,
      nutrients,
      foods,
    },
  };
}

// ---------------------------------------------------------------------------
// Reading the archives, and the run
// ---------------------------------------------------------------------------

/**
 * Every record of one archive, projected. The digest is checked first, and this
 * is not a duplicate of `usda:backup verify`: both artifacts state the bytes
 * they were generated from, so generating from bytes the manifest does not
 * describe would publish a provenance claim that is simply false.
 *
 * Records arrive one at a time from `usda-archive.mjs` because SR Legacy
 * inflates to 210 MB of JSON; what survives is the projection, which is a
 * twentieth of that.
 */
async function readArchive(archive, dir) {
  const path = join(dir, archive.file);
  const zip = await readFile(path).catch(() => null);
  if (zip === null)
    throw new Error(
      `${archive.file} is not in ${dir}. Run \`pnpm usda:backup fetch\` first.`
    );
  const sha256 = createHash("sha256").update(zip).digest("hex");
  if (sha256 !== archive.sha256)
    throw new Error(
      `${archive.file}: sha256 ${sha256}, manifest says ${archive.sha256}. ` +
        "Generating from undescribed bytes would put a false release in both artifacts."
    );

  const entries = [];
  const counted = await countArchiveRecords(zip, archive.root_key, (text) =>
    entries.push(projectArchiveFood(JSON.parse(text)))
  );
  if (!counted.found)
    throw new Error(
      `${archive.file}: no "${archive.root_key}" array inside; the archive's shape has changed`
    );
  if (counted.records !== archive.records)
    throw new Error(
      `${archive.file}: ${counted.records} records, manifest says ${archive.records}`
    );
  return entries;
}

const kib = (bytes) => `${Math.round(bytes / 1024)} KiB`;

/**
 * Raw, gzip-9 and brotli-11 bytes for one artifact.
 *
 * Every compressor is named beside its number, and all three are printed rather
 * than one. A size quoted without its compressor is how "361 KiB" survived three
 * ADRs before #120 caught it, and the two figures that disagreed there were the
 * same artifact under gzip and brotli.
 */
export function measure(text) {
  const raw = Buffer.byteLength(text);
  return {
    raw,
    gzip: gzipSync(text, { level: 9 }).length,
    brotli: brotliCompressSync(Buffer.from(text), {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: raw,
      },
    }).length,
  };
}

/**
 * How long `JSON.parse` takes on this machine, in milliseconds: the fastest of
 * several warmed runs, because a single timing on a busy machine measures the
 * machine rather than the artifact, and ADR-0047 §2's split rests on the ratio
 * between these two numbers.
 *
 * It is a Node figure on a dev machine and says nothing about a phone. The
 * in-app measurement is #113's, and it is the one that decides whether the
 * nutrient store ever needs a Worker.
 */
function parseMs(text) {
  let best = Infinity;
  for (let run = 0; run < 5; run++) {
    const started = process.hrtime.bigint();
    JSON.parse(text);
    best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
  }
  return best;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    if (at === -1) return fallback;
    if (!args[at + 1]) throw new Error(`--${name} needs a path after it`);
    return args[at + 1];
  };
  const dir = resolve(ROOT, flag("dir", ".usda-backup"));
  const out = resolve(ROOT, flag("out", join("public", "usda")));
  const reportOnly = args.includes("--report");

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const archives = BUNDLE_DATASETS.map((dataset) => {
    const archive = manifest.archives.find((a) => a.dataset === dataset);
    if (!archive) throw new Error(`no "${dataset}" archive in the manifest`);
    return archive;
  });

  const scratch = await mkdtemp(join(tmpdir(), "usda-bundle-"));
  const app = assertAppExports(await loadAppModule(scratch));
  await rm(scratch, { recursive: true, force: true });

  const entries = [];
  for (const archive of archives) {
    process.stdout.write(`  .. ${archive.file}\n`);
    entries.push(...(await readArchive(archive, dir)));
  }

  const { survivors, dropped, twinned, identities } = buildCorpus(
    groupByIdentity(entries),
    app
  );
  const { index, nutrientStore } = buildArtifacts(survivors, archives, app);
  const indexText = serialiseIndex(index);
  const nutrientText = serialiseNutrientStore(nutrientStore);

  const merged = index.foods.filter((row) => row.merged_from).length;
  const withPortions = index.foods.filter((row) => row.portions).length;
  const nutrientCount = survivors.reduce(
    (total, s) => total + s.food.foodNutrients.length,
    0
  );
  console.log(
    `\n${identities.toLocaleString("en-GB")} food identities across ${archives.length} archives, ` +
      `${twinned} twinned; ${survivors.length.toLocaleString("en-GB")} survive the ADR-0042 filters ` +
      `(${dropped.brand_specific} brand-specific, ${dropped.processed} packaged or processed, ` +
      `${dropped.prepared} prepared or composite dropped)`
  );
  console.log(
    `  ${merged} rows name a twin in merged_from, ${withPortions} carry portions, ` +
      `${Object.keys(nutrientStore.nutrients).length} distinct nutrient ids ` +
      `(${(nutrientCount / survivors.length).toFixed(1)} per food)`
  );

  console.log("");
  for (const [label, text] of [
    ["search index", indexText],
    ["nutrient store", nutrientText],
  ]) {
    const size = measure(text);
    console.log(
      `  ${label.padEnd(15)} ${kib(size.raw).padStart(9)} raw, ` +
        `${kib(size.gzip).padStart(8)} gzip-9, ${kib(size.brotli).padStart(8)} brotli-11; ` +
        `JSON.parse ${parseMs(text).toFixed(2)} ms (best of 5, Node)`
    );
  }

  if (reportOnly) {
    console.log("\n--report: measured only, nothing written.");
    return;
  }
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "search-index.json"), indexText);
  await writeFile(join(out, "nutrient-store.json"), nutrientText);
  console.log(
    `\nwritten to ${out}/search-index.json and ${out}/nutrient-store.json`
  );
}

// Only when run, never on import: everything above is unit-tested, and inflating
// 210 MB of JSON is not something a test suite should be made to do.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  // A missing or wrong archive is an operator problem with a known remedy, not a
  // crash: say what to run, and keep the stack for genuine bugs.
  await main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
