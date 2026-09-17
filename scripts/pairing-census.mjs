#!/usr/bin/env node
/**
 * #243's measurement: over the packaged food actually logged, how many Open
 * Food Facts twins can be paired to a USDA reference food, and by what?
 *
 * Three proposers over one population, the way [#243] asks for them:
 *
 * 1. **Your own past pairings**, measured CROSS-BARCODE — could a pairing made
 *    on an earlier, different product have proposed this one? The twin's own
 *    datom is already the same-barcode cache (#240's Notes), so a proposer that
 *    only repeats a barcode it has seen proposes nothing new.
 * 2. **The mechanical matcher** — OFF `categories_tags` and `product_name` run
 *    through `searchIndexRows`, the search the app ships. Imported, never
 *    restated, for ADR-0047 §4's reason: this measures the ranking that ships
 *    or it measures nothing.
 * 3. **The ceiling** — {@link ADJUDICATION}, hand-read against the corpus, one
 *    row at a time. Without it the other two numbers mean nothing.
 *
 * **The population is personal data and is not in this repo.** It is read out
 * of the ledger export #241 produced, which lives outside any working tree and
 * is never committed (ADR-0064). What IS committed is the adjudication: the
 * verdict per barcode, with the reason, so the ceiling can be argued with
 * rather than taken on trust (#188's premise — whoever writes a rule does not
 * also get to say whether it worked).
 *
 * Reads the shipped artifacts; regenerates nothing.
 *
 * Usage: `node scripts/pairing-census.mjs [--verbose]`
 *        `INVENTORIA_LEDGER_EXPORT=/path/to/ledger-export.jsonl node scripts/pairing-census.mjs`
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve as resolveTs } from "./ts-resolve-hook.mjs";

registerHooks({ resolve: resolveTs });
const { buildSearchCorpus, searchIndexRows } =
  await import("../src/lib/food/usda-corpus.ts");
const { BAKED_NUTRIENT_TARGETS_G } =
  await import("../src/lib/food/nutrition-targets.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");
const STORE_PATH = join(ROOT, "public", "usda", "nutrient-store.json");
const EXPORT_PATH =
  process.env.INVENTORIA_LEDGER_EXPORT ??
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl");

const VERBOSE = process.argv.includes("--verbose");

// ---------------------------------------------------------------------------
// The ceiling: every twin in the population, adjudicated by hand
// ---------------------------------------------------------------------------

/**
 * What a perfect proposer COULD have offered for each barcode, and why.
 *
 * `fdcId` is the row this session would accept if the app offered it;
 * `null` is a refusal, and `why` carries the refusal's reason as well as the
 * acceptance's. Every entry was read against the shipped 2,023-row corpus
 * rather than against USDA at large, because a row this app does not ship
 * cannot be proposed by anything.
 *
 * Three verdicts, not two, and the third is the finding:
 *
 * - `paired` — the corpus holds a reference food for this substance in a state
 *   whose per-100 g composition is a fair stand-in for the product as eaten.
 * - `state-gap` — the corpus holds the INGREDIENT but only dried or raw, and
 *   the product is sold cooked or in brine. ADR-0103/0104 consolidated the
 *   corpus to uncooked foods, so there is a row, and a per-100 g annotation off
 *   it would be wrong by the water the cooking added — roughly threefold for a
 *   pulse. Counted apart from `paired` because calling it a pairing is what
 *   would put a 3x error into a meter.
 * - `none` — no defensible row, or the OFF record does not say what the food is.
 */
