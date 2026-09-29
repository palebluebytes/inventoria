#!/usr/bin/env node
/**
 * Have the two hand-authored tables' pinned barcodes moved? (ADR-0046 §4, #117;
 * ADR-0113 §14, #523)
 *
 *   node scripts/curated-snapshot-check.mjs      # or `pnpm curated:check`
 *
 * Re-fetches every barcode in `src/lib/food/curated-stand-ins.ts` and every one
 * in `src/lib/food/curated-pairings.ts` from Open Food Facts, and asks each
 * table's own question of the answer: has the stand-in's pinned panel moved, and
 * does the pairing's barcode still name the pack it was paired against. Exits
 * non-zero when anything has moved, or when an entry could not be read at all,
 * which is what `.github/workflows/curated-snapshot-check.yml` turns into an
 * issue once a quarter. The rules — and why those two are not the same finding,
 * and why a delisting is a finding for one table and not the other — live in
 * `curated-drift.mjs`.
 *
 * It never writes: not to the ledger, not to the app, not to the tables it
 * reads. Pulling a corrected value in silently would undo the point of
 * snapshotting (ADR-0046 §4), and both a moved panel and a moved name need a
 * human's judgement re-run before the row can be trusted again.
 *
 * Plain Node built-ins, no install step: the entries are read straight out of
 * the TypeScript modules the app uses, which stay type-import-only so that a
 * bare runner's Node can load them.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  checkPinned,
  formatReport,
  needsReVetting,
  needsAnotherRun,
  STAND_INS,
  PAIRINGS,
} from "./curated-drift.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tableModule = (name) =>
  pathToFileURL(join(ROOT, "src", "lib", "food", `${name}.ts`)).href;

const OFF_BASE = "https://world.openfoodfacts.org/api/v3/product";
// OFF asks every caller to identify itself as `AppName/Version (contact)`, and
// to say which caller it is: this job is not the app, and a rate limit or a
// block earned here should not land on people using Inventoria.
const USER_AGENT = "Inventoria-snapshot-check/1.0 (thomas@palebluebytes.space)";

/** One OFF product read, as {@link checkPinned} expects to receive it. */
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

const { CURATED_STAND_INS } = await import(tableModule("curated-stand-ins"));
const { CURATED_PAIRINGS } = await import(tableModule("curated-pairings"));

/** Both tables, run in turn and reported apart, then counted together. */
const results = [];
for (const [entries, table] of [
  [CURATED_STAND_INS, STAND_INS],
  [CURATED_PAIRINGS, PAIRINGS],
]) {
  console.log(
    `Checking ${entries.length} ${table.what}(s) against Open Food Facts.\n`
  );
  // `continuing` keeps the rate limit spanning both tables. The interval stays
  // `checkPinned`'s decision; all this says is that requests have been spent.
  const run = await checkPinned(entries, {
    fetchProduct,
    table,
    continuing: results.length > 0,
  });
  console.log(`${formatReport(run, table)}\n`);
  results.push(...run);
}

// Counted as two numbers, not one, because they ask for two different things
// (#205): an entry OFF answered about needs a human to re-vet it, and an entry
// OFF never answered about needs the run repeating. Both still fail the job —
// a quarter in which a pinned barcode went unchecked is not a quarter it
// passed. Both tables are counted together because the job's answer is one exit
// code.
//
// A third outcome asks for neither and so fails nothing: a barcode Open Food
// Facts has no record of is settled, and running the job again would establish
// the same nothing. It still prints, under its own mark, because a report that
// said `ok` there would be claiming a confirmation nobody made.
const toReVet = results.filter((result) =>
  result.findings.some(needsReVetting)
).length;
const unchecked = results.filter(
  (result) =>
    result.findings.some(needsAnotherRun) &&
    !result.findings.some(needsReVetting)
).length;
if (toReVet + unchecked > 0) {
  const parts = [];
  if (toReVet > 0) parts.push(`${toReVet} to re-vet`);
  if (unchecked > 0) parts.push(`${unchecked} unchecked`);
  console.error(`\nOf ${results.length} entries: ${parts.join(", ")}.`);
  process.exit(1);
}
