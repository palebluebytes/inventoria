/**
 * PROTOTYPE, throwaway (#509). The adjudication pass: asks whether the arms that
 * DID run are enough to answer the ticket, without spending a neuron.
 *
 * A THIRD pass, downstream of `score.mjs` on purpose. `score.mjs` reports each
 * arm; this one puts the arms against each other and against the published bar,
 * because the question *is the estimate confirmable?* (#509 §2) is not answered
 * by any single arm's MAE. Nothing here calls a model: every figure comes out of
 * the committed raw responses.
 *
 * Run: node scratch/509/adjudicate.mjs
 */
import { readFileSync } from "node:fs";

const DIR = "scratch/509";
const slice = JSON.parse(readFileSync(`${DIR}/slice.json`, "utf8"));
const truth = new Map(slice.dishes.map((d) => [d.id, d]));

/** `score.mjs`'s parser, restated — a string content is already a signal. */
function parsed(content) {
  if (content && typeof content === "object") return content;
  if (typeof content !== "string") return null;
  const text = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** id -> { kcal, grams } for the rows that came back and carry a number. */
function arm(file) {
  const out = new Map();
  for (const r of JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"))) {
    if (r.status !== 200) continue;
    const v = parsed(r.content);
    if (!v || typeof v.calories !== "number") continue;
    const items = Array.isArray(v.items) ? v.items : [];
    const grams = items.reduce((a, x) => a + (Number(x?.grams) || 0), 0);
    out.set(r.id, { kcal: v.calories, grams });
  }
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (xs) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
/**
 * MIDRANKS, not positions. `bare` answers 550 five times in thirteen dishes, and
 * with naive ranking the tie order decides the correlation — sorting the same
 * thirteen by id instead of by truth moved it 0.73 -> 0.86. Tied values share
 * the average of their positions, which is the definition and is order-free.
 */
const ranks = (xs) => {
  const order = [...xs.keys()].sort((a, b) => xs[a] - xs[b]);
  const r = [];
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && xs[order[j + 1]] === xs[order[i]]) j += 1;
    const mid = (i + j) / 2;
    for (let k = i; k <= j; k += 1) r[order[k]] = mid;
    i = j + 1;
  }
  return r;
};
const spearman = (a, b) => {
  const [ra, rb] = [ranks(a), ranks(b)];
  const [ma, mb] = [mean(ra), mean(rb)];
  const num = ra.reduce((s, x, i) => s + (x - ma) * (rb[i] - mb), 0);
  const den = Math.sqrt(
    ra.reduce((s, x) => s + (x - ma) ** 2, 0) *
      rb.reduce((s, x) => s + (x - mb) ** 2, 0)
  );
  return den ? num / den : NaN;
};

/** MAE, MAE/mean and the hit rate for one set of (truth, predicted) pairs. */
function bar(label, pairs) {
  const ae = pairs.map(([t, p]) => Math.abs(p - t));
  const mape = pairs.map(([t, p]) => (Math.abs(p - t) / t) * 100);
  const tm = mean(pairs.map(([t]) => t));
  console.log(
    `  ${label.padEnd(44)} MAE ${mean(ae).toFixed(1).padStart(6)}  ` +
      `MAE/mean ${((mean(ae) / tm) * 100).toFixed(1).padStart(5)}%  ` +
      `MAPE med ${median(mape).toFixed(1).padStart(5)}%  ` +
      `within25% ${mape.filter((m) => m <= 25).length}/${mape.length}`
  );
}

const itemised = arm("raw-main-itemised.json");
const bare = arm("raw-main-bare.json");
const both = [...itemised.keys()]
  .filter((id) => bare.has(id))
  .sort((a, b) => truth.get(a).kcal - truth.get(b).kcal);

console.log(`\n${"=".repeat(78)}`);
console.log("#509 adjudication — published bars: direct-2D 70.6 kcal / 26.1 %");
console.log(
  "of mean; best reported method 41.3 / 16.5 %; nutritionists ~41 %."
);
console.log("=".repeat(78));

// ---------------------------------------------------------------------------
console.log(`\n1. The two shapes, and which one the app actually has\n`);
console.log(
  `   \`bare\` IS the shipped \`PlateEstimate\` — { name, calories, ingredients[] }.`
);
console.log(
  `   \`itemised\` adds items[] with grams and kcal, which plate-estimator.ts:29`
);
console.log(
  `   forbids by name. The headline arm is the shape we cannot ship.\n`
);
bar(
  `A  itemised, every dish it answered (n=${itemised.size})`,
  [...itemised].map(([id, v]) => [truth.get(id).kcal, v.kcal])
);
bar(
  `A  itemised, the ${both.length} \`bare\` also reached`,
  both.map((id) => [truth.get(id).kcal, itemised.get(id).kcal])
);
bar(
  `   bare, those same ${both.length} (arm cut short by 429s)`,
  both.map((id) => [truth.get(id).kcal, bare.get(id).kcal])
);

const diffs = both.map(
  (id) =>
    Math.abs(itemised.get(id).kcal - truth.get(id).kcal) -
    Math.abs(bare.get(id).kcal - truth.get(id).kcal)
);
const bareWins = diffs.filter((d) => d > 0).length;
console.log(
  `\n   paired: bare wins ${bareWins}, itemised wins ${diffs.length - bareWins}. ` +
    `Median |err| reduction ${median(diffs).toFixed(1)} kcal,`
);
console.log(
  `   mean ${mean(diffs).toFixed(1)}, largest single contribution ` +
    `${Math.max(...diffs).toFixed(1)} kcal. So bare's lower MAE is not a better`
);
console.log(
  `   reading — it is the same reading without itemisation's double-counting.`
);

