#!/usr/bin/env node
/**
 * #498's measurement: a recipe made of paired and measured ingredients — how
 * many reference foods does one dish actually borrow from, and what does a mark
 * on a derived row claim?
 *
 * #245 settled a Consumption Event whose target is a food twin: ONE
 * `event/pairing` blob, one reference food, one `filled_fields` list. It scoped
 * itself out of the Recipe Instantiation case and said the arity may not
 * survive it. This script measures the population that decides it:
 *
 * 1. **The arity.** Per recipe and per frozen instantiation, how many ingredient
 *    rows point at a `gtin:` twin, how many of those are pairable at all
 *    (`pairing-adjudication.mjs`), and therefore how many DISTINCT reference
 *    foods one dish would name. One blob is enough only if that count never
 *    exceeds one.
 * 2. **What a mark on a derived row would claim.** For each of the nineteen
 *    panel nutrients, the share of the dish's total that a pairing supplies —
 *    against the share the label printed. A row marked `est` that is 4%
 *    borrowed and one that is 100% borrowed are the same mark.
 * 3. **The seam that already rides unmarked.** `deriveRecipeNutrition` totals an
 *    extra nutrient "only across the ingredients that actually reported it", so
 *    a dish's iron is ALREADY a partial sum over a subset of its ingredients,
 *    with nothing on screen saying so. Measured here because a mark that
 *    distinguishes borrowed from printed, while staying silent about
 *    six-ingredients-of-which-two-reported, is answering the smaller question.
 *
 * **The population is personal data and is not in this repo.** It is read out of
 * the ledger export #241 produced, which lives outside any working tree and is
 * never committed (ADR-0064). The adjudication it is read through is
 * `pairing-adjudication.mjs`, shared with `pairing-census.mjs` and
 * `limit-fill-census.mjs` so the measurements cannot drift onto different
 * populations.
 *
 * Reads the shipped artifacts; regenerates nothing. The app's own
 * `storedPanelFor` and `EXTRA_NUTRIENT_KEYS` are imported rather than restated
 * (ADR-0047 §4).
 *
 * Usage: `node scripts/recipe-pairing-census.mjs`
 *        `INVENTORIA_LEDGER_EXPORT=/path/to/ledger-export.jsonl node scripts/recipe-pairing-census.mjs`
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADJUDICATION } from "./pairing-adjudication.mjs";
import { resolve as resolveTs } from "./ts-resolve-hook.mjs";

registerHooks({ resolve: resolveTs });
const { storedPanelFor } = await import("../src/lib/food/usda-corpus.ts");
const { EXTRA_NUTRIENT_KEYS } = await import("../src/lib/food/nutrition.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORE_PATH = join(ROOT, "public", "usda", "nutrient-store.json");
const EXPORT_PATH =
  process.env.INVENTORIA_LEDGER_EXPORT ??
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl");

/**
 * The two keys #495 refuses a pairing outright: sodium and saturated fat are
 * declared under every regime this app meets, so their silence is a failed
 * capture and no reference food may cover for it. Filtered here rather than
 * reported and subtracted later, because a census that counted them would be
 * measuring a rule nothing will ship.
 */
const REFUSED = new Set(["sodium_content", "saturated_fat_content"]);

/** Latest datom per (entity, attribute) by HLC stamp (ADR-0020). */
function foldLedger(path) {
  const latest = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (!row.entity) continue;
    const key = `${row.entity} ${row.attribute}`;
    const held = latest.get(key);
    if (
      !held ||
      row.hlc_ms > held.hlc_ms ||
      (row.hlc_ms === held.hlc_ms && row.hlc_ctr > held.hlc_ctr)
    )
      latest.set(key, row);
  }
  const entities = new Map();
  for (const row of latest.values()) {
    const attrs = entities.get(row.entity) ?? {};
    attrs[row.attribute] = JSON.parse(row.value);
    entities.set(row.entity, attrs);
  }
  return entities;
}

/** A consumption event still standing: not retracted, not superseded. */
function isLive(attrs) {
  return !attrs["event/status"] && !attrs["event/replaced_by"];
}

/** The adjudication entry for an ingredient ref, or null where it is not a pack. */
function verdictFor(ref) {
  if (!ref.startsWith("gtin:")) return null;
  return ADJUDICATION[ref.slice("gtin:".length)] ?? null;
}

const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));
const ledger = foldLedger(EXPORT_PATH);

// ---------------------------------------------------------------------------
// 1. The arity: how many reference foods does one dish name?
// ---------------------------------------------------------------------------

console.log("\n=== 1. How many reference foods one dish would name ===\n");

