/**
 * Arm J: ask the model to name the food in USDA's OWN CONVENTION — a style
 * guide and eight examples, never the 2,023-row catalogue #247 handed it.
 *
 * Plus the one checkable number the system owns: the proposed row's energy
 * against the label's, which is #243's `energyRatio` and is confirmable by
 * anybody holding the pack.
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

const env = Object.fromEntries(
  readFileSync(resolvePath(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ])
);
const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const URL_ = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/inventoria-model-route/workers-ai/${MODEL}`;

const index = JSON.parse(
  readFileSync(resolvePath(ROOT, "public/usda/search-index.json"), "utf8")
);
const corpus = buildSearchCorpus(index);
const byId = new Map(index.foods.map((r) => [r.fdcId, r]));

const PROMPT = `You name foods the way the USDA FoodData Central database names them.

USDA writes the food's own name first, then qualifiers, separated by commas:
  Oil, olive, salad or cooking
  Cheese, swiss
  Pickles, cucumber, sweet
  Yogurt, plain, whole milk
  Bread, crumbs, dry, grated, plain
  Noodles, egg, dry
  Vinegar, distilled
  Spinach, mature

Given a packaged product, answer with the words USDA would use for the food inside the pack: the food's own name and at most one qualifier, two or three words in total.

Rules:
- Answer with the words only. No brand, no punctuation, no explanation.
- The database holds foods as bought and not yet cooked. Name the food as bought.
- Use USDA's word, not the shelf word, where they differ.
- If you cannot tell what the food is, answer exactly: unknown`;

async function ask(pack) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_AI_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: pack },
      ],
      temperature: 0,
      max_tokens: 20,
    }),
  });
  if (!res.ok) return { error: `${res.status}` };
  const j = await res.json();
  return {
    text: (j.result?.response ?? "").trim().toLowerCase().replace(/[."]/g, ""),
  };
}

const pop = readPackTwins(
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl")
).sort((a, b) => a.captured - b.captured);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
for (const t of pop) {
  const a = ADJUDICATION[t.gtin];
  if (!a || a.verdict !== "paired") continue;
  const { tags } = packQueries(t);
  const ans = await ask(
    `product name: ${t.productName ?? t.name ?? "(none)"}\ndatabase categories: ${tags.length ? tags.join(", ") : "(none)"}`
  );
  const { hits } = searchIndexRows(corpus, ans.text ?? "");
  const rank = hits.findIndex((h) => h.row.fdcId === a.fdcId);
  const topRow = hits[0] ? byId.get(hits[0].row.fdcId) : null;
  const ratio =
    topRow?.macros?.calories && t.panel?.calories
      ? topRow.macros.calories / t.panel.calories
      : null;
  out.push({
    t,
    a,
    said: ans.text,
    rank,
    hits: hits.length,
    top: hits[0]?.row,
    ratio,
  });
  await sleep(3500);
}

const top1 = out.filter((r) => r.rank === 0);
const inList = out.filter((r) => r.rank >= 0);
console.log(`\n# Arm J — the model speaks USDA's convention\n`);
console.log(
  `  top-1                ${top1.length}/${out.length}   (clause 1 bar: 15)`
);
console.log(
  `  in the returned list ${inList.length}/${out.length}   (clause 2 bar: 20)`
);
console.log(`  found nothing        ${out.filter((r) => r.hits === 0).length}`);
console.log(
  `  said unknown         ${out.filter((r) => r.said === "unknown").length}\n`
);
for (const r of out) {
  const mark = r.rank === 0 ? "✓" : r.rank > 0 ? String(r.rank + 1) : "✗";
  console.log(
    `  ${mark.padStart(2)} ${(r.t.productName ?? r.t.name ?? "—").slice(0, 28).padEnd(30)}"${r.said}"`
  );
  if (r.rank !== 0)
    console.log(
      `       wanted ${byId.get(r.a.fdcId)?.description}\n       got    ${r.top ? byId.get(r.top.fdcId)?.description : "nothing"}`
    );
}

console.log(
  `\n## The one checkable number: proposed row's energy ÷ the label's\n`
);
for (const r of out) {
  if (r.ratio === null || !r.top) continue;
  const right = r.rank === 0 ? "right" : "WRONG";
  const flag = r.ratio < 0.7 || r.ratio > 1.4 ? "  ⚑ off by more than 40%" : "";
  console.log(
    `  ${right.padEnd(6)} x${r.ratio.toFixed(2).padStart(5)}  ${(r.t.productName ?? r.t.name ?? "—").slice(0, 28)}${flag}`
  );
}
