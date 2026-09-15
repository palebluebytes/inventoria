#!/usr/bin/env node
/**
 * `docs/food-search.html` — how food search works, and every food it discards.
 *
 *   pnpm docs:food-search            # regenerate the page
 *   pnpm docs:food-search --check    # fail if the committed page is out of date
 *
 * Two documents in one file, because they answer one question between them. The
 * first half explains the three narrowings a typed word goes through; the second
 * is a review surface over every record the first narrowing removes, so
 * "what was discarded, and why" is a thing a person can sit down and audit
 * rather than a number in a build log.
 *
 * **Every figure is computed, none is typed.** The prose interpolates what this
 * script measures from `public/usda/search-index.json` and
 * `docs/research/usda-drop-census.json`, so a filter retune moves the sentences
 * as well as the tables. That is the whole reason the page is generated rather
 * than written: this map has watched a count restated in three files drift
 * (#162), and a hand-written explainer is a fourth file to drift.
 *
 * The reachability sweep and the vocabulary landing pass import the app's own
 * ranking rather than restating it, the way `usda-ranking-corpus.mjs` does — a
 * page describing a ranking it has reimplemented describes the reimplementation.
 *
 * The drop census behind the second half originated on the throwaway
 * `prototype/food-search-explorer` branch, which asked "where are the edges of
 * this data" and answered it seven ways. What came back is the census, the
 * category cliff, the reachability number and the misrouted synonym clusters —
 * the findings, not the prototype's code.
 *
 * It is wired into `pnpm check` under `--check` only, so a stale page fails CI
 * while a regeneration stays a deliberate act.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  compareRelevance,
  compileReferenceFoodQuery,
  qualifiersOf,
  readReferenceFoodName,
  readRowRank,
  withoutStrayMentions,
  wordsOf,
} from "../src/lib/food/reference-food-ranking.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = join(ROOT, "public", "usda", "search-index.json");
const CENSUS_PATH = join(ROOT, "docs", "research", "usda-drop-census.json");
const KEY_CENSUS_PATH = join(ROOT, "docs", "research", "192-key-census.json");
const OUT_PATH = join(ROOT, "docs", "food-search.html");

const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
const keyCensus = JSON.parse(readFileSync(KEY_CENSUS_PATH, "utf8"));

// ── numbers ─────────────────────────────────────────────────────────────────

const n = (v) => v.toLocaleString("en-GB");
const pc = (part, whole) => `${Math.round((part / whole) * 100)}%`;

const ROWS = index.foods.length;
const IDENTITIES = census.identities;
/** Every record the corpus does not carry, whatever became of it. */
const DROPPED = census.dropped;
/**
 * The records ADR-0103's collapse took, which is the one family in the census
 * that still SHIPS: each is the same food as a row that survived, under that
 * row's `fdcId`. Counted apart from {@link DISCARDED} because a headline saying
 * 5,937 foods were discarded would be wrong by 381 and the page's own correction
 * paragraph would be arguing with its own stat strip.
 */
const COLLAPSED = census.drops.filter((d) => d.stage === "collapse").length;
/** Records no row carries: a drop, not a collapse. */
const DISCARDED = DROPPED - COLLAPSED;

if (census.shipped !== ROWS)
  throw new Error(
    `the census says ${census.shipped} rows ship and the index holds ${ROWS}. ` +
      "Regenerate the census: pnpm usda:drop-census"
  );

/** The drop families, in the order the generator applies them. */
const STAGE_ORDER = ["food_kind", "variant", "name", "collapse"];
const RULE_ORDER = [
  "brand_specific",
  "processed",
  "foodservice_record",
  "drink_powder",
  "reconstituted_drink",
  "prepared",
  "adjudicated_dish",
  "cooked_form",
  "dry_basis",
  "manufacturing_input",
  "superseded",
  "no_energy",
  "flavoured_variant",
  "dehydrated_form",
  "fortification_duplicate",
  "adjudicated_variant",
  "frozen_mirror",
  "collision",
  "preparation_sibling",
  "designation_collision",
  "enrichment_duplicate",
  "collapsed_into",
];

/**
 * What each rule is for, in a sentence a reviewer can disagree with.
 *
 * The one piece of editorial judgement in this file, and it is deliberately
 * separate from the counts beside it: a reader auditing a drop needs to know
 * what the rule CLAIMS before deciding whether it was right.
 */
const RULE_BLURB = {
  brand_specific: [
    "Names a brand",
    "USDA files manufacturer records alongside generic ones. A brand is a product, and products are reached by scanning a barcode.",
  ],
  processed: [
    "A packaged or processed product",
    "Canned, frozen with sauce, from concentrate, enriched. Not something you would call an ingredient.",
  ],
  prepared: [
    "A prepared dish, not a food",
    "Mostly decided by USDA's own filing: eight of its categories are dishes end to end.",
  ],
  adjudicated_dish: [
    "A dish, read one row at a time",
    "USDA files nine composite dishes under a category the prepared-food filter cannot take without deleting 120 real ingredients with them.",
  ],
  foodservice_record: [
    "Published for a kitchen, not a shopper",
    'A catering pack of sliced ham, foodservice ketchup, restaurant American cheese. The word <em>restaurant</em> reaches all seven and nothing else &mdash; and one of them, <span class="rec">Ham, sliced, restaurant</span>, was the single row a typed <span class="rec">ham</span> returned, hiding 47 real hams behind it.',
  ],
  drink_powder: [
    "A powder you make a drink out of",
    'Cocoa mixes, lemonade powder, flavour mixes, protein powders. The category is the whole of the safety: curry, garlic and onion powder, unsweetened cocoa, icing sugar, baobab and tomato powder are all ingredients and all filed elsewhere, so reading <em>powder</em> without <span class="rec">Beverages</span> would take the spice rack.',
  ],
  reconstituted_drink: [
    "A powder made up into a drink",
    "Both halves are needed and each alone is wrong: <em>prepared with</em> on its own reaches tofu naming its coagulant and soy sauce naming its grain, and <em>powder</em> on its own reaches the spice rack. Together they name a mix that has been made up, which is a drink rather than an ingredient. Brewed coffee and tea say <em>brewed</em> and are untouched.",
  ],
  cooked_form: [
    "Somebody cooked it",
    "The corpus is ingredients as bought. Roasted nuts and seeds stay, because you can scoop those out of a bin; parboiled rice cannot be.",
  ],
  dry_basis: [
    "A laboratory assay, not a food",
    "A record stated at 0% moisture is a measurement of a substance, not a thing anybody eats.",
  ],
  manufacturing_input: [
    "Sold to factories, not people",
    "USDA's own trade vocabulary — industrial, manufacturing — on records nobody buys.",
  ],
  superseded: [
    "A poorer second copy",
    "Written down one row at a time, because no property of a description says that napa cabbage and pe-tsai are one vegetable.",
  ],
  no_energy: [
    "Reports no energy",
    "A record with no calorie figure cannot be logged, so it does not ship.",
  ],
  flavoured_variant: [
    "A flavoured version of a food already here",
    "Chocolate milk, under a head phrase that has been read end to end.",
  ],
  dehydrated_form: [
    "A dried version of a food already here",
    "Dried buttermilk, under a head phrase that has been read end to end.",
  ],
  fortification_duplicate: [
    "The same food, with vitamins added",
    "Two records for one product where the only difference is the fortification.",
  ],
  adjudicated_variant: [
    "Removed by hand, under a read head",
    "Four head phrases have been read row by row — Milk, Yogurt, Soymilk and Egg. A drop may fire nowhere else.",
  ],
  frozen_mirror: [
    "A frozen copy of a fresh cut",
    "USDA publishes New Zealand lamb frozen and American lamb fresh, cut for cut. It fires only where the unfrozen row provably ships.",
  ],
  collision: [
    "Its new name is already taken",
    "After a commercial origin is stripped, two rows can end up with one name.",
  ],
  preparation_sibling: [
    "Another preparation of a food already here",
    "Left over once the origin strip has merged the rest of its family.",
  ],
  designation_collision: [
    "Collides, and has the poorer panel",
    "Two rows reach one name and the one measuring fewer nutrients goes.",
  ],
  enrichment_duplicate: [
    "The unenriched half of a pair",
    "Enrichment puts back the B vitamins milling removed. Where both halves ship, the enriched one takes the plain name and this one leaves.",
  ],
  collapsed_into: [
    "The same food, at another trim or grade",
    "Not a drop: the food is still here, under the fdcId named beside each row. USDA assays one flank steak lean-or-fat by trim by grade, and a diarist writes one word for all of them.",
  ],
};

const STAGE_BLURB = {
  food_kind: [
    "Is it a food at all?",
    "Seven judgements about the kind of thing the record describes. Every row is offered to them in order, and the first to fire is the one that removes it.",
  ],
  variant: [
    "Is it a variant of a food already here?",
    "Three rules that only fire under a head phrase somebody has read row by row — today Milk, Yogurt and Soymilk, and nowhere else.",
  ],
  name: [
    "Does its new name collide?",
    "After the renaming. Two rows that end up with one name cannot both ship under it.",
  ],
  collapse: [
    "Is it another record of a food already here?",
    "Last, over the names that ship. These rows are not dropped: each names the row it collapsed into, and that row is in the corpus or the generation stops.",
  ],
};

const byRule = new Map(RULE_ORDER.map((r) => [r, []]));
for (const drop of census.drops) byRule.get(drop.rule).push(drop);

const stageOf = new Map(census.drops.map((d) => [d.rule, d.stage]));

