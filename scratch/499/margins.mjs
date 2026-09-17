/**
 * #499 — what a density answer is worth, priced in kilocalories.
 *
 * Every figure in the resolution of #499 is printed by this file. It reads
 * `public/usda/search-index.json`, which is already in the repo, and imports the
 * shipped gate's own `foodDensity` / `selectClass` so the selection is the one
 * ADR-0108 §3 proves rather than a second implementation of it. No network.
 *
 *   node scratch/499/margins.mjs
 *
 * The question it was written to answer is not "how accurate is a density" but
 * "how often must the user be asked", so everything is reported as the kcal cost
 * of a WRONG answer on a realistic serving of that food. A distinction worth
 * less than a kilocalorie or two is a question that should never be asked.
 */
import { readFileSync } from "node:fs";
import {
  foodDensity,
  selectClass,
} from "../../scripts/density-class-check.mjs";

const { foods } = JSON.parse(
  readFileSync("public/usda/search-index.json", "utf8")
);
const withDensity = foods.filter((f) => foodDensity(f) !== null);

/** The five pinned classes, each with the serving anyone actually measures. */
const CLASSES = [
  {
    id: "water-like",
    figure: 1.0,
    dose: 250,
    pattern: { category: "Beverages", name: /^Beverages, water,|brewed/i },
  },
  {
    id: "milk-like",
    figure: 1.03,
    dose: 250,
    pattern: { name: /^Milk,/i, except: /evaporated|condensed|dry|powder/i },
  },
  { id: "juice", figure: 1.04, dose: 250, pattern: { name: /juice/i } },
  {
    id: "beer-wine",
    figure: 0.99,
    dose: 250,
    pattern: {
      category: "Beverages",
      name: /\b(beer|wine)\b/i,
      except: /hard lemonade/i,
    },
  },
  {
    id: "oil",
    figure: 0.92,
    dose: 15,
    pattern: {
      category: "Fats and Oils",
      name: /^(\w+ )?oil,/i,
      except: /fully hydrogenated/i,
    },
  },
];

const kcalPerGram = (food) => (food.macros?.calories ?? 0) / 100;
/** What assuming `figure` costs on `dose` ml of this food, in kcal. */
const cost = (food, figure, dose) =>
  Math.abs(figure - foodDensity(food)) * dose * kcalPerGram(food);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const heading = (text) => console.log(`\n\n=== ${text}\n`);

// ---------------------------------------------------------------------------
heading("The corpus (confirms the two stale numbers density-class.ts carries)");

console.log(
  `  foods in the artifact        ${foods.length}   (density-class.ts says 2,437)`
);
console.log(
  `  foods stating a density      ${withDensity.length}   (ADR-0108 §12 says 896, schema-8)`
);

const inAClass = new Set();
for (const c of CLASSES)
  selectClass(withDensity, c.pattern).forEach((f) => inAClass.add(f.fdcId));
const outside = withDensity.filter((f) => !inAClass.has(f.fdcId));
console.log(`  inside one of the five       ${inAClass.size}`);
console.log(`  outside all five             ${outside.length}`);

// ---------------------------------------------------------------------------
heading("1. What a per-food table would buy over the class figure");

for (const c of CLASSES) {
  const members = selectClass(withDensity, c.pattern);
  const errors = members.map((f) => cost(f, c.figure, c.dose));
  const worst = members[errors.indexOf(Math.max(...errors))];
  console.log(
    `  ${c.id.padEnd(11)} n=${String(members.length).padStart(2)}  ` +
      `mean ${mean(errors).toFixed(2).padStart(5)} kcal / ${c.dose} ml   ` +
      `worst ${Math.max(...errors)
        .toFixed(2)
        .padStart(5)} kcal  (${worst.description.slice(0, 44)})`
  );
}

// ---------------------------------------------------------------------------
heading("2. The ceiling on a bigger table — the 513 outside the classes");

