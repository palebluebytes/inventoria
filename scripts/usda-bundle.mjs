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
 * **Nothing here restates app logic.** The ADR-0042 reference-food filters and
 * ADR-0048 §5's dry-basis filter come out of `src/lib/food/usda-food-kind.ts`;
 * the ADR-0045 §2 twin merge, the nutrition panel, the portion mapping and
 * ADR-0048 §6's no-energy filter come out of `src/lib/food/usda-fdc.ts`. Both
 * are loaded through esbuild (see `loadAppModule`). A bundled row is therefore
 * exactly the row a live search would have produced, and a filter retune cannot
 * leave the artifact behind.
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
 *
 * What the artifacts are SHAPED like and what the finished bytes look like is
 * `usda-artifacts.mjs` — the schema version, the three builders, and ADR-0047 §3's
 * per-line layout and the size report beside it. This file decides what ships;
 * that one decides how it is written, and the two change for different reasons.
 * How the app's own filters, merge and ranking are reached at all is
 * `usda-app-module.mjs`, which is ADR-0047 §4's import-don't-copy rule.
 */

import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { countArchiveRecords } from "./usda-archive.mjs";
import { assertAppExports, loadAppModule } from "./usda-app-module.mjs";
import {
  buildArtifacts,
  kib,
  measure,
  parseMs,
  serialiseIndex,
  serialiseNutrientStore,
} from "./usda-artifacts.mjs";
import {
  compareToPublished,
  fetchPublishedArchives,
} from "./usda-releases.mjs";
import {
  admitLocalVocabulary,
  assertVocabularyHolds,
  buildLocalVocabularySection,
  buildVocabularySection,
  deriveVocabulary,
  describeVocabulary,
  readTaxonomyGroups,
  readVocabularySource,
  retrievalCounter,
} from "./usda-vocabulary.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");
/** Where the committed artifacts live, and where `pnpm build` picks them up. */
const ARTIFACT_DIR = join(ROOT, "public", "usda");

/**
 * The datasets the corpus is built from, in the manifest's own naming. Survey is
 * deliberately absent: search has never read it (ADR-0045) and bundling it would
 * ship 5,432 composite dishes the ADR-0042 filters exist to drop.
 */
export const BUNDLE_DATASETS = ["Foundation Foods", "SR Legacy"];

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
 * The app's own logic, in the shape `loadAppModule` hands it over: exactly what
 * `usda-app-module.mjs` names in its six rosters, and nothing this script is
 * allowed to reimplement.
 *
 * Described here rather than beside the loader because it is stated in terms of
 * the shapes above — `BundleFood`, `MergedSource`, `Survivor` — which belong to
 * what this file builds. The loader composes named exports and has no opinion
 * about their types.
 *
 * @typedef {object} AppModule
 * @property {(description: string) => boolean} isBrandSpecific
 * @property {(description: string) => boolean} isProcessedProduct
 * @property {(foodCategory: string | undefined, description: string) => boolean} isPreparedProduct
 * @property {(description: string) => boolean} isDryBasisRecord
 * @property {(description: string) => boolean} isManufacturingInput
 * @property {(food: BundleFood) => boolean} fdcReportsNoEnergy
 * @property {(food: BundleFood, splitNdbNumbers: ReadonlySet<number>) => string | number} fdcIdentityKey
 * @property {(group: BundleFood[]) => { food: BundleFood, merged_from: MergedSource[] }} resolveFdcGroup
 * @property {(description: string) => string} stripArchiveBoilerplate
 * @property {(descriptions: string[], surviving: string) => string[]} twinSearchAliases
 * @property {(food: BundleFood, merged_from: MergedSource[]) => { attributes: Record<string, any> }} mapFdcFoodToPayload
 * @property {(portions: Survivor["foodPortions"]) => Portion[]} mapFdcPortions
 * @property {(description: string) => object} readReferenceFoodName
 * @property {(query: string) => (name: object) => { tier: number }} compileReferenceFoodQuery
 * @property {readonly string[]} DENIED_VOCABULARY_TAGS
 * @property {readonly { key: string, targets: readonly string[], lands_on: string, why: string }[]} LOCAL_VOCABULARY
 * @property {number} LOCAL_VOCABULARY_CEILING
 * @property {(index: object) => { foods: object[] }} buildSearchCorpus
 * @property {(corpus: object, query: string) => { hits: { row: { description: string } }[] }} searchIndexRows
 * @property {(rows: { fdcId: number, description: string }[]) => { renamed: ReadonlyMap<number, string>, dropped: ReadonlyMap<number, "collision" | "preparation_sibling"> }} resolveShippedNames
 * @property {(description: string) => string} stripNonNamingQualifiers
 * @property {readonly TwinLedgerEntry[]} TWIN_LEDGER
 * @property {ReadonlySet<number>} SPLIT_TWIN_NDB_NUMBERS
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
 * live search never produced. The adjudicated splits travel the same way, as the
 * key's own argument (ADR-0051), so the refusal cannot drift from the rule.
 *
 * `splitNdbNumbers` is overridable for one caller: passing an EMPTY set groups by
 * USDA's numbering alone, which is the population {@link assertTwinLedgerCovers}
 * is a census of. Asked with the splits applied it would find no pair at all,
 * because a split pair's two records key apart by construction — and would then
 * report the whole ledger as stale.
 *
 * @param {{ food: BundleFood }[]} entries
 * @param {AppModule} app
 */