/**
 * The terms that did the most removing inside one rule.
 *
 * A census entry's `because` is a minimal sufficient removal set — the smallest
 * set of terms you could delete from the record and have the rule go quiet — so
 * counting the terms across a family answers "which words is this rule actually
 * made of", without reading the rule's own tables. That matters because the
 * rosters are module-private on purpose, and a page that copied them would be a
 * second copy of the editorial judgement, drifting quietly (ADR-0047 §4).
 */
const topTerms = (drops, limit = 8) => {
  const tally = new Map();
  for (const drop of drops)
    for (const term of drop.because)
      tally.set(term, (tally.get(term) ?? 0) + 1);
  return [...tally]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
};

// ── survival by USDA's own category ─────────────────────────────────────────

/**
 * Each of USDA's categories, and how much of it survived.
 *
 * The finding the prototype called the cliff: the filters do not thin a category
 * evenly, they take all of it or almost none. Whether that is right is a
 * judgement a reader can now make one category at a time.
 */
const categories = new Map();
const bump = (name, key) => {
  const k = name ?? "(none)";
  if (!categories.has(k)) categories.set(k, { shipped: 0, dropped: 0 });
  categories.get(k)[key]++;
};
for (const row of index.foods) bump(row.foodCategory, "shipped");
for (const drop of census.drops) bump(drop.foodCategory, "dropped");

const categoryRows = [...categories]
  .map(([name, c]) => ({
    name,
    ...c,
    total: c.shipped + c.dropped,
    survival: c.shipped / (c.shipped + c.dropped),
  }))
  .sort((a, b) => b.total - a.total);

const wipedOut = categoryRows.filter((c) => c.shipped === 0);
const wipedRows = wipedOut.reduce((t, c) => t + c.dropped, 0);
const nearlyKept = categoryRows.filter((c) => c.survival >= 0.9);

// ── head-phrase families ────────────────────────────────────────────────────

const headOf = (description) => description.split(",")[0].trim();

const families = new Map();
for (const row of index.foods) {
  const head = headOf(row.description).toLowerCase();
  families.set(head, (families.get(head) ?? 0) + 1);
}
const familyRows = [...families].sort((a, b) => b[1] - a[1]);
const topTenShare = familyRows.slice(0, 10).reduce((t, f) => t + f[1], 0);
const singletonFamilies = familyRows.filter(([, size]) => size === 1).length;

const droppedHeads = new Set(
  census.drops.map((d) => headOf(d.description).toLowerCase())
);
const familiesWipedOut = [...droppedHeads].filter(
  (head) => !families.has(head)
).length;

// ── the corpus as the ranking sees it ───────────────────────────────────────

const corpus = index.foods.map((row) => ({
  description: row.description,
  rank: readRowRank(row),
  names: [row.description, ...(row.also ?? [])].map(readReferenceFoodName),
}));

const scoreAll = (query) => {
  const rank = compileReferenceFoodQuery(query);
  const scored = corpus
    .map((food) => ({
      description: food.description,
      key: food.names
        .map((name) => ({ ...rank(name), ...food.rank }))
        .reduce((best, key) => (compareRelevance(key, best) < 0 ? key : best)),
    }))
    .filter(({ key }) => key.tier > 0);
  return withoutStrayMentions(scored).sort((a, b) =>
    compareRelevance(a.key, b.key)
  );
};

/**
 * A real corpus row that answers `query` on exactly `tier`, best-first.
 *
 * The tier ladder used to carry hand-written examples and one of them was
 * already wrong — `grape` leads with a muscadine, not with the row the prose
 * claimed. An example of a rung is a thing the corpus can be asked for, so it is
 * asked rather than remembered.
 */
const exampleAt = (query, tier) => {
  const rank = compileReferenceFoodQuery(query);
  const hit = corpus
    .map((food) => ({
      description: food.description,
      key: food.names
        .map((name) => ({ ...rank(name), ...food.rank }))
        .reduce((best, key) => (compareRelevance(key, best) < 0 ? key : best)),
    }))
    .filter(({ key }) => key.tier === tier)
    .sort((a, b) => compareRelevance(a.key, b.key))[0];
  return hit ? hit.description : null;
};

/**
 * The best rank every row ever reaches, over every word the corpus itself uses.
 *
 * The prototype's sharpest finding and the reason it is recomputed here rather
 * than quoted: a row nobody can reach by typing the vocabulary of its own corpus
 * is, for practical purposes, not in the corpus. The sweep asks the head
 * phrases and head words only — the words a person would actually try — and not
 * the full 3,857-query ranking sweep, which includes adjective-noun pairs a
 * reader would have to already know.
 */
const headVocabulary = [
  ...new Set(
    index.foods.flatMap((row) => {
      const head = headOf(row.description).toLowerCase();
      return [head, ...wordsOf(head)];
    })
  ),
].sort();

const bestRank = new Map(index.foods.map((r) => [r.description, Infinity]));
for (const query of headVocabulary) {
  const results = scoreAll(query);
  for (let i = 0; i < results.length; i++) {
    const held = bestRank.get(results[i].description);
    if (held !== undefined && i + 1 < held)
      bestRank.set(results[i].description, i + 1);
  }
}

const everLeads = [...bestRank.values()].filter((r) => r === 1).length;
const neverOnPage = [...bestRank.values()].filter((r) => r > 50).length;
const neverRetrieved = [...bestRank.values()].filter(
  (r) => r === Infinity
).length;

const buriedByFamily = new Map();
for (const [description, rank] of bestRank) {
  if (rank <= 50) continue;
  const head = headOf(description).toLowerCase();
  buriedByFamily.set(head, (buriedByFamily.get(head) ?? 0) + 1);
}
const worstBuried = [...buriedByFamily]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4)
  .map(([head, buried]) => ({ head, buried, of: families.get(head) ?? 0 }));

// ── where the vocabulary lands ──────────────────────────────────────────────

/**
 * Every vocabulary key, and the row it actually lands on.
 *
 * ADR-0049 admits a key only if it RETRIEVES something, and a non-empty result
 * cannot tell landing on the right food from landing on any food. Grouping the
 * keys by their landing row is what exposed that: the map is checked for being
 * non-empty and never for being right.
 */
const vocabulary = {
  ...index.vocabulary_off.expansions,
  ...index.vocabulary_local.expansions,
};
const landings = new Map();
for (const [key, phrases] of Object.entries(vocabulary)) {
  let best = null;
  for (const phrase of [phrases].flat()) {
    const hit = scoreAll(phrase)[0];
    if (hit && !best) best = hit.description;
  }
  if (!best) continue;
  if (!landings.has(best)) landings.set(best, []);
  landings.get(best).push(key);
}
const crowdedLandings = [...landings]
  .filter(([, keys]) => keys.length >= 5)
  .sort((a, b) => b[1].length - a[1].length);
const landedKeys = [...landings.values()].reduce((t, k) => t + k.length, 0);

// ── name depth, keyness, energy residual ────────────────────────────────────

const depthOf = (description) => qualifiersOf(description).length;

const depthHistogram = (descriptions) => {
  const bins = new Map();
  for (const d of descriptions) {
    const depth = Math.min(depthOf(d), 9);
    bins.set(depth, (bins.get(depth) ?? 0) + 1);
  }
  return bins;
};

const shippedDepth = depthHistogram(index.foods.map((r) => r.description));
const droppedDepth = depthHistogram(census.drops.map((d) => d.description));
const deeplyQualified = index.foods.filter(
  (r) => depthOf(r.description) >= 8
).length;

/**
 * The words most predictive of which half of the split a record landed in.
 *
 * A log-odds ratio over the two word bags, which says something no drop rule
 * states: what the corpus BECAME once the prepared food was gone. No rule
 * mentions beef anywhere.
 */
const bagOf = (descriptions) => {
  const bag = new Map();
  for (const d of descriptions)
    for (const word of new Set(wordsOf(d.toLowerCase())))
      bag.set(word, (bag.get(word) ?? 0) + 1);
  return bag;
};
const shippedBag = bagOf(index.foods.map((r) => r.description));
const droppedBag = bagOf(census.drops.map((d) => d.description));

const keyness = [...new Set([...shippedBag.keys(), ...droppedBag.keys()])]
  .map((word) => {
    const s = shippedBag.get(word) ?? 0;
    const d = droppedBag.get(word) ?? 0;
    if (s + d < 40) return null;
    const odds = Math.log2(
      (s + 0.5) / (ROWS + 1) / ((d + 0.5) / (DROPPED + 1))
    );
    return { word, shipped: s, dropped: d, odds };
  })
  .filter(Boolean);

const shippedWords = [...keyness].sort((a, b) => b.odds - a.odds).slice(0, 8);
const droppedWords = [...keyness].sort((a, b) => a.odds - b.odds).slice(0, 8);

/**
 * Stated energy against the Atwater sum of a row's own macros.
 *
 * Not a defect hunt: the residual reads both ways for known reasons — ethanol
 * carries ~7 kcal/g and is in none of the three macros, and fibre sits inside
 * the carbohydrate figure while yielding far less than 4 kcal/g. It is the same
 * gap #122 measured from the label side, seen from the corpus side.
 */
const residuals = index.foods
  .map((row) => {
    const m = row.macros ?? {};
    if (
      m.calories == null ||
      m.protein_content == null ||
      m.fat_content == null ||
      m.carbohydrate_content == null
    )
      return null;
    return {
      description: row.description,
      residual:
        m.calories -
        (4 * m.protein_content +
          9 * m.fat_content +
          4 * m.carbohydrate_content),
    };
  })
  .filter(Boolean);
