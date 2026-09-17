/**
 * PROTOTYPE, throwaway (#482). Scores raw-*.json against ground-truth.json.
 * Separate from the harness so a scoring bug never costs a re-run, and so the
 * raw outputs outlive the judgement.
 *
 * Counts, per the ticket's own six measurements:
 *   correct / wrong / missing    - rows the label prints
 *   fabricated                   - rows the label does NOT print, given a value
 *   thousand_x                   - a comma-decimal read as a thousands separator
 *   malformed                    - no JSON object recoverable from the output
 *
 * Run: node scratch/482/score.mjs raw-main.json [raw-b.json ...]
 */
import { readFileSync } from "node:fs";

const GT = JSON.parse(
  readFileSync("scratch/482/ground-truth.json", "utf8")
).labels;
const MICROS = [
  "vitamin_d_mg",
  "calcium_mg",
  "iron_mg",
  "potassium_mg",
  "vitamin_a_mg",
  "vitamin_c_mg",
  "vitamin_e_mg",
  "vitamin_b6_mg",
  "vitamin_b12_mg",
  "folate_mg",
  "magnesium_mg",
  "zinc_mg",
];
const MACROS = [
  "energy_kj",
  "energy_kcal",
  "fat_g",
  "saturated_fat_g",
  "carbohydrate_g",
  "sugar_g",
  "fiber_g",
  "protein_g",
  "salt_g",
];

/** Recover a JSON object from prose, a fenced block, or an already-parsed object. */
function recover(content) {
  if (content && typeof content === "object") return content;
  if (typeof content !== "string") return null;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : content;
  const start = body.indexOf("{");
  if (start === -1) return null;
  // Walk braces so trailing prose after the object does not defeat the parse.
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}" && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const num = (v) =>
  typeof v === "number"
    ? v
    : typeof v === "string"
      ? Number(v.replace(",", ".").replace(/[^0-9.\-]/g, ""))
      : null;
const close = (a, b) =>
  a !== null &&
  b !== null &&
  Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.001);

const rows = [];
for (const f of process.argv.slice(2)) {
  for (const r of JSON.parse(readFileSync(`scratch/482/${f}`, "utf8")))
    rows.push(r);
}

const byKey = new Map();
for (const r of rows) {
  if (r.status === "skipped") continue;
  const gtKey = r.label === "olive-oil-both" ? "olive-oil-panel" : r.label;
  const gt = GT[gtKey];
  const obj = recover(r.content);
  const key = `${r.label}|${r.model}|${r.arm}|${r.edge}`;
  if (!byKey.has(key))
    byKey.set(key, {
      label: r.label,
      model: r.model,
      arm: r.arm,
      edge: r.edge,
      runs: 0,
      malformed: 0,
      correct: 0,
      wrong: 0,
      missing: 0,
      fabricated_macro: 0,
      fabricated_micro: 0,
      thousand_x: 0,
      ms: [],
      neurons: [],
      barcode_ok: 0,
      barcode_wrong: 0,
      basis_ok: 0,
      basis_wrong: 0,
      detail: [],
    });
  const acc = byKey.get(key);
  acc.runs++;
  if (r.ms) acc.ms.push(r.ms);
  if (r.usage?.neurons) acc.neurons.push(r.usage.neurons);
  if (!obj) {
    acc.malformed++;
    continue;
  }

  const n =
    obj.nutrition && typeof obj.nutrition === "object" ? obj.nutrition : obj;
  const issues = [];

  for (const k of MACROS) {
    const truth = gt.printed[k];
    const got = k in n && n[k] !== null ? num(n[k]) : null;
    if (truth === null || truth === undefined) {
      // The label does not print this row.
      if (got !== null) {
        acc.fabricated_macro++;
        issues.push(`FABRICATED ${k}=${got}`);
      }
      continue;
    }
    if (got === null) {
      acc.missing++;
      issues.push(`MISSING ${k}`);
      continue;
    }
    if (close(got, truth)) {
      acc.correct++;
      continue;
    }
    acc.wrong++;
    // A comma-decimal read as a thousands separator: 13.808 -> 13808.
    if (close(got, truth * 1000) || close(got * 1000, truth)) {
      acc.thousand_x++;
      issues.push(`1000x ${k}=${got} (truth ${truth})`);
    } else issues.push(`WRONG ${k}=${got} (truth ${truth})`);
  }
  for (const k of MICROS) {
    if (k in n && n[k] !== null && num(n[k]) !== null) {
      acc.fabricated_micro++;
      issues.push(`FABRICATED ${k}=${n[k]}`);
    }
  }
  const bc =
    obj.barcode == null ? null : String(obj.barcode).replace(/\D/g, "");
  const wantBc =
    r.label === "olive-oil-both" ? GT["olive-oil-barcode"].barcode : gt.barcode;
  if (wantBc) {
    if (bc === wantBc) acc.barcode_ok++;
    else if (bc) {
      acc.barcode_wrong++;
      issues.push(`BARCODE ${bc} (truth ${wantBc})`);
    }
  }
  if (gt.basis) {
    if (obj.basis === gt.basis) acc.basis_ok++;
    else {
      acc.basis_wrong++;
      issues.push(`BASIS ${obj.basis} (truth ${gt.basis})`);
    }
  }
  if (issues.length) acc.detail.push(`r${r.repeat}: ${issues.join("; ")}`);
}

const med = (a) =>
  a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0;
const out = [...byKey.values()].sort(
  (a, b) => a.label.localeCompare(b.label) || a.model.localeCompare(b.model)
);
console.log(
  [
    "label",
    "model",
    "arm",
    "edge",
    "runs",
    "malf",
    "ok",
    "wrong",
    "miss",
    "fab_macro",
    "fab_micro",
    "1000x",
    "bc_ok",
    "basis_ok",
    "med_ms",
    "med_n",
  ].join("\t")
);
for (const a of out) {
  console.log(
    [
      a.label,
      a.model,
      a.arm,
      a.edge,
      a.runs,
      a.malformed,
      a.correct,
      a.wrong,
      a.missing,
      a.fabricated_macro,
      a.fabricated_micro,
      a.thousand_x,
      a.barcode_ok,
      a.basis_ok,
      med(a.ms),
      Math.round(med(a.neurons)),
    ].join("\t")
  );
}
console.log("\n--- issues ---");
for (const a of out)
  if (a.detail.length)
    console.log(
      `\n${a.label} / ${a.model} / ${a.arm} ${a.edge}\n  ` +
        a.detail.join("\n  ")
    );