export function groupByIdentity(
  entries,
  app,
  splitNdbNumbers = app.SPLIT_TWIN_NDB_NUMBERS
) {
  const groups = new Map();
  for (const entry of entries) {
    const key = app.fdcIdentityKey(entry.food, splitNdbNumbers);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
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
 * The corpus with USDA's commercial origin qualifiers taken out of its names,
 * and the rows whose name that left already taken (ADR-0056).
 *
 * **Where this runs is load-bearing in both directions.** It is after
 * {@link assertTwinNamesRetrieve}, because that check is a question about the
 * MERGE and has to be asked of the names USDA actually wrote — a renamed row
 * cannot answer to the archived description it came from, and asking it to
 * would fail a check about something else entirely. It is before the vocabulary
 * derivation, because ADR-0049 §3's filters ask what the FINISHED corpus
 * retrieves, and after this the finished corpus is sixteen rows
 * short and 355 names different.
 *
 * Aliases are renamed with the descriptions. None carries an origin qualifier
 * today, so this reaches nothing — but an alias IS a name the row answers to
 * (ADR-0050 §4), and a rule that took the words out of one kind of name while
 * leaving them in the other would quietly make `new zealand` searchable again
 * the first time a refresh produced such a twin.
 */
export function applyShippedNames(survivors, app) {
  const { renamed, dropped } = app.resolveShippedNames(
    survivors.map((s) => ({
      fdcId: s.food.fdcId,
      description: s.food.description,
    }))
  );
  const kept = [];
  for (const survivor of survivors) {
    if (dropped.has(survivor.food.fdcId)) continue;
    const description =
      renamed.get(survivor.food.fdcId) ?? survivor.food.description;
    // Every surviving row, not only the renamed ones: a row's own description
    // can be clean while a name the twin merge discarded is not, and `also` is
    // ranked against exactly like a description (`bestNameKey`).
    const { also: discarded, ...rest } = survivor;
    const also = [
      ...new Set((discarded ?? []).map(app.stripNonNamingQualifiers)),
    ].filter((alias) => alias !== description);
    kept.push({
      ...rest,
      food: { ...survivor.food, description },
      ...(also.length ? { also } : {}),
    });
  }

  const origin_dropped = { collision: 0, preparation_sibling: 0 };
  for (const reason of dropped.values()) origin_dropped[reason]++;
  return { survivors: kept, renamed: renamed.size, origin_dropped };
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
/**
 * The survivors as {@link retrievalCounter} reads them: every name a row answers
 * to, which after ADR-0050 is its description and its aliases.
 *
 * Its own function because two counters are built from it, and ADR-0049's second
 * one has to be fresh — a check handed the derivation's memoised counter reads
 * back the answers that admitted each phrase and can never fail. What must not
 * differ between them is the corpus; what must differ is the cache.
 *
 * @param {Survivor[]} survivors
 */
const retrievalRows = (survivors) =>
  survivors.map((survivor) => ({
    description: survivor.food.description,
    also: survivor.also,
  }));

/**
 * Refuses a corpus holding a twin pair nobody has adjudicated, and a ledger entry
 * the archives no longer hold (ADR-0051).
 *
 * The merge is decided at grouping time, before a filter has run, so this asks
 * the GROUPS rather than the survivors — the pair behind `Orange juice, raw` is
 * one whose merged row is dropped, and skipping it is how that food went missing
 * with no judgement ever made about it.
 *
 * It fails in BOTH directions on purpose. A pair the ledger does not name is an
 * unexamined merge, which is the defect this whole record exists to close. A
 * ledger entry the archives never produce is a verdict about words USDA has
 * moved past, and leaving it would let the census claim a coverage it no longer
 * has. Either way the answer is to adjudicate, not to default.
 *
 * The comparison is `ndbNumber` plus BOTH descriptions, boilerplate stripped,
 * because the verdict was reached by reading those words. A refresh that rewrites
 * either one stops the build rather than silently reusing a judgement about a
 * different name.
 *
 * A generation that stops beats a test that goes red later, for the reason
 * {@link assertTwinNamesRetrieve} gives: the population is a function of USDA's
 * own `ndbNumber` assignments, and the next mirror refresh can introduce twins
 * nobody has looked at.
 *
 * Asks for the two things it reads rather than the whole {@link AppModule}, so a
 * test can hand it one entry and a strip without standing up a filter roster.
 *
 * @typedef {readonly [ndbNumber: number, reason: string, foundation: string, sr_legacy: string]} TwinLedgerEntry
 *
 * @param {Map<string | number, { food: BundleFood }[]>} groups
 * @param {{ TWIN_LEDGER: readonly TwinLedgerEntry[], stripArchiveBoilerplate: (description: string) => string }} app
 * @returns {number} how many adjudicated pairs were matched
 */
export function assertTwinLedgerCovers(groups, app) {
  const strip = (description) => app.stripArchiveBoilerplate(description);
  const key = (ndbNumber, foundation, sr_legacy) =>
    `${ndbNumber}\u0000${foundation}\u0000${sr_legacy}`;

  const unseen = new Map(
    app.TWIN_LEDGER.map((entry) => [key(entry[0], entry[2], entry[3]), entry])
  );

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const foundation = group.find((e) => e.food.dataType === "Foundation");
    const twin = group.find((e) => e !== foundation);
    // Every pair in both archives is one Foundation record and one SR Legacy
    // record; a group of another shape is a change in USDA's data this ledger
    // has never been asked about.
    if (!foundation || !twin || group.length > 2)
      throw new Error(
        `${group.length} records share the identity of ` +
          `"${group[0].food.description}". The twin ledger adjudicates pairs of ` +
          "one Foundation and one SR Legacy record, and this is neither."
      );
    const ndbNumber = foundation.food.ndbNumber;
    const found = key(
      ndbNumber,
      strip(foundation.food.description),
      strip(twin.food.description)
    );
    if (!unseen.delete(found))
      throw new Error(
        `no twin-ledger verdict for ndbNumber ${ndbNumber}: ` +
          `"${strip(foundation.food.description)}" and ` +
          `"${strip(twin.food.description)}". USDA numbered two records alike ` +
          "and nobody has decided whether they are one food. Adjudicate it in " +
          "src/lib/food/usda-twin-ledger.ts against " +
          "docs/research/145-twin-fusion-adjudication.md §6."
      );
  }

  if (unseen.size)
    throw new Error(
      `the twin ledger holds ${unseen.size} entr` +
        (unseen.size === 1 ? "y" : "ies") +
        " the archives no longer produce, the first being ndbNumber " +
        `${[...unseen.values()][0][0]} ("${[...unseen.values()][0][2]}"). ` +
        "A verdict about words USDA has moved past is not coverage; re-read the " +
        "pair and update or remove the entry."
    );

  return app.TWIN_LEDGER.length;
}

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

  // Two groupings, and the order matters. The first asks what USDA's numbering
  // makes, which is the population the ledger adjudicates; the second applies
  // that adjudication and is what the corpus is built from (ADR-0051).
  const adjudicated = assertTwinLedgerCovers(
    groupByIdentity(entries, app, new Set()),
    app
  );
  const groups = groupByIdentity(entries, app);
  const {
    survivors: filtered,
    dropped,
    twinned,
    twinned_survivors,
    identities,
  } = buildCorpus(groups, app);
  // Asked of USDA's own names, so it has to come before the rename (ADR-0056 §4).
  const twinNames = assertTwinNamesRetrieve(groups, filtered, app);
  const { survivors, renamed, origin_dropped } = applyShippedNames(
    filtered,
    app
  );

  // After the corpus, never before: both of ADR-0049 §3's filters ask what the
  // FINISHED corpus retrieves, so a group's members are compared against the
  // rows that survived rather than against the archives they came from.
  const countMatches = retrievalCounter(retrievalRows(survivors), app);
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
    retrievalCounter(retrievalRows(survivors), app)
  );
  const { index, nutrientStore } = buildArtifacts(
    survivors,
    archives,
    app,
    buildVocabularySection(vocabulary.expansions, manifest.vocabulary),
    buildLocalVocabularySection(app.LOCAL_VOCABULARY)
  );
  // Nothing is written until this returns: an entry whose expected row has moved
  // stops the generation (ADR-0049's #141 Amendment).
  const hand_written = admitLocalVocabulary(index, app);
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
  // Reported rather than assumed, for the reason every other tally here is:
  // a rule whose reach nobody measured is a hole nobody can see (ADR-0056 §5).
  console.log(
    `  ${renamed} lose a commercial origin or USDA's aisle label from their ` +
      `name; ${origin_dropped.collision} then collide with a row that named no ` +
      `origin, and ${origin_dropped.preparation_sibling} follow as other ` +
      "preparations of the same food"
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
    `  ${adjudicated} twin pairs adjudicated, ` +
      `${app.SPLIT_TWIN_NDB_NUMBERS.size} of them refused the merge (ADR-0051)`
  );
  console.log(
    `  ${withPortions} rows carry portions, ` +
      `${Object.keys(nutrientStore.nutrients).length} distinct nutrient ids ` +
      `(${(nutrientCount / survivors.length).toFixed(1)} per food)`
  );

  console.log(`\n${describeVocabulary(vocabulary)}\n${hand_written}`);

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
