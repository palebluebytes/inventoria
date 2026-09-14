/**
 * Every food USDA published that the corpus does NOT ship, with the rule that
 * removed it and the terms that rule fired on.
 *
 *   pnpm usda:drop-census                    # regenerate docs/research/usda-drop-census.json
 *   pnpm usda:drop-census --dir <path>       # ...from archives elsewhere
 *
 * **Why this has to be generated rather than read.** Every drop rule runs at
 * generation time (ADR-0047 §4), so the shipped index contains only survivors
 * and a dropped record is simply ABSENT from it, with no record anywhere of
 * which rule removed it. `usda-ranking-audit.mjs --explain` answers that one
 * query at a time by re-reading the archives; this answers it for all 3,736 at
 * once, so the question "what was discarded, and why" has a committed answer.
 *
 * The output is COMMITTED, for ADR-0047 §3's reason applied to an account
 * rather than to an artifact: a clone can read what the filters removed with no
 * archives, no network and no 17 MB of USDA zips, and a filter retune arrives as
 * a reviewable diff — this many rows left, these ones, for this reason — rather
 * than as a number in a build log nobody kept. It is written one drop per line
 * so that diff is readable.
 *
 * **It restates nothing.** The merge, the grouping, the seven food-kind
 * judgements, the variant drops and the name drops are all the generator's and
 * the app's own, reached through the same two seams `usda-bundle.mjs` uses. The
 * one thing here that is not borrowed is the ATTRIBUTION (see {@link attribute}),
 * and it is deliberately implementation-blind: it asks the predicate, it does
 * not read the predicate's tables.
 *
 * **It asserts itself.** The rule ORDER below is mirrored from `buildCorpus`
 * rather than borrowed from it — the one place this file could fall out of step
 * with the generator — so {@link main} checks its own survivor count against the
 * shipped index's row count and fails rather than publishing a census that does
 * not add up.
 *
 * Originated on the throwaway `prototype/food-search-explorer` branch, where the
 * question "what is missing, and why" was first asked of the whole corpus at
 * once. The decision came back, and so did this, because a census nobody can
 * reproduce is the thing #156 warns about.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertAppExports, loadAppModule } from "./usda-app-module.mjs";
import {
  bundleArchives,
  groupByIdentity,
  readBundleArchives,
} from "./usda-bundle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");
const OUT_DEFAULT = join(ROOT, "docs", "research", "usda-drop-census.json");

const WORD = /[A-Za-z0-9'’.&-]+/g;

/**
 * The cause of a verdict, found by asking the predicate rather than by reading
 * the predicate's tables.
 *
 * The five food-kind judgements return a boolean and export none of the rosters
 * behind them (`TRADEMARK_DENYLIST`, `PROCESSED_MARKERS`, `PREPARED_DISH_MARKERS`
 * and the rest are module-private). Copying them here to report "matched
 * TRADEMARK_DENYLIST entry Cabot" would be a second copy of ~200 lines of
 * editorial judgement, which is the exact thing ADR-0047 §4 forbids and the
 * exact way the copy would drift.
 *
 * So the attribution is an ABLATION, and what it reports is a MINIMAL SUFFICIENT
 * REMOVAL SET: the smallest set of terms you could delete from the record and
 * have the rule stop firing. That is implementation-blind — it survives a
 * rewrite of the rosters — and it says something more useful than naming a table
 * entry: *these terms are jointly load-bearing for this verdict, and none of
 * them is redundant.*
 *
 * Found by delta minimisation rather than by search over subsets, which is both
 * cheaper (one pass, not n²) and more truthful. Single words and pairs were
 * measured first and were not enough: `Candies, TWIZZLERS CHERRY BITES` needs
 * all three capitalised words removed before `isBrandSpecific` goes quiet
 * (`BRAND_CAPS` only wants one to remain), and
 * `Lemon juice from concentrate, canned or bottled` carries three independent
 * processed markers. Asked for singles and pairs alone, 1,370 of 3,736 drops
 * came back "unattributed" — which was a limit of the question, not a fact
 * about the rules.
 *
 * The CATEGORY is one of the ablatable terms where a rule reads it, because for
 * `isPreparedProduct` it is very often the whole cause: 1,026 drops are records
 * USDA filed under a prepared category (`Baked Products`, `Fast Foods`) whose
 * description says nothing about preparation at all. Attributing those to a word
 * would have been inventing a cause.
 *
 * @param {(description: string, category: string) => boolean} fires
 * @param {string} description
 * @param {string | undefined} category the category when the rule reads one
 * @returns {{ because: string[], because_kind: string }}
 */
