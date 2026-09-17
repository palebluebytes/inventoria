#!/usr/bin/env node
/**
 * PROTOTYPE — #247. Throwaway. Not shipped, not gated, no tests.
 *
 * Can a model beat the mechanical matcher at proposing an OFF → USDA pairing?
 *
 * The bar, from #243 (`scripts/pairing-census.mjs`, reproducible with
 * `pnpm pairing:census`): over the 35 `gtin:` twins in #241's ledger export the
 * shipped matcher offers 16, agrees with hand adjudication 7 times, is wrong 9,
 * and 5 of those 9 are wrong in a way a person would plausibly accept. It is
 * structurally silent on 19 — and #247's own thread says that silent 19 is the
 * population that matters, because it is the only place a model can add reach
 * rather than reshuffle it.
 *
 * Five arms, cheapest first. The last two exist because the second one broke:
 *
 *   --control   NO MODEL, no network. The shipped search minus its conjunction:
 *               a row scores on how many of the record's words it carries, one
 *               word is enough, best score wins. This is the control #247 needs
 *               before it may credit a model with anything — if lenient
 *               retrieval alone clears the bar, the answer is "fix the search",
 *               not "add a model".
 *
 *   --model     The model picks an IDENTITY out of the whole corpus. Every one
 *               of the 2,023 shipped rows goes in the prompt as
 *               `fdcId<TAB>description` (76.5 KB, ~21.3k tokens against a 131k
 *               window), so the emission is an `fdcId` by construction and a
 *               hallucinated one is detectable by set membership. #240's Notes
 *               forbid a model emitting a NUMBER; an id is what they ask for,
 *               and #247's thread warns that a model emitting a QUERY instead
 *               inherits the conjunction that already scores `product_name` at
 *               0 of 35.
 *
 *   --catalogue=N  The same arm over a shorter candidate list, SEEDED with the
 *               adjudicated rows so a miss is never "it wasn't in the list".
 *               Measures capability at a shortlist size, never buildability.
 *
 *   --decoy     `--catalogue=N` inverted: N rows containing NONE of the right
 *               answers. The only way to price a CHUNKED scan, which hands the
 *               model sixteen such lists for every one that holds the answer.
 *
 *   --terms     No catalogue at all. The model names the food in English and
 *               says its state; the SHIPPED search does the reaching, scored at
 *               top-1 and top-5. Cheapest arm in the file, 192 neurons for 35.
 *
 *   --ablate=X  The #482 discipline: before crediting the model with a safety
 *               property, strip the sentence that might be carrying it.
 *                 refusal — drop "say null when no row is the food"
 *                 state   — drop the cooked/dried refusal (#489) AND the
 *                           label's energy, which is the only evidence in the
 *                           prompt that the jar is not the dry ingredient
 *
 * `--dry` writes the prompt and makes no call; `--rescore=<label>` scores a run
 * off its saved response, because a call already paid for must never be re-paid
 * to be read.
 *
 * Scored against the hand adjudication committed in `scripts/pairing-census.mjs`
 * — #188's premise, that whoever writes a rule does not also grade it, applies
 * doubly here: the truth was fixed before this arm existed.
 *
 * The population is PERSONAL DATA and is not in this repo (ADR-0064). It is read
 * out of #241's export, which lives outside every working tree. The prompts this
 * builds carry 35 product names and their label energies, so `--model` is real
 * egress: it goes through the `inventoria-model-route` gateway, whose
 * `collect_logs: false` is the only reason it is not also retained by AI Gateway
 * (`docs/how-to-operate-the-model-route.md`).
 *
 * Reads the shipped artifacts; regenerates nothing.
 *
 * Usage (every model arm needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN;
 * `node --env-file=../.env` from the main checkout is how they were supplied):
 *   node scratch/247/pairing-proposer.mjs --control
 *   node scratch/247/pairing-proposer.mjs --terms
 *   node scratch/247/pairing-proposer.mjs --model
 *   node scratch/247/pairing-proposer.mjs --model --catalogue=120
 *   node scratch/247/pairing-proposer.mjs --model --catalogue=120 --decoy
 *   node scratch/247/pairing-proposer.mjs --model --catalogue=120 --ablate=refusal
 *   node scratch/247/pairing-proposer.mjs --model --only=0078895126396 --catalogue=120
 *   node scratch/247/pairing-proposer.mjs --rescore=model-full-batch-35
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve as resolveTs } from "../../scripts/ts-resolve-hook.mjs";

registerHooks({ resolve: resolveTs });
const { buildSearchCorpus, searchIndexRows } =
  await import("../../src/lib/food/usda-corpus.ts");

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");
const EXPORT_PATH =
  process.env.INVENTORIA_LEDGER_EXPORT ??
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl");
const OUT_DIR = join(HERE, "responses");

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const GATEWAY = "inventoria-model-route";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

// ---------------------------------------------------------------------------
// The truth: #243's hand adjudication, read out of the committed census
// ---------------------------------------------------------------------------

/**
 * `ADJUDICATION` and `PLAUSIBLE_WRONG` are const object literals in
 * `scripts/pairing-census.mjs`, which is a script and exports nothing. Rather
 * than restate 35 verdicts here — the one thing a second copy would be free to
 * disagree about — the file is read and the two literals are evaluated out of
 * it. Brittle on purpose: if the census is refactored this throws instead of
 * scoring against a stale truth.
 */
