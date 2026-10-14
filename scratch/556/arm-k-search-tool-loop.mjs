/**
 * Arm K: the model is given the SHIPPED SEARCH as a tool and must pick a row it
 * was actually shown.
 *
 * The difference from #247 in one line: it never sees a catalogue and never
 * emits an id it did not read off a real result. A pick outside what was
 * returned is counted as a fabrication rather than quietly accepted.
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
const byId = new Map(index.foods.map((r) => [r.fdcId, r.description]));

const SHOWN = 8; // rows handed back per search
const MAX_ROUNDS = 4; // searches the model may make per pack

const PROMPT = `You find which generic reference food in a food database best stands in for a packaged product.

You have one tool. Answer with EXACTLY ONE line, nothing else:

  SEARCH: <words>      to search the database
  PICK: <id>           to choose a row you have been shown
  GIVE UP              if no row shown can stand in for this product

Rules:
- You may only PICK an id that appeared in a search result above. Never invent one.
- The database holds foods as bought and not yet cooked, named in American English.
- If a search returns no rows, the database does not use those words. Try a plainer or more common word for the same food.
- Prefer the plainest row for the substance. A flavour, a brand or a preparation is not the food.`;

async function chat(messages) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_AI_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages, temperature: 0, max_tokens: 30 }),
  });
  if (!res.ok) return `ERROR ${res.status}`;
  const j = await res.json();
  return (j.result?.response ?? "").trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pop = readPackTwins(
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl")
).sort((a, b) => a.captured - b.captured);
const out = [];

for (const t of pop) {
  const a = ADJUDICATION[t.gtin];
  if (!a || a.verdict !== "paired") continue;
  const { tags } = packQueries(t);
  const messages = [
    { role: "system", content: PROMPT },
    {
      role: "user",
      content:
        `Product: ${t.productName ?? t.name ?? "(no name)"}\n` +
        `Database categories: ${tags.length ? tags.join(", ") : "(none)"}\n\n` +
        `Find the reference food that stands in for what is inside this pack.`,
    },
  ];
  const seen = new Set();
  const trail = [];
  let verdict = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await chat(messages);
    await sleep(3200);
    const line =
      reply.split("\n").find((l) => /SEARCH:|PICK:|GIVE UP/i.test(l)) ?? reply;
    trail.push(line.slice(0, 60));
    const search = /SEARCH:\s*(.+)/i.exec(line);
    const pick = /PICK:\s*(\d+)/i.exec(line);
    if (pick) {
      const id = Number(pick[1]);
      verdict = { kind: seen.has(id) ? "pick" : "fabricated", id };
      break;
    }
    if (/GIVE UP/i.test(line)) {
      verdict = { kind: "gaveup" };
      break;
    }
    if (search) {
      const q = search[1].trim().replace(/[."]/g, "");
      const { hits } = searchIndexRows(corpus, q);
      const shown = hits.slice(0, SHOWN);
      for (const h of shown) seen.add(h.row.fdcId);
      messages.push({ role: "assistant", content: line });
      messages.push({
        role: "user",
        content: shown.length
          ? shown.map((h) => `${h.row.fdcId}  ${h.row.description}`).join("\n")
          : "No rows. The database does not use those words.",
      });
      continue;
    }
    verdict = { kind: "malformed", text: line.slice(0, 40) };
    break;
  }
  out.push({ t, a, verdict: verdict ?? { kind: "ranout" }, trail, seen });
}

const picked = out.filter((r) => r.verdict.kind === "pick");
const right = picked.filter((r) => r.verdict.id === r.a.fdcId);
const wrong = picked.filter((r) => r.verdict.id !== r.a.fdcId);
const fabricated = out.filter((r) => r.verdict.kind === "fabricated");
const reachable = out.filter((r) => r.seen.has(r.a.fdcId));

console.log(
  `\n# Arm K — the model searches the corpus and picks a row it was shown\n`
);
console.log(`  picked a row it had seen   ${picked.length}/${out.length}`);
console.log(
  `  ... and it was right       ${right.length}/${out.length}   (clause 1 bar: 15)`
);
console.log(`  ... and it was wrong       ${wrong.length}`);
console.log(`  INVENTED an id             ${fabricated.length}`);
console.log(
  `  gave up / malformed / ran out  ${out.length - picked.length - fabricated.length}`
);
console.log(
  `  the right row was shown to it  ${reachable.length}/${out.length}   (clause 2 bar: 20)\n`
);
for (const r of out) {
  const v = r.verdict;
  const mark =
    v.kind === "pick"
      ? v.id === r.a.fdcId
        ? "✓"
        : "✗"
      : v.kind === "fabricated"
        ? "!"
        : "·";
  console.log(
    `  ${mark} ${(r.t.productName ?? r.t.name ?? "—").slice(0, 28).padEnd(30)}${r.trail.join("  |  ")}`
  );
  if (mark !== "✓")
    console.log(
      `     wanted ${r.a.fdcId} ${byId.get(r.a.fdcId)}` +
        (v.id
          ? `\n     took   ${v.id} ${byId.get(v.id) ?? "*** NOT A ROW IN THE CORPUS ***"}`
          : "") +
        `\n     was the right row ever shown? ${r.seen.has(r.a.fdcId) ? "yes" : "no"}`
    );
}