const ADJUDICATION = {
  8436578483167: {
    name: "Aceite de oliva virgen extra",
    verdict: "paired",
    fdcId: 171413,
    why: "Oil, olive, salad or cooking. Same substance, no state change; USDA carries vitamin E and K, which the label does not.",
  },
  4068263049675: {
    name: "Alubia roja cocida",
    verdict: "state-gap",
    fdcId: 175193,
    why: "#240's motivating case. `fdcId 173740` (kidney beans, cooked, boiled) is the row the map's Notes cite and it is NO LONGER SHIPPED — ADR-0103/0104's consolidation dropped every cooked row. What survives is `Beans, kidney, all types, dried` at ~333 kcal/100 g against this jar's 104.",
  },
  4068263001970: {
    name: "Bebida de almendra ecologica",
    verdict: "paired",
    fdcId: 1999631,
    why: "Almond milk, unsweetened, plain. Same kind of product at the same dilution order; the label already carries the fortified vitamins, so what USDA adds is the rest.",
  },
  8423352106213: {
    name: "Bebida de arroz + coco",
    verdict: "none",
    fdcId: null,
    why: "A 15% rice drink with 2% coconut milk. The corpus has no rice beverage, and `Nuts, coconut milk` is the undiluted ingredient.",
  },
  5400706613279: {
    name: "Cacao Nibs",
    verdict: "none",
    fdcId: null,
    why: "The corpus holds cocoa POWDER, which is the defatted derivative — 13% fat against the nibs' 55%. Every mineral per 100 g is concentrated by the fat that was pressed out.",
  },
  8852646172007: {
    name: "Chili Paste with holy basil leaves",
    verdict: "none",
    fdcId: null,
    why: "A compound condiment. No single reference food describes it.",
  },
  6921804720304: {
    name: "Crispy Chilli in Oil",
    verdict: "none",
    fdcId: null,
    why: "45% soybean oil, 25% chilli, 15% onion. A recipe, not a food.",
  },
  3228023910039: {
    name: "Emmental Cœur de Meule",
    verdict: "paired",
    fdcId: 746767,
    why: "Cheese, swiss — which is what USDA files Emmental as. The matcher cannot reach it: OFF's leaf tag is `en:emmentaler`, and that word appears nowhere in the corpus.",
  },
  8414532033207: {
    name: "Espinaca picada",
    verdict: "paired",
    fdcId: 1999633,
    why: "Spinach, mature. Frozen chopped spinach is blanched leaf; the per-100 g composition is the same order, and spinach is where USDA's folate, iron and magnesium are worth having.",
  },
  8426967020677: {
    name: "Frijoles negros",
    verdict: "state-gap",
    fdcId: 173734,
    why: "Canned black beans in sauce. `Beans, black, dried` at ~341 kcal/100 g against the jar's 91. Same shape as the kidney bean above.",
  },
  3379141822848: {
    name: "Galette De Riz Ronde 22 CM LION",
    verdict: "none",
    fdcId: null,
    why: "Rice paper: rice, tapioca, water, salt, dried into a sheet. A manufactured product, not the grain; the corpus has neither it nor a rice flour that would stand for it.",
  },
  6901089041097: {
    name: "Glasnudeln | Vermicelles",
    verdict: "none",
    fdcId: null,
    why: "Mung bean glass noodles are mung bean STARCH — near-zero protein. `Mung beans, dried` carries 24 g of it. The corpus row names the seed the starch was taken out of.",
  },
  3379140130067: {
    name: "Haricots chinois",
    verdict: "none",
    fdcId: null,
    why: "The name says yardlong bean and the label does not: 122 kcal and 13.1 g protein against `Yardlong bean` raw at 47 and 2.8. The only candidate disagrees with the printed panel by 2.6x on energy, which is the macro-overlap check refusing a pairing the name would have waved through.",
  },
  8410069021649: {
    name: "Harina Gallo",
    verdict: "paired",
    fdcId: 789951,
    why: "Flour, wheat, all-purpose, unbleached. Same substance, no state change.",
  },
  "0060032101083": {
    name: "Jarabe de arce",
    verdict: "paired",
    fdcId: 169661,
    why: "Syrups, maple. The cleanest pairing in the population, and the one the matcher gets for free: OFF's leaf tag is `en:maple-syrups` and the corpus answers it.",
  },
  8424790111005: {
    name: "Kéfir",
    verdict: "paired",
    fdcId: 2259793,
    why: "The corpus has no kefir. `Yogurt, plain, whole milk` is the same milk under a different ferment, and the calcium, B12 and phosphorus a person would want from it do not turn on which culture did the work. A substitution the user must see and confirm, which is the shape #240 already committed to.",
  },
  8480017747297: {
    name: "Liguine-Tallarines",
    verdict: "paired",
    fdcId: 169736,
    why: "Pasta, dry. Dry durum pasta against dry durum pasta.",
  },
  "0078895126389": {
    name: "LKK's PREMIUM DARK SOY SAUCE",
    verdict: "paired",
    fdcId: 174277,
    why: "Soy sauce made from soy and wheat (shoyu). Dark soy carries caramel and sugar the reference does not, and the sodium is the label's anyway (#240: USDA fills silence only).",
  },
  8436551861487: {
    name: "Oli de Gira-Sol",
    verdict: "paired",
    fdcId: 171025,
    why: "Oil, sunflower, linoleic (approx. 65%). The corpus holds four sunflower oils that differ by fatty-acid profile; for the vitamin E a bottle of frying oil is being annotated with, any of them is the same answer.",
  },
  8721321940623: {
    name: "Panko breadcrumbs",
    verdict: "paired",
    fdcId: 174928,
    why: "Bread, crumbs, dry, grated, plain. Adjudicable, and unreachable by the matcher for a reason the matcher cannot fix: this twin was hand-typed from the label and has no OFF record at all.",
  },
  5060326278786: {
    name: "Peanut butter powder",
    verdict: "paired",
    fdcId: 174267,
    why: "Peanut flour, defatted. USDA's name for exactly this product.",
  },
  8431876301304: {
    name: "Pepinillo Laminado",
    verdict: "paired",
    fdcId: 169378,
    why: "Pickles, cucumber, sweet. The ingredients list vinegar and sugar, which is what picks the sweet row over the dill one.",
  },
  8414100382003: {
    name: "Pink tonic",
    verdict: "none",
    fdcId: null,
    why: "The corpus has no tonic water. Hand-typed twin, no OFF record.",
  },
  "0078895126396": {
    name: "Premium Soy Sauce",
    verdict: "paired",
    fdcId: 174277,
    why: "Soy sauce made from soy and wheat (shoyu). The second barcode in the population to land on this row, and the only cross-barcode repeat in it.",
  },
  5013635484287: {
    name: "Pure sesame oil",
    verdict: "paired",
    fdcId: 171016,
    why: "Oil, sesame, salad or cooking.",
  },
  8026160007705: {
    name: "Riccotta",
    verdict: "paired",
    fdcId: 746766,
    why: "Cheese, ricotta, whole milk. The ingredients are whey, milk, cream and salt, which is the whole-milk row rather than the part-skim one.",
  },
  3364699043470: {
    name: "Shanxi sliced noodles",
    verdict: "paired",
    fdcId: 168908,
    why: "Noodles, japanese, somen, dry — dried wheat noodle against dried wheat noodle. `Pasta, dry` would serve as well; neither is reachable from an OFF record that carries no categories at all.",
  },
  6902253111721: {
    name: "Shirataki nouilles",
    verdict: "none",
    fdcId: null,
    why: "Konjac. 20 kcal/100 g and nothing in the corpus resembles it.",
  },
  8480017305978: {
    name: "Tagliata al huevo",
    verdict: "paired",
    fdcId: 169731,
    why: "Noodles, egg, dry.",
  },
  "0300719065117": {
    name: "Tofu Blando",
    verdict: "paired",
    fdcId: 172449,
    why: "Tofu, soft, prepared with calcium sulfate and magnesium chloride (nigari). The coagulant decides the calcium, which is the one number worth pairing tofu for, and the OFF record does not say which was used — so this is an acceptance the user has to make, not one a proposer may make for them.",
  },
  8414100382027: {
    name: "Tonic Water Zero",
    verdict: "none",
    fdcId: null,
    why: "No tonic water in the corpus. Hand-typed twin, no OFF record. (Its `food/ingredients_text` describes a gazpacho — a capture-path defect in the ledger, noted and left to #208.)",
  },
  8424790113009: {
    name: "Unknown",
    verdict: "none",
    fdcId: null,
    why: "The OFF shell case #240 was chartered on, in its harder form: 93 kcal, 7 g fat, 4 g protein, and no name, no categories and no ingredients. A perfect proposer reads the record, and this record does not say what the food is. Only the person holding it can start the pairing.",
  },
  8710411045003: {
    name: "Unknown",
    verdict: "paired",
    fdcId: 172470,
    why: "Peanut butter, smooth style, without salt. The OFF record has NO product name and is still adjudicable, because `en:peanut-butters` says what the blank name does not — the one case in the population where the categories carry the food and the name carries nothing.",
  },
  6901017331207: {
    name: "Vinaigre De Riz 600 G",
    verdict: "paired",
    fdcId: 172237,
    why: "Vinegar, distilled. Honest and worthless: both are water and acetic acid, and the annotation would move no meter. Counted as a pairing because it is one, and reported as moving nothing, because that is the number that decides whether the machinery earns its keep.",
  },
  8424790100047: {
    name: "Yogur natural con leche de vacas de pasto",
    verdict: "paired",
    fdcId: 2259793,
    why: "Yogurt, plain, whole milk.",
  },
};