export function attribute(fires, description, category) {
  const words = description.match(WORD) ?? [];
  const CATEGORY = words.length; // the category's index, when there is one
  const terms = category === undefined ? words.length : words.length + 1;

  const ask = (kept) => {
    let at = -1;
    const text = description
      .replace(WORD, (word) => (++at, kept.has(at) ? word : ""))
      .replace(/\s{2,}/g, " ")
      .replace(/\s*,(\s*,)+/g, ",")
      .replace(/^[\s,]+|[\s,]+$/g, "");
    return fires(text, kept.has(CATEGORY) ? (category ?? "") : "");
  };

  // Everything removed: if the rule still fires on nothing, no set of terms
  // accounts for it and the census says so rather than guessing.
  const empty = new Set();
  if (ask(empty)) return { because: [], because_kind: "unattributed" };

  // Minimise: put each term back, and keep it back only if the rule stays
  // quiet. What is still missing at the end is minimal — no member of it can be
  // returned without the rule firing again.
  const kept = new Set();
  for (let i = 0; i < terms; i++) {
    kept.add(i);
    if (ask(kept)) kept.delete(i);
  }

  const because = [];
  for (let i = 0; i < terms; i++) {
    if (kept.has(i)) continue;
    because.push(i === CATEGORY ? `category: ${category}` : words[i]);
  }
  const kind =
    because.length === 1
      ? because[0].startsWith("category: ")
        ? "category"
        : "word"
      : because.length === 2
        ? "pair"
        : "words";
  return { because, because_kind: kind };
}

/**
 * Every identity the food-kind filters removed, in the order `buildCorpus`
 * applies them — so a food two rules agree on is attributed to the FIRST one to
 * fire, which is the one that actually removed it.
 *
 * The order is mirrored from `buildCorpus` deliberately and is the one thing
 * here that could fall out of step with it. It is asserted rather than trusted:
 * the survivor count this produces is checked against the shipped artifact's row
 * count by {@link main}, so a reordering or a missing rule shows up as a census
 * that does not add up.
 *
 * @param {Map<string | number, { food: object }[]>} groups
 * @param {object} app
 */