const recipes = [...ledger].filter(([e]) => e.startsWith("recipe:"));
for (const [entity, attrs] of recipes) {
  const ingredients = attrs["recipe/ingredients"] ?? [];
  const packs = ingredients.filter((i) => i.ref.startsWith("gtin:"));
  const pairable = packs.filter((i) => verdictFor(i.ref)?.verdict === "paired");
  const refs = new Set(pairable.map((i) => verdictFor(i.ref).fdcId));
  console.log(
    `${String(attrs["recipe/name"] ?? entity).padEnd(16)} ` +
      `${String(ingredients.length).padStart(2)} ingredients, ` +
      `${String(packs.length).padStart(2)} packs, ` +
      `${String(pairable.length).padStart(2)} pairable ` +
      `→ ${refs.size} distinct reference food${refs.size === 1 ? "" : "s"}`
  );
  for (const ing of packs) {
    const entry = verdictFor(ing.ref);
    console.log(
      `    ${(entry?.name ?? ing.ref).padEnd(34)} ${
        entry ? entry.verdict : "un-adjudicated"
      }${entry?.fdcId ? ` → fdc:${entry.fdcId}` : ""}`
    );
  }
}

const instantiations = [...ledger].filter(
  ([e, a]) =>
    e.startsWith("event:consume_") && a["event/instantiation"] && isLive(a)
);
const arities = instantiations.map(([, attrs]) => {
  const rows = attrs["event/instantiation"].ingredients ?? [];
  return new Set(
    rows
      .map((r) => verdictFor(r.ref))
      .filter((v) => v?.verdict === "paired")
      .map((v) => v.fdcId)
  ).size;
});
const histogram = new Map();
for (const n of arities) histogram.set(n, (histogram.get(n) ?? 0) + 1);
console.log(
  `\nLive Recipe Instantiations: ${instantiations.length} of ${
    [...ledger].filter(([e, a]) => e.startsWith("event:consume_") && isLive(a))
      .length
  } live consumption events.`
);
console.log("Distinct reference foods per logged occasion:");
for (const n of [...histogram.keys()].sort((a, b) => a - b))
  console.log(`  ${n} → ${histogram.get(n)} occasion(s)`);

// ---------------------------------------------------------------------------
// 2. What a mark on a derived row would claim
// 3. The partial sum that already rides unmarked
// ---------------------------------------------------------------------------

console.log(
  "\n=== 2/3. Per dish: what a row's mark would claim, and what already rides unmarked ===\n"
);

const KEYS = ["calories", "protein", "fat", "carbs", ...EXTRA_NUTRIENT_KEYS];

for (const [entity, attrs] of instantiations) {
  const snapshot = attrs["event/instantiation"];
  const rows = snapshot.ingredients ?? [];
  const name =
    ledger.get(snapshot.based_on)?.["recipe/name"] ?? snapshot.based_on;

  /** Per key: printed total, borrowed total, and how many rows reported it. */
  const tally = new Map(
    KEYS.map((k) => [
      k,
      { printed: 0, borrowed: 0, reporting: 0, borrowing: 0 },
    ])
  );

  for (const row of rows) {
    const entry = verdictFor(row.ref);
    const twinPanel = ledger.get(row.ref)?.["nutrition/info"] ?? {};
    const reference =
      entry?.verdict === "paired"
        ? storedPanelFor(store, entry.fdcId)
        : undefined;

    // The row's own scale factor, recovered from what it froze: the row is the
    // twin's per-100 panel times this. Recovered rather than re-derived, and
    // that is the point — the frozen row already absorbed whatever unit
    // conversion ADR-0108 §5 applied on the way in, so a borrowed figure scaled
    // by it lands on exactly the scale the printed ones are on, with no
    // second guess at a basis or a density. It carries `roundFood`'s rounding
    // with it, which moves a share by well under a tenth of a point and none of
    // the readings below by enough to matter.
    let factor = null;
    for (const key of ["calories", "protein", "fat", "carbs"]) {
      const basis = twinPanel[key];
      if (
        typeof basis === "number" &&
        basis > 0 &&
        typeof row[key] === "number"
      ) {
        factor = row[key] / basis;
        break;
      }
    }

    for (const key of KEYS) {
      const t = tally.get(key);
      const printed = row[key];
      if (typeof printed === "number") {
        t.printed += printed;
        t.reporting += 1;
        continue;
      }
      // Silent on this row. Would a pairing fill it?
      if (!reference || REFUSED.has(key) || factor === null) continue;
      const per100 = reference[key];
      if (typeof per100 !== "number") continue;
      t.borrowed += per100 * factor;
      t.borrowing += 1;
    }
  }

  console.log(`--- ${name} (${entity}), ${rows.length} rows`);
  for (const key of KEYS) {
    const t = tally.get(key);
    if (t.reporting === 0 && t.borrowing === 0) continue;
    const total = t.printed + t.borrowed;
    const share = total > 0 ? (t.borrowed / total) * 100 : 0;
    console.log(
      `  ${key.padEnd(24)} printed by ${String(t.reporting).padStart(2)}/${
        rows.length
      } rows` +
        `, borrowed by ${String(t.borrowing).padStart(2)}` +
        (t.borrowing > 0 ? `  → ${share.toFixed(1)}% of the dish's total` : "")
    );
  }
  console.log("");
}
