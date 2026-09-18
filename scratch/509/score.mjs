/**
 * PROTOTYPE, throwaway (#509). Scores the raw responses the harness wrote. A
 * SEPARATE PASS on purpose (#482's method): the raw outputs survive the
 * judgement, so a scoring bug never destroys a run.
 *
 * Run: node scratch/509/score.mjs raw-main-itemised.json [raw-b.json ...]
 */
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (!files.length) throw new Error("usage: score.mjs <raw-*.json> ...");

const slice = JSON.parse(readFileSync("scratch/509/slice.json", "utf8"));
const truth = new Map(slice.dishes.map((d) => [d.id, d]));

/**
 * The API hands back `result.response` as a parsed object when the model's
 * output is valid JSON and as a string when it is not — so a string here is
 * already a signal. Fenced code blocks are unwrapped before parsing.
 */
function parsed(content) {
  if (content && typeof content === "object")
    return { ok: true, value: content };
  if (typeof content !== "string") return { ok: false, why: "no content" };
  const text = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, why: "no JSON object" };
  try {
    return {
      ok: true,
      value: JSON.parse(text.slice(start, end + 1)),
      loose: true,
    };
  } catch (e) {
    return { ok: false, why: `unparseable: ${e.message.slice(0, 60)}` };
  }
}

const STOP = new Set([
  "and",
  "with",
  "of",
  "the",
  "a",
  "fresh",
  "roasted",
  "grilled",
  "cooked",
  "raw",
  "mixed",
  "sliced",
  "chopped",
  "diced",
  "steamed",
  "baked",
  "plate",
  "side",
  "salad",
  "dish",
  "serving",
  "pieces",
  "piece",
]);
const words = (s) =>
  new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .map((w) => (w.endsWith("es") && w.length > 4 ? w.slice(0, -2) : w))
      .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w))
      .filter((w) => w.length > 2 && !STOP.has(w))
  );