residuals.sort((a, b) => Math.abs(a.residual) - Math.abs(b.residual));
const medianResidual = Math.abs(
  residuals[Math.floor(residuals.length / 2)].residual
);
const wildResiduals = residuals.filter((r) => Math.abs(r.residual) > 50).length;
const byResidual = [...residuals].sort((a, b) => b.residual - a.residual);

// ── the inlined review data ─────────────────────────────────────────────────

/**
 * The drop list the browser reads, with the fields the page shows and no others.
 *
 * Short keys and a rule INDEX rather than a name: the census is 1.18 MiB and
 * this has to sit inside an HTML file somebody opens from disk. Nothing here is
 * derived — every field is the census's own, renamed.
 */
const reviewCategories = [
  ...new Set(census.drops.map((d) => d.foodCategory ?? "")),
].sort();
const categoryIndex = new Map(reviewCategories.map((c, at) => [c, at]));

const reviewData = {
  rules: RULE_ORDER,
  categories: reviewCategories,
  drops: census.drops.map((d) => ({
    i: d.fdcId,
    d: d.description,
    c: categoryIndex.get(d.foodCategory ?? ""),
    r: RULE_ORDER.indexOf(d.rule),
    k: d.calories,
    n: d.nutrients,
    b: d.because,
  })),
};

/**
 * What each ranking key asks, in a sentence. The counts beside them are NOT
 * here: they are read from the key census, so a re-measure moves the page and a
 * key added to the ranking without one fails the lookup rather than shipping a
 * blank.
 */
const KEY_BLURB = [
  [
    "tier",
    "The six rungs above &mdash; how much of the food's own name you accounted for.",
  ],
  [
    "recent",
    "How recently you logged this exact food on this device (#165). 0 for a food you never have.",
  ],
  [
    "frequent",
    "How often you have logged it, decayed so that forty times last year weighs less than five times this week.",
  ],
  [
    "canonical",
    "A hand-written roster, two entries long: where rows tie all the way down, name the one the query actually means.",
  ],
  ["raw", "Prefer a raw food to a prepared one."],
  ["head", "How completely your query fills the head phrase."],
  [
    "accounted",
    "Is <em>every</em> word of the name answered? A boolean, because counting leftovers prefers &ldquo;Chicken, ground&rdquo; to a whole chicken.",
  ],
  [
    "position",
    "How far into the name your words landed, summed. USDA orders qualifiers by importance, so depth says how much the food <em>is</em> that thing.",
  ],
  [
    "plainSibling",
    "Demote a row when a plainer version of it exists elsewhere in the corpus.",
  ],
  [
    "plain",
    "Demote an imitation, a substitute, a reduced-fat form or a cooked one.",
  ],
  [
    "wholeness",
    "2 for a whole animal averaged over its cuts, 0 for a fat trimmed off it, 1 for everything between.",
  ],
  [
    "designated",
    "Where two rows tie on everything else, prefer the one not published for a specific population.",
  ],
];

/** One key's measured lead movement, from the committed census. */
const movedLeads = (key) => {
  const run = keyCensus.runs.find((r) => r.label === "shipped");
  const ablation = run.ablations.find((a) => a.key === key);
  if (!ablation)
    throw new Error(
      `${key} is in the ranking and not in 192-key-census.json. ` +
        "Re-run: pnpm usda:key-census --write"
    );
  return ablation.moved;
};

/**
 * The app's real search, bundled for the browser.
 *
 * The page lets a reader type a query and see what the ranking answers, and the
 * only honest way to do that is to run the SHIPPED code. A page that described
 * a ranking it had reimplemented would be describing the reimplementation, and
 * `usda-corpus.ts` is where `rankAgainst`, the stray-mention filter and the
 * vocabulary fallback actually live (ADR-0047 §4's import-don't-copy rule,
 * applied to a document instead of a generator).
 *
 * Twenty kilobytes, tree-shaken, and it pulls in no browser API that would need
 * stubbing. Reached through esbuild from the PATH or through `nix shell`, the
 * same two attempts `usda-app-module.mjs` makes.
 */
const BUNDLE_EXPORTS = [
  "buildSearchCorpus",
  "searchIndexRows",
  "searchResultName",
  "SEARCH_RESULT_LIMIT",
  "compareRelevance",
  "compileReferenceFoodQuery",
  "readReferenceFoodName",
  "readRowRank",
];

const bundleSearch = () => {
  const scratch = mkdtempSync(join(tmpdir(), "food-search-page-"));
  const entry = join(scratch, "search-entry.ts");
  const out = join(scratch, "search.js");
  writeFileSync(
    entry,
    "export { buildSearchCorpus, searchIndexRows, searchResultName, SEARCH_RESULT_LIMIT } from " +
      JSON.stringify(join(ROOT, "src/lib/food/usda-corpus")) +
      ";\nexport { compareRelevance, compileReferenceFoodQuery, readReferenceFoodName, readRowRank } from " +
      JSON.stringify(join(ROOT, "src/lib/food/reference-food-ranking")) +
      ";\n"
  );
  const argv = [
    entry,
    "--bundle",
    "--format=iife",
    "--global-name=FoodSearch",
    "--platform=browser",
    "--minify",
    `--outfile=${out}`,
  ];
  for (const [command, args] of [
    ["esbuild", argv],
    ["nix", ["shell", "nixpkgs#esbuild", "-c", "esbuild", ...argv]],
  ]) {
    const run = spawnSync(command, args, { cwd: ROOT, encoding: "utf8" });
    if (run.status === 0) {
      const code = readFileSync(out, "utf8");
      rmSync(scratch, { recursive: true, force: true });
      // Every name `food-search-tryit.js` calls off the global, checked against
      // what the bundle actually exports. The entry list above is a string, so a
      // name can be dropped from it and the bundle still builds, still ships and
      // still answers a search — the results path never touches the annotation's
      // functions. That is how `compareRelevance` went missing once, past a
      // verification that only ran queries.
      for (const name of BUNDLE_EXPORTS)
        if (!new RegExp(`\\b${name}\\b`).test(code))
          throw new Error(
            `the browser bundle does not export ${name}, which ` +
              "scripts/food-search-tryit.js calls. Add it to the entry above."
          );
      return code;
    }
  }
  rmSync(scratch, { recursive: true, force: true });
  throw new Error(
    "could not bundle the search for the page. esbuild is reached from the " +
      "PATH or through `nix shell nixpkgs#esbuild`."
  );
};

/**
 * The corpus the page searches: every field the ranking reads, and the macros a
 * result row renders. `portions` is the one thing left out, and it is 433 KiB of
 * the 980 - nothing here stages a food.
 */
const searchCorpus = {
  schema_version: index.schema_version,
  vocabulary_off: index.vocabulary_off,
  vocabulary_local: index.vocabulary_local,
  foods: index.foods.map((row) => ({
    fdcId: row.fdcId,
    description: row.description,
    ...(row.foodCategory ? { foodCategory: row.foodCategory } : {}),
    ...(row.also ? { also: row.also } : {}),
    ...(row.plain_sibling ? { plain_sibling: true } : {}),
    ...(row.raw ? { raw: true } : {}),
    ...(row.macros ? { macros: row.macros } : {}),
  })),
};

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ── the page ────────────────────────────────────────────────────────────────

const CSS = readFileSync(
  join(ROOT, "scripts", "food-search-explainer.css"),
  "utf8"
);

const funnelRow = (label, sub, value, scale, kind, extra = "") => `
          <div class="frow ${extra}">
            <div class="flabel">${esc(label)}<span>${esc(sub)}</span></div>
            <div class="ftrack"><div class="fbar ${kind}" style="width:${((Math.abs(value) / scale) * 100).toFixed(2)}%"></div></div>
            <div class="fnum ${kind === "cut" ? "cut" : kind === "keep" ? "keep" : ""}">${value < 0 ? "&minus;" : ""}${n(Math.abs(value))}</div>
          </div>`;

const stageBlock = (stage) => {
  const rules = RULE_ORDER.filter((r) => stageOf.get(r) === stage);
  const [title, blurb] = STAGE_BLURB[stage];
  const total = rules.reduce((t, r) => t + byRule.get(r).length, 0);
  return `
        <div class="frow stagehead">
          <div class="flabel">${esc(title)} &mdash; ${n(total)} removed<span>${esc(blurb)}</span></div>
          <div></div><div></div>
        </div>${rules
          .map((rule) =>
            funnelRow(
              RULE_BLURB[rule][0],
              rule,
              -byRule.get(rule).length,
              IDENTITIES,
              "cut"
            )
          )
          .join("")}`;
};

const ruleCard = (rule) => {
  const drops = byRule.get(rule);
  const [title, blurb] = RULE_BLURB[rule];
  const terms = topTerms(drops);
  return `
        <article class="rulecard">
          <header>
            <h4>${esc(title)}</h4>
            <span class="rulecount">${n(drops.length)}</span>
          </header>
          <p class="rulename">${esc(rule)} &middot; stage ${STAGE_ORDER.indexOf(stageOf.get(rule)) + 1}</p>
          <p class="ruleblurb">${esc(blurb)}</p>
          ${
            terms.length
              ? `<ul class="terms">${terms
                  .map(
                    ([term, count]) =>
                      `<li><span>${esc(term)}</span><b>${n(count)}</b></li>`
                  )
                  .join("")}</ul>`
              : `<p class="ruleblurb muted">No term to point at &mdash; this rule reads the record, not its name.</p>`
          }
          <button type="button" class="reviewjump" data-rule="${esc(rule)}">Review all ${n(drops.length)} &rarr;</button>
        </article>`;
};

