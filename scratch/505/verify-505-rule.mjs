/**
 * #505's two load-bearing claims, checked against the shipped corpus:
 *
 *   1. the three-line panel rule recovers 123 of 124 non-aerated foods;
 *   2. the worst wrong answer each collapsed class admits is under ~10 kcal on a
 *      realistic serving, priced at each food's OWN energy rather than a class
 *      average — which is where a first pass got sugar-free syrup wrong by 6x.
 */
import { readFileSync } from "node:fs";
import {
  selectClass,
  classStats,
} from "/home/inkpotmonkey/code/inventoria/.claude/worktrees/density-505/scripts/density-class-check.mjs";

const ROOT = "/home/inkpotmonkey/code/inventoria/.claude/worktrees/density-505";
const corpus = JSON.parse(
  readFileSync(`${ROOT}/public/usda/search-index.json`, "utf8")
);
const foods = corpus.foods ?? corpus;

/** #505's rule, verbatim. Gated on a volume basis by its caller, not here. */
function classFromPanel(macros) {
  const kcal = macros?.calories ?? 0;
  const fat = macros?.fat_content ?? 0;
  const carb = macros?.carbohydrate_content ?? 0;
  if (fat >= 80) return "oil";
  if (kcal >= 250 && fat < 5 && carb >= 55) return "syrup";
  return "liquid";
}

const PATTERNS = {
  oil: [
    {
      category: "Fats and Oils",
      name: /^(\w+ )?oil,/i,
      except: /fully hydrogenated/i,
    },
  ],
  syrup: [{ name: /\b(syrups?|honey|molasses)\b/i }],
  liquid: [
    { category: "Beverages", name: /^Beverages, water,|brewed/i },
    { name: /^Milk,/i, except: /evaporated|condensed|dry|powder/i },
    { name: /juice/i },
    {
      category: "Beverages",
      name: /\b(beer|wine)\b/i,
      except: /hard lemonade/i,
    },
  ],
};

// The truth set: which class each food belongs to by the evidence patterns.
const truth = new Map();
for (const [id, patterns] of Object.entries(PATTERNS))
  for (const p of patterns)
    for (const f of selectClass(foods, p))
      if (!truth.has(f.fdcId)) truth.set(f.fdcId, id);

const FIGURES = { liquid: 1.0, oil: 0.92, syrup: 1.39 };
const SERVING_ML = { liquid: 250, oil: 14.787, syrup: 14.787 };
const SERVING_NAME = { liquid: "250 ml", oil: "tbsp", syrup: "tbsp" };

let hits = 0;
const misses = [];
const worst = { liquid: null, oil: null, syrup: null };

for (const [fdcId, want] of truth) {
  const food = foods.find((f) => f.fdcId === fdcId);
  const got = classFromPanel(food.macros);
  if (got === want) hits++;
  else misses.push({ name: food.description, want, got, macros: food.macros });

  // Cost: the food's own density against the figure its panel rule assigns,
  // over a realistic serving, at the food's own energy density.
  const own = classStats([food]).figure;
  if (!Number.isFinite(own)) continue;
  const kcalPerG = (food.macros?.calories ?? 0) / 100;
  const ml = SERVING_ML[got];
  const kcal = Math.abs(own - FIGURES[got]) * ml * kcalPerG;
  if (!worst[got] || kcal > worst[got].kcal)
    worst[got] = { name: food.description, own, kcal, assigned: got };
}

console.log(`corpus ${foods.length} foods, schema ${corpus.schema_version}`);
console.log(`\nthe panel rule recovers ${hits} of ${truth.size}`);
for (const m of misses)
  console.log(
    `  MISS ${m.name.slice(0, 46).padEnd(46)} want=${m.want.padEnd(6)} got=${m.got.padEnd(
      6
    )} kcal=${m.macros?.calories} fat=${m.macros?.fat_content} carb=${m.macros?.carbohydrate_content}`
  );

console.log(`\nworst wrong answer per class, at each food's own energy:`);
for (const [id, w] of Object.entries(worst))
  if (w)
    console.log(
      `  ${id.padEnd(7)} ${w.name.slice(0, 44).padEnd(44)} own=${w.own.toFixed(
        4
      )} vs ${FIGURES[id]} -> ${w.kcal.toFixed(1)} kcal / ${SERVING_NAME[id]}`
    );