/** A named food matches a truth ingredient when any content word is shared. */
function matches(name, truthNames) {
  const a = words(name);
  return truthNames.some((t) => {
    const b = words(t);
    for (const w of a) if (b.has(w)) return true;
    return false;
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

for (const file of files) {
  const rows = JSON.parse(readFileSync(`scratch/509/${file}`, "utf8"));
  console.log(
    `\n${"=".repeat(72)}\n${file}  (${rows.length} rows)\n${"=".repeat(72)}`
  );

  const bad = [];
  const scored = [];
  const controls = [];

  for (const r of rows) {
    const p = parsed(r.content);
    if (!p.ok) {
      bad.push({ id: r.id, why: p.why, status: r.status });
      continue;
    }
    const v = p.value;
    const kcal = v.calories;
    if (r.kind !== "plate") {
      controls.push({
        id: r.id,
        kind: r.kind,
        repeat: r.repeat,
        calories: kcal,
        items: (v.items ?? v.ingredients ?? []).length,
        name: v.name,
      });
      continue;
    }
    const t = truth.get(r.id);
    const items = Array.isArray(v.items) ? v.items : [];
    const named = items.length
      ? items.map((i) => i.food ?? i.name)
      : Array.isArray(v.ingredients)
        ? v.ingredients
        : [];
    const truthNames = t.ingredients.map((i) => i.name);
    const hit = named.filter((n) => matches(n, truthNames)).length;
    const covered = truthNames.filter((tn) =>
      named.some((n) => matches(tn, [n]))
    ).length;
    const itemSum = items.length
      ? items.reduce((a, i) => a + (Number(i.kcal) || 0), 0)
      : null;
    const gramSum = items.length
      ? items.reduce((a, i) => a + (Number(i.grams) || 0), 0)
      : null;
    scored.push({
      id: r.id,
      repeat: r.repeat,
      band: t.band,
      loose: !!p.loose,
      truth: t.kcal,
      truth_mass: t.mass,
      pred: typeof kcal === "number" ? kcal : null,
      null_answer: kcal === null,
      err: typeof kcal === "number" ? kcal - t.kcal : null,
      abs: typeof kcal === "number" ? Math.abs(kcal - t.kcal) : null,
      pct: typeof kcal === "number" ? Math.abs(kcal - t.kcal) / t.kcal : null,
      n_items: items.length,
      n_named: named.length,
      named_hit: hit,
      truth_n: truthNames.length,
      truth_covered: covered,
      item_sum: itemSum,
      sum_ok:
        itemSum === null || typeof kcal !== "number"
          ? null
          : Math.abs(itemSum - kcal) <= Math.max(1, kcal * 0.02),
      gram_sum: gramSum,
      mass_err: gramSum === null ? null : gramSum - t.mass,
    });
  }

  if (bad.length) {
    console.log(`\nMALFORMED: ${bad.length}`);
    for (const b of bad.slice(0, 8))
      console.log(`  ${b.id} ${b.status} ${b.why}`);
  }

  if (controls.length) {
    console.log(`\nCONTROLS (calories:null is the correct answer)`);
    for (const c of controls) {
      console.log(
        `  ${c.kind.padEnd(12)} ${c.id.padEnd(20)} r${c.repeat} calories=${
          c.calories === null
            ? "null  <- correct"
            : `${c.calories}  <- FABRICATED`
        } items=${c.items} name=${JSON.stringify(c.name)}`
      );
    }
    const fab = controls.filter((c) => typeof c.calories === "number").length;
    console.log(`  fabrication rate: ${fab}/${controls.length}`);
  }

  if (!scored.length) continue;

  const withNum = scored.filter((s) => s.pred !== null);
  const nulls = scored.filter((s) => s.null_answer);
  console.log(
    `\nPLATES: ${scored.length} scored, ${nulls.length} answered null`
  );
  if (!withNum.length) continue;

  const mae = mean(withNum.map((s) => s.abs));
  const mape = mean(withNum.map((s) => s.pct));
  const bias = mean(withNum.map((s) => s.err));
  const truthMean = mean(withNum.map((s) => s.truth));
  console.log(`  MAE            ${mae.toFixed(1)} kcal`);
  console.log(
    `  MAE / mean     ${((mae / truthMean) * 100).toFixed(1)}%   (Nutrition5k 2D baseline 70.6 kcal / 26.1%)`
  );
  console.log(
    `  MAPE           ${(mape * 100).toFixed(1)}%   median ${(median(withNum.map((s) => s.pct)) * 100).toFixed(1)}%`
  );
  console.log(
    `  bias (signed)  ${bias > 0 ? "+" : ""}${bias.toFixed(1)} kcal   (${withNum.filter((s) => s.err > 0).length}/${withNum.length} over)`
  );
  console.log(
    `  within 25%     ${withNum.filter((s) => s.pct <= 0.25).length}/${withNum.length}`
  );
  console.log(
    `  within 50%     ${withNum.filter((s) => s.pct <= 0.5).length}/${withNum.length}`
  );
  console.log(
    `  worst          ${withNum
      .slice()
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3)
      .map(
        (s) =>
          `${s.id.slice(5)} ${s.truth}->${s.pred} (${(s.pct * 100).toFixed(0)}%)`
      )
      .join(", ")}`
  );

  const bands = [...new Set(withNum.map((s) => s.band))].sort();
  console.log(`\n  by calorie band:`);
  for (const b of bands) {
    const g = withNum.filter((s) => s.band === b);
    console.log(
      `    ${b.padEnd(9)} n=${String(g.length).padStart(2)}  MAE ${mean(
        g.map((s) => s.abs)
      )
        .toFixed(0)
        .padStart(
          4
        )} kcal  MAPE ${(mean(g.map((s) => s.pct)) * 100).toFixed(0).padStart(3)}%  bias ${mean(g.map((s) => s.err)) > 0 ? "+" : ""}${mean(g.map((s) => s.err)).toFixed(0)}`
    );
  }

  const withItems = withNum.filter((s) => s.n_items > 0);
  if (withItems.length) {
    const sums = withItems.filter((s) => s.sum_ok !== null);
    console.log(`\n  itemisation:`);
    console.log(
      `    items/plate    ${mean(withItems.map((s) => s.n_items)).toFixed(1)}  (truth ${mean(withItems.map((s) => s.truth_n)).toFixed(1)})`
    );
    console.log(
      `    parts sum to the total  ${sums.filter((s) => s.sum_ok).length}/${sums.length}`
    );
    const massed = withItems.filter((s) => s.gram_sum);
    if (massed.length)
      console.log(
        `    mass MAE       ${mean(massed.map((s) => Math.abs(s.mass_err))).toFixed(0)} g  bias ${mean(massed.map((s) => s.mass_err)) > 0 ? "+" : ""}${mean(massed.map((s) => s.mass_err)).toFixed(0)} g  (truth mean ${mean(massed.map((s) => s.truth_mass)).toFixed(0)} g)`
      );
  }
  const named = withNum.filter((s) => s.n_named > 0);
  if (named.length) {
    console.log(
      `\n  naming (token overlap against the weighed ingredient list):`
    );
    console.log(
      `    named foods that are really there  ${named.reduce((a, s) => a + s.named_hit, 0)}/${named.reduce((a, s) => a + s.n_named, 0)}`
    );
    console.log(
      `    real ingredients the model named   ${named.reduce((a, s) => a + s.truth_covered, 0)}/${named.reduce((a, s) => a + s.truth_n, 0)}`
    );
  }

  const byId = new Map();
  for (const s of withNum) {
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id).push(s.pred);
  }
  const repeated = [...byId.entries()].filter(([, v]) => v.length > 1);
  if (repeated.length) {
    console.log(
      `\n  run-to-run variance (temperature 0, ${repeated[0][1].length} repeats):`
    );
    for (const [id, preds] of repeated) {
      const spread = Math.max(...preds) - Math.min(...preds);
      console.log(
        `    ${id.slice(5)} truth ${truth.get(id).kcal.toFixed(0).padStart(4)}  preds ${preds.join(", ").padEnd(24)} spread ${spread.toFixed(0)} kcal (${((spread / mean(preds)) * 100).toFixed(0)}%)`
      );
    }
  }
}
