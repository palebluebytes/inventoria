/**
 * PROTOTYPE, throwaway (#509). Builds the scoring slice from Nutrition5k's own
 * metadata, applying #515 §6.2's filter and §6.3's stratification.
 *
 * Reads the two dish_metadata CSVs and the official depth_test split, which are
 * fetched once into TMP (they are not committed - 2.3 MB of third-party CSV).
 * Writes scratch/509/slice.json: the dish ids, their true calories, mass and
 * per-ingredient breakdown.
 *
 * Run: node scratch/509/slice.mjs [--take 50] [--seed 509]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TMP =
  "/tmp/claude-1000/-home-inkpotmonkey-code-inventoria--claude-worktrees-wayfinder-474-ask-a-model/9155f163-0b21-471f-bd75-bc4192434915/scratchpad/n5k";

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const TAKE = Number(flag("take", "50"));
const SEED = Number(flag("seed", "509"));

/** Deterministic PRNG so the slice is reproducible from the seed alone. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A row is `dish_id, kcal, mass_g, fat, carb, protein` then repeating groups of
 * six: `ingr_id, name, grams, kcal, fat, carb, protein` - seven, actually, the
 * id counts. Parsed positionally; the CSV has no header and no quoting.
 */
function parseDishes(text) {
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const f = line.split(",");
    const dish = {
      id: f[0],
      kcal: Number(f[1]),
      mass: Number(f[2]),
      fat: Number(f[3]),
      carb: Number(f[4]),
      protein: Number(f[5]),
      ingredients: [],
    };
    for (let i = 6; i + 6 < f.length + 1; i += 7) {
      if (!f[i]?.startsWith("ingr_")) break;
      dish.ingredients.push({
        name: f[i + 1],
        grams: Number(f[i + 2]),
        kcal: Number(f[i + 3]),
      });
    }
    out.push(dish);
  }
  return out;
}

const dishes = [
  ...parseDishes(readFileSync(join(TMP, "dish_metadata_cafe1.csv"), "utf8")),
  ...parseDishes(readFileSync(join(TMP, "dish_metadata_cafe2.csv"), "utf8")),
];
const testIds = new Set(
  readFileSync(join(TMP, "depth_test_ids.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
);

// #515 6.2: drop single-component scans, zero-calorie rows and the physically
// impossible ones (above 9 kcal/g is above pure fat).
const kept = dishes.filter(
  (d) =>
    d.ingredients.length >= 3 &&
    d.kcal >= 50 &&
    d.mass > 0 &&
    d.kcal / d.mass <= 9
);
const pool = kept.filter((d) => testIds.has(d.id));

const BANDS = [
  ["50-150", 50, 150],
  ["150-300", 150, 300],
  ["300-500", 300, 500],
  ["500-800", 500, 800],
  ["800+", 800, Infinity],
];
const bandOf = (d) =>
  BANDS.find(([, lo, hi]) => d.kcal >= lo && d.kcal < hi)[0];
const complexOf = (d) => (d.ingredients.length <= 5 ? "simple" : "complex");

// #515 6.3: stratify on calorie band first, then component count within it.
const cells = new Map();
for (const d of pool) {
  const k = `${bandOf(d)}|${complexOf(d)}`;
  if (!cells.has(k)) cells.set(k, []);
  cells.get(k).push(d);
}

const rand = rng(SEED);
for (const list of cells.values()) {
  list.sort((a, b) => a.id.localeCompare(b.id));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

// Round-robin across cells so every band and both complexities are represented
// even when TAKE does not divide evenly.
const order = [...cells.keys()].sort();
const picked = [];
for (let round = 0; picked.length < TAKE; round++) {
  let moved = false;
  for (const k of order) {
    const list = cells.get(k);
    if (list.length > round) {
      picked.push(list[round]);
      moved = true;
      if (picked.length === TAKE) break;
    }
  }
  if (!moved) break;
}

const summary = {};
for (const d of picked) {
  const k = `${bandOf(d)}|${complexOf(d)}`;
  summary[k] = (summary[k] ?? 0) + 1;
}

writeFileSync(
  "scratch/509/slice.json",
  JSON.stringify(
    {
      seed: SEED,
      counts: {
        all_dishes: dishes.length,
        after_filter: kept.length,
        in_depth_test: pool.length,
        picked: picked.length,
      },
      strata: summary,
      dishes: picked.map((d) => ({
        id: d.id,
        kcal: Math.round(d.kcal * 100) / 100,
        mass: Math.round(d.mass * 100) / 100,
        band: bandOf(d),
        n_ingredients: d.ingredients.length,
        ingredients: d.ingredients.map((i) => ({
          name: i.name,
          grams: Math.round(i.grams * 10) / 10,
          kcal: Math.round(i.kcal * 10) / 10,
        })),
      })),
    },
    null,
    2
  )
);

console.log(
  `all ${dishes.length} -> filtered ${kept.length} -> depth_test ${pool.length} -> picked ${picked.length}`
);
console.log(summary);