// ---------------------------------------------------------------------------
console.log(`\n2. The coarse prior, measured in BOTH shapes (#509 §2)\n`);
for (const [tag, m, ids] of [
  ["itemised (all)", itemised, [...itemised.keys()]],
  [`itemised (the ${both.length})`, itemised, both],
  [`bare     (the ${both.length})`, bare, both],
]) {
  const t = ids.map((id) => truth.get(id).kcal);
  const p = ids.map((id) => m.get(id).kcal);
  const counts = new Map();
  for (const x of p) counts.set(x, (counts.get(x) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  console.log(
    `  ${tag.padEnd(22)} distinct ${String(counts.size).padStart(2)}/${p.length}  ` +
      `sd ${sd(p).toFixed(0)} vs truth ${sd(t).toFixed(0)}  ` +
      `x50 ${p.filter((x) => x % 50 === 0).length}/${p.length}  ` +
      `Spearman ${spearman(t, p).toFixed(2)}  most common ${top[0]}x${top[1]}`
  );
}
console.log(
  `\n   Same rank correlation, compressed spread, and the shipped shape is the`
);
console.log(
  `   coarser of the two. The defect is not an artefact of itemising.`
);

// ---------------------------------------------------------------------------
console.log(
  `\n3. Does the number move when the food does? (the near-duplicate clusters)\n`
);
const stamps = slice.dishes
  .map((d) => [Number(d.id.split("_")[1]), d.id])
  .sort((a, b) => a[0] - b[0]);
const clusters = [];
let run = [stamps[0]];
for (const s of stamps.slice(1)) {
  if (s[0] - run[run.length - 1][0] <= 900) run.push(s);
  else {
    if (run.length > 1) clusters.push(run);
    run = [s];
  }
}
if (run.length > 1) clusters.push(run);

for (const [tag, m] of [
  ["itemised", itemised],
  ["bare", bare],
]) {
  const buckets = { "<200 kcal": [], ">=200 kcal": [] };
  for (const c of clusters) {
    const ids = c.map(([, id]) => id);
    for (let k = 0; k < ids.length - 1; k += 1) {
      const [a, b] = [ids[k], ids[k + 1]];
      if (!m.has(a) || !m.has(b)) continue;
      const dt = truth.get(b).kcal - truth.get(a).kcal;
      const dp = m.get(b).kcal - m.get(a).kcal;
      buckets[Math.abs(dt) < 200 ? "<200 kcal" : ">=200 kcal"].push([dt, dp]);
    }
  }
  console.log(`  ${tag}:`);
  for (const [k, g] of Object.entries(buckets)) {
    if (!g.length) {
      console.log(`    steps ${k.padEnd(10)} none reached`);
      continue;
    }
    const tt = g.reduce((s, [d]) => s + Math.abs(d), 0);
    const pp = g.reduce((s, [, d]) => s + Math.abs(d), 0);
    console.log(
      `    steps ${k.padEnd(10)} n=${g.length}  |truth| ${tt.toFixed(0)} kcal  ` +
        `|predicted| ${pp.toFixed(0)}  -> tracks ${((pp / tt) * 100).toFixed(0)}%`
    );
  }
}
console.log(
  `\n   Large additions are tracked almost exactly; small ones are invisible.`
);
console.log(
  `   \`bare\` reached one large step and no small one, so this instrument is`
);
console.log(
  `   itemised-only — which is why §2 above had to be measured instead.`
);

// ---------------------------------------------------------------------------
console.log(
  `\n4. Arm B's CEILING, without spending a neuron (#509's comment)\n`
);
console.log(
  `   Arm B lets the model name items and grams and has the app compute kcal.`
);
console.log(
  `   Its best possible lookup is the dish's OWN true energy density, so scoring`
);
console.log(
  `   model-grams x true-kcal/g is an upper bound no real table can beat.\n`
);
const withMass = [...itemised]
  .filter(([id, v]) => v.grams > 0 && truth.get(id).mass)
  .map(([id, v]) => ({ t: truth.get(id), v }));
bar(
  `A  the model's own total`,
  withMass.map(({ t, v }) => [t.kcal, v.kcal])
);
bar(
  `B* model grams x TRUE energy density (ceiling)`,
  withMass.map(({ t, v }) => [t.kcal, v.grams * (t.kcal / t.mass)])
);
const ratios = withMass.map(({ t, v }) => v.grams / t.mass);
console.log(
  `\n   Mass is what is left, and it dominates: |1 - ratio| median ` +
    `${(median(ratios.map((r) => Math.abs(r - 1))) * 100).toFixed(0)} %, only ` +
    `${ratios.filter((r) => Math.abs(r - 1) <= 0.25).length}/${ratios.length}`
);
console.log(
  `   dishes within 25 % on mass. A perfect table buys ~25 kcal of MAE, misses`
);
console.log(
  `   the published bar anyway, and makes the MEDIAN and the hit rate worse.`
);
console.log(
  `   #247 measured the real lookup at 6-of-22 top-1, so the true arm is worse.\n`
);