const bands = [
  [0, 0.3],
  [0.3, 0.5],
  [0.5, 0.7],
  [0.7, 0.85],
  [0.85, 1.25],
  [1.25, 1.6],
];
for (const [lo, hi] of bands) {
  const n = outside.filter(
    (f) => foodDensity(f) >= lo && foodDensity(f) < hi
  ).length;
  console.log(
    `  ${lo.toFixed(2)}–${hi.toFixed(2)}  ${String(n).padStart(3)}${lo < 0.85 ? "   bulk packing density of a heaped solid" : ""}`
  );
}
console.log(
  `\n  Below 0.85: ${outside.filter((f) => foodDensity(f) < 0.85).length} foods that must never convert.` +
    `\n  The 0.85–1.60 band is dominated by mayonnaise, cottage cheese, peanut butter,` +
    `\n  tahini, tofu, miso, pickle relish and table salt — packing densities of` +
    `\n  semi-solids. The genuinely pourable residue is ~30 foods (#501 counts 28).`
);

// ---------------------------------------------------------------------------
heading("3. The sixth-class rider — every candidate fails on n, not CV");

const CANDIDATES = {
  vinegar: /^vinegar,/i,
  "soy sauce": /soy sauce/i,
  "ice cream": /ice cream|frozen dessert/i,
  soup: /^soup,/i,
  "plant milk":
    /(soy|almond|oat|rice|coconut|cashew).{0,25}(milk|beverage|drink)/i,
  carbonated: /carbonated|soft drink|energy drink/i,
};
for (const [name, re] of Object.entries(CANDIDATES)) {
  const rows = withDensity.filter((f) => re.test(f.description));
  const ds = rows.map(foodDensity).sort((a, b) => a - b);
  if (!ds.length) {
    console.log(
      `  ${name.padEnd(11)} n= 0                                 fails n`
    );
    continue;
  }
  const m = mean(ds);
  const cv = (Math.sqrt(mean(ds.map((d) => (d - m) ** 2))) / m) * 100;
  console.log(
    `  ${name.padEnd(11)} n=${String(ds.length).padStart(2)}  ${ds[0].toFixed(3)}–${ds.at(-1).toFixed(3)}  ` +
      `CV ${cv.toFixed(2).padStart(5)}%   ${ds.length < 8 ? "fails n" : cv > 2 ? "fails CV" : "CLEARS"}`
  );
}
console.log(
  "\n  ADR-0108 §2's floor is n >= 8. The members do not exist to be found,"
);
console.log("  which is not something a model can fix.");

// ---------------------------------------------------------------------------
heading("4. The four non-oil classes pooled into one 'it's a liquid' figure");

const pooled = CLASSES.slice(0, 4).flatMap((c) =>
  selectClass(withDensity, c.pattern)
);
const seen = new Set();
const pooledFoods = pooled.filter(
  (f) => !seen.has(f.fdcId) && seen.add(f.fdcId)
);
const pooledDs = pooledFoods.map(foodDensity).sort((a, b) => a - b);
const pm = mean(pooledDs);
const pooledCv =
  (Math.sqrt(mean(pooledDs.map((d) => (d - pm) ** 2))) / pm) * 100;
const median =
  pooledDs.length % 2
    ? pooledDs[(pooledDs.length - 1) / 2]
    : (pooledDs[pooledDs.length / 2 - 1] + pooledDs[pooledDs.length / 2]) / 2;

console.log(
  `  n=${pooledFoods.length}  range ${pooledDs[0].toFixed(4)}–${pooledDs.at(-1).toFixed(4)}  median ${median.toFixed(4)}  CV ${pooledCv.toFixed(2)}%`
);
console.log(
  `  -> ${pooledCv <= 2 ? "CLEARS" : "fails"} ADR-0108 §2's own bar. "It's a liquid" is an admissible class.\n`
);