export function censusFoodKind(groups, app) {
  /** @type {object[]} */
  const drops = [];
  /** @type {{ food: object, group: object[], also: string[] }[]} */
  const survivors = [];
  const adjudicatedDishes = new Set(
    app.ADJUDICATED_DISHES.map(([fdcId]) => fdcId)
  );

  // The six food-kind judgements and the id list, in `buildCorpus`'s order.
  // `ablate` is how {@link attribute} re-asks the rule of a reduced record, and
  // `reads_category` is whether the category is one of the terms it may ablate —
  // only `isPreparedProduct` takes one, and for 1,026 records it IS the cause.
  const RULES = [
    {
      name: "brand_specific",
      fires: (food) => app.isBrandSpecific(food.description),
      ablate: (d) => app.isBrandSpecific(d),
    },
    {
      name: "processed",
      fires: (food) => app.isProcessedProduct(food.description),
      ablate: (d) => app.isProcessedProduct(d),
    },
    // Ahead of `prepared`, which would otherwise swallow it: the drink rule
    // lives INSIDE `isPreparedProduct`, so asking the general rule first files
    // all eight of these under it and ablation then reports their cause as the
    // word `with` — true, minimal, and useless to a reader, who learns that a
    // preposition dropped a food. Asked first, they are named by their shape.
    {
      name: "foodservice_record",
      fires: (food) => app.isFoodserviceRecord(food.description),
      ablate: (d) => app.isFoodserviceRecord(d),
    },
    {
      name: "drink_powder",
      fires: (food) => app.isDrinkPowder(food.foodCategory, food.description),
      ablate: (d, category) => app.isDrinkPowder(category, d),
      reads_category: true,
    },
    {
      name: "reconstituted_drink",
      fires: (food) => app.isReconstitutedDrink(food.description),
      ablate: (d) => app.isReconstitutedDrink(d),
    },
    {
      name: "prepared",
      fires: (food) =>
        app.isPreparedProduct(food.foodCategory, food.description),
      ablate: (d, category) => app.isPreparedProduct(category, d),
      reads_category: true,
    },
    {
      name: "adjudicated_dish",
      fires: (food) => adjudicatedDishes.has(food.fdcId),
    },
    {
      name: "cooked_form",
      fires: (food) => app.isCookedForm(food.foodCategory, food.description),
      ablate: (d, category) => app.isCookedForm(category, d),
      reads_category: true,
    },
    {
      name: "dry_basis",
      fires: (food) => app.isDryBasisRecord(food.description),
      ablate: (d) => app.isDryBasisRecord(d),
    },
    {
      name: "manufacturing_input",
      fires: (food) => app.isManufacturingInput(food.description),
      ablate: (d) => app.isManufacturingInput(d),
    },
    {
      name: "superseded",
      fires: (food) => app.SUPERSEDED_FDC_IDS.has(food.fdcId),
    },
    { name: "no_energy", fires: (food) => app.fdcReportsNoEnergy(food) },
  ];

  for (const group of groups.values()) {
    const { food } = app.resolveFdcGroup(group.map((e) => e.food));
    const rule = RULES.find(({ fires }) => fires(food));
    const record = {
      fdcId: food.fdcId,
      description: food.description,
      dataType: food.dataType,
      ...(food.foodCategory ? { foodCategory: food.foodCategory } : {}),
      ...(food.scientificName ? { scientificName: food.scientificName } : {}),
      group: group.map((e) => e.food.description),
      nutrients: food.foodNutrients.length,
      calories:
        food.foodNutrients.find((n) => n.nutrientId === 1008)?.value ?? null,
    };

    if (!rule) {
      const base = group.find((e) => e.food.fdcId === food.fdcId);
      survivors.push({
        food,
        group: group.map((e) => e.food),
        foodPortions: base.foodPortions,
        also: app.twinSearchAliases(
          group.map((e) => e.food.description),
          food.description
        ),
      });
      continue;
    }

    drops.push({
      ...record,
      stage: "food_kind",
      rule: rule.name,
      // `superseded` and `no_energy` have nothing to ablate. One is an id list,
      // because no property of the description decides it — only knowing that
      // napa cabbage and pe-tsai are one vegetable does (ADR-0051's converse).
      // The other reads the PANEL, not the name (ADR-0048 §6). `adjudicated_dish`
      // has nothing to ablate either: it is a read verdict about a whole row.
      ...(rule.ablate
        ? attribute(
            rule.ablate,
            food.description,
            rule.reads_category ? (food.foodCategory ?? "") : undefined
          )
        : { because: [], because_kind: "by_record" }),
    });
  }

  return { drops, survivors };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    if (at === -1) return fallback;
    if (!args[at + 1]) throw new Error(`--${name} needs a value after it`);
    return args[at + 1];
  };
  const dir = resolve(ROOT, flag("dir", ".usda-backup"));
  const out = resolve(ROOT, flag("out", OUT_DEFAULT));

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const archives = bundleArchives(manifest);

  // No freshness check, unlike `usda-bundle.mjs`: this writes nothing a user
  // ever sees, and a census of the mirror as it stands is exactly what the
  // explorer wants beside an index generated from those same bytes. The digests
  // are still checked — `readArchive` refuses undescribed bytes.
  const scratch = await mkdtemp(join(tmpdir(), "usda-drop-census-"));
  const app = assertAppExports(await loadAppModule(scratch));
  await rm(scratch, { recursive: true, force: true });

  process.stdout.write("reading the archives\n");
  const entries = await readBundleArchives(manifest, dir);
  const groups = groupByIdentity(entries, app);

  const { drops, survivors } = censusFoodKind(groups, app);

  // ADR-0061's drops, over the corpus the filters left — the same population
  // and the same order `usda-bundle.mjs` asks them in, because whether a head
  // still keeps a plain row is a fact about the corpus, not about a name.
  const variantRows = survivors.map((s) => ({
    fdcId: s.food.fdcId,
    description: s.food.description,
  }));
  const variantDrops = app.resolveVariantDrops(variantRows);
  const afterVariants = survivors.filter(
    (s) => !variantDrops.has(s.food.fdcId)
  );
  for (const s of survivors) {
    const reason = variantDrops.get(s.food.fdcId);
    if (!reason) continue;
    drops.push({
      fdcId: s.food.fdcId,
      description: s.food.description,
      dataType: s.food.dataType,
      ...(s.food.foodCategory ? { foodCategory: s.food.foodCategory } : {}),
      group: s.group.map((f) => f.description),
      nutrients: s.food.foodNutrients.length,
      calories:
        s.food.foodNutrients.find((n) => n.nutrientId === 1008)?.value ?? null,
      stage: "variant",
      rule: reason,
      // A variant drop is not a property of the name either: every one of the
      // three rules asks what the row's HEAD-PHRASE SIBLINGS look like, so the
      // cause is the sibling that survived, not a word.
      because: [],
      because_kind: "by_siblings",
    });
  }

  // ADR-0056/0062's drops, last, over the corpus the variant rules left.
  const nameVerdict = app.resolveShippedNames(
    afterVariants.map((s) => ({
      fdcId: s.food.fdcId,
      description: s.food.description,
      panelFields: s.food.foodNutrients.length,
      ...(s.also.length ? { also: s.also } : {}),
    }))
  );
  for (const s of afterVariants) {
    const reason = nameVerdict.dropped.get(s.food.fdcId);
    if (!reason) continue;
    drops.push({
      fdcId: s.food.fdcId,
      description: s.food.description,
      dataType: s.food.dataType,
      ...(s.food.foodCategory ? { foodCategory: s.food.foodCategory } : {}),
      group: s.group.map((f) => f.description),
      nutrients: s.food.foodNutrients.length,
      calories:
        s.food.foodNutrients.find((n) => n.nutrientId === 1008)?.value ?? null,
      stage: "name",
      rule: reason,
      because: [],
      because_kind: "by_collision",
    });
  }

  // The two name passes that run after `resolveShippedNames` in the generator.
  // The comparative rule only renames; the enrichment rule also DROPS, taking an
  // unenriched row whose enriched twin has just claimed the plain name, so the
  // census has to replay both or its survivor count will not add up.
  const afterNames = afterVariants.filter(
    (s) => !nameVerdict.dropped.has(s.food.fdcId)
  );
  const renamedRows = afterNames.map((s) => ({
    fdcId: s.food.fdcId,
    description: nameVerdict.renamed.get(s.food.fdcId) ?? s.food.description,
  }));
  const uncontested = app.dropUncontestedQualifiers(renamedRows);
  const trimmedRows = renamedRows.map((row) => ({
    ...row,
    description: uncontested.get(row.fdcId) ?? row.description,
  }));
  const enrichment = app.stripEnrichment(trimmedRows);
  const byId = new Map(afterNames.map((s) => [s.food.fdcId, s]));
  for (const fdcId of enrichment.dropped) {
    const s = byId.get(fdcId);
    const row = trimmedRows.find((r) => r.fdcId === fdcId);
    drops.push({
      fdcId,
      description: row.description,
      dataType: s.food.dataType,
      ...(s.food.foodCategory ? { foodCategory: s.food.foodCategory } : {}),
      group: s.group.map((f) => f.description),
      nutrients: s.food.foodNutrients.length,
      calories:
        s.food.foodNutrients.find((n) => n.nutrientId === 1008)?.value ?? null,
      stage: "name",
      rule: "enrichment_duplicate",
      // Relational like the two above it: what removed this row is the twin that
      // took its name, never a word in it.
      because: [],
      because_kind: "by_collision",
    });
  }

  // The frozen-mirror rule, last of all and over the names that will ship —
  // where the generator runs it, and for its reason: until the origin strip has
  // run these rows still say `New Zealand, imported` and no mirror can be seen.
  const finalRows = trimmedRows
    .filter((row) => !enrichment.dropped.has(row.fdcId))
    .map((row) => ({
      ...row,
      description: enrichment.renamed.get(row.fdcId) ?? row.description,
    }));
  const mirrors = app.resolveFrozenMirrors(finalRows);
  for (const fdcId of mirrors) {
    const s = byId.get(fdcId);
    const row = finalRows.find((r) => r.fdcId === fdcId);
    drops.push({
      fdcId,
      description: row.description,
      dataType: s.food.dataType,
      ...(s.food.foodCategory ? { foodCategory: s.food.foodCategory } : {}),
      group: s.group.map((f) => f.description),
      nutrients: s.food.foodNutrients.length,
      calories:
        s.food.foodNutrients.find((n) => n.nutrientId === 1008)?.value ?? null,
      stage: "name",
      rule: "frozen_mirror",
      // Relational: what removed it is the unfrozen cut that ships, never a word.
      because: [],
      because_kind: "by_collision",
    });
  }

  const shipped = afterNames.length - enrichment.dropped.size - mirrors.size;

  // The census adds up or it is wrong. The rule ORDER above is mirrored from
  // `buildCorpus` rather than borrowed from it — the one place this script could
  // fall out of step with the generator — and this is what notices.
  const index = JSON.parse(
    await readFile(join(ROOT, "public", "usda", "search-index.json"), "utf8")
  );
  if (shipped !== index.foods.length)
    throw new Error(
      `census says ${shipped} rows survive, the shipped index has ${index.foods.length}. ` +
        "The drop order here has fallen out of step with buildCorpus, or the " +
        "artifact was generated from different archives."
    );

  const counts = {};
  for (const drop of drops)
    counts[`${drop.stage}:${drop.rule}`] =
      (counts[`${drop.stage}:${drop.rule}`] ?? 0) + 1;
  const attribution = {};
  for (const drop of drops)
    attribution[drop.because_kind] = (attribution[drop.because_kind] ?? 0) + 1;

  drops.sort((a, b) => a.fdcId - b.fdcId);
  const census = {
    artifact: "usda-drop-census",
    schema_version: index.schema_version,
    generated_from: index.generated_from,
    identities: groups.size,
    shipped,
    dropped: drops.length,
    counts,
    attribution,
    drops,
  };

  await mkdir(dirname(out), { recursive: true });
  // One drop per line, compact — the shape `usda-artifacts.mjs` uses, and for
  // exactly its reason: the file is committed, so the unit of a diff has to be
  // one dropped food. Pretty-printing it costs 0.6 MiB of indentation and makes
  // every drop a twelve-line hunk.
  const text = `${JSON.stringify({ ...census, drops: "@@DROPS@@" }).replace(
    '"@@DROPS@@"',
    `[\n${drops.map((drop) => JSON.stringify(drop)).join(",\n")}\n]`
  )}\n`;
  await writeFile(out, text);

  console.log(
    `\n${groups.size.toLocaleString("en-GB")} identities, ` +
      `${shipped.toLocaleString("en-GB")} shipped, ` +
      `${drops.length.toLocaleString("en-GB")} dropped`
  );
  for (const [rule, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(5)}  ${rule}`);
  console.log("\nattribution of the cause:");
  for (const [kind, n] of Object.entries(attribution).sort(
    (a, b) => b[1] - a[1]
  ))
    console.log(`  ${String(n).padStart(5)}  ${kind}`);
  console.log(
    `\nwritten to ${out} (${(text.length / 1024 / 1024).toFixed(2)} MiB)`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
