/**
 * Does the LABEL's own panel pick the right variant out of a candidate list?
 *
 * The dominant failure in arm K is not retrieval: the adjudicated row was shown
 * to the model in 19 of 22, and it took a different row in 9 of those. Every one
 * of those misses is a wrong VARIANT of the right food — part-skim for whole
 * ricotta, fresh pasta for dry, chow mein for somen. Variants differ in macros,
 * and the pack prints its macros.
 *
 * So this asks selection as arithmetic rather than as judgement. It originates
 * no number: both sides are published figures, and the person holding the pack
 * can check either.
 */
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolve as resolveTs } from "../../scripts/ts-resolve-hook.mjs";
import { readPackTwins, packQueries } from "../../scripts/ledger-fold.mjs";
import { ADJUDICATION } from "../../scripts/pairing-adjudication.mjs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({ resolve: resolveTs });
const { buildSearchCorpus, searchIndexRows } =
  await import("../../src/lib/food/usda-corpus.ts");

const index = JSON.parse(
  readFileSync(resolvePath(ROOT, "public/usda/search-index.json"), "utf8")
);
const corpus = buildSearchCorpus(index);
const byId = new Map(index.foods.map((r) => [r.fdcId, r]));
const spoken = (d) => {
  const p = d.split(",").map((s) => s.trim());
  return p.length === 1 ? p[0].toLowerCase() : `${p[1]} ${p[0]}`.toLowerCase();
};

const KEYS = [
  ["calories", "calories"],
  ["protein_content", "protein_content"],
  ["fat_content", "fat_content"],
  ["carbohydrate_content", "carbohydrate_content"],
];

/** Mean relative gap between a label panel and a row's macros, over the keys both carry. */
function macroGap(panel, row) {
  let sum = 0,
    n = 0;
  for (const [pk, rk] of KEYS) {
    const a = panel?.[pk],
      b = row?.macros?.[rk];
    if (typeof a !== "number" || typeof b !== "number") continue;
    const scale = Math.max(Math.abs(a), 1); // guard a printed zero
    sum += Math.abs(a - b) / scale;
    n++;
  }
  return n === 0 ? null : sum / n;
}

const pop = readPackTwins(
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl")
).sort((a, b) => a.captured - b.captured);

function run(label, candidatesOf) {
  let rankWins = 0,
    macroWins = 0,
    n = 0,
    noPanel = 0;
  const flips = [];
  for (const t of pop) {
    const a = ADJUDICATION[t.gtin];
    if (!a || a.verdict !== "paired") continue;
    n++;
    const cands = candidatesOf(t, a).slice(0, 8);
    if (cands.length === 0) continue;
    const byRank = cands[0];
    if (byRank === a.fdcId) rankWins++;
    const scored = cands
      .map((id) => ({ id, gap: macroGap(t.panel, byId.get(id)) }))
      .filter((s) => s.gap !== null)
      .sort((x, y) => x.gap - y.gap);
    if (scored.length === 0) {
      noPanel++;
      continue;
    }
    if (scored[0].id === a.fdcId) macroWins++;
    if (byRank !== a.fdcId && scored[0].id === a.fdcId)
      flips.push(
        `  + ${(t.productName ?? t.name).slice(0, 28).padEnd(30)} rank gave ${byId.get(byRank)?.description?.slice(0, 44)}`
      );
    if (byRank === a.fdcId && scored[0].id !== a.fdcId)
      flips.push(
        `  - ${(t.productName ?? t.name).slice(0, 28).padEnd(30)} macros took ${byId.get(scored[0].id)?.description?.slice(0, 44)}`
      );
  }
  console.log(
    `\n## ${label}  (n=${n}${noPanel ? `, ${noPanel} with no comparable panel` : ""})`
  );
  console.log(`   top of the ranking   ${rankWins}/${n}`);
  console.log(`   closest macros       ${macroWins}/${n}`);
  if (flips.length) console.log(flips.join("\n"));
}

// 1. Selection in isolation: the candidates an ideal query returns.
run("Candidates from an ideal English query", (t, a) => {
  const { hits } = searchIndexRows(
    corpus,
    spoken(byId.get(a.fdcId).description)
  );
  return hits.map((h) => h.row.fdcId);
});

// 2. Realistic: the candidates the pack's own words reach, unioned.
run("Candidates the pack's own words reach", (t) => {
  const { tags, name } = packQueries(t);
  const seen = [];
  for (const q of [...tags, name]) {
    if (!q) continue;
    for (const h of searchIndexRows(corpus, q).hits)
      if (!seen.includes(h.row.fdcId)) seen.push(h.row.fdcId);
  }
  return seen;
});
