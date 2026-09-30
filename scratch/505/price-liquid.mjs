import { readFileSync } from "node:fs";
import {
  selectClass,
  classStats,
} from "/home/inkpotmonkey/code/inventoria/.claude/worktrees/density-505/scripts/density-class-check.mjs";

const ROOT = "/home/inkpotmonkey/code/inventoria/.claude/worktrees/density-505";
const c = JSON.parse(
  readFileSync(`${ROOT}/public/usda/search-index.json`, "utf8")
);
const foods = c.foods ?? c;
const P = [
  { category: "Beverages", name: /^Beverages, water,|brewed/i },
  { name: /^Milk,/i, except: /evaporated|condensed|dry|powder/i },
  { name: /juice/i },
  { category: "Beverages", name: /\b(beer|wine)\b/i, except: /hard lemonade/i },
];
const pool = new Map();
for (const p of P) for (const f of selectClass(foods, p)) pool.set(f.fdcId, f);
const rows = [...pool.values()]
  .map((f) => {
    const d = classStats([f]).figure;
    const k = (f.macros?.calories ?? 0) / 100;
    return { n: f.description, d, k, kcal250: Math.abs(d - 1.0) * 250 * k };
  })
  .filter((r) => Number.isFinite(r.d))
  .sort((a, b) => b.kcal250 - a.kcal250);

console.log("pooled foods over 5 kcal on 250 ml, against liquid 1.00:");
for (const r of rows.filter((r) => r.kcal250 > 5))
  console.log(
    `  ${r.n.slice(0, 48).padEnd(48)} d=${r.d.toFixed(4)} ${(r.k * 100).toFixed(
      0
    )} kcal/100g -> ${r.kcal250.toFixed(1)} kcal/250ml, ${(
      (r.kcal250 * 100) /
      250
    ).toFixed(1)} kcal/100ml`
  );
console.log(
  `\npriced ${rows.length} pooled foods; over 10 kcal at 250 ml: ${
    rows.filter((r) => r.kcal250 > 10).length
  }; over 10 kcal at 100 ml: ${rows.filter((r) => (r.kcal250 * 100) / 250 > 10).length}`
);
