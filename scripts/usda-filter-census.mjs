#!/usr/bin/env node
/**
 * Which of the corpus filters still removes a row the collapse would not have
 * removed? The second half of the measurement behind research note #192.
 *
 *   USDA_COLLAPSED_PATH=/tmp/collapsed.json pnpm usda:filter-census
 *   ...--json   as JSON     ...--write   and commit the artifact
 *
 * Flags: --dir <path> (where the archives are, default .usda-backup).
 *
 * **The filters cannot be measured on the collapsed corpus.** They run at
 * generation time, BEFORE any collapse, so the 2,837-row corpus is derived from
 * the 4,238 rows they already chose. Counting what a filter matches in the
 * collapsed corpus answers nothing: by construction it matches nothing, because
 * it removed those rows two steps earlier.
 *
 * The question a filter actually faces is counterfactual — with this filter off,
 * would the collapse have absorbed its casualties, or would they arrive in the
 * corpus as rows of their own? So this replays the generator's own pipeline,
 * keeps every casualty instead of counting it, and asks of each one:
 *
 *   **Does its residual description, under ADR-0100 §3's key, collide with a row
 *   that ships?**
 *
 * A collision is a NECESSARY condition for redundancy and not a sufficient one,
 * and the direction of that gap is the argument for using it. A casualty with no
 * collision would arrive as its own corpus row, so its filter is load-bearing and
 * the verdict is certain. A casualty WITH a collision only MIGHT be absorbed —
 * §4's chain could pick the casualty as the group's representative instead,
 * which would not absorb the row but promote it. So the test over-credits the
 * collapse and never under-credits it, and a filter this census calls alive is
 * alive. The colliding casualties are reported split by which of the two they
 * are, on §4's own chain: fuller panel first, then lower `fdcId`.
 *
 * Nothing here restates a filter. Every predicate comes out of the app through
 * `usda-app-module.mjs`'s esbuild seam and every pipeline step out of
 * `usda-bundle.mjs`, for ADR-0047 §4's reason: a census measuring a second copy
 * of the filters measures the copy.
 *
 * It asserts nothing and is not wired into `pnpm check`, for the reason
 * `usda-ranking-audit.mjs` gives about itself.
 */

import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAppModule, assertAppExports } from "./usda-app-module.mjs";

import {
  bundleArchives,
  groupByIdentity,
  readBundleArchives,
} from "./usda-bundle.mjs";
import { claim, groupingKey } from "./usda-collapse-roster.mjs";
import { resolve as resolveTs } from "./ts-resolve-hook.mjs";

/**
 * ADR-0056 §1's four strip rosters, reached through the extensionless-import
 * hook rather than through `usda-app-module.mjs`'s esbuild seam.
 *
 * The seam exports what the GENERATOR needs (`SHIPPED_NAME_EXPORTS`), and these
 * four are not in it because the generator never reads them directly — it calls
 * `resolveShippedNames`, which closes over them. Widening a shipped seam to suit
 * a census would be the tail wagging the dog, and the hook costs nothing: this
 * is still the one copy of the rosters, read out of the module that owns them.
 */
