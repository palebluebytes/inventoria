/**
 * #556, the untested shape: a model that names the food IN WORDS, never a row
 * id, with the shipped search doing the identification.
 *
 * Scored against ADJUDICATION, which was fixed long before this arm existed.
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
const ACCOUNT = env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = env.CLOUDFLARE_AI_API_TOKEN;
const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const URL_ = `https://gateway.ai.cloudflare.com/v1/${ACCOUNT}/inventoria-model-route/workers-ai/${MODEL}`;

const index = JSON.parse(
  readFileSync(resolvePath(ROOT, "public/usda/search-index.json"), "utf8")
);
const corpus = buildSearchCorpus(index);
const byId = new Map(index.foods.map((r) => [r.fdcId, r.description]));

const PROMPT = `You name foods for a shopping diary.

Given what a packaged product's label and database record say, answer with the plain English name of the FOOD inside the pack, as a shopper would say it in two or three words.

Rules:
- Answer with the words only. No punctuation, no explanation, no brand.
- Name the substance, not the pack. "extra virgin olive oil" is "olive oil".
- Use the ordinary English name even where the pack is in another language.
- If you cannot tell what the food is, answer exactly: unknown`;

async function nameTheFood(pack) {
  const body = {
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: pack },
    ],
    temperature: 0,
    max_tokens: 20,
  };
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok)
    return { error: `${res.status} ${(await res.text()).slice(0, 120)}` };
  const json = await res.json();
  const text = (json.result?.response ?? "").trim().toLowerCase();
  return { text, neurons: json.result?.usage?.total_tokens ?? null };
}

const pop = readPackTwins(
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl")
).sort((a, b) => a.captured - b.captured);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

for (const t of pop) {
  const a = ADJUDICATION[t.gtin];
  if (!a || a.verdict !== "paired") continue;
  const { tags } = packQueries(t);
  const described =
    `product name: ${t.productName ?? t.name ?? "(none)"}\n` +
    `brand: ${t.brand ?? "(none)"}\n` +
    `database categories: ${tags.length ? tags.join(", ") : "(none)"}`;
  const answer = await nameTheFood(described);
  if (answer.error) {
    results.push({ t, a, err: answer.error });
  } else {
    const { hits } = searchIndexRows(corpus, answer.text);
    const rank = hits.findIndex((h) => h.row.fdcId === a.fdcId);
    results.push({
      t,
      a,
      said: answer.text,
      rank,
      hits: hits.length,
      got: hits[0]
        ? `${hits[0].row.fdcId} ${hits[0].row.description}`
        : "nothing",
    });
  }
  await sleep(3500);
}

const ok = results.filter((r) => r.rank === 0);
const inList = results.filter((r) => r.rank >= 0);
const refused = results.filter((r) => r.said === "unknown");
const silent = results.filter(
  (r) => r.rank === undefined || (r.hits === 0 && r.said !== "unknown")
);
const errs = results.filter((r) => r.err);

console.log(`\n# The model names the food in words (#556)\n`);
console.log(
  `model: ${MODEL}, temperature 0, through the inventoria-model-route gateway`
);
console.log(`population: ${results.length} adjudicated-pairable gtin: twins\n`);
console.log(
  `  top-1                 ${ok.length}/${results.length}   (clause 1 bar: 15)`
);
console.log(
  `  in the returned list  ${inList.length}/${results.length}   (clause 2 bar: 20)`
);
console.log(`  said "unknown"        ${refused.length}`);
console.log(`  phrase found nothing  ${silent.length}`);
console.log(`  route errors          ${errs.length}\n`);
for (const r of results) {
  const mark = r.err
    ? "!"
    : r.rank === 0
      ? "✓"
      : r.rank > 0
        ? `${r.rank + 1}`
        : "✗";
  console.log(
    `  ${String(mark).padStart(2)} ${(r.t.productName ?? r.t.name ?? "—").slice(0, 30).padEnd(32)}` +
      (r.err ? `ERROR ${r.err}` : `said "${r.said}"`)
  );
  if (!r.err && r.rank !== 0)
    console.log(
      `       wanted ${r.a.fdcId} ${byId.get(r.a.fdcId)}\n       got    ${r.got}`
    );
}