/**
 * The barcodes where the matcher's wrong answer is one a person would plausibly
 * ACCEPT, which #243 says is the number that matters more than the other two.
 *
 * A hand judgement, and kept apart from {@link ADJUDICATION} because it judges
 * the matcher rather than the food. The test applied: shown this row beside
 * this pack, with nothing else on the screen, would a person tap yes? A
 * brewed coffee proposed for an almond drink fails it on sight. A part-skim
 * ricotta proposed for a whole-milk one does not.
 */
const PLAUSIBLE_WRONG = {
  8436551861487:
    "Two sunflower oils that differ by fatty-acid profile. Accepted, and harmless — x1.00 on every material metered nutrient.",
  8026160007705:
    "Part-skim ricotta for whole-milk ricotta. Accepted, mildly wrong.",
  3228023910039:
    "Parmesan for Emmental. Both hard cheeses on a board; accepted, and wrong by x0.40 on B12.",
  8414532033207:
    "Mustard spinach for spinach. Accepted by anyone not reading closely, and it silently zeroes vitamin E.",
  8410069021649:
    "Self-rising flour for plain flour. The worst one in the population: accepted without hesitation, and the leavening carries x16.10 the calcium.",
};

// ---------------------------------------------------------------------------
// The population, read out of the export
// ---------------------------------------------------------------------------