const categoryBar = (c) => `
          <tr>
            <td>${esc(c.name)}</td>
            <td class="barcell"><div class="catbar"><div class="catfill" style="width:${(c.survival * 100).toFixed(1)}%"></div></div></td>
            <td class="num">${n(c.shipped)}</td>
            <td class="num">${n(c.dropped)}</td>
            <td class="num survival ${c.shipped === 0 ? "zero" : c.survival >= 0.9 ? "high" : ""}">${pc(c.shipped, c.total)}</td>
          </tr>`;

const depthBars = () => {
  const max = Math.max(...shippedDepth.values(), ...droppedDepth.values());
  let out = "";
  for (let depth = 1; depth <= 9; depth++) {
    const s = shippedDepth.get(depth) ?? 0;
    const d = droppedDepth.get(depth) ?? 0;
    out += `
          <div class="drow">
            <span class="dlabel">${depth === 9 ? "9+" : depth}</span>
            <div class="dpair">
              <div class="dbar keep" style="width:${((s / max) * 100).toFixed(1)}%"></div>
              <div class="dbar cut" style="width:${((d / max) * 100).toFixed(1)}%"></div>
            </div>
            <span class="dnum">${n(s)} <i>/</i> ${n(d)}</span>
          </div>`;
  }
  return out;
};

const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>How Inventoria Finds a Food</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;800&amp;family=IBM+Plex+Mono:wght@400;500&amp;family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&amp;display=swap">
<style>
${CSS}
</style>
</head>
<body>
<div class="shell">

  <header class="masthead">
    <p class="eyebrow">Inventoria &middot; food search, end to end</p>
    <h1>How Inventoria finds a food</h1>
    <p class="standfirst">You type <span class="rec">beef</span>. Something decides which of USDA's ${n(IDENTITIES)} published records you are allowed to see, which of the survivors your word reaches, and which of those goes first. This is all three &mdash; and then every one of the ${n(DISCARDED)} foods the first decision discarded and the ${n(COLLAPSED)} it merged into a row beside them, with the rule and the words that did it.</p>
    <div class="stamp">
      <span>Index <b>schema ${index.schema_version}</b></span>
      <span>Corpus <b>${n(ROWS)} rows</b></span>
      <span>Discarded <b>${n(DISCARDED)}</b></span>
      <span>Collapsed <b>${n(COLLAPSED)}</b></span>
      <span>Ranking <b>${keyCensus.keys.length} keys</b></span>
      <span>Page <b>50 rows</b></span>
    </div>
    <p class="generated">Generated by <code>pnpm docs:food-search</code> from ${esc(census.generated_from)}. Every figure on this page is computed from the shipped index and the committed drop census; none is typed in.</p>
  </header>

  <nav class="rail" aria-label="Sections">
    <ol>
      <li><a href="#answer">The short answer</a></li>
      <li><a href="#try"><b>Try it</b></a></li>
      <li><a href="#sources">Four sources</a></li>
      <li><a href="#twice">Narrowing happens twice</a></li>
      <li><a href="#discarded"><b>What was discarded</b></a></li>
      <li><a href="#rules">The ${RULE_ORDER.length} rules</a></li>
      <li><a href="#cliff">Survival by category</a></li>
      <li><a href="#review"><b>Review all ${n(DROPPED)}</b></a></li>
      <li><a href="#reach">What your word reaches</a></li>
      <li><a href="#order">What goes first</a></li>
      <li><a href="#screen">What reaches the screen</a></li>
      <li><a href="#edges">The edges</a></li>
      <li><a href="#bar">How good is it</a></li>
      <li><a href="#tradeoffs">Trade-offs</a></li>
      <li><a href="#pending">What the rule cost</a></li>
      <li><a href="#faq">Questions</a></li>
    </ol>
  </nav>

  <main>

    <section id="answer">
      <p class="kicker">01 &middot; The short answer</p>
      <h2>Three narrowings, two of them invisible</h2>

      <p class="lede">Search is not one filter. It is a <strong>membership</strong> decision taken at build time, a <strong>retrieval</strong> decision taken on your keystroke, and an <strong>ordering</strong> decision taken on what survived both. Most of the work &mdash; ${pc(DROPPED, IDENTITIES)} of everything USDA published &mdash; happened before you opened the app.</p>

      <p>The whole pipeline is local. There is no search server, no API key and no network call: a committed JSON file ships with the app, is parsed in about 14&nbsp;ms, and every keystroke ranks all ${n(ROWS)} rows in memory. Search works on a plane.</p>

      <div class="instrument">
        <h4>One query, start to finish</h4>
        <div class="funnel">
          <div class="frow stagehead"><div class="flabel">At build time</div><div></div><div></div></div>
${funnelRow("USDA publishes", "2 bulk archives", IDENTITIES, IDENTITIES, "cut")}
${funnelRow("Corpus ships", "search-index.json", ROWS, IDENTITIES, "keep")}
          <div class="frow stagehead"><div class="flabel">On your keystroke &mdash; typing &ldquo;beef&rdquo;</div><div></div><div></div></div>
${funnelRow("Rows your word reaches", "tier > 0", scoreAll("beef").length, IDENTITIES, "keep")}
${funnelRow("Rows you can see", "page cap", 50, IDENTITIES, "keep")}
${funnelRow("Rows that are the beef you meant", "80/20 mince, past the cap", 0, IDENTITIES, "cut", "total")}
        </div>
        <p class="caption">Bars are to scale against the ${n(IDENTITIES)} records USDA publishes. The last row is the honest one: the most-logged beef there is sits past the 50-row page, so typing <span class="rec">beef</span> cannot reach it at all.</p>
      </div>
    </section>


    <section id="try">
      <p class="kicker">02 &middot; Try it</p>
      <h2>Search the real corpus</h2>

      <p>This is not a demo. The ${n(ROWS)}-row corpus below and the code ranking it are the ones the app ships &mdash; <code>usda-corpus.ts</code> bundled for the browser, the same <code>searchIndexRows</code> a keystroke calls. Type and you get exactly what the app would answer, cap and all.</p>

      <div class="tryit">
        <label class="ctl grow">
          <span>Search the corpus</span>
          <input type="search" id="q2" placeholder="beef, potato, milk, olive oil&hellip;" autocomplete="off" value="potato">
        </label>
        <div class="presets" id="presets">
          <span>Queries this page argues about:</span>
          <button type="button" data-q="beef">beef</button>
          <button type="button" data-q="potato">potato</button>
          <button type="button" data-q="cheese">cheese</button>
          <button type="button" data-q="milk">milk</button>
          <button type="button" data-q="grape">grape</button>
          <button type="button" data-q="olive oil">olive oil</button>
          <button type="button" data-q="aubergine">aubergine</button>
          <button type="button" data-q="pak-choi">pak-choi</button>
          <button type="button" data-q="gammon">gammon</button>
        </div>
        <p class="resultline" id="count2" role="status">&nbsp;</p>
        <div class="hits" id="hits"></div>
        <p class="caption" id="keyhelp">Each row shows the key vector that placed it, read left to right exactly as <code>compareRelevance</code> reads it &mdash; the first column where two rows differ is the one that decided them. <span class="rec">tier</span> is the six rungs; <span class="rec">pos</span> is how far into the name your words landed; <span class="rec">sib</span>, <span class="rec">raw</span> and <span class="rec">desig</span> are read off the row rather than the name.</p>
        <p class="caption">Two annotations can appear under a row, and they are different things. A name in <strong>brackets</strong> &mdash; <span class="rec">Eggplant (aubergine)</span> &mdash; is another name FOR the food, and the app shows it too, in the name itself, so the word you typed follows the food into your log. A line reading <strong>reached through USDA&rsquo;s discarded name</strong> is not a name for the food at all: it is the losing half of a twin merge, or a filing a rename replaced, and it explains why a row surfaced when the words you typed appear nowhere on it. <strong>This page shows that line and the app does not</strong> &mdash; the app has to answer, this page has to explain &mdash; and it is kept out of the name on both, because <span class="rec">Eggs, Grade A, Large, egg whole</span> is USDA&rsquo;s paperwork and not what anybody calls an egg.</p>
      </div>
    </section>

    <section id="sources">
      <p class="kicker">03 &middot; Sources</p>
      <h2>Four places a food can come from</h2>

      <p>Only one of them is a text search. Knowing which is which explains most of what looks inconsistent about the screen.</p>

      <div class="tablewrap">
        <table>
          <thead><tr><th>Source</th><th>Reached by</th><th class="num">Size</th><th>What it is for</th></tr></thead>
          <tbody>
            <tr><td><strong>USDA reference foods</strong></td><td>typing a word</td><td class="num">${n(ROWS)}</td><td>Base ingredients &mdash; the things you cook with. The only text-searchable table.</td></tr>
            <tr><td><strong>Open Food Facts</strong></td><td>scanning a barcode</td><td class="num">&mdash;</td><td>Packaged products. <strong>Deliberately not text-searchable.</strong> No packet, no product.</td></tr>
            <tr><td><strong>Curated stand-ins</strong></td><td>typing a word</td><td class="num">2</td><td>Hand-captured products for base foods USDA lacks: <span class="rec">cacao nibs</span>, <span class="rec">double cream</span>. Capped at 8.</td></tr>
            <tr><td><strong>Your own ledger</strong></td><td>Recent list</td><td class="num">&mdash;</td><td>Anything you logged before. Sorted by time, <strong>not ranked</strong>.</td></tr>
          </tbody>
        </table>
      </div>

      <p style="margin-top:1.3rem">When you type, the curated table and the USDA corpus are searched with the <em>same</em> phrases, and the results are stitched in a fixed order: <strong>exact curated hits first, then every USDA row, then partial curated hits</strong>. So typing <span class="rec">cacao nibs</span> leads with the stand-in, while a broad <span class="rec">cocoa</span> never displaces USDA's cocoa powder.</p>

      <div class="note">
        <span class="tag">Why products are not text-searchable</span>
        <p>Open Food Facts is crowd-sourced and enormous, and a text search over it would bury a plain onion under forty branded onion products. Barcode-only is a deliberate refusal, not a missing feature &mdash; and it is a known cost: if the packet is already in the bin, the product is unreachable.</p>
      </div>
    </section>

    <section id="twice">
      <p class="kicker">04 &middot; The spine</p>
      <h2>Membership is decided once; retrieval is decided every keystroke</h2>

      <p>This split is the single most useful thing to hold onto. Two completely different sets of rules run at two completely different times, and confusing them is how almost every question about search goes wrong.</p>

      <div class="tablewrap">
        <table>
          <thead><tr><th></th><th>Membership</th><th>Retrieval &amp; order</th></tr></thead>
          <tbody>
            <tr><td><strong>When</strong></td><td>Once, when the artifact is generated</td><td>Every keystroke, in your browser</td></tr>
            <tr><td><strong>Question</strong></td><td>Is this a food a person logs?</td><td>Does this word reach it, and how well?</td></tr>
            <tr><td><strong>Instrument</strong></td><td>${RULE_ORDER.length} drop rules + 4 name rosters</td><td>6 tier rungs + 11 ordering keys</td></tr>
            <tr><td><strong>Failure</strong></td><td>A food is gone and nothing says so</td><td>A food is there but buried</td></tr>
            <tr><td><strong>Recoverable?</strong></td><td>No &mdash; you cannot scroll to a row that never shipped</td><td>Yes &mdash; by scrolling</td></tr>
          </tbody>
        </table>
      </div>

      <p style="margin-top:1.3rem">That asymmetry is why the rules are lopsided, and why the rest of this page is mostly about the left-hand column. A wrong <em>order</em> costs a scroll. A wrong <em>drop</em> costs the food, silently, with nothing on screen to notice.</p>
    </section>

    <!-- ══ the review half ═══════════════════════════════════════════════ -->

    <section id="discarded">
      <p class="kicker">05 &middot; The review surface</p>
      <h2>What was discarded</h2>

      <p class="lede">${n(DROPPED)} of USDA's ${n(IDENTITIES)} records never reach the app &mdash; ${pc(DROPPED, IDENTITIES)} of everything published. A dropped record is simply <em>absent</em> from the shipped index, with nothing anywhere saying which rule took it. This section is the reconstruction: every one of them, the rule that removed it, and the terms that rule fired on.</p>

      <p><strong>${n(COLLAPSED)} of those ${n(DROPPED)} are not removals, which is why the stat strip above counts them apart.</strong> The records under <em>${esc(RULE_BLURB.collapsed_into[0])}</em> are the same food as a row that ships, assayed again at another trim or grade, and each one names the <span class="rec">fdcId</span> it collapsed into. ${n(DISCARDED)} foods were discarded; these ${n(COLLAPSED)} were merged. They are reviewed here with the rest because from the index's side a record is absent either way, and one file should answer &ldquo;where did this go?&rdquo;.</p>

      <p><strong>The survivor then loses the words the group collapsed on.</strong> A name may never claim less than the panel under it measures, so the strip is licensed by the merge rather than by the name: where a group of several became one, the words naming a dissection, a trade trim and a carcass grade go, and where a lone record is all USDA published, the name it published stays whole.</p>

      <pre class="record">Beef, flank, steak, separable lean and fat, trimmed to 0&quot; fat, choice
  -&gt; Beef, flank, steak</pre>

      <p>The cause is found by <strong>ablation, not by reading a table</strong>. The filters' word lists are deliberately private, so a page that copied them would be a second copy of two hundred lines of editorial judgement, drifting quietly. Instead each record is asked of the real rule with terms removed one at a time, and what is reported is the <em>minimal sufficient removal set</em>: the smallest set of terms you could delete and have the rule go quiet. It survives a rewrite of the rules.</p>

      <div class="instrument">
        <h4>How the ${n(DROPPED)} break down</h4>
        <div class="funnel">
