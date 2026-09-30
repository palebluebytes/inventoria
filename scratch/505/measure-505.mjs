/**
 * What #505's collapsed table actually measures, using the gate's own method.
 *
 * Nothing here decides anything: it prints what `public/usda/search-index.json`
 * states, through `density-class-check.mjs`'s own `selectClass` and `classStats`,
 * so the figures pinned afterwards are the corpus's rather than #499's remembered.
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
console.log(`corpus: ${foods.length} foods, schema ${corpus.schema_version}`);

const FOUR = [
  {
    id: "water-like",
    category: "Beverages",
    name: /^Beverages, water,|brewed/i,
  },
  {
    id: "milk-like",
    name: /^Milk,/i,
    except: /evaporated|condensed|dry|powder/i,
  },
  { id: "juice", name: /juice/i },
  {
    id: "beer-wine",
    category: "Beverages",
    name: /\b(beer|wine)\b/i,
    except: /hard lemonade/i,
  },
];

const to = (n, places) => Number(n.toFixed(places));
const report = (label, selected) => {
  const s = classStats(selected);
  console.log(
    `${label.padEnd(14)} foods=${String(s.foods).padStart(3)} portions=${String(
      s.portions
    ).padStart(3)} figure=${s.figure.toFixed(4)} spread=${to(
      s.spread * 100,
      1
    )}% cv=${to(s.cv * 100, 2)}%`
  );
  return s;
};

// Each of the four on its own, to confirm the existing pins still hold here.
for (const p of FOUR) report(p.id, selectClass(foods, p));

// The pool, deduplicated by fdcId: `juice` and `beer-wine` can both reach a row.
const pooled = new Map();
for (const p of FOUR)
  for (const f of selectClass(foods, p)) pooled.set(f.fdcId, f);
const liquid = report("POOLED liquid", [...pooled.values()]);

// The class ADR-0108 §2 refused on CV, which #505 admits on cost instead.
const syrup = report(
  "syrup",
  selectClass(foods, { name: /\b(syrups?|honey|molasses)\b/i })
);

console.log("\n-- what a wrong answer costs, per #505's ~10 kcal threshold --");
// A syrup is ~300 kcal/100 g, so an error in g/ml is an error in kcal directly.
const SYRUP_KCAL_PER_G = 3.0;
const TBSP_ML = 14.787;
const worstSyrup = [
  ...selectClass(foods, { name: /\b(syrups?|honey|molasses)\b/i }),
]
  .map((f) => ({ name: f.description, d: classStats([f]).figure }))
  .filter((r) => Number.isFinite(r.d))
  .sort((a, b) => Math.abs(b.d - syrup.figure) - Math.abs(a.d - syrup.figure));
for (const r of worstSyrup.slice(0, 4))
  console.log(
    `  syrup worst: ${r.name.slice(0, 44).padEnd(44)} ${r.d.toFixed(4)} -> ${(
      Math.abs(r.d - syrup.figure) *
      TBSP_ML *
      SYRUP_KCAL_PER_G
    ).toFixed(1)} kcal/tbsp off ${syrup.figure.toFixed(2)}`
  );

// And the same for the pool, on a 250 ml glass at milk's ~0.64 kcal/g.
const MILK_KCAL_PER_G = 0.64;
const GLASS_ML = 250;
const worstLiquid = [...pooled.values()]
  .map((f) => ({ name: f.description, d: classStats([f]).figure }))
  .filter((r) => Number.isFinite(r.d))
  .sort(
    (a, b) => Math.abs(b.d - liquid.figure) - Math.abs(a.d - liquid.figure)
  );
for (const r of worstLiquid.slice(0, 5))
  console.log(
    `  liquid worst: ${r.name.slice(0, 43).padEnd(43)} ${r.d.toFixed(4)} -> ${(
      Math.abs(r.d - liquid.figure) *
      GLASS_ML *
      MILK_KCAL_PER_G
    ).toFixed(1)} kcal/250ml off ${liquid.figure.toFixed(2)}`
  );