/**
 * Every `gtin:` twin in the export, with the OFF record it was captured from.
 *
 * Latest datom per attribute by HLC stamp (ADR-0020), which is what the app's
 * own fold does — a twin edited after capture must be read as it stands now, or
 * the census measures a product that was superseded.
 */
function readPopulation(path) {
  const latest = new Map();
  const firstSeen = new Map();
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
    const seen = firstSeen.get(row.entity);
    if (seen === undefined || row.hlc_ms < seen)
      firstSeen.set(row.entity, row.hlc_ms);
  }

  return [...latest].map(([entity, attrs]) => {
    const provenance =
      attrs.get("twin/raw_provenance")?.value ??
      attrs.get("provenance/raw")?.value;
    const product = provenance?.raw_data?.product ?? provenance?.product ?? {};
    return {
      gtin: entity.slice("gtin:".length),
      captured: firstSeen.get(entity),
      name: attrs.get("food/name")?.value ?? null,
      panel: attrs.get("nutrition/info")?.value ?? null,
      hasOffRecord: Object.keys(product).length > 0,
      productName: product.product_name || null,
      categoriesTags: product.categories_tags ?? [],
    };
  });
}

// ---------------------------------------------------------------------------
// Proposer 2: the mechanical matcher
// ---------------------------------------------------------------------------

/**
 * The queries an OFF record offers the corpus, most specific first.
 *
 * `en:`-prefixed tags only. OFF's taxonomy is canonically English however the
 * pack is written, which is the whole reason the categories are worth more here
 * than the name — this population is Spanish, French, Catalan, Dutch, German
 * and Chinese, and the corpus is English. A `da:`, `es:` or `fr:` tag is a
 * language-local leaf OFF never canonicalised and the corpus cannot answer.
 *
 * OFF orders a tag list broad to specific, so it is read backwards.
 */
function queriesFor(twin) {
  const tags = twin.categoriesTags
    .filter((tag) => tag.startsWith("en:"))
    .map((tag) => tag.slice(3).replaceAll("-", " ").toLowerCase())
    .reverse();
  return { tags, name: twin.productName ?? twin.name };
}