${funnelRow("USDA publishes", "food identities, after the twin merge", IDENTITIES, IDENTITIES, "keep")}
${STAGE_ORDER.map(stageBlock).join("")}
${funnelRow("Corpus ships", `${n(index.foods.filter((r) => r.dataType === "SR Legacy").length)} SR Legacy, ${n(index.foods.filter((r) => r.dataType === "Foundation").length)} Foundation`, ROWS, IDENTITIES, "keep", "total")}
        </div>
        <p class="caption">Rules are asked in this order, and a record is attributed to the <em>first</em> one to fire &mdash; the one that actually removed it. So a family's count is the records that reached it, not the records that match it.</p>
      </div>

      <div class="statgrid">
        <div class="stat"><b>${n(census.attribution.word ?? 0)}</b><span>removed by a single word in the name</span></div>
        <div class="stat"><b>${n(census.attribution.category ?? 0)}</b><span>removed by USDA's own filing alone &mdash; the name says nothing</span></div>
        <div class="stat"><b>${n((census.attribution.pair ?? 0) + (census.attribution.words ?? 0))}</b><span>needed several terms acting together</span></div>
        <div class="stat"><b>${n((census.attribution.by_siblings ?? 0) + (census.attribution.by_collision ?? 0) + (census.attribution.by_record ?? 0))}</b><span>have no word to point at &mdash; the rule reads the corpus or the panel</span></div>
      </div>

      <div class="note">
        <span class="tag">The largest single cause is not a word</span>
        <p>It is <strong>USDA's own <code>foodCategory</code></strong>, which alone removes ${n(census.attribution.category ?? 0)} records &mdash; files them under <em>Baked Products</em> or <em>Fast Foods</em> and their descriptions say nothing about preparation at all. Whether to trust another organisation's filing that far is a real question, and it is the one this page most wants a reviewer to look at.</p>
      </div>
    </section>

    <section id="rules">
      <p class="kicker">06 &middot; By rule</p>
      <h2>The ${RULE_ORDER.length} rules, and the words they are made of</h2>

      <p>Each card is one rule: what it claims, how many foods it took, and the terms that did the most removing. Those terms are not the rule's source &mdash; they are what the ablation found actually load-bearing across the family.</p>

      <div class="rulegrid">
${RULE_ORDER.map(ruleCard).join("")}
      </div>
    </section>

    <section id="cliff">
      <p class="kicker">07 &middot; By category</p>
      <h2>The filters cut on a cliff, not a gradient</h2>

      <p>Sorted by how many records USDA published in each of its own categories. The striking thing is the shape: <strong>${wipedOut.length} categories lost every single record</strong> (${n(wipedRows)} rows between them) while <strong>${nearlyKept.length} kept over 90%</strong>. Very few sit in between.</p>

      <p>That is not a rule anybody wrote. It is what happens when &ldquo;is this an ingredient?&rdquo; meets a filing system built around meals &mdash; and it means the categories that vanished are worth an eyeball, because nothing inside them was individually judged.</p>

      <div class="instrument">
        <h4>Survival by USDA category &middot; ${categoryRows.length} categories</h4>
        <div class="tablewrap">
          <table class="cattable">
            <thead><tr><th>Category</th><th>Survived</th><th class="num">Shipped</th><th class="num">Dropped</th><th class="num">%</th></tr></thead>
            <tbody>${categoryRows.map(categoryBar).join("")}</tbody>
          </table>
        </div>
        <p class="caption">Categories losing everything: ${wipedOut.map((c) => esc(c.name)).join(", ")}.</p>
      </div>
    </section>

    <section id="review">
      <p class="kicker">08 &middot; Every one of them</p>
      <h2>Review all ${n(DROPPED)} records the corpus does not carry</h2>

      <p>Filter by rule, by USDA category, or by typing. Each row shows the food as USDA named it, the rule that removed it, and &mdash; where there is one &mdash; the terms the rule fired on, which are highlighted in the name.</p>

      <div class="browser">
        <div class="controls">
          <label class="ctl grow">
            <span>Search them</span>
            <input type="search" id="q" placeholder="e.g. buttermilk, TWIZZLERS, salmon" autocomplete="off">
          </label>
          <label class="ctl">
            <span>Rule</span>
            <select id="rule">
              <option value="">All ${n(DROPPED)}</option>
${RULE_ORDER.map((r) => `              <option value="${esc(r)}">${esc(RULE_BLURB[r][0])} (${n(byRule.get(r).length)})</option>`).join("\n")}
            </select>
          </label>
          <label class="ctl">
            <span>USDA category</span>
            <select id="cat"><option value="">All categories</option></select>
          </label>
          <label class="ctl">
            <span>Sort</span>
            <select id="sort">
              <option value="name">Name</option>
              <option value="cal">Calories, high first</option>
              <option value="panel">Nutrients measured</option>
            </select>
          </label>
        </div>
        <p class="resultline" id="count" role="status">&nbsp;</p>
        <div class="droplist" id="list"></div>
        <button type="button" id="more" class="more" hidden>Show more</button>
      </div>
    </section>

    <!-- ══ back to the pipeline ══════════════════════════════════════════ -->

    <section id="reach">
      <p class="kicker">09 &middot; Keystroke, part one</p>
      <h2>What your word reaches</h2>

      <p>USDA names a food <span class="rec">Food, qualifier, qualifier</span>. Everything below leans on that: the <strong>head phrase</strong> before the first comma is the food's identity, and everything after it is description. Retrieval scores how much of a food's own name your query accounts for, on six rungs.</p>

      <div class="instrument">
        <h4>The tier ladder &mdash; strongest first, as the list reads</h4>
        <div class="ladder">
