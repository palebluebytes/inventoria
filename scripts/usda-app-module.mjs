/**
 * Everything the USDA scripts borrow from the app, and how a plain-Node script
 * gets at it.
 *
 * ADR-0047 §4's import-don't-copy rule in one place. It used to be in two: the
 * filter roster here, the ranking and deny-list rosters in `usda-vocabulary.mjs`
 * where nothing read them, and the loader that composes all three in
 * `usda-bundle.mjs` — so `usda-ranking-audit.mjs` reached through the generator
 * to borrow a loader. The rule is one rule, and it now has one home.
 *
 * A library, not a command. It changes when the app's module layout or the
 * esbuild interop does, never when a filter or a merge does.
 */

import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
const TWIN_LEDGER_MODULE = join(
  ROOT,
  "src",
  "lib",
  "food",
  "usda-twin-ledger.ts"
);

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
 * The ranking, borrowed for the same reason the filters are (ADR-0049 §2).
 *
 * The vocabulary is built by asking, thousands of times, "does this phrase
 * retrieve anything?" — which is a question only the shipped search can answer.
 * A second implementation here would decide a key belongs in the map by rules
 * the app does not use, and every disagreement would ship as a key that already
 * answers or a miss that never got one.
 */
export const RANKING_EXPORTS = [
  "readReferenceFoodName",
  "compileReferenceFoodQuery",
];

/**
 * The one input to the derivation a machine cannot supply: which OFF groups name
 * nothing a person would type. Reached through the same seam so it stays out of
 * the app bundle (`src/lib/food/food-vocabulary.ts` explains the arrangement).
 */
export const VOCABULARY_EXPORTS = ["DENIED_VOCABULARY_TAGS"];

/**
 * The twin adjudication, borrowed for the same reason and through the same seam
 * (ADR-0051).
 *
 * `fdcIdentityKey` takes the split set as an argument, so the generator is where
 * the ledger and the key meet. Reaching the ledger this way keeps 190 rows of
 * adjudication out of the app bundle while leaving them beside the merge they
 * constrain, which is the arrangement `food-vocabulary.ts` already uses.
 */
export const TWIN_LEDGER_EXPORTS = ["TWIN_LEDGER", "SPLIT_TWIN_NDB_NUMBERS"];

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
  [TWIN_LEDGER_MODULE, TWIN_LEDGER_EXPORTS],
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