function readCensusTruth() {
  const src = readFileSync(join(ROOT, "scripts", "pairing-census.mjs"), "utf8");
  const literal = (name) => {
    const at = src.indexOf(`const ${name} = {`);
    if (at < 0)
      throw new Error(`pairing-census.mjs no longer declares ${name}`);
    const open = src.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0)
        return new Function(`return ${src.slice(open, i + 1)}`)();
    }
    throw new Error(`unterminated ${name}`);
  };
  return {
    adjudication: literal("ADJUDICATION"),
    plausibleWrong: literal("PLAUSIBLE_WRONG"),
  };
}

// ---------------------------------------------------------------------------
// The population
// ---------------------------------------------------------------------------

/** Every `gtin:` twin in the export, latest datom per attribute by HLC stamp. */
function readPopulation(path) {
  const latest = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!row.entity?.startsWith("gtin:")) continue;
    const stamp = [row.hlc_ms, row.hlc_ctr];
    const attrs = latest.get(row.entity) ?? new Map();
    const held = attrs.get(row.attribute);
    if (
      !held ||
      stamp[0] > held.stamp[0] ||
      (stamp[0] === held.stamp[0] && stamp[1] > held.stamp[1])
    )
      attrs.set(row.attribute, { stamp, value: JSON.parse(row.value) });
    latest.set(row.entity, attrs);
  }

  return [...latest].map(([entity, attrs]) => {
    const prov =
      attrs.get("twin/raw_provenance")?.value ??
      attrs.get("provenance/raw")?.value;
    const product = prov?.raw_data?.product ?? prov?.product ?? {};
    const panel = attrs.get("nutrition/info")?.value ?? null;
    return {
      gtin: entity.slice("gtin:".length),
      typedName: attrs.get("food/name")?.value ?? null,
      hasOffRecord: Object.keys(product).length > 0,
      productName: product.product_name || product.product_name_en || null,
      genericName: product.generic_name || null,
      brands: product.brands || null,
      quantity: product.quantity || null,
      categories: product.categories || null,
      categoriesTags: product.categories_tags ?? [],
      ingredients:
        product.ingredients_text || product.ingredients_text_en || null,
      labels: product.labels_tags ?? [],
      countries: product.countries_tags ?? [],
      kcal: panel?.calories ?? null,
      protein: panel?.protein_content ?? null,
      carbs: panel?.carbohydrate_content ?? null,
      fat: panel?.fat_content ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

function readCorpus() {
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  return {
    schema_version: index.schema_version,
    // The shipped search, imported not restated (ADR-0047 §4) — the silent 19
    // is defined by what `searchIndexRows` reaches, so a second spelling of it
    // would be free to disagree about which twins the matcher can be asked.
    shipped: buildSearchCorpus(index),
    rows: index.foods.map((row) => ({
      fdcId: row.fdcId,
      description: row.description,
      also: row.also ?? [],
      kcal: row.macros?.calories ?? null,
    })),
  };
}

const WORD = /[a-z0-9]+/g;
const words = (s) =>
  String(s ?? "")
    .toLowerCase()
    .match(WORD) ?? [];

/**
 * STOP is not the shipped search's stop list — the shipped search has none,
 * because it never has to cope with a pack's marketing words. It exists so the
 * control is not handed `premium`, `bio` and a brand as if they were food.
 */
const STOP = new Set([
  "de",
  "la",
  "el",
  "los",
  "las",
  "con",
  "sin",
  "y",
  "al",
  "du",
  "des",
  "le",
  "les",
  "et",
  "aux",
  "der",
  "die",
  "das",
  "und",
  "mit",
  "premium",
  "pure",
  "bio",
  "eco",
  "ecologico",
  "ecologica",
  "organic",
  "natural",
  "g",
  "kg",
  "ml",
  "cl",
  "l",
  "pcs",
  "en",
  "of",
  "the",
  "and",
  "a",
  "for",
  "cm",
]);

// ---------------------------------------------------------------------------
// Arm: the control — the shipped search minus its conjunction
// ---------------------------------------------------------------------------

/**
 * A row scores on how many DISTINCT record words it carries; one is enough.
 *
 * Deliberately a restatement rather than an import, which is the opposite of
 * #243's rule (ADR-0047 §4: measure the ranking that ships or measure nothing).
 * The point here is to measure what does NOT ship — `searchIndexRows` takes a
 * query down whole the moment one word fails to land, and #243 measured that
 * costing `product_name` 0 of 35. So the conjunction is the variable and it
 * cannot be held fixed by importing it.
 */
function controlPropose(corpus, twin) {
  const asked = new Set(
    [
      twin.productName,
      twin.typedName,
      twin.genericName,
      twin.categories,
      ...twin.categoriesTags.map((t) =>
        t.replace(/^[a-z]{2}:/, "").replaceAll("-", " ")
      ),
    ]
      .flatMap(words)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
  if (asked.size === 0) return null;

  let best = null;
  for (const row of corpus.rows) {
    const have = new Set([
      ...words(row.description),
      ...row.also.flatMap(words),
    ]);
    let hit = 0;
    for (const w of asked) if (have.has(w)) hit++;
    if (hit === 0) continue;
    const score = [hit, -row.description.length];
    if (
      !best ||
      score[0] > best.score[0] ||
      (score[0] === best.score[0] && score[1] > best.score[1])
    )
      best = {
        fdcId: row.fdcId,
        description: row.description,
        score,
        matched: hit,
      };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Arm: the model picks an identity out of the whole corpus
// ---------------------------------------------------------------------------

const RULES = {
  base: [
    "You are matching a packaged product to a reference food in a fixed catalogue.",
    "The catalogue is the complete list below. You may only answer with an fdc_id that appears in it.",
    "Answer with the reference food whose per-100g composition is a fair stand-in for the SUBSTANCE in this pack, as the pack is sold.",
    "You are naming an identity, not a number. Never invent, adjust or interpolate a nutrient value.",
  ],
  refusal: [
    'Say "fdc_id": null whenever no row in the catalogue is the food in the pack. A refusal is a correct answer and is much better than a near miss: a compound sauce, a recipe, a flavoured drink or a derivative made by pressing, defatting or fermenting is a DIFFERENT food from its ingredient.',
  ],
  state: [
    'Say "fdc_id": null when the pack is sold cooked, boiled, canned or in brine and the only candidate row is the dry or raw ingredient. Water changes every figure per 100g. The label energy given for each product is the evidence: a dry pulse near 330 kcal/100g is not the same food as a jar at 104.',
  ],
  shape: [
    "Reply with nothing but a JSON array, one object per product, in the order given:",
    '[{"gtin":"<as given>","fdc_id":<integer or null>,"why":"<max 12 words>"}]',
  ],
};

/**
 * The second design, and the one this prototype only reached because the first
 * one broke: no catalogue at all. The model says, in English, what the food IS,
 * and the search the app already ships does the reaching.
 *
 * #247's thread warns that a model emitting a QUERY rather than an identity
 * inherits the conjunction that scores `product_name` at 0 of 35. That warning
 * is about the pack's OWN name, and #243 says why in the same breath: `"Pure
 * sesame oil"` reaches 0 rows where `"sesame oil"` reaches 1, and `"Premium Soy
 * Sauce"` reaches 0 where `"soy sauce"` reaches 5. The brand and the marketing
 * word are what the conjunction chokes on. So the question this arm asks is
 * whether a model can hand the shipped search the two or three words that are
 * actually the food — which is a translation and a strip, not a judgement about
 * composition, and needs no catalogue in the prompt to do.
 */
const TERM_RULES = [
  "For each packaged product below, say what the food IS in plain English, as a food reference book would name it.",
  "Two or three words. No brand, no marketing word, no pack size, no language other than English.",
  "Name the substance as the pack sells it, and say whether it is sold dry/raw or cooked/canned/in brine.",
  'Say "term": null only when the record does not say what the food is at all.',
  "Reply with nothing but a JSON array, one object per product, in the order given:",
  '[{"gtin":"<as given>","term":"<the food in English>","state":"dry|raw|cooked|canned|in brine|other","why":"<max 10 words>"}]',
];

/**
 * A catalogue of `n` rows that still contains every row hand adjudication
 * chose for these twins — the long-context diagnostic. Whether a model can pick
 * an id out of 2,023 rows and whether it can pick one out of 120 are different
 * questions, and only the second one has a chance of being about food.
 *
 * Filled by a deterministic stride so the kept rows are spread across the
 * catalogue rather than taken off the top, then re-sorted into the shipped
 * order. The truth rows are seeded first, so a miss here is never "it wasn't
 * in the list".
 */
function shrinkCatalogue(corpus, twins, truth, n, decoy = false) {
  const keep = new Map();
  const wanted = new Set(
    twins.map((t) => truth.adjudication[t.gtin]?.fdcId).filter(Boolean)
  );
  // `--decoy` inverts the seeding: a chunk of the catalogue that contains NONE
  // of the right answers. It is the only test that can price a CHUNKED scan —
  // 17 calls of 120 rows over the whole corpus — because such a scan hands the
  // model 16 chunks in which the honest answer is a refusal. A model that
  // proposes anyway makes the 16 refusals unbuyable at any price.
  if (!decoy)
    for (const want of wanted) {
      const row = corpus.rows.find((r) => r.fdcId === want);
      if (row) keep.set(row.fdcId, row);
    }
  const pool = decoy
    ? corpus.rows.filter((r) => !wanted.has(r.fdcId))
    : corpus.rows;
  const stride = Math.max(1, Math.floor(pool.length / (n - keep.size)));
  for (let i = 0; i < pool.length && keep.size < n; i += stride)
    keep.set(pool[i].fdcId, pool[i]);
  const order = new Map(corpus.rows.map((r, i) => [r.fdcId, i]));
  return [...keep.values()].sort(
    (a, b) => order.get(a.fdcId) - order.get(b.fdcId)
  );
}

function buildPrompt(corpus, twins, ablate, rows = corpus.rows, terms = false) {
  const rules = terms
    ? TERM_RULES
    : [
        ...RULES.base,
        ...(ablate === "refusal" ? [] : RULES.refusal),
        ...(ablate === "state" ? [] : RULES.state),
        ...RULES.shape,
      ];
  const catalogue = rows.map((r) => `${r.fdcId}\t${r.description}`).join("\n");
  const products = twins
    .map((t) => {
      const lines = [`gtin: ${t.gtin}`];
      const put = (k, v) => v && lines.push(`${k}: ${v}`);
      put("name on the shelf", t.productName ?? t.typedName);
      put("also called", t.genericName);
      put("brand", t.brands);
      put("pack size", t.quantity);
      put("categories (free text, any language)", t.categories);
      put(
        "category tags",
        t.categoriesTags.length ? t.categoriesTags.join(", ") : null
      );
      put("ingredients", t.ingredients);
      put("sold in", t.countries.map((c) => c.replace("en:", "")).join(", "));
      if (ablate !== "state" && t.kcal != null)
        lines.push(`label energy: ${t.kcal} kcal per 100 g`);
      if (!t.hasOffRecord)
        lines.push(
          "(no database record at all — this is only what was typed in)"
        );
      return lines.join("\n");
    })
    .join("\n\n");

  return [
    rules.join("\n"),
    "",
    ...(terms
      ? []
      : [
          `CATALOGUE (${rows.length} rows, fdc_id<TAB>description):`,
          catalogue,
          "",
        ]),
    `PRODUCTS (${twins.length}):`,
    products,
  ].join("\n");
}

async function askModel(prompt, label) {
  if (flag("dry")) {
    console.log("  --dry: prompt written, no call made");
    process.exit(0);
  }
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!account || !token)
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN must be in the environment"
    );
  const url = `https://gateway.ai.cloudflare.com/v1/${account}/${GATEWAY}/workers-ai/${MODEL}`;
  const body = {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 3000,
    temperature: 0,
  };
  const started = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "cf-aig-collect-log": "false",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, `${label}.json`),
    JSON.stringify(
      {
        label,
        model: MODEL,
        status: res.status,
        ms: Date.now() - started,
        body: text,
      },
      null,
      2
    )
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  const parsed = JSON.parse(text);
  // `result.response` on this endpoint is the model's JSON ALREADY PARSED into
  // an array — interpolating it yields `[object Object],…`, which is the shape
  // of a bug that looks like a malformed reply. The string is under `choices`.
  const content = parsed.result?.choices?.[0]?.message?.content;
  const usage = parsed.result?.usage ?? {};
  console.log(
    `  ${res.status} in ${Date.now() - started}ms — ` +
      `${usage.prompt_tokens} in, ${usage.completion_tokens} out, ` +
      `${usage.neurons?.toFixed(1)} neurons, finish ${parsed.result?.choices?.[0]?.finish_reason}`
  );
  return typeof content === "string"
    ? content
    : JSON.stringify(parsed.result?.response ?? "");
}

/** The model's reply, which is prose-free by instruction but not by guarantee. */
function readAnswers(reply) {
  const open = reply.indexOf("[");
  const close = reply.lastIndexOf("]");
  if (open < 0 || close < open)
    throw new Error(`no JSON array in reply: ${reply.slice(0, 300)}`);
  return JSON.parse(reply.slice(open, close + 1));
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function score(name, proposals, truth, corpus, silent, asked) {
  const fdcIds = new Set(corpus.rows.map((r) => r.fdcId));
  const byId = new Map(corpus.rows.map((r) => [r.fdcId, r.description]));
  const out = {
    name,
    offers: 0,
    agrees: 0,
    wrong: 0,
    wrongWhereSilenceWasRight: 0,
    stateGapAccepted: 0,
    hallucinated: 0,
    silent: 0,
    rows: [],
  };
  for (const [gtin, verdict] of Object.entries(truth.adjudication)) {
    if (asked && !asked.has(gtin)) continue;
    const p = proposals.get(gtin) ?? null;
    const want = verdict.verdict === "paired" ? verdict.fdcId : null;
    const id = p?.fdcId ?? null;
    let mark;
    if (id === null) {
      out.silent++;
      mark = want === null ? "refused (right)" : "refused (missed)";
    } else if (!fdcIds.has(id)) {
      out.hallucinated++;
      out.offers++;
      mark = "HALLUCINATED id";
    } else {
      out.offers++;
      if (id === want) {
        out.agrees++;
        mark = "agrees";
      } else {
        out.wrong++;
        if (verdict.verdict === "none") {
          out.wrongWhereSilenceWasRight++;
          mark = "WRONG (silence was right)";
        } else if (verdict.verdict === "state-gap") {
          out.stateGapAccepted++;
          mark = "WRONG (state gap accepted)";
        } else {
          mark = "WRONG";
        }
      }
    }
    out.rows.push({
      gtin,
      food: verdict.name,
      verdict: verdict.verdict,
      want,
      got: id,
      gotName: id == null ? null : (byId.get(id) ?? "(not in corpus)"),
      mark,
      why: p?.why ?? p?.description ?? null,
      inSilent19: silent.has(gtin),
    });
  }
  return out;
}

function report(s, silentOnly) {
  const rows = silentOnly ? s.rows.filter((r) => r.inSilent19) : s.rows;
  const tally = (f) => rows.filter(f).length;
  const scope = silentOnly ? "the 19 the matcher is silent on" : "all 35";
  console.log(`\n### ${s.name} — ${scope}`);
  console.log(
    `  offers ${tally((r) => r.got !== null)}/${rows.length}` +
      `   agrees ${tally((r) => r.mark === "agrees")}` +
      `   wrong ${tally((r) => r.mark.startsWith("WRONG"))}` +
      `   refused-right ${tally((r) => r.mark === "refused (right)")}` +
      `   refused-missed ${tally((r) => r.mark === "refused (missed)")}`
  );
  const bad = rows.filter((r) => r.mark.startsWith("WRONG"));
  if (bad.length) {
    console.log(`  wrong answers:`);
    for (const r of bad)
      console.log(
        `    ${r.food.padEnd(36)} ${r.mark}\n` +
          `      got  ${r.got} ${r.gotName}\n` +
          `      want ${r.want ?? "a refusal"}${r.want ? ` ${r.gotName && ""}` : ""}` +
          (r.why ? `\n      why  ${r.why}` : "")
      );
  }
  const missed = rows.filter((r) => r.mark === "refused (missed)");
  if (missed.length) {
    console.log(`  reach it did not take:`);
    for (const r of missed)
      console.log(`    ${r.food.padEnd(36)} want ${r.want}`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const truth = readCensusTruth();
const corpus = readCorpus();
const population = readPopulation(EXPORT_PATH);
const only = opt("only")?.split(",").filter(Boolean) ?? null;

/**
 * The 19 the matcher cannot be asked, straight out of #243's own two reasons:
 * no `en:` category tag at all (16), or `en:` tags that reach no row (3). Read
 * from the census's own definition of silence rather than pasted as a list.
 */
const silent = new Set(
  population
    .filter((t) => {
      // `queriesFor` in the census, restated in two lines: `en:` tags only,
      // read backwards because OFF orders a tag list broad to specific.
      const tags = t.categoriesTags
        .filter((x) => x.startsWith("en:"))
        .map((x) => x.slice(3).replaceAll("-", " ").toLowerCase())
        .reverse();
      const queries = [...tags, t.productName ?? t.typedName];
      return !queries.some(
        (q) => q && searchIndexRows(corpus.shipped, q).hits.length > 0
      );
    })
    .map((t) => t.gtin)
);

const twins = population.filter(
  (t) => truth.adjudication[t.gtin] && (!only || only.includes(t.gtin))
);
/** Scoring is scoped to what was actually asked, or `--only` reads as silence. */
const asked = new Set(twins.map((t) => t.gtin));

console.log(`# #247 — a model against the matcher\n`);
console.log(
  `Corpus      : ${corpus.rows.length} rows, schema ${corpus.schema_version}`
);
console.log(
  `Population  : ${twins.length} twins (${silent.size} the matcher is silent on)`
);

if (flag("control")) {
  const proposals = new Map(
    twins.map((t) => [t.gtin, controlPropose(corpus, t)])
  );
  const s = score(
    "control: lenient retrieval, no model",
    proposals,
    truth,
    corpus,
    silent,
    asked
  );
  report(s, false);
  report(s, true);
  writeFileSync(join(HERE, "control.json"), JSON.stringify(s, null, 2));
}

/**
 * Score a run off its saved raw response, spending nothing.
 *
 * Exists because the first full-corpus call threw on `result.response` before
 * it scored — and a call already paid for must never be re-paid to be read.
 */
if (opt("rescore")) {
  const file = join(OUT_DIR, `${opt("rescore")}.json`);
  const saved = JSON.parse(readFileSync(file, "utf8"));
  const content = JSON.parse(saved.body).result.choices[0].message.content;
  const answers = readAnswers(content);
  const proposals = new Map(
    answers.map((a) => [
      String(a.gtin),
      a.fdc_id == null ? null : { fdcId: Number(a.fdc_id), why: a.why },
    ])
  );
  const s = score(
    `rescored: ${opt("rescore")}`,
    proposals,
    truth,
    corpus,
    silent,
    asked
  );
  report(s, false);
  report(s, true);
  console.log(
    `\n  offers ${s.offers}  agrees ${s.agrees}  wrong ${s.wrong}` +
      `  (silence-was-right ${s.wrongWhereSilenceWasRight}, state-gap accepted ${s.stateGapAccepted})` +
      `  hallucinated ${s.hallucinated}  refusals ${s.silent}`
  );
  writeFileSync(
    join(HERE, `${opt("rescore")}.json`),
    JSON.stringify(s, null, 2)
  );
}

if (flag("terms")) {
  const prompt = buildPrompt(corpus, twins, null, [], true);
  const label = `terms-batch-${twins.length}`;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${label}.prompt.txt`), prompt);
  console.log(
    `\nprompt: ${prompt.length} bytes ≈ ${Math.round(prompt.length / 3.6)} tokens (no catalogue)`
  );
  const answers = readAnswers(await askModel(prompt, label));
  const byGtin = new Map(answers.map((a) => [String(a.gtin), a]));

  // What the SHIPPED search does with the model's words — imported, not
  // restated (ADR-0047 §4). Top-1 is what a proposer would offer; top-5 is what
  // a person scrolling the results the app already renders would see.
  const out = [];
  for (const t of twins) {
    const a = byGtin.get(t.gtin);
    const verdict = truth.adjudication[t.gtin];
    const want = verdict.verdict === "paired" ? verdict.fdcId : null;
    const hits = a?.term ? searchIndexRows(corpus.shipped, a.term).hits : [];
    const ids = hits.map((h) => h.row.fdcId);
    out.push({
      gtin: t.gtin,
      food: verdict.name,
      verdict: verdict.verdict,
      term: a?.term ?? null,
      state: a?.state ?? null,
      want,
      top1: ids[0] ?? null,
      top1Name: hits[0]?.row.description ?? null,
      depth: ids.length,
      rank: want === null ? null : ids.indexOf(want) + 1 || null,
      inSilent19: silent.has(t.gtin),
    });
  }

  const show = (rows, scope) => {
    const pairable = rows.filter((r) => r.verdict === "paired");
    const reached = (n) => pairable.filter((r) => r.rank && r.rank <= n).length;
    console.log(
      `\n### model names the food, the shipped search reaches it — ${scope}`
    );
    console.log(
      `  ${rows.length} twins, ${pairable.length} of them pairable at all`
    );
    console.log(
      `  the search reaches nothing at all for ${rows.filter((r) => r.depth === 0).length}` +
        `   (term was null for ${rows.filter((r) => !r.term).length})`
    );
    console.log(
      `  adjudicated row at top-1 ${reached(1)}/${pairable.length}` +
        `   in top-5 ${reached(5)}/${pairable.length}` +
        `   anywhere in the hits ${pairable.filter((r) => r.rank).length}/${pairable.length}`
    );
    const refusable = rows.filter((r) => r.verdict !== "paired");
    console.log(
      `  where a refusal was right (${refusable.length}): the search still offered a top row for ` +
        `${refusable.filter((r) => r.top1).length}`
    );
  };
  show(out, "all 35");
  show(
    out.filter((r) => r.inSilent19),
    "the 19 the matcher is silent on"
  );

  console.log(`\n  per twin:`);
  for (const r of out)
    console.log(
      `    ${r.food.slice(0, 34).padEnd(35)} ${String(r.term ?? "—").padEnd(26)}` +
        ` ${String(r.state ?? "").padEnd(9)} ${r.verdict.padEnd(9)}` +
        ` rank ${r.rank ?? "—"}  depth ${r.depth}` +
        (r.rank === 1
          ? "  ✓"
          : r.verdict === "paired" && !r.rank
            ? "  MISSED"
            : "") +
        (r.verdict !== "paired" && r.top1 ? `  offered ${r.top1Name}` : "")
    );
  writeFileSync(join(HERE, `${label}.json`), JSON.stringify(out, null, 2));
  console.log(`\nraw reply: scratch/247/responses/${label}.json`);
}

if (flag("model")) {
  const ablate = opt("ablate");
  const shrink = opt("catalogue") ? Number(opt("catalogue")) : null;
  const decoy = flag("decoy");
  const rows = shrink
    ? shrinkCatalogue(corpus, twins, truth, shrink, decoy)
    : corpus.rows;
  const label = [
    "model",
    ablate ? `ablate-${ablate}` : "full",
    only ? `only-${only.length}` : `batch-${twins.length}`,
    `cat-${rows.length}${decoy ? "-decoy" : ""}`,
  ].join("-");
  const prompt = buildPrompt(corpus, twins, ablate, rows);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${label}.prompt.txt`), prompt);
  console.log(
    `\nprompt: ${prompt.length} bytes ≈ ${Math.round(prompt.length / 3.6)} tokens` +
      ` → ≈ ${Math.round((prompt.length / 3.6 / 1e6) * 24545)} neurons in` +
      (ablate ? `   [ABLATED: ${ablate}]` : "")
  );
  const reply = await askModel(prompt, label);
  const answers = readAnswers(reply);
  const proposals = new Map(
    answers.map((a) => [
      String(a.gtin),
      a.fdc_id == null ? null : { fdcId: Number(a.fdc_id), why: a.why },
    ])
  );
  const s = score(
    `model${ablate ? ` (ablated: ${ablate})` : ""}`,
    proposals,
    truth,
    corpus,
    silent,
    asked
  );
  report(s, false);
  report(s, true);
  writeFileSync(join(HERE, `${label}.json`), JSON.stringify(s, null, 2));
  console.log(`\nraw reply: scratch/247/responses/${label}.json`);
}