const POOLED = 1.0;
let worstPooled = 0;
for (const c of CLASSES.slice(0, 4)) {
  const members = selectClass(withDensity, c.pattern);
  const errs = members.map((f) => cost(f, POOLED, c.dose));
  worstPooled = Math.max(worstPooled, ...errs);
  console.log(
    `  ${c.id.padEnd(11)} collapsing costs mean ${mean(errs).toFixed(2).padStart(5)} kcal / ${c.dose} ml, ` +
      `worst ${Math.max(...errs).toFixed(1)} kcal`
  );
}
console.log(
  `\n  The whole four-way question is worth at most ${worstPooled.toFixed(1)} kcal, on one food.`
);
console.log("  The distinctions that pay:");
for (const [name, d, dose, kcal] of [
  ["oil", 0.92, 15, 884],
  ["syrup", 1.43, 15, 304],
  ["aerated", 0.65, 100, 207],
])
  console.log(
    `    ${name.padEnd(8)} ${((Math.abs(POOLED - d) * dose * kcal) / 100).toFixed(0).padStart(2)} kcal per ${dose} ml`
  );

// ---------------------------------------------------------------------------
heading("5. The panel alone, with no tags at all");

/**
 * Read off the nutrition panel, which is on every twin — so unlike a category
 * tag this reaches the 24.24% of millilitre products that carry no usable tags.
 *
 * ONLY SAFE FOR A FOOD SOLD BY VOLUME. Over the whole corpus this calls dry
 * noodles and freeze-dried chives "syrup" at 400+ kcal of error; they cannot
 * reach it because `offPanelBasis` asks the question only where the panel is
 * per 100 ml, and that gate is load-bearing rather than incidental.
 */
const fromPanel = (food) => {
  const {
    calories = 0,
    fat_content: fat = 0,
    carbohydrate_content: carb = 0,
  } = food.macros ?? {};
  if (fat >= 80) return "oil";
  if (calories >= 250 && fat < 5 && carb >= 55) return "syrup";
  return "liquid";
};

const groups = {
  oil: selectClass(withDensity, CLASSES[4].pattern),
  syrup: withDensity.filter((f) =>
    /^(syrups|honey|molasses)/i.test(f.description)
  ),
  liquid: pooledFoods,
};
let hits = 0;
let total = 0;
for (const [truth, rows] of Object.entries(groups)) {
  const right = rows.filter((f) => fromPanel(f) === truth).length;
  hits += right;
  total += rows.length;
  console.log(
    `  actually ${truth.padEnd(7)} n=${String(rows.length).padStart(2)}  ->  ${right} correct`
  );
}
console.log(`\n  ${hits} of ${total} non-aerated foods, from the panel alone.`);
for (const f of groups.syrup.filter((f) => fromPanel(f) !== "syrup"))
  console.log(
    `  the one miss: ${f.description} — ${f.macros?.calories} kcal/100 g, costing ${cost(f, POOLED, 15).toFixed(1)} kcal/15 ml`
  );

// ---------------------------------------------------------------------------
heading(
  "6. Aerated — the one case a panel cannot see, and the one worth asking"
);

for (const f of groups.liquid.length
  ? withDensity.filter((f) => /ice cream|frozen dessert/i.test(f.description))
  : [])
  console.log(
    `  d=${foodDensity(f).toFixed(3)}  ${String(f.macros?.calories ?? 0).padStart(3)} kcal/100 g  |  ` +
      `as 1.00: ${cost(f, 1.0, 100).toFixed(0).padStart(2)} kcal/100 ml  |  ` +
      `as 0.65: ${cost(f, 0.65, 100).toFixed(0).padStart(2)} kcal/100 ml   ${f.description}`
  );
console.log(
  "\n  Air has no macros, so no panel rule reaches this. n=2 fails §2's floor,"
);
console.log(
  "  and even a pinned 0.65 leaves 10–17 kcal — above the ~10 kcal ask-threshold."
);
console.log(
  "  So no figure may be applied silently however obtained: this is the question."
);