registerHooks({ resolve: resolveTs });
const {
  ORIGIN_QUALIFIERS,
  CATALOGUE_QUALIFIERS,
  FORTIFICATION_QUALIFIERS,
  DESIGNATION_TAGS,
  carriesOriginQualifier,
  stripDesignationTag,
  stripFortificationQualifier,
  stripNonNamingQualifiers,
} = await import("../src/lib/food/usda-shipped-name.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = join(ROOT, "scripts", "usda-backup.manifest.json");
const ACCOUNT = join(ROOT, "docs", "research", "192-filter-census.json");
const COLLAPSED = process.env.USDA_COLLAPSED_PATH ?? null;

const args = process.argv.slice(2);
const flagAt = args.indexOf("--dir");
const DIR = resolve(ROOT, flagAt === -1 ? ".usda-backup" : args[flagAt + 1]);

/**
 * The generator's pipeline, replayed with every casualty kept.
 *
 * `usda-bundle.mjs`'s `buildCorpus` counts its casualties and discards them,
 * which is right for a generator and useless here. This walks the same groups in
 * the same order asking the same predicates, and the order is load-bearing: a
 * row dropped as brand-specific is never offered to the processed filter, so a
 * family's casualties are the rows that reached it, not the rows that match it.
 * Reported as such, since #144's lesson is that a drop rule's reach is pinned as
 * the population it left.
 */
function replayRowFilters(groups, app) {
  const families = new Map(
    [
      "brand_specific",
      "processed",
      "prepared",
      "dry_basis",
      "manufacturing_input",
      "superseded",
      "no_energy",
    ].map((name) => [name, []])
  );
  const survivors = [];

  for (const group of groups.values()) {
    const { food, merged_from } = app.resolveFdcGroup(group.map((e) => e.food));
    const casualty = {
      fdcId: food.fdcId,
      description: food.description,
      panel: food.foodNutrients.length,
    };
    if (app.isBrandSpecific(food.description)) {
      families.get("brand_specific").push(casualty);
      continue;
    }
    if (app.isProcessedProduct(food.description)) {
      families.get("processed").push(casualty);
      continue;
    }
    if (app.isPreparedProduct(food.foodCategory, food.description)) {
      families.get("prepared").push(casualty);
      continue;
    }
    if (app.isDryBasisRecord(food.description)) {
      families.get("dry_basis").push(casualty);
      continue;
    }
    if (app.isManufacturingInput(food.description)) {
      families.get("manufacturing_input").push(casualty);
      continue;
    }
    if (app.SUPERSEDED_FDC_IDS.has(food.fdcId)) {
      families.get("superseded").push(casualty);
      continue;
    }
    if (app.fdcReportsNoEnergy(food)) {
      families.get("no_energy").push(casualty);
      continue;
    }
    const base = group.find((e) => e.food.fdcId === food.fdcId);
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
  return { families, survivors };
}

/** ADR-0061's four variant-drop families, with the dropped rows kept. */
function replayVariantDrops(survivors, app) {
  const rows = survivors.map((s) => ({
    fdcId: s.food.fdcId,
    description: s.food.description,
  }));
  const verdicts = app.resolveVariantDrops(rows);
  const families = new Map();
  const panel = new Map(
    survivors.map((s) => [s.food.fdcId, s.food.foodNutrients.length])
  );
  for (const [fdcId, reason] of verdicts) {
    if (!families.has(reason)) families.set(reason, []);
    const row = rows.find((r) => r.fdcId === fdcId);
    families.get(reason).push({ ...row, panel: panel.get(fdcId) ?? 0 });
  }
  return {
    families,
    survivors: survivors.filter((s) => !verdicts.has(s.food.fdcId)),
  };
}

/**
 * What ADR-0056 §1's four strip rosters reach, measured BEFORE the strip runs.
 *
 * The same category error the header warns about for filters applies here in
 * reverse: the shipped corpus's names have already lost these segments, so
 * counting them in `search-index.json` reports 0 for three of the four rosters
 * and says nothing. The population a strip acted on is the population that
 * reached it (#144).
 *
 * Each roster is measured by ITS OWN shipped function and never by a
 * whole-segment match written here. `DESIGNATION_TAGS` is why: its entries are
 * parenthesised tags carried INSIDE a segment — `Bear, black, meat (Alaska
 * Native)` — so a segment-equality test reports the roster reaching nothing,
 * which is a census measuring its own transcription rather than the rule.
 *
 * The overlap column is #192's actual question for this surface. ADR-0100 §5
 * gives ADR-0056 §1's positional strip a second roster, so the two could have
 * been the same rule twice — they are not, and the number says so rather than an
 * argument about it.
 */
function measureStripRosters(survivors) {
  const names = survivors.map((s) => s.food.description);
  const reached = (changes) => names.filter(changes).length;
  const overlap = (roster) =>
    [...roster].filter((entry) => claim(entry)).length;
  return [
    {
      roster: "ORIGIN_QUALIFIERS",
      entries: ORIGIN_QUALIFIERS.size,
      reaches: reached(carriesOriginQualifier),
      measured_by: "carriesOriginQualifier",
      also_claimed_by_the_collapse: overlap(ORIGIN_QUALIFIERS),
    },
    {
      roster: "CATALOGUE_QUALIFIERS",
      entries: CATALOGUE_QUALIFIERS.size,
      reaches: reached((d) => stripNonNamingQualifiers(d) !== d),
      measured_by: "stripNonNamingQualifiers — origin and catalogue together",
      also_claimed_by_the_collapse: overlap(CATALOGUE_QUALIFIERS),
    },
    {
      roster: "FORTIFICATION_QUALIFIERS",
      entries: FORTIFICATION_QUALIFIERS.size,
      reaches: reached((d) => stripFortificationQualifier(d) !== d),
      measured_by: "stripFortificationQualifier",
      also_claimed_by_the_collapse: overlap(FORTIFICATION_QUALIFIERS),
    },
    {
      roster: "DESIGNATION_TAGS",
      entries: DESIGNATION_TAGS.size,
      reaches: reached((d) => stripDesignationTag(d) !== d),
      measured_by: "stripDesignationTag — a parenthesised tag, never a segment",
      also_claimed_by_the_collapse: overlap(DESIGNATION_TAGS),
    },
  ];
}

/** ADR-0056's name-collision drops, likewise. */
function replayNameDrops(survivors, app) {
  const rows = survivors.map((s) => ({
    fdcId: s.food.fdcId,
    description: s.food.description,
    panelFields: s.food.foodNutrients.length,
  }));
  const { renamed, dropped } = app.resolveShippedNames(rows);
  const families = new Map();
  for (const [fdcId, reason] of dropped) {
    if (!families.has(reason)) families.set(reason, []);
    const row = rows.find((r) => r.fdcId === fdcId);
    families.get(reason).push({
      fdcId,
      description: row.description,
      panel: row.panelFields,
    });
  }
  const shipped = survivors
    .filter((s) => !dropped.has(s.food.fdcId))
    .map((s) => ({
      fdcId: s.food.fdcId,
      description: renamed.get(s.food.fdcId) ?? s.food.description,
      panel: s.food.foodNutrients.length,
    }));
  return {
    families,
    shipped,
    renamed: renamed.size,
    adjudicated_names: app.ADJUDICATED_NAMES.length,
  };
}

/**
 * One family's verdict against the collapse.
 *
 * `absorbed` is a casualty whose group already ships a row that beats it on §4's
 * chain — the collapse would take it and nothing would change. `promoted` is a
 * casualty that would WIN its group, so with the filter off the collapse hands
 * the group's name to the row the filter exists to remove: not redundancy but a
 * regression the filter is currently preventing. `own_row` has no group at all
 * and would simply arrive.
 */
const judge = (casualties, shippedByKey) => {
  let absorbed = 0;
  let promoted = 0;
  const own_row = [];
  const promotions = [];
  for (const casualty of casualties) {
    const key = groupingKey(casualty.description);
    const incumbent = shippedByKey.get(key);
    if (!incumbent) {
      own_row.push(casualty);
      continue;
    }
    const wins =
      casualty.panel > incumbent.panel ||
      (casualty.panel === incumbent.panel && casualty.fdcId < incumbent.fdcId);
    if (wins) {
      promoted++;
      if (promotions.length < 5)
        promotions.push({
          casualty: casualty.description,
          would_displace: incumbent.description,
        });
    } else absorbed++;
  }
  return {
    casualties: casualties.length,
    absorbed,
    promoted,
    own_row: own_row.length,
    examples: own_row.slice(0, 3).map((c) => c.description),
    promotions,
  };
};

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const scratch = await mkdtemp(join(tmpdir(), "usda-filter-census-"));
const app = assertAppExports(await loadAppModule(scratch));
await rm(scratch, { recursive: true, force: true });

const entries = await readBundleArchives(manifest, DIR);
const groups = groupByIdentity(entries, app);

const rowStage = replayRowFilters(groups, app);
const variantStage = replayVariantDrops(rowStage.survivors, app);
const stripRosters = measureStripRosters(variantStage.survivors);
const nameStage = replayNameDrops(variantStage.survivors, app);

/**
 * The shipped rows a casualty could be absorbed INTO, keyed by §3's grouping
 * key, best-of-group first on §4's chain.
 *
 * Built from the corpus this generator produced rather than from the pilot's
 * emission, because the emission has already renamed merged rows to their
 * residual and a name is not what §3 groups on.
 */
const shippedByKey = new Map();
for (const row of nameStage.shipped) {
  const key = groupingKey(row.description);
  const held = shippedByKey.get(key);
  if (
    !held ||
    row.panel > held.panel ||
    (row.panel === held.panel && row.fdcId < held.fdcId)
  )
    shippedByKey.set(key, row);
}

const families = [
  ...[...rowStage.families].map(([name, rows]) => ["row", name, rows]),
  ...[...variantStage.families].map(([name, rows]) => ["variant", name, rows]),
  ...[...nameStage.families].map(([name, rows]) => ["name", name, rows]),
];

const account = {
  artifact: "192-filter-census",
  schema_version: 1,
  ticket: "https://github.com/palebluebytes/inventoria/issues/192",
  map: "https://github.com/palebluebytes/inventoria/issues/186",
  method:
    "Each filter's casualties are kept rather than counted, and each is asked " +
    "whether ADR-0100 §3's grouping key collides with a shipped row. A " +
    "collision is necessary for redundancy and not sufficient, so a filter " +
    "reported alive is alive.",
  roster:
    "scripts/usda-collapse-roster.mjs — the Beef pilot's roster, not a shipped one",
  corpus: {
    shipped_rows: nameStage.shipped.length,
    grouping_keys: shippedByKey.size,
    ...(COLLAPSED
      ? {
          collapsed_reference: `sha256:${createHash("sha256").update(readFileSync(COLLAPSED)).digest("hex").slice(0, 16)}`,
        }
      : {}),
  },
  rename_surface: {
    note:
      "ADR-0056 §1's positional strip, measured over the rows that reached it " +
      "rather than over the shipped corpus, whose names have already lost these " +
      "segments. ADR-0100 §5 extends this roster; the overlap column asks " +
      "whether it duplicates it.",
    rows_renamed: nameStage.renamed,
    adjudicated_names: nameStage.adjudicated_names,
    rosters: stripRosters,
  },
  families: families.map(([stage, name, rows]) => ({
    stage,
    family: name,
    ...judge(rows, shippedByKey),
  })),
};

if (args.includes("--json")) {
  console.log(JSON.stringify(account, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  console.log(
    `\n${account.corpus.shipped_rows} rows ship, over ${account.corpus.grouping_keys} collapse groups.\n`
  );
  console.log(
    `  ${pad("stage", 9)}${pad("family", 22)}${num("dropped", 9)}${num("absorbed", 10)}${num("promoted", 10)}${num("own row", 9)}`
  );
  for (const f of account.families)
    console.log(
      `  ${pad(f.stage, 9)}${pad(f.family, 22)}${num(f.casualties, 9)}${num(f.absorbed, 10)}${num(f.promoted, 10)}${num(f.own_row, 9)}`
    );
  console.log(
    `\n  ${pad("strip roster", 26)}${num("entries", 9)}${num("reaches", 10)}${num("overlap", 9)}`
  );
  for (const r of stripRosters)
    console.log(
      `  ${pad(r.roster, 26)}${num(r.entries, 9)}${num(r.reaches, 10)}${num(r.also_claimed_by_the_collapse, 9)}`
    );
  console.log(
    `  ${pad("rows renamed", 26)}${num("", 9)}${num(nameStage.renamed, 10)}\n` +
      `  ${pad("ADJUDICATED_NAMES", 26)}${num(nameStage.adjudicated_names, 9)}`
  );
  console.log(
    `\nA family with rows in "own row" is ALIVE: those rows would arrive in the ` +
      `corpus\nwith the filter off. "promoted" is worse than alive — the casualty ` +
      `would take\nits group's name from the row that ships today.`
  );
}

if (args.includes("--write")) {
  writeFileSync(ACCOUNT, `${JSON.stringify(account, null, 2)}\n`);
  console.log(`\nwritten: ${ACCOUNT}`);
}