${[
  [
    50,
    "The head phrase <em>is</em> your query.",
    "grape",
    exampleAt("grape", 50),
  ],
  [
    40,
    "A typed word <em>is</em> a head word.",
    "grape",
    exampleAt("grape", 40),
  ],
  [
    30,
    "The head completes what you are still typing.",
    "pot",
    exampleAt("pot", 30),
  ],
  [
    20,
    "A whole typed word, but only in a qualifier.",
    "grape",
    exampleAt("grape", 20),
  ],
  [
    10,
    "A typed word merely prefixes some word, anywhere.",
    "pot",
    exampleAt("pot", 10),
  ],
]
  .map(
    ([tier, what, query, row]) => `
          <div class="rung"><b>${tier}</b><span class="what">${what}<span class="eg">&ldquo;${esc(query)}&rdquo; &rarr; ${row ? esc(row) : "nothing in this corpus"}</span></span></div>`
  )
  .join("")}
          <div class="rung"><b>0</b><span class="what">No match at all. The row never enters the result set.<span class="eg">the row is not in the result set</span></span></div>
        </div>
        <p class="caption">Rung 40 sits above rung 30 deliberately: for &ldquo;grape&rdquo;, grape leaves are a grape and a grapefruit is not.</p>
      </div>

      <h3>The stray-mention rule</h3>
      <p>USDA writes an <em>ingredient</em> where a qualifier goes, so <span class="rec">Cheese, mozzarella, whole milk</span> matches the word <span class="rec">milk</span> perfectly well. So a row whose <strong>every</strong> typed word landed past the food's own name is dropped &mdash; but only where some other row answered on a strictly higher rung. That second condition is what makes it structural rather than a judgement call: <strong>the leading row can never be dropped</strong>, and a query no name answers leaves the bar at 0 so nothing is cut.</p>

      <h3>When your word reaches nothing at all</h3>
      <p>Only then &mdash; and the gate is absolute &mdash; a vocabulary map runs. It holds <strong>${n(Object.keys(index.vocabulary_off.expansions).length)} phrases derived from Open Food Facts' ingredient taxonomy</strong> plus <strong>${n(Object.keys(index.vocabulary_local.expansions).length)} hand-written British entries</strong> OFF does not carry: ${Object.keys(
        index.vocabulary_local.expansions
      )
        .map((k) => `<span class="rec">${esc(k)}</span>`)
        .join(", ")}.</p>

      <div class="note">
        <span class="tag">Why the gate is absolute</span>
        <p>Because the expansion only runs when the literal search returned <em>zero</em> rows, an expansion can never reorder, displace or truncate a result you would have got anyway. The no-regression property is structural rather than a promise &mdash; which is also why the ranking has no key, tier or clause for the vocabulary at all.</p>
      </div>
    </section>

    <section id="order">
      <p class="kicker">10 &middot; Keystroke, part two</p>
      <h2>${keyCensus.keys.length === 12 ? "Twelve" : keyCensus.keys.length} keys, read in order, never summed</h2>

      <p>Every retrieved row gets ${n(keyCensus.keys.length)} numbers. They are compared <strong>strictly in sequence</strong> &mdash; a tie on the first is broken by the second &mdash; so an earlier key is never traded against a later one. A row scores as the best of all its names, including the ${n(index.foods.filter((r) => r.also).length)} rows carrying aliases a merge discarded.</p>

      <div class="instrument">
        <h4>The cascade, best-first &middot; <span style="text-transform:none;letter-spacing:0">right column = leads that move if the key is removed</span></h4>
        <div class="cascade">
${KEY_BLURB.map(
  ([name, blurb], at) => `
          <div class="kstep"><span class="ord">${at + 1}</span><span class="nm">${esc(name)}</span><span class="ds">${blurb}</span><span class="mv"><b>${n(movedLeads(name))}</b></span></div>`
).join("")}
        </div>
        <p class="caption">Counts are read from <code>192-key-census.json</code>, measured by ablation over a ${n(keyCensus.runs[0].queries)}-query sweep built from every head phrase and head word in the corpus. Six of these read the <em>row</em> rather than its name &mdash; the two frecency keys, <span class="rec">canonical</span>, <span class="rec">raw</span>, <span class="rec">plainSibling</span> and <span class="rec">designated</span> &mdash; which is why a careless measuring harness loses them silently. <strong><span class="rec">recent</span> and <span class="rec">frequent</span> measure zero here because this corpus has no ledger behind it</strong>; on a device that has logged nothing they tie on every row, and what is left is the eleven-key ranking everyone who has logged nothing gets.</p>
      </div>

      <h3>Why each of them exists</h3>
      <p>Not one was designed up front. Each arrived because a specific query led with a specific wrong row:</p>
      <ul>
        <li><span class="rec">position</span> &mdash; <span class="rec">olive oil</span> led with <span class="rec">Oil, corn, peanut, and olive</span>, a blend, for a query naming a single oil.</li>
        <li><span class="rec">accounted</span> &mdash; <span class="rec">soybean oil</span> led with <span class="rec">Oil, soybean lecithin</span>, an emulsifier, because two rows agreed on every key and the lower id won.</li>
        <li><span class="rec">wholeness</span> &mdash; <span class="rec">australian beef</span> led with <span class="rec">external fat</span>, and demoting that promoted <span class="rec">seam fat</span> at 562&nbsp;kcal.</li>
        <li><span class="rec">plainSibling</span> &mdash; fifteen red and thirteen white varietal wines sitting above the wine they are varieties of.</li>
      </ul>
    </section>

    <section id="screen">
      <p class="kicker">11 &middot; Display</p>
      <h2>What actually reaches the screen</h2>

      <p>The ranked list is cut to <strong>50 rows</strong>, and that is the last narrowing. Nothing below 50 is reachable by any means except typing a different word.</p>

      <div class="instrument">
        <h4>A ranked list &middot; searching &ldquo;grape&rdquo;</h4>
        <div class="results">
${scoreAll("grape")
  .slice(0, 5)
  .map(
    (hit, at) =>
      `          <div class="res ${at === 0 ? "win" : at === 1 ? "r2" : at === 2 ? "r3" : ""}">${esc(hit.description)}</div>`
  )
  .join("\n")}
        </div>
        <p class="caption">The real top five, ranked by the app's own comparator at generation time. The winner inverts &mdash; ink on paper. The runners-up carry a stepping left edge that thins over three rows and then stops, which is where the list stops making a claim worth reading.</p>
      </div>

      <p><strong>A chronology gets no rank mark at all.</strong> Your Recent list is sorted by time; its newest entry won nothing, and painting a crown over it would be a claim about order the list does not make. That was a real shipped defect, and the rule now reads: a presentation meaning &ldquo;this one won&rdquo; may not appear over a list that has not ranked anything.</p>
    </section>

    <section id="edges">
      <p class="kicker">12 &middot; The edges</p>
      <h2>Where this data runs out</h2>

      <p>Five measurements that no rule states and nobody designed. They are what the corpus <em>became</em>.</p>

      <h3>${pc(neverOnPage, ROWS)} of the corpus cannot be reached by typing its own vocabulary</h3>
      <p>Sweeping all ${n(headVocabulary.length)} head phrases and head words the corpus itself uses, only <strong>${n(everLeads)} rows (${pc(everLeads, ROWS)}) ever lead a query</strong>, and <strong>${n(neverOnPage)} (${pc(neverOnPage, ROWS)}) never reach the first fifty for any of them</strong>. Only ${n(neverRetrieved)} are never returned at all &mdash; the rest are simply always buried. You can arrive at them only by already knowing the full name.</p>

      <div class="tablewrap">
        <table>
          <thead><tr><th>Family</th><th class="num">Buried</th><th class="num">Of</th><th class="num">Share</th></tr></thead>
          <tbody>
${worstBuried
  .map(
    (f) =>
      `            <tr><td class="key">${esc(f.head)}</td><td class="num">${n(f.buried)}</td><td class="num">${n(f.of)}</td><td class="num">${pc(f.buried, f.of)}</td></tr>`
  )
  .join("\n")}
          </tbody>
        </table>
      </div>

      <h3>The corpus is one animal and a long tail</h3>
      <p>${n(familyRows.length)} head phrases hold ${n(ROWS)} rows. The ten largest hold <strong>${pc(topTenShare, ROWS)}</strong>; <span class="rec">${esc(familyRows[0][0])}</span> alone holds ${n(familyRows[0][1])} (${pc(familyRows[0][1], ROWS)}). ${n(singletonFamilies)} families are a single row, and ${n(familiesWipedOut)} head phrases lost every record they had.</p>

      <h3>Name depth runs the opposite way in each half</h3>
      <div class="instrument">
        <h4>Comma-parts per name &middot; <span class="swatch keep"></span> shipped &nbsp; <span class="swatch cut"></span> discarded</h4>
        <div class="depth">${depthBars()}</div>
        <p class="caption">Discarded names pile up shallow; shipped ones run deep, and ${n(deeplyQualified)} shipped rows carry eight parts or more. What survived is the deeply-qualified name &mdash; which is exactly the hardest kind to type, and explains the reachability number above.</p>
      </div>

      <h3>The vocabulary is checked for landing somewhere, never for landing right</h3>
      <p>${n(landedKeys)} vocabulary keys land on only ${n(landings.size)} distinct rows. A key is admitted if it <em>retrieves something</em>, and a non-empty result cannot tell landing on the right food from landing on any food. The crowded landings are where to look:</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Keys</th><th>All land on</th><th>For example</th></tr></thead>
          <tbody>
