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
const FOOD_KIND_MODULE = join(ROOT, "src", "lib", "food", "usda-food-kind.ts");
const VARIANT_DROP_MODULE = join(
  ROOT,
  "src",
  "lib",
  "food",
  "usda-variant-drops.ts"
);
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
const CORPUS_MODULE = join(ROOT, "src", "lib", "food", "usda-corpus.ts");
const SHIPPED_NAME_MODULE = join(
  ROOT,
  "src",
  "lib",
  "food",
  "usda-shipped-name.ts"
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
 * The list is exported so `usda-app-module.test.ts` can assert every one of these
 * is a real export of `usda-fdc.ts` — the same lock `usda-coverage.test.ts` puts
 * on `PANEL_FIELDS`. A rename in the app then fails a test rather than failing a
 * regeneration months later. Every roster below is locked the same way, and
 * `usda-bundle.test.ts` checks the union of them against the generator's own
 * stub, so a call site added without a roster entry fails too.
 */
export const APP_EXPORTS = [
  "fdcReportsNoEnergy",
  "fdcIdentityKey",
  "resolveFdcGroup",
  "stripArchiveBoilerplate",
  "twinSearchAliases",
  "mapFdcFoodToPayload",
  "mapFdcPortions",
];

/**
 * The five food-kind judgements, borrowed through the same seam and for the same
 * reason {@link loadAppModule} gives below — they are just no longer in the same
 * file as the merge and the panel (#146).
 *
 * Nothing in `src/` imports that module, so this list is the whole of its
 * readership.
 */
export const FOOD_KIND_EXPORTS = [
  "isBrandSpecific",
  "isProcessedProduct",
  "isPreparedProduct",
  "isDryBasisRecord",
  "isManufacturingInput",
];

/**
 * The sixth judgement, from the module next door (ADR-0061).
 *
 * Its own roster because it is its own module and moves for its own reason: the
 * five above ask what a record IS and take one description, `resolveVariantDrops`
 * asks what a row is a VARIANT of and takes the whole corpus, because whether a
 * head phrase still keeps a plain form is not a fact about any one name.
 * `ADJUDICATED_VARIANTS` is the hand list behind it, borrowed so the generator
 * can refuse a corpus that has moved past a written verdict.
 */
export const VARIANT_DROP_EXPORTS = [
  "resolveVariantDrops",
  "ADJUDICATED_VARIANTS",
];

/**
 * The ranking, borrowed for the same reason the filters are (ADR-0049 §2).
 *
 * The vocabulary is built by asking, thousands of times, "does this phrase
 * retrieve anything?" — which is a question only the shipped search can answer.
 * A second implementation here would decide a key belongs in the map by rules
 * the app does not use, and every disagreement would ship as a key that already
 * answers or a miss that never got one.
 *
 * `plainSiblingsOf` is here for the other half of the same rule and is the one
 * entry the ROWS use rather than the vocabulary: ADR-0055 §6 bakes that key into
 * the artifact because deriving it at load costs 24 ms against the 18.5 ms the
 * whole corpus load costs, and baking a value means the generator and the search
 * have to agree about it exactly.
 *
 * ADR-0062 §1's `withoutStrayMentions` is deliberately NOT here. #177 measured
 * borrowing it and found it answers neither question the derivation asks;
 * `retrievalCounter` in `usda-vocabulary.mjs` carries that reasoning, beside the
 * count it decides.
 */
export const RANKING_EXPORTS = [
  "readReferenceFoodName",
  "compileReferenceFoodQuery",
  "plainSiblingsOf",
];

/**
 * The two inputs to the vocabulary a machine cannot supply: which OFF groups name
 * nothing a person would type, and the everyday names OFF's taxonomy does not
 * carry at all. Reached through the same seam so they stay out of the app bundle
 * (`src/lib/food/food-vocabulary.ts` explains the arrangement) — the app reads
 * the finished map out of the artifact and never the evidence behind it.
 */
export const VOCABULARY_EXPORTS = [
  "DENIED_VOCABULARY_TAGS",
  "LOCAL_VOCABULARY",
  "LOCAL_VOCABULARY_CEILING",
];

/**
 * The search itself, borrowed for the hand-written vocabulary's second
 * admission (ADR-0049's #141 Amendment).
 *
 * `RANKING_EXPORTS` above answers "does this phrase retrieve anything?", which
 * is all the derivation needs. An entry in the hand list claims more: that a
 * user typing `caster sugar` LEADS with `Sugars, granulated`. That is a question
 * about the fallback, the two matching tiers, the six ranking keys and the alias
 * scoring together, and only the shipped search can answer it. Restating it here
 * would pin the entries to a ranking the app does not have.
 */
export const CORPUS_EXPORTS = ["buildSearchCorpus", "searchIndexRows"];

/**
 * The origin rename, borrowed through the same seam and for the same reason
 * (ADR-0056 §4).
 *
 * `resolveShippedNames` is corpus-wide — whether a stripped name is still free is
 * not a fact about that name — so it belongs beside `plainSiblingsOf` on the
 * generator's side of the seam rather than in the app, which reads finished
 * names and never the rule that produced them. `stripNonNamingQualifiers` comes with
 * it because the aliases are renamed one at a time, after the verdict.
 */
export const SHIPPED_NAME_EXPORTS = [
  "resolveShippedNames",
  "stripNonNamingQualifiers",
  "ADJUDICATED_NAMES",
];

/**
 * The twin adjudication, borrowed for the same reason and through the same seam
 * (ADR-0051).
 *
 * `fdcIdentityKey` takes the split set as an argument, so the generator is where
 * the ledger and the key meet. Reaching the ledger this way keeps 190 rows of
 * adjudication out of the app bundle while leaving them beside the merge they
 * constrain, which is the arrangement `food-vocabulary.ts` already uses.
 */
export const TWIN_LEDGER_EXPORTS = [
  "TWIN_LEDGER",
  "SPLIT_TWIN_NDB_NUMBERS",
  "SUPERSEDED_RECORDS",
  "SUPERSEDED_FDC_IDS",
];

// ---------------------------------------------------------------------------
// Reaching the app's own logic
// ---------------------------------------------------------------------------

/**
 * Every app module this script borrows from, with what it takes from each.
 *
 * One table rather than one call site per module, so the entry {@link loadAppModule}
 * writes and the check {@link assertAppExports} runs cannot fall out of step
 * with each other.
 */
const BORROWED = [
  [APP_MODULE, APP_EXPORTS],
  [FOOD_KIND_MODULE, FOOD_KIND_EXPORTS],
  [VARIANT_DROP_MODULE, VARIANT_DROP_EXPORTS],
  [RANKING_MODULE, RANKING_EXPORTS],
  [VOCABULARY_MODULE, VOCABULARY_EXPORTS],
  [CORPUS_MODULE, CORPUS_EXPORTS],
  [SHIPPED_NAME_MODULE, SHIPPED_NAME_EXPORTS],
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
