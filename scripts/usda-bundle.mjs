#!/usr/bin/env node
/**
 * Generating the bundled USDA search index and nutrient store (ADR-0047).
 *
 *   pnpm usda:bundle              # regenerate both artifacts into public/usda/
 *   pnpm usda:bundle --report     # measure and print, write nothing
 *
 * Flags: --dir <path> (where the archives are, default .usda-backup),
 * --skip-freshness (generate without asking USDA what it publishes).
 *
 * Why this exists: ADR-0047 retires the FoodData Central API and ships USDA's
 * own bulk distribution instead, so food search works with no key, no quota and
 * no network. The two artifacts this writes are COMMITTED (§3) — a clone builds
 * with no archives, no network and no credentials, and a mirror refresh arrives
 * as a reviewable diff rather than a silent rebuild.
 *
 * Two properties are load-bearing and everything below is shaped by them.
 *
 * **Nothing here restates app logic.** The ADR-0042 reference-food filters,
 * ADR-0048 §5's dry-basis and no-energy filters, the ADR-0045 §2 twin merge, the
 * nutrition panel and the portion mapping all come out of
 * `src/lib/food/usda-fdc.ts` itself, loaded through esbuild (see
 * `loadAppModule`). A bundled row is therefore exactly the row a live search
 * would have produced, and a filter retune cannot leave the artifact behind.
 * The no-energy filter is the sharpest case: the same predicate decides whether
 * a row ships here and whether the food card will log it (ADR-0048 §6).
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
 * reproduce. The pinned vocabulary source beside them follows the same rule.
 *
 * The search index also carries the derived vocabulary (ADR-0049). That
 * derivation lives in `usda-vocabulary.mjs` and runs from {@link main} after the
 * corpus is final, because its filters ask what the FINISHED corpus retrieves.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { countArchiveRecords } from "./usda-archive.mjs";
import {
  compareToPublished,
  fetchPublishedArchives,
} from "./usda-releases.mjs";
import {
  RANKING_EXPORTS,
  VOCABULARY_EXPORTS,
  assertVocabularyHolds,
  buildVocabularySection,
  deriveVocabulary,
  describeVocabulary,
  readTaxonomyGroups,
  readVocabularySource,
  retrievalCounter,
} from "./usda-vocabulary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");
const APP_MODULE = join(ROOT, "src", "lib", "food", "usda-fdc.ts");
const RANKING_MODULE = join(
  ROOT,
  "src",
  "lib",
  "food",
  "reference-food-ranking.ts"
);
const VOCABULARY_MODULE = join(
  ROOT,
  "src",
  "lib",
  "food",
  "food-vocabulary.ts"
);
/** Where the committed artifacts live, and where `pnpm build` picks them up. */
const ARTIFACT_DIR = join(ROOT, "public", "usda");

/**
 * Bumped when either artifact's shape changes, so a reader can refuse an old one.
 *
 * 2 adds the search index's `vocabulary_off` section (ADR-0049 §4). 3 adds a
 * row's `also`, the names the twin merge discarded (#137). Both files carry the
 * version because both are generated together from one corpus, and a pair that
 * disagreed about their version would be the bug the number exists to catch.
 */
export const SCHEMA_VERSION = 3;

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
  "isDryBasisRecord",
  "isManufacturingInput",
  "fdcReportsNoEnergy",
  "fdcIdentityKey",
  "resolveFdcGroup",
  "stripArchiveBoilerplate",
  "twinSearchAliases",
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
 * The app's own logic, in the shape {@link loadAppModule} hands it over: exactly
 * {@link APP_EXPORTS}, and nothing this script is allowed to reimplement.
 *
 * @typedef {object} AppModule
 * @property {(description: string) => boolean} isBrandSpecific
 * @property {(description: string) => boolean} isProcessedProduct
 * @property {(foodCategory: string | undefined, description: string) => boolean} isPreparedProduct
 * @property {(description: string) => boolean} isDryBasisRecord
 * @property {(description: string) => boolean} isManufacturingInput
 * @property {(food: BundleFood) => boolean} fdcReportsNoEnergy
 * @property {(food: BundleFood) => string | number} fdcIdentityKey
 * @property {(group: BundleFood[]) => { food: BundleFood, merged_from: MergedSource[] }} resolveFdcGroup
 * @property {(description: string) => string} stripArchiveBoilerplate
 * @property {(descriptions: string[], surviving: string) => string[]} twinSearchAliases
 * @property {(food: BundleFood, merged_from: MergedSource[]) => { attributes: Record<string, any> }} mapFdcFoodToPayload
 * @property {(portions: Survivor["foodPortions"]) => Portion[]} mapFdcPortions
 * @property {(description: string) => object} readReferenceFoodName
 * @property {(query: string) => (name: object) => { tier: number }} compileReferenceFoodQuery
 * @property {readonly string[]} DENIED_VOCABULARY_TAGS
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
 * @property {string[]} [also]
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
 * @property {string[]} [also]
 */