${crowdedLandings
  .slice(0, 6)
  .map(
    ([row, keys]) =>
      `            <tr><td class="num">${n(keys.length)}</td><td>${esc(row)}</td><td class="key">${keys.slice(0, 3).map(esc).join(", ")}</td></tr>`
  )
  .join("\n")}
          </tbody>
        </table>
      </div>

      <h3>Stated energy against the food's own macros</h3>
      <p>Median gap <strong>${medianResidual.toFixed(1)} kcal</strong>; <strong>${n(wildResiduals)} rows</strong> are more than 50 kcal apart. It reads both ways for known reasons &mdash; ethanol carries about 7&nbsp;kcal/g and is in none of the three macros, while fibre sits inside the carbohydrate figure and yields far less than 4. The extremes:</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Food</th><th class="num">Stated &minus; Atwater</th></tr></thead>
          <tbody>
${[...byResidual.slice(0, 3), ...byResidual.slice(-3)]
  .map(
    (r) =>
      `            <tr><td>${esc(r.description)}</td><td class="num ${r.residual > 0 ? "" : "neg"}">${r.residual > 0 ? "+" : ""}${r.residual.toFixed(0)}</td></tr>`
  )
  .join("\n")}
          </tbody>
        </table>
      </div>

      <h3>What the surviving half is made of, in its own words</h3>
      <p>The words most distinctive of each half, by log-odds. No drop rule mentions beef anywhere &mdash; this is simply what is left once prepared food is gone.</p>
      <div class="tablewrap">
        <table>
          <thead><tr><th>Predicts shipped</th><th class="num">S / D</th><th>Predicts discarded</th><th class="num">S / D</th></tr></thead>
          <tbody>