/** The first query that reaches anything, and the row it put on top. */
function propose(corpus, queries) {
  for (const query of queries) {
    if (!query) continue;
    const { hits } = searchIndexRows(corpus, query);
    if (hits.length > 0)
      return {
        query,
        fdcId: hits[0].row.fdcId,
        description: hits[0].row.description,
        depth: hits.length,
      };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The macro-overlap check
// ---------------------------------------------------------------------------

/**
 * How far a proposed row's macros stand from the label's, where both carry one.
 *
 * #240 forbids filling a panel from two sources and says the label always wins.
 * That leaves the overlapping macros doing nothing — and they are the only
 * evidence in the system that a proposal is about the right food. Energy is the
 * one reported: it is on every label and every row, and it is what a state
 * change moves most.
 *
 * Returns the ratio row/label, so 3.2 means the reference food carries three
 * times the energy of the thing in the jar.
 */
function energyRatio(panel, row) {
  const label = panel?.calories;
  const reference = row?.macros?.calories;
  if (!label || !reference) return null;
  return reference / label;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
const corpus = buildSearchCorpus(index);
const rowsById = new Map(index.foods.map((row) => [row.fdcId, row]));
const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));

const population = readPopulation(EXPORT_PATH).sort(
  (a, b) => a.captured - b.captured
);
const missing = population.filter((twin) => !ADJUDICATION[twin.gtin]);
if (missing.length > 0) {
  console.error(
    `Un-adjudicated barcodes in the export: ${missing.map((t) => `${t.gtin} (${t.name})`).join(", ")}`
  );
  process.exitCode = 1;
}

/** The twelve micronutrients `nutrition-targets.ts` puts a meter under. */
const METERED = {
  1114: "vitamin_d",
  1087: "calcium",
  1089: "iron",
  1092: "potassium",
  1106: "vitamin_a",
  1109: "vitamin_e",
  1175: "vitamin_b6",
  1178: "vitamin_b12",
  1177: "folate",
  1090: "magnesium",
  1095: "zinc",
  1079: "fiber_content",
};

const rows = population.map((twin) => {
  const truth = ADJUDICATION[twin.gtin] ?? {
    verdict: "unknown",
    fdcId: null,
    why: "",
  };
  const { tags, name } = queriesFor(twin);
  const byCategory = propose(corpus, tags);
  const byName = propose(corpus, [name]);
  const combined = byCategory ?? byName;
  return { twin, truth, byCategory, byName, combined };
});

/** Proposer 1, cross-barcode: was this row already reached from an earlier, different barcode? */
const seen = new Set();
for (const row of rows) {
  row.byHistory = row.truth.fdcId !== null && seen.has(row.truth.fdcId);
  if (row.truth.fdcId !== null) seen.add(row.truth.fdcId);
}

const pairable = rows.filter((r) => r.truth.verdict === "paired");
const stateGap = rows.filter((r) => r.truth.verdict === "state-gap");
const refused = rows.filter((r) => r.truth.verdict === "none");
const noOffRecord = rows.filter((r) => !r.twin.hasOffRecord);
const noCategories = rows.filter(
  (r) => r.twin.hasOffRecord && r.twin.categoriesTags.length === 0
);
const noEnglishCategories = rows.filter(
  (r) => queriesFor(r.twin).tags.length === 0
);

const agrees = (row, proposal) =>
  proposal !== null && proposal.fdcId === row.truth.fdcId;
const wrong = (row, proposal) =>
  proposal !== null && proposal.fdcId !== row.truth.fdcId;

const score = (label, pick) => {
  const proposed = rows.filter((r) => pick(r) !== null);
  const right = rows.filter((r) => agrees(r, pick(r)));
  const bad = rows.filter((r) => wrong(r, pick(r)));
  const badOverRefusal = bad.filter((r) => r.truth.fdcId === null);
  console.log(
    `${label.padEnd(28)} proposes ${String(proposed.length).padStart(2)}/${rows.length}` +
      `   agrees ${String(right.length).padStart(2)}` +
      `   wrong ${String(bad.length).padStart(2)}` +
      ` (of which ${badOverRefusal.length} where the honest answer was silence)`
  );
  return { proposed, right, bad, badOverRefusal };
};

console.log(`\n# The pairing census (#243)\n`);
console.log(
  `Corpus      : ${index.foods.length} rows, schema ${index.schema_version}`
);
console.log(`Population  : ${rows.length} gtin: twins from ${EXPORT_PATH}`);
console.log(
  `              ${noOffRecord.length} were hand-typed from the label and have no OFF record at all`
);
console.log(
  `              ${noCategories.length} have an OFF record carrying NO categories_tags`
);
console.log(
  `              ${noEnglishCategories.length} offer the matcher no English category tag (the two above, plus language-local leaves)`
);

console.log(`\n## 3. The ceiling — what could be paired at all\n`);
console.log(
  `  paired    ${String(pairable.length).padStart(2)}/${rows.length}   a reference food for the substance, in a usable state`
);
console.log(
  `  state-gap ${String(stateGap.length).padStart(2)}/${rows.length}   the corpus holds the ingredient DRIED and the product is sold cooked`
);
console.log(
  `  none      ${String(refused.length).padStart(2)}/${rows.length}   no defensible row, or the record does not say what the food is`
);

console.log(`\n## 1 & 2. The proposers, against that ceiling\n`);
const history = rows.filter((r) => r.byHistory);
console.log(
  `${"1. own past pairings".padEnd(28)} proposes ${String(history.length).padStart(2)}/${rows.length}` +
    `   (cross-barcode repeats of a row an earlier product already reached)`
);
score("2a. categories_tags", (r) => r.byCategory);
score("2b. product_name", (r) => r.byName);
score("2. matcher (categories→name)", (r) => r.combined);

console.log(
  `\n  product_name reaches nothing at all, and not only because this shopping is` +
    `\n  Spanish, French, Catalan and Chinese. The shipped search drops a row the` +
    `\n  moment one typed word fails to land, so a pack's name — which always` +
    `\n  carries a brand or a marketing word — is refused whole: "Pure sesame oil"` +
    `\n  reaches 0 rows where "sesame oil" reaches 1, and "Premium Soy Sauce"` +
    `\n  reaches 0 where "soy sauce" reaches 5.`
);

// ---------------------------------------------------------------------------
// How wrong is a wrong proposal?
// ---------------------------------------------------------------------------

/**
 * The worst metered-micronutrient divergence between what the matcher proposed
 * and what the hand adjudication chose, for the rows where they disagree.
 *
 * #243 asks how often a proposer "proposes something wrong that a user might
 * plausibly accept", and says that number matters more than the other two. The
 * plausibility is a judgement; the COST of being wrong is not, so it is
 * measured rather than asserted. A proposal that lands on a near neighbour of
 * the right food is only harmless if its numbers are.
 */
const TO_GRAMS = { g: 1, mg: 1e-3, µg: 1e-6, ug: 1e-6 };

/**
 * A nutrient is MATERIAL here when 100 g of one of the two foods supplies a
 * tenth of its daily target. Without that floor the worst ratio is always a
 * trace: two sunflower oils differ infinitely in iron because one records
 * 0.01 mg and the other records nothing, and neither is iron a person would
 * ever reach for an oil to get. The targets are the app's own
 * (`nutrition-targets.ts`), imported rather than restated.
 */
const MATERIAL = 0.1;

const divergence = (proposedId, truthId) => {
  const a = store.foods[String(proposedId)] ?? {};
  const b = store.foods[String(truthId)] ?? {};
  let worst = null;
  for (const [id, field] of Object.entries(METERED)) {
    const scale = TO_GRAMS[store.nutrients[id]?.unit];
    const target = BAKED_NUTRIENT_TARGETS_G[field];
    if (!scale || !target) continue;
    const x = (a[id] ?? 0) * scale;
    const y = (b[id] ?? 0) * scale;
    if (Math.max(x, y) < target * MATERIAL) continue;
    const ratio = y === 0 ? Infinity : x / y;
    const magnitude = ratio === 0 ? Infinity : Math.max(ratio, 1 / ratio);
    if (worst === null || magnitude > worst.magnitude)
      worst = { field, ratio, magnitude };
  }
  return worst ?? { field: "nothing material", ratio: 1 };
};

console.log(`\n## The cost of a wrong proposal\n`);
for (const row of rows) {
  const p = row.combined;
  if (!p || p.fdcId === row.truth.fdcId) continue;
  if (row.truth.fdcId === null) {
    console.log(
      `  ${(row.twin.name ?? "").padEnd(42)} proposed ${p.description} where the honest answer was silence`
    );
    continue;
  }
  const { field, ratio } = divergence(p.fdcId, row.truth.fdcId);
  const printed =
    ratio === Infinity ? "∞" : ratio === 0 ? "0" : ratio.toFixed(2);
  console.log(
    `  ${(row.twin.name ?? "").padEnd(42)} ${p.description}` +
      `\n  ${" ".repeat(42)} instead of ${rowsById.get(row.truth.fdcId)?.description} — worst material metered nutrient ${field} x${printed}` +
      (PLAUSIBLE_WRONG[row.twin.gtin]
        ? `\n  ${" ".repeat(42)} PLAUSIBLY ACCEPTED: ${PLAUSIBLE_WRONG[row.twin.gtin]}`
        : "")
  );
}
const wrongProposals = rows.filter(
  (r) => r.combined && r.combined.fdcId !== r.truth.fdcId
);
console.log(
  `\n  ${Object.keys(PLAUSIBLE_WRONG).length} of the matcher's ${wrongProposals.length} wrong proposals are ones a person would plausibly accept.` +
    `\n  Against ${rows.filter((r) => r.combined && r.combined.fdcId === r.truth.fdcId).length} it gets right, that is the bar #247 has to beat.`
);

console.log(`\n## Where the matcher is structurally silent\n`);
const silentWithTags = rows.filter(
  (r) => r.byCategory === null && queriesFor(r.twin).tags.length > 0
);
console.log(
  `  ${noEnglishCategories.length}/${rows.length} hand the matcher no English category tag at all — it cannot be asked.`
);
console.log(
  `  ${silentWithTags.length}/${rows.length} hand it English tags that reach nothing:`
);
for (const row of silentWithTags)
  console.log(
    `      ${(row.twin.name ?? "").padEnd(34)} ${JSON.stringify(queriesFor(row.twin).tags)}`
  );

console.log(
  `\n## The motivating case, re-checked against the corpus that ships today\n`
);
const MOTIVATING = 173740;
console.log(
  `  fdcId ${MOTIVATING} (Beans, kidney, all types, mature seeds, cooked, boiled), which #240's` +
    `\n  Notes cite as "already shipped in this repo with ~60 nutrients", is ` +
    (rowsById.has(MOTIVATING) ? "PRESENT." : "NOT IN THE CORPUS.") +
    `\n  Rows in the shipped index whose description says cooked: ` +
    index.foods.filter((row) => /\bcooked\b/i.test(row.description)).length +
    `, boiled: ` +
    index.foods.filter((row) => /\bboiled\b/i.test(row.description)).length +
    `, canned: ` +
    index.foods.filter((row) => /\bcanned\b/i.test(row.description)).length +
    `.`
);

console.log(`\n## What a pairing would actually move\n`);
let moved = 0;
for (const row of pairable) {
  const nutrients = store.foods[String(row.truth.fdcId)] ?? {};
  const panel = row.twin.panel ?? {};
  const fills = Object.entries(METERED).filter(
    ([id, field]) =>
      nutrients[id] !== undefined &&
      nutrients[id] > 0 &&
      (panel[field] === undefined || panel[field] === null)
  );
  if (fills.length > 0) moved += 1;
  if (VERBOSE)
    console.log(
      `  ${row.twin.name.padEnd(42)} fills ${String(fills.length).padStart(2)}/12  ${fills.map(([, f]) => f).join(" ")}`
    );
}
console.log(
  `  ${moved}/${pairable.length} adjudicated pairings would put at least one metered micronutrient on a panel that lacks it.`
);

console.log(`\n## Per twin\n`);
for (const row of rows) {
  const t = row.truth;
  const target =
    t.fdcId === null
      ? "—"
      : `${t.fdcId} ${rowsById.get(t.fdcId)?.description ?? "(NOT IN CORPUS)"}`;
  console.log(
    `${row.twin.gtin}  ${(row.twin.name ?? "").padEnd(42)} ${t.verdict.padEnd(10)} ${target}`
  );
  const p = row.combined;
  const mark =
    p === null ? "silent" : p.fdcId === t.fdcId ? "agrees" : "WRONG ";
  console.log(
    `${" ".repeat(15)}matcher ${mark}` +
      (p === null
        ? ""
        : `  via ${JSON.stringify(p.query)} → ${p.fdcId} ${p.description}`) +
      (row.byHistory ? "   [history could have proposed this]" : "")
  );
  const ratio =
    t.fdcId === null
      ? null
      : energyRatio(row.twin.panel, rowsById.get(t.fdcId));
  if (ratio !== null && (ratio > 1.4 || ratio < 0.7))
    console.log(`${" ".repeat(15)}energy ratio row/label ${ratio.toFixed(2)}`);
  if (VERBOSE) console.log(`${" ".repeat(15)}${t.why}`);
}

console.log();