// ---------------------------------------------------------------------------
// Reaching the app's own logic
// ---------------------------------------------------------------------------

/**
 * Every app module this script borrows from, with what it takes from each.
 *
 * One table rather than three call sites, so the entry {@link loadAppModule}
 * writes and the check {@link assertAppExports} runs cannot fall out of step
 * with each other.
 */
const BORROWED = [
  [APP_MODULE, APP_EXPORTS],
  [RANKING_MODULE, RANKING_EXPORTS],
  [VOCABULARY_MODULE, VOCABULARY_EXPORTS],
];

/**
 * Bundles the app modules above to a temporary ES module and imports them, so
 * this plain-Node script can call the app's TypeScript directly.
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
 * The entry re-exports only what {@link BORROWED} names, so the bundle
 * tree-shakes to a few tens of kB and pulls in no browser API this script would
 * have to stub.
 */
export async function loadAppModule(scratchDir) {
  const entry = join(scratchDir, "app-entry.ts");
  const out = join(scratchDir, "app-bundle.mjs");
  await writeFile(
    entry,
    BORROWED.map(
      ([module, names]) =>
        `export { ${names.join(", ")} } from ${JSON.stringify(module)};\n`
    ).join("")
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

/**
 * Fails unless the app module exports everything {@link APP_EXPORTS} names.
 *
 * @returns {AppModule}
 */
export function assertAppExports(app) {
  for (const [module, names] of BORROWED) {
    const missing = names.filter((name) => app[name] === undefined);
    if (missing.length)
      throw new Error(
        `${module} no longer exports ${missing.join(", ")}. The bundle is ` +
          "generated from the app's own filters, merge and ranking, so a rename " +
          "there has to be followed here rather than forked."
      );
  }
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
 * Groups projected records by the app's own `fdcIdentityKey`, preserving arrival
 * order.
 *
 * The key comes from the app rather than being mirrored here because it is the
 * single input that decides WHICH records merge: a twin paired differently at
 * generation time than at search time would put values in a bundled row that a
 * live search never produced.
 *
 * @param {{ food: BundleFood }[]} entries
 * @param {AppModule} app
 */
export function groupByIdentity(entries, app) {
  const groups = new Map();
  for (const entry of entries) {
    const key = app.fdcIdentityKey(entry.food);
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
 * so the six tallies sum to the foods removed rather than double-counting a
 * food two filters agree on.
 *
 * The last two are ADR-0048 §5's and #144's, and their position after
 * `resolveFdcGroup` is load-bearing: five oils report no energy of their own and
 * borrow their SR Legacy twin's, so filtering before the merge would drop foods
 * the merge rescues.
 *
 * @param {Map<string | number, { food: BundleFood, foodPortions: Survivor["foodPortions"] }[]>} groups
 * @param {AppModule} app
 * `twinned` counts the identities USDA holds two records for and
 * `twinned_survivors` how many of those the filters kept, because the two
 * numbers are what explain the merged_from count on the artifact: most twinned
 * pairs are brand-specific or packaged foods that never reach it.
 *
 * @returns {{ survivors: Survivor[], dropped: Record<string, number>, twinned: number, twinned_survivors: number, identities: number }}
 */
export function buildCorpus(groups, app) {
  /** @type {Survivor[]} */
  const survivors = [];
  const dropped = {
    brand_specific: 0,
    processed: 0,
    prepared: 0,
    dry_basis: 0,
    manufacturing_input: 0,
    no_energy: 0,
  };
  let twinned = 0;
  let twinned_survivors = 0;

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
    // A dry-basis assay is not a food (ADR-0048 §5) — a food-kind judgement of
    // the same species as the three above, and it holds whether or not the
    // record ever gains an energy value, so it is asked first.
    if (app.isDryBasisRecord(food.description)) {
      dropped.dry_basis++;
      continue;
    }
    // Nor is a food-manufacturing input a food (#144) — the same species of
    // judgement, asked in the same place and for the same reason.
    if (app.isManufacturingInput(food.description)) {
      dropped.manufacturing_input++;
      continue;
    }
    // A record with no energy cannot be logged, so it does not ship. The app
    // owns the question — this asks the same one the food card asks of the
    // mapped panel, and does not restate the ids behind it (§6).
    if (app.fdcReportsNoEnergy(food)) {
      dropped.no_energy++;
      continue;
    }
    // Always found: the merge keeps the base record's identity, so the resolved
    // food's fdcId is one the group carries.
    const base = group.find((e) => e.food.fdcId === food.fdcId);
    if (group.length > 1) twinned_survivors++;
    // The names the merge just discarded, so the row still answers to them
    // (#137). Asked of the WHOLE group rather than of `merged_from`, which
    // names only the twins that filled a panel field: a twin that borrowed
    // nothing still took its name with it.
    const also = app.twinSearchAliases(
      group.map((e) => e.food.description),
      food.description
    );
    survivors.push({
      food,
      merged_from,
      foodPortions: base.foodPortions,
      ...(also.length ? { also } : {}),
    });
  }

  survivors.sort((a, b) => a.food.fdcId - b.food.fdcId);
  return {
    survivors,
    dropped,
    twinned,
    twinned_survivors,
    identities: groups.size,
  };
}

/**
 * Refuses a corpus in which USDA holds a name for a surviving food that the
 * finished row no longer answers to.
 *
 * Stated over the ARCHIVES and measured over the finished names, which is what
 * keeps it from restating {@link buildCorpus}: the group is where every name
 * USDA published lives, and the row is where the ones it kept do. An alias the
 * rule failed to emit shows up here as a name that retrieves nothing.
 *
 * The one thing it borrows is the strip, because a name has to be looked for in
 * the spelling an alias would carry — `Cheese, cheddar (Includes foods for
 * USDA's Food Distribution Program)` is USDA saying something about a
 * distribution programme, and no user types it.
 *
 * A generation that stops beats a test that goes red later: the population is a
 * function of USDA's own `ndbNumber` assignments, so the next mirror refresh can
 * introduce twins nobody has looked at, and this is what looks at them (#137).
 *
 * @param {Map<string | number, { food: BundleFood }[]>} groups
 * @param {Survivor[]} survivors
 * @param {AppModule} app
 * @returns {number} how many archived names were checked
 */
export function assertTwinNamesRetrieve(groups, survivors, app) {
  const kept = new Map(survivors.map((s) => [s.food.fdcId, s]));
  let checked = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const survivor = group
      .map((entry) => kept.get(entry.food.fdcId))
      .find(Boolean);
    // The whole identity failed a filter; no name of it is expected to answer.
    if (!survivor) continue;
    const names = [survivor.food.description, ...(survivor.also ?? [])].map(
      (description) => app.readReferenceFoodName(description)
    );
    for (const entry of group) {
      const phrase = app.stripArchiveBoilerplate(entry.food.description);
      const rank = app.compileReferenceFoodQuery(phrase);
      if (!names.some((name) => rank(name).tier > 0))
        throw new Error(
          `USDA holds "${entry.food.description}" under the identity that ships ` +
            `as "${survivor.food.description}", and the shipped row does not ` +
            "answer to it. The merge discarded a name no alias carries."
        );
      checked++;
    }
  }
  return checked;
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
 * @param {AppModule} app
 * @returns {IndexRow}
 */
export function buildIndexRow({ food, merged_from, foodPortions, also }, app) {
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
  if (also?.length) row.also = also;
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

/**
 * A JSON object written as ordered `"key": <already-rendered value>` sections.
 *
 * The two artifacts share this envelope — what they are, the schema a reader has
 * to understand, and the archives behind them — and differ only in the sections
 * that follow it. `vocabulary_off` nests one inside another, which is why this
 * renders no trailing newline and {@link serialiseDocument} adds it.
 */
function renderObject(sections) {
  const body = sections
    .map(([key, rendered]) => `${JSON.stringify(key)}: ${rendered}`)
    .join(",\n");
  return `{\n${body}\n}`;
}

/** {@link renderObject} as a whole file: one trailing newline, as POSIX wants. */
function serialiseDocument(sections) {
  return `${renderObject(sections)}\n`;
}

/** The `generated_from` block both artifacts carry, one archive per line. */
function renderProvenance(generated_from) {
  return linePerEntry(
    "[",
    "]",
    generated_from.map((archive) => JSON.stringify(archive))
  );
}

/**
 * The `vocabulary_off` section, one key per line (ADR-0049 §4).
 *
 * Per line for the reason the foods are: a taxonomy refresh has to diff as the
 * handful of phrases that moved, since the committed map IS the review gate for
 * a source that is unversioned and rewritten in place.
 */
function renderVocabulary(vocabulary) {
  return renderObject([
    ["licence", JSON.stringify(vocabulary.licence)],
    ["source", JSON.stringify(vocabulary.source)],
    ["url", JSON.stringify(vocabulary.url)],
    ["sha256", JSON.stringify(vocabulary.sha256)],
    [
      "expansions",
      linePerEntry(
        "{",
        "}",
        Object.entries(vocabulary.expansions).map(
          ([phrase, targets]) =>
            `${JSON.stringify(phrase)}: ${JSON.stringify(targets)}`
        )
      ),
    ],
  ]);
}

/** The search index, serialised as one food per line, sorted by `fdcId` (§3). */
export function serialiseIndex(artifact) {
  return serialiseDocument([
    ["artifact", '"usda-search-index"'],
    ["schema_version", String(artifact.schema_version)],
    ["generated_from", renderProvenance(artifact.generated_from)],
    ["vocabulary_off", renderVocabulary(artifact.vocabulary_off)],
    [
      "foods",
      linePerEntry(
        "[",
        "]",
        artifact.foods.map((row) => JSON.stringify(row))
      ),
    ],
  ]);
}

/** The nutrient store, serialised as one food per line, keyed by `fdcId` (§3). */
export function serialiseNutrientStore(artifact) {
  const keyed = (entries) =>
    linePerEntry(
      "{",
      "}",
      entries.map(
        ([key, value]) =>
          `${JSON.stringify(String(key))}: ${JSON.stringify(value)}`
      )
    );
  return serialiseDocument([
    ["artifact", '"usda-nutrient-store"'],
    ["schema_version", String(artifact.schema_version)],
    ["generated_from", renderProvenance(artifact.generated_from)],
    ["nutrients", keyed(Object.entries(artifact.nutrients))],
    ["foods", keyed(Object.entries(artifact.foods))],
  ]);
}

/**
 * Both artifacts, built over one corpus.
 *
 * The vocabulary is passed in rather than derived here because it is derived
 * FROM the finished corpus (ADR-0049 §3): the effect filter asks what these
 * survivors retrieve, so it cannot run until they are known.
 *
 * @param {Survivor[]} survivors
 * @param {AppModule} app
 * @param {ReturnType<typeof buildVocabularySection>} vocabulary_off
 */
export function buildArtifacts(survivors, archives, app, vocabulary_off) {
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
      vocabulary_off,
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
/**
 * The manifest entries for the datasets this bundle consumes, in the order it
 * reads them.
 *
 * Exported because a second reader needs the same answer: `usda:ranking-audit`
 * has to know which archives could possibly have produced a shipped row, and it
 * used to restate that as a literal dataset name. The manifest renamed the
 * Survey release and the restatement silently stopped matching, so every one of
 * its 5,432 records was reported as a corpus casualty (#137).
 *
 * @param {{ archives: { dataset: string }[] }} manifest
 */
export function bundleArchives(manifest) {
  return BUNDLE_DATASETS.map((dataset) => {
    const archive = manifest.archives.find((a) => a.dataset === dataset);
    if (!archive) throw new Error(`no "${dataset}" archive in the manifest`);
    return archive;
  });
}

/**
 * Every projected record the bundled datasets hold, digests checked.
 *
 * @param {{ archives: object[] }} manifest
 * @param {string} dir
 */
export async function readBundleArchives(manifest, dir) {
  const entries = [];
  for (const archive of bundleArchives(manifest)) {
    process.stdout.write(`  .. ${archive.file}\n`);
    entries.push(...(await readArchive(archive, dir)));
  }
  return entries;
}

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

/**
 * Refuses to generate against a manifest USDA has moved past (ADR-0047 §12).
 *
 * The mirror stopped being insurance when these artifacts started being
 * generated from it: a release the manifest has not caught up with is not a
 * stale backup, it is a lag shipped to every user until somebody regenerates.
 * Scoped to the datasets the bundle actually reads, so a Survey release nothing
 * here consumes cannot block a generation.
 *
 * `--skip-freshness` is the offline escape hatch, and it is a flag rather than a
 * fallback so that skipping the check is a thing somebody typed.
 */
async function assertMirrorIsCurrent(manifest, archives) {
  let published;
  try {
    published = await fetchPublishedArchives(manifest.release_index);
  } catch (error) {
    throw new Error(
      `could not ask USDA what it publishes: ${error.message}\n` +
        "Pass --skip-freshness to generate from the mirror as it stands."
    );
  }
  const behind = compareToPublished(archives, published).filter(
    (verdict) => verdict.state !== "current"
  );
  if (behind.length)
    throw new Error(
      `${behind.map((verdict) => verdict.message).join("\n")}\n\n` +
        "Refresh the mirror first (docs/how-to-back-up-the-usda-datasets.md): an " +
        "artifact generated from a release USDA has moved past ships that lag to " +
        "every user. Pass --skip-freshness to regenerate from the mirror as it stands."
    );
  for (const verdict of compareToPublished(archives, published))
    process.stdout.write(`  ok  ${verdict.message}\n`);
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
  const reportOnly = args.includes("--report");

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const archives = bundleArchives(manifest);

  if (!args.includes("--skip-freshness"))
    await assertMirrorIsCurrent(manifest, archives);

  const scratch = await mkdtemp(join(tmpdir(), "usda-bundle-"));
  const app = assertAppExports(await loadAppModule(scratch));
  await rm(scratch, { recursive: true, force: true });

  const entries = await readBundleArchives(manifest, dir);

  const groups = groupByIdentity(entries, app);
  const { survivors, dropped, twinned, twinned_survivors, identities } =
    buildCorpus(groups, app);
  const twinNames = assertTwinNamesRetrieve(groups, survivors, app);

  // After the corpus, never before: both of ADR-0049 §3's filters ask what the
  // FINISHED corpus retrieves, so a group's members are compared against the
  // rows that survived rather than against the archives they came from.
  const countMatches = retrievalCounter(
    survivors.map((survivor) => ({
      description: survivor.food.description,
      also: survivor.also,
    })),
    app
  );
  const vocabulary = deriveVocabulary(
    readTaxonomyGroups(await readVocabularySource(manifest.vocabulary, dir)),
    {
      denied: app.DENIED_VOCABULARY_TAGS,
      countMatches,
      corpusSize: survivors.length,
    }
  );
  // Re-measured with a counter of its own, so the check cannot simply agree with
  // the cache that built the map (ADR-0049's two acceptance properties).
  assertVocabularyHolds(
    vocabulary.expansions,
    retrievalCounter(
      survivors.map((survivor) => ({
        description: survivor.food.description,
        also: survivor.also,
      })),
      app
    )
  );
  const { index, nutrientStore } = buildArtifacts(
    survivors,
    archives,
    app,
    buildVocabularySection(vocabulary.expansions, manifest.vocabulary)
  );
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
      `${twinned} twinned; ${survivors.length.toLocaleString("en-GB")} survive the filters ` +
      `(${dropped.brand_specific} brand-specific, ${dropped.processed} packaged or processed, ` +
      `${dropped.prepared} prepared or composite, ${dropped.dry_basis} dry-basis, ` +
      `${dropped.manufacturing_input} manufacturing inputs, ` +
      `${dropped.no_energy} reporting no energy dropped)`
  );
  const aliased = index.foods.filter((row) => row.also);
  const aliasBytes = aliased.reduce(
    (total, row) => total + JSON.stringify(row.also).length + ',"also":'.length,
    0
  );
  console.log(
    `  ${twinned_survivors} twinned foods survive, of which ${merged} borrowed a ` +
      `field and so name a twin in merged_from`
  );
  // Measured, not estimated: #120 caught this artifact being 40% larger than the
  // ADR describing it claimed, on an estimate nobody had re-run.
  console.log(
    `  ${aliased.length} of them answer to a name the merge discarded ` +
      `(${aliased.reduce((n, row) => n + row.also.length, 0)} aliases, ` +
      `${aliasBytes.toLocaleString("en-GB")} bytes of the index); ` +
      `all ${twinNames} archived names retrieve`
  );
  console.log(
    `  ${withPortions} rows carry portions, ` +
      `${Object.keys(nutrientStore.nutrients).length} distinct nutrient ids ` +
      `(${(nutrientCount / survivors.length).toFixed(1)} per food)`
  );

  console.log(`\n${describeVocabulary(vocabulary)}`);

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
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(join(ARTIFACT_DIR, "search-index.json"), indexText);
  await writeFile(join(ARTIFACT_DIR, "nutrient-store.json"), nutrientText);
  console.log(
    `\nwritten to ${ARTIFACT_DIR}/search-index.json and ` +
      `${ARTIFACT_DIR}/nutrient-store.json`
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