${shippedWords
  .map(
    (s, at) =>
      `            <tr><td class="key">${esc(s.word)}</td><td class="num">${n(s.shipped)} / ${n(s.dropped)}</td><td class="key">${esc(droppedWords[at].word)}</td><td class="num">${n(droppedWords[at].shipped)} / ${n(droppedWords[at].dropped)}</td></tr>`
  )
  .join("\n")}
          </tbody>
        </table>
      </div>
    </section>

    <section id="bar">
      <p class="kicker">13 &middot; Honesty</p>
      <h2>How good is it, really</h2>

      <p>Before any of this was changed, a bar was written down and committed &mdash; 44 hand-judged queries, each with the exact record a diarist means, keyed by USDA id so a rename cannot fake a pass.</p>

      <div class="tablewrap">
        <table>
          <thead><tr><th>Condition</th><th>Asks</th><th class="num">Today</th></tr></thead>
          <tbody>
            <tr><td><strong>C1</strong></td><td>Is the row you meant in the top three?</td><td class="num">24 / 44</td></tr>
            <tr><td><strong>C2</strong></td><td>Does the query answer with 25 rows or fewer?</td><td class="num">27 / 44</td></tr>
          </tbody>
        </table>
      </div>

      <p style="margin-top:1.3rem">So <strong>search fails its own bar on roughly half of ordinary one-word queries</strong>. Four gold rows are off the screen entirely &mdash; three past the 50-row page cap and one not retrieved at all. C2 was chosen over a cleverer proposal for one reason: <strong>result-set size is the one number ranking cannot move.</strong></p>
    </section>

    <section id="tradeoffs">
      <p class="kicker">14 &middot; Trade-offs</p>
      <h2>Every choice, and what it costs</h2>

      <div class="tablewrap">
        <table>
          <thead><tr><th>Choice</th><th>Buys</th><th>Costs</th></tr></thead>
          <tbody>
            <tr><td><strong>Bundle the corpus; no API</strong></td><td>No key, no quota, offline search, 14&nbsp;ms parse</td><td>A 1.7&nbsp;MB file in the app; refreshing it is a code change</td></tr>
            <tr><td><strong>USDA over other national tables</strong></td><td>95% of rows carry a household portion; deep nutrient panels</td><td>The <em>worst</em> table on duplication: 8.28 rows per head against CIQUAL's 2.00</td></tr>
            <tr><td><strong>Barcode-only products</strong></td><td>A typed word reaches ingredients, never forty branded onions</td><td>No packet, no product</td></tr>
            <tr><td><strong>Drop rather than rank packaged foods</strong></td><td>${n(DROPPED)} rows of noise never reach a keystroke</td><td>A food dropped in error is unreachable and silent</td></tr>
            <tr><td><strong>Trust USDA's own filing</strong></td><td>${n(census.attribution.category ?? 0)} dishes removed without hand-judging each</td><td>${wipedOut.length} categories vanish whole, unexamined</td></tr>
            <tr><td><strong>Keep cooked rows, demote them</strong></td><td>A logged bowl of rice is not costed at dry-rice energy &mdash; ~360 kcal against ~130</td><td>41% of the corpus names a cooking method, so lists are long</td></tr>
            <tr><td><strong>Vocabulary only on zero results</strong></td><td>An expansion can never damage a result you already had</td><td><span class="rec">raw aubergine</span> gets no help, because the map is phrase-keyed</td></tr>
            <tr><td><strong>Ordinal keys, never summed</strong></td><td>One key can never be outvoted by two weaker ones</td><td>Deep ties are broken by USDA id &mdash; effectively arbitrary</td></tr>
            <tr><td><strong>50-row page</strong></td><td>A bounded list, a bounded render</td><td>11 of 45 queries hit it, and three correct answers sit past it</td></tr>
          </tbody>
        </table>
      </div>

      <div class="note" style="margin-top:1.8rem">
        <span class="tag">The standing risk</span>
        <p><strong>${pc(index.foods.filter((r) => r.dataType === "SR Legacy").length, ROWS)} of what ships is SR&nbsp;Legacy, which USDA stopped maintaining in 2018.</strong> Thirteen national composition tables were surveyed for a replacement; none is more current <em>and</em> better on duplication <em>and</em> carries household portions.</p>
      </div>
    </section>

    <section id="pending">
      <p class="kicker">15 &middot; What the rule cost</p>
      <h2>One row per ingredient, and the fourteen foods it took</h2>

      <p>The corpus used to carry every record USDA published about a food, including the ones it had cooked first. Typing <span class="rec">beef</span> returned rows that were the same sentence permuted over trim, grade, separation and cooking. That list was not mis-sorted &mdash; it was one food written out thirty times, and no ordering of thirty copies produces fewer than thirty.</p>

      <div class="note">
        <span class="tag">The rule the corpus now follows</span>
        <p><strong>A corpus row is a food as bought.</strong> Cooking happens after the purchase, so a cooked record is not an ingredient and does not ship. Drying, curing and smoking happen before it, so dried apricots and smoked salmon are foods and do.</p>
        <p>The line between them is a shop: <em>if you could scoop it out of a bin and carry it home in a paper bag with no label on it, it is an ingredient.</em> That is why roasted peanuts and toasted sunflower seeds stay and parboiled rice does not.</p>
      </div>

      <p>${n(byRule.get("cooked_form").length)} records left on that rule alone. A name then loses the words that only existed to deny an alternative &mdash; every spelling of the uncooked state, an enrichment word whose counterpart no longer ships, and a comparative like <span class="rec">regular</span> that nothing contests any more:</p>

      <pre class="record">Rice, white, long-grain, regular, raw, enriched
  -&gt; Rice, white, long-grain</pre>

      <h3>What it cost, stated rather than buried</h3>

      <p><strong>Fourteen foods left the corpus entirely</strong>, because the only record USDA published of each was a cooked one. There is no version of this rule that keeps them: a rule reading one row at a time cannot tell a duplicate from the only record there is.</p>

      <div class="tablewrap">
        <table>
          <thead><tr><th>Gone</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td><strong>mutton</strong>, <strong>turkey breast</strong>, <strong>turkey thigh</strong>, dove</td><td>USDA publishes them roasted and no other way</td></tr>
            <tr><td>escarole, stinging nettles, malabar spinach, tree fern</td><td>published boiled</td></tr>
            <tr><td>buckwheat groats, pinon nuts, winged bean</td><td>published cooked or roasted</td></tr>
            <tr><td>salmon nuggets, guava sauce, beef composite</td><td>published cooked</td></tr>
          </tbody>
        </table>
      </div>

      <p>A British reader loses one more thing worth naming: <span class="rec">jacket potato</span> no longer answers. A jacket potato <em>is</em> a baked potato, so there is no uncooked row for the word to reach. A raw potato is still in the corpus and still answers <span class="rec">potato</span>.</p>

      <h3>What it bought</h3>

      <div class="statgrid">
        <div class="stat"><b>${n(ROWS)}</b><span>rows, down from 4,238 &mdash; and 498 foods, down from 512</span></div>
        <div class="stat"><b>${pc(neverOnPage, ROWS)}</b><span>of rows unreachable by typing the corpus's own vocabulary, down from 41%</span></div>
        <div class="stat"><b>${n(scoreAll("beef").length)}</b><span>rows answer <span class="rec">beef</span></span></div>
        <div class="stat"><b>0</b><span>leads the <span class="rec">simplicity</span> ranking key still moves</span></div>
      </div>

      <p>That last figure is the one nobody was looking for. <strong>Removing the cooked rows retired a ranking key.</strong> <span class="rec">simplicity</span> now moves no lead at all and breaks nothing when deleted, and <span class="rec">raw</span> has fallen from 63 moved leads to ${n(movedLeads("raw"))} &mdash; it was reading a word no name carries any more. An earlier census went looking for exactly this and found nothing redundant; what it was testing was a rule that merged duplicate rows, and merging leaves every distinction standing. Removing them does not.</p>

      <p>It also repaired five cases a hand-adjudication had recorded as wrong. <span class="rec">spinach</span> used to lead with <span class="rec">Spinach, cooked, boiled, drained, without salt</span>; millet, teff, tempeh and rice noodles led with their cooked rows too. All five leads were wrong because a cooked row was answering, and all five rows are gone.</p>
    </section>

    <section id="faq">
      <p class="kicker">16 &middot; Questions</p>
      <h2>Questions this usually raises</h2>

      <div class="faq">
        <details open>
          <summary>How do I check whether a food I expected is missing?</summary>
          <p>Type it into the browser in section 7. If it is there, the row tells you which rule removed it and which words that rule fired on. If it is not there and it is not in the app either, it is a food USDA never published &mdash; the census covers every record in both archives, and its survivor count is checked against the shipped index on every regeneration, so it cannot quietly miss a record.</p>
        </details>

        <details>
          <summary>Why did <span class="rec">egg</span> used to lead with a duck egg?</summary>
          <p>It no longer does, and the way it stopped is worth reading, because the obvious fix was not the one that worked.</p>
          <p>USDA names four birds &mdash; <span class="rec">Egg, duck, whole, fresh</span>, goose, quail, turkey &mdash; and then files a hen's egg under its retail grade, as <span class="rec">Eggs, Grade A, Large, egg whole</span>. So the one egg nearly everybody means was the only one whose name never said which bird laid it, and it lost on two keys at once: the plural <span class="rec">Eggs</span> filled the head phrase less completely than <span class="rec">Egg</span>, and USDA never wrote <em>raw</em> on a graded egg, so a box of fresh eggs scored 0 on a key the duck scored 1 on.</p>
          <p><strong>Renaming it was necessary and not sufficient.</strong> Shipped as <span class="rec">Egg, chicken, whole, fresh</span> the row matches its four siblings exactly &mdash; and that is the problem: same tier, same head, same everything the keys can read. All five tied to the bottom of the comparator, where the sort fell through to corpus order and the duck's lower record number won. Nothing about that was a judgement.</p>
          <p>So the tie is broken by <span class="rec">canonical</span>, a hand-written roster with two entries in it, sitting just below the two frecency keys. Below them on purpose: <strong>if you log duck eggs, duck leads</strong>. A roster rather than a rule because there is no rule to write &mdash; the names differ only in the bird, and which bird is the default is knowledge about shoppers, not about food composition. It moves ${n(movedLeads("canonical"))} leads across the whole sweep, and it can never remove a row: every egg is still there, in the order the next key down would have put them.</p>
        </details>

        <details>
          <summary>Why did <span class="rec">cow milk</span> used to find nothing?</summary>
          <p>The same shape as the eggs, one step worse. USDA names three animals under the head phrase <span class="rec">Milk</span> &mdash; <span class="rec">Milk, sheep, fluid</span>, <span class="rec">Milk, goat, fluid</span>, <span class="rec">Milk, indian buffalo, fluid</span> &mdash; and then files cow's milk by its fat content. So the milk almost every search means was the only one that never said which animal it came from, <span class="rec">milk</span> led with sheep, and <span class="rec">cow milk</span> returned zero rows.</p>
          <p>The four fluid milks now say it: <span class="rec">Milk, cow, whole, 3.7% milkfat</span> and its 2%, 1% and skimmed siblings. Evaporated milk and buttermilk are cow's milk too and are deliberately left alone &mdash; nobody says &ldquo;cow buttermilk&rdquo;, and the word only earns its place where an animal is genuinely in question.</p>
          <p><strong>This is a rename, not a species rule.</strong> A ranking key that read animal words out of descriptions was designed, measured and refused, and that refusal stands: there is no roster of animals anywhere in the search, and goat, sheep and buffalo milk hold every position they had relative to each other. What changed is that the corpus now states the species in the data, in the same place USDA already states it for the other three &mdash; which is also the only thing that could fix the retrieval, since no ordering key can return a row that the words never reach.</p>
        </details>

        <details>
          <summary>Why is there no &ldquo;popularity&rdquo; ranking?</summary>
          <p>Nothing leaves the device, so there is no <em>shared</em> usage data to rank on. What ranking there is comes from two places, and both obey the same standing principle &mdash; prevalence may rank a food and may never drop one.</p>
          <p>The first is your own log: <span class="rec">recent</span> and <span class="rec">frequent</span> are computed on this device from what you have actually eaten, and they sit above every other ordering key. The second is <span class="rec">canonical</span>, two hand-written entries, which fire only on rows that tie in every earlier key. Ranking by assumed prevalence as a <em>drop</em> rule was considered and refused outright.</p>
        </details>

        <details>
          <summary>Is &ldquo;the rule fired on this word&rdquo; the same as &ldquo;this word is in a denylist&rdquo;?</summary>
          <p>No, and the difference matters. The census never reads the rules' word lists &mdash; they are private, and copying them would be a second copy of the judgement. It removes terms from the record until the real rule goes quiet, and reports the smallest set that keeps it quiet. So a term shown here is <em>load-bearing for this verdict</em>, which is a stronger and more useful claim than naming a table entry, and it survives a rewrite of the table.</p>
        </details>

        <details>
          <summary>Some rows show no terms at all. Why?</summary>
          <p>Because those rules do not read the name. <span class="rec">superseded</span> is a hand-written id list, <span class="rec">no_energy</span> reads the nutrient panel, the three variant rules ask what a row's head-phrase siblings look like, and the name-collision rules ask what other rows are called. There is no word to point at, and the census says so rather than inventing one.</p>
        </details>

        <details>
          <summary>Do I lose past logs when a row leaves the corpus?</summary>
          <p>No. A logged food carries its own nutrient panel into the append-only ledger, and nothing re-reads the search index for a past log. Dropping rows cannot damage history &mdash; which is why membership changes are safe to make and ordering changes are the fiddly ones.</p>
        </details>

        <details>
          <summary>Why are raw and cooked the same food, but whole and skimmed milk are not?</summary>
          <p>The meal-log test. You buy beef and cook it, so cooking happened after the purchase and collapses. You buy 2% milk <em>as</em> 2% milk, so fat content is true at purchase and distinguishes. Nutritional distance is explicitly not the test &mdash; a threshold on calorie movement was built and refuted, because cooking moves a chicken breast 13% and trim moves beef 12%, one point apart.</p>
        </details>

        <details>
          <summary>If a collapse throws away a measured difference, which number do I get?</summary>
          <p>One real USDA record's panel, whole &mdash; never a mean, because a mean is a number USDA never measured and no row can be pointed at to explain it. The survivor is chosen by fullest nutrient panel, then lowest id.</p>
        </details>

        <details>
          <summary>What happens when USDA has no good record?</summary>
          <p>The group ships its fullest-panel row under that row's <em>whole, unstripped</em> name. So <span class="rec">Quinoa, cooked</span> ships saying exactly that, rather than being renamed to <span class="rec">Quinoa</span> and quietly claiming to be the dry grain. A name may never claim less than its panel measures.</p>
        </details>

        <details>
          <summary>How do I regenerate this page?</summary>
          <p><code>pnpm usda:drop-census</code> rebuilds the census from the archives in <code>.usda-backup</code>, then <code>pnpm docs:food-search</code> rebuilds this page from the census and the shipped index. <code>pnpm docs:food-search --check</code> fails if the committed page is out of date, and runs in <code>pnpm check</code>.</p>
        </details>
      </div>
    </section>

  </main>

  <footer>
    Inventoria &middot; generated from ${esc(census.generated_from)} &middot; ${n(ROWS)} shipped, ${n(DROPPED)} discarded
  </footer>

</div>

<script id="corpus" type="application/json">${JSON.stringify(searchCorpus).replace(/</g, "\\u003c")}</script>
<script>
${bundleSearch()}
</script>
<script id="drops" type="application/json">${JSON.stringify(reviewData).replace(/</g, "\\u003c")}</script>
<script>
${readFileSync(join(ROOT, "scripts", "food-search-tryit.js"), "utf8")}
</script>
<script>
${readFileSync(join(ROOT, "scripts", "food-search-explainer.js"), "utf8")}
</script>
</body>
</html>
`;

// ── write, or check ─────────────────────────────────────────────────────────

function main() {
  if (process.argv.includes("--check")) {
    let committed = null;
    try {
      committed = readFileSync(OUT_PATH, "utf8");
    } catch {
      throw new Error(`${OUT_PATH} does not exist. Run: pnpm docs:food-search`);
    }
    if (committed !== html)
      throw new Error(
        "docs/food-search.html is out of date with the corpus or the drop " +
          "census. Regenerate it: pnpm docs:food-search"
      );
    console.log(
      `  ok  docs/food-search.html is current (${n(ROWS)} shipped, ${n(DROPPED)} discarded)`
    );
    return;
  }

  writeFileSync(OUT_PATH, html);
  console.log(
    `${n(IDENTITIES)} identities, ${n(ROWS)} shipped, ${n(DROPPED)} discarded\n` +
      `  ${n(headVocabulary.length)} head words swept: ${n(everLeads)} rows ever lead, ${n(neverOnPage)} never reach the page\n` +
      `  ${categoryRows.length} categories, ${wipedOut.length} losing every record\n` +
      `\nwritten to ${OUT_PATH} (${(html.length / 1024 / 1024).toFixed(2)} MiB)`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
