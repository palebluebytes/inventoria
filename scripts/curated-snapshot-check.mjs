#!/usr/bin/env node
/**
 * Are the curated stand-ins' pinned OFF records still the ones we vetted?
 * (ADR-0046 §4, #117)
 *
 *   node scripts/curated-snapshot-check.mjs      # or `pnpm curated:check`
 *
 * Re-fetches every barcode in `src/lib/food/curated-stand-ins.ts` from Open Food
 * Facts and diffs it against the snapshot pinned beside it. Exits non-zero when
 * anything has moved, or when an entry could not be read at all, which is what
 * `.github/workflows/curated-snapshot-check.yml` turns into an issue once a
 * quarter. The rules — and why those two are not the same finding — live in
 * `curated-drift.mjs`.
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
import {
  checkStandIns,
  formatReport,
  needsReVetting,
} from "./curated-drift.mjs";

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
  // Only a 200 carries a body the rules read (see `productFromResponse`); every
  // other status is classified by the status alone. A 404 is an answer rather
  // than a failure — the delisting this job exists to catch — and OFF serves it
  // empty; the rest is a rate limit or an outage, served with whatever error
  // page the edge felt like, and parsing that would turn a plain 502 into a JSON
  // syntax error wearing a transport failure's clothes.
  if (response.status !== 200) return { status: response.status, body: null };
  return { status: 200, body: await response.json() };
}

const { CURATED_STAND_INS } = await import(pathToFileURL(TABLE).href);

console.log(
  `Checking ${CURATED_STAND_INS.length} curated stand-in(s) against Open Food Facts.\n`
);
const results = await checkStandIns(CURATED_STAND_INS, { fetchProduct });
console.log(formatReport(results));

// Counted as two numbers, not one, because they ask for two different things
// (#205): an entry OFF answered about needs a human to re-vet it, and an entry
// OFF never answered about needs the run repeating. Both still fail the job —
// a quarter in which a stand-in went unchecked is not a quarter it passed.
// An entry lands in exactly one of the two, so the pair adds up.
const toReVet = results.filter((result) =>
  result.findings.some(needsReVetting)
).length;
const unchecked = results.filter(
  (result) =>
    result.findings.length > 0 && !result.findings.some(needsReVetting)
).length;
if (toReVet + unchecked > 0) {
  const parts = [];
  if (toReVet > 0) parts.push(`${toReVet} to re-vet`);
  if (unchecked > 0) parts.push(`${unchecked} unchecked`);
  console.error(`\nOf ${results.length} entries: ${parts.join(", ")}.`);
  process.exit(1);
}
