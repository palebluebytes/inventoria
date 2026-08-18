#!/usr/bin/env node
/**
 * Are the curated stand-ins' pinned OFF records still the ones we vetted?
 * (ADR-0046 §4, #117)
 *
 *   node scripts/curated-snapshot-check.mjs      # or `pnpm curated:check`
 *
 * Re-fetches every barcode in `src/lib/food/curated-stand-ins.ts` from Open Food
 * Facts and diffs it against the snapshot pinned beside it. Exits non-zero when
 * anything has moved, which is what `.github/workflows/curated-snapshot-check.yml`
 * turns into an issue once a quarter. The rules — and why the three failures are
 * told apart — live in `curated-drift.mjs`.
 *
 * It never writes: not to the ledger, not to the app, not to the table it reads.
 * Pulling a corrected value in silently would undo the point of snapshotting
 * (ADR-0046 §4), and a moved panel needs §2's admissions re-run by a human.
 *
 * Plain Node built-ins, no install step: the entries are read straight out of
 * the TypeScript module the app uses, which stays type-import-only so that a
 * bare runner's Node can load it.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { checkStandIns, formatReport } from "./curated-drift.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = join(ROOT, "src", "lib", "food", "curated-stand-ins.ts");

const OFF_BASE = "https://world.openfoodfacts.org/api/v3/product";
// OFF asks every caller to identify itself as `AppName/Version (contact)`, and
// to say which caller it is: this job is not the app, and a rate limit or a
// block earned here should not land on people using Inventoria.
const USER_AGENT = "Inventoria-snapshot-check/1.0 (thomas@palebluebytes.space)";

/** One OFF product read, as {@link checkStandIns} expects to receive it. */
async function fetchProduct(code) {
  const response = await fetch(`${OFF_BASE}/${code}.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  // A 404 is an answer, not a failure: it is the delisting this job exists to
  // catch, and OFF serves it with an empty body. Anything else is parsed, and a
  // body that is not JSON throws through to the run's `unreachable` finding.
  if (response.status === 404) return { status: 404, body: null };
  return { status: response.status, body: await response.json() };
}

const { CURATED_STAND_INS } = await import(pathToFileURL(TABLE).href);

console.log(
  `Checking ${CURATED_STAND_INS.length} curated stand-in(s) against Open Food Facts.\n`
);
const results = await checkStandIns(CURATED_STAND_INS, { fetchProduct });
console.log(formatReport(results));

const drifted = results.filter((result) => result.findings.length > 0).length;
if (drifted > 0) {
  console.error(`\n${drifted} of ${results.length} entries need re-vetting.`);
  process.exit(1);
}
