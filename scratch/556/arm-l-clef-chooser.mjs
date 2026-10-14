/**
 * Arm L: local search narrows, Clef chooses.
 *
 * The option ids are OURS, so a fabricated fdcId is not expressible in the
 * return type — the guarantee arm K earned by validation, taken structurally.
 * And `confidence` is measured against correctness, which is the only way to
 * find out whether a threshold could turn "confidently wrong" into "silent".
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
const MODEL = "@cf/cloudflare/clef-flash";
const URL_ = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/inventoria-model-route/workers-ai/${MODEL}`;

const index = JSON.parse(
  readFileSync(resolvePath(ROOT, "public/usda/search-index.json"), "utf8")
);
const corpus = buildSearchCorpus(index);
const byId = new Map(index.foods.map((r) => [r.fdcId, r]));
const spoken = (d) => {
  const p = d.split(",").map((s) => s.trim());
  return p.length === 1 ? p[0].toLowerCase() : `${p[1]} ${p[0]}`.toLowerCase();
};

async function decide(state, criteria) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_AI_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      state,
      questions: {
        stand_in: {
          type: "choice",
          instructions:
            "Which of these generic reference foods best stands in for the food inside this pack, so that nutrients the label does not print can be borrowed from it? Prefer the plainest row for the substance, and match the variant the label's own figures imply.",
          criteria,
        },
        any_good: {
          type: "noul",
          instructions:
            "Is at least one of the listed reference foods a fair stand-in for the food inside this pack?",
          criteria: {
            true: "One of them is the same substance in the same state.",
            false:
              "None is the same food, or only a different preparation of it.",
          },
        },
      },
    }),
  });
  const text = await res.text();
  if (!res.ok)
    return {
      error: `${res.status} ${text.slice(0, 160)}`,
      retryable: res.status === 429,
    };
  return JSON.parse(text).result;
}

/** Clef answers `3040 inference queue is full` under load; back off and ask again. */
async function decideWithRetry(state, criteria, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await decide(state, criteria);
    if (!r.error || !r.retryable) return r;
    await sleep(4000 * (i + 1));
  }
  return { error: "gave up after retries" };
}

const pop = readPackTwins(
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl")
).sort((a, b) => a.captured - b.captured);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function candidatesFor(t, a, ideal) {
  const seen = [];
  const queries = ideal
    ? [spoken(byId.get(a.fdcId).description)]
    : [...packQueries(t).tags, packQueries(t).name].filter(Boolean);
  for (const q of queries)
    for (const h of searchIndexRows(corpus, q).hits)
      if (!seen.includes(h.row.fdcId)) seen.push(h.row.fdcId);
  return seen.slice(0, 20);
}

for (const ideal of [true, false]) {
  const out = [];
  for (const t of pop) {
    const a = ADJUDICATION[t.gtin];
    if (!a || a.verdict !== "paired") continue;
    const cands = candidatesFor(t, a, ideal);
    // A search returning nothing proposes nothing; one returning a single row has
    // already decided, and the app would offer it with no model call. Both belong
    // in the denominator — dropping them scored the model on the hard half only.
    if (cands.length === 0) {
      out.push({ t, a, decided: null, had: false, n: 0 });
      continue;
    }
    if (cands.length === 1) {
      out.push({
        t,
        a,
        decided: cands[0],
        had: cands[0] === a.fdcId,
        n: 1,
        bySearch: true,
      });
      continue;
    }
    const criteria = Object.fromEntries(
      cands.map((id) => [String(id), byId.get(id).description])
    );
    const state = {
      product_name: t.productName ?? t.name ?? null,
      categories: packQueries(t).tags,
      label_per_100: t.panel ?? null,
    };
    const r = await decideWithRetry(state, criteria);
    out.push({
      t,
      a,
      r,
      decided: r?.answers?.stand_in ? Number(r.answers.stand_in.choice) : null,
      had: cands.includes(a.fdcId),
      n: cands.length,
    });
    await sleep(3200);
  }
  const usable = out.filter((o) => o.r && !o.r.error);
  const right = out.filter((o) => o.decided === o.a.fdcId);
  const had = out.filter((o) => o.had);
  const bySearch = out.filter((o) => o.bySearch);
  const failed = out.filter((o) => o.r?.error);
  console.log(
    `\n# Arm L — Clef chooses  [${ideal ? "ideal query candidates" : "the pack's own words"}]`
  );
  if (out.some((o) => o.r?.error))
    console.log(`  ERRORS: ${out.find((o) => o.r?.error).r.error}`);
  console.log(`  right row was among the options  ${had.length}/${out.length}`);
  console.log(
    `  Clef chose it                    ${right.length}/${out.length}`
  );
  console.log(
    `  ... of which the search alone decided  ${bySearch.filter((o) => o.decided === o.a.fdcId).length}/${bySearch.length} (single-row results, no model call)`
  );
  console.log(`  call failed after retries        ${failed.length}`);
  console.log(
    `  no candidates at all             ${out.filter((o) => o.n === 0).length}\n`
  );
  for (const o of out.filter((x) => x.r && !x.r.error)) {
    const ans = o.r.answers?.stand_in,
      yes = o.r.answers?.any_good?.noul;
    const ok = Number(ans?.choice) === o.a.fdcId;
    console.log(
      `  ${ok ? "✓" : o.had ? "✗" : "·"} ${(o.t.productName ?? o.t.name ?? "—").slice(0, 26).padEnd(28)}` +
        `conf ${(ans?.confidence ?? 0).toFixed(2)}  yes ${(yes ?? 0).toFixed(2)}  ` +
        `${ok ? "" : `took ${byId.get(Number(ans?.choice))?.description?.slice(0, 40) ?? ans?.choice}`}`
    );
  }
}
