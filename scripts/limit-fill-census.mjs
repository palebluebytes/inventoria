#!/usr/bin/env node
/**
 * #495's measurement: when "USDA fills silence only" meets a stay-under limit,
 * what does the fill actually do?
 *
 * #240's Notes let a reference food supply any field the label left empty.
 * ADR-0032's four limits — sodium, saturated fat, cholesterol, trans fat — are
 * caps rather than targets, so a fill that is too low under-claims a *harm*,
 * and since #244 the meter takes an estimate as measured. This script asks the
 * three questions that decide whether the rule may reach them at all:
 *
 * 1. **Which silences are real.** Per paired twin, which of the four limits the
 *    captured panel is silent on, whether the twin has an OFF record behind it,
 *    and what `countries_tags` the record carries. The last is the fact a
 *    per-jurisdiction rule would have to stand on.
 * 2. **What the fill moves.** Day totals over the logged population, three ways:
 *    as they stand, with only the EU-lawful silences filled (cholesterol and
 *    trans fat), and with every silence filled. Reported as cap crossings,
 *    because the crossing is what tints a meter.
 * 3. **What already spends each cap**, so a figure a pairing would add can be
 *    read against the ones shipping today.
 *
 * **The population is personal data and is not in this repo.** It is read out of
 * the ledger export #241 produced, which lives outside any working tree and is
 * never committed (ADR-0064). The adjudication it is read through is
 * `pairing-adjudication.mjs`, shared with `pairing-census.mjs` so the two
 * measurements cannot drift onto different populations.
 *
 * Reads the shipped artifacts; regenerates nothing.
 *
 * Usage: `node scripts/limit-fill-census.mjs`
 *        `INVENTORIA_LEDGER_EXPORT=/path/to/ledger-export.jsonl node scripts/limit-fill-census.mjs`
 */

import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { foldLedgerExport } from "./ledger-fold.mjs";
import { ADJUDICATION } from "./pairing-adjudication.mjs";
import { resolve as resolveTs } from "./ts-resolve-hook.mjs";

registerHooks({ resolve: resolveTs });
const { BAKED_NUTRIENT_LIMITS_G } =
  await import("../src/lib/food/nutrition-targets.ts");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STORE_PATH = join(ROOT, "public", "usda", "nutrient-store.json");
const EXPORT_PATH =
  process.env.INVENTORIA_LEDGER_EXPORT ??
  join(homedir(), ".local", "share", "inventoria", "ledger-export.jsonl");

// ---------------------------------------------------------------------------
// The four limits, and the split this script exists to price
// ---------------------------------------------------------------------------

/**
 * Each limit's panel key, its USDA nutrient id, and the factor that takes the
 * store's unit to the panel's (grams). USDA reports sodium and cholesterol in
 * milligrams and the two fats in grams; the panel is grams throughout
 * (ADR-0021: one fixed unit per field).
 */
const LIMITS = {
  sodium_content: { id: "1093", toGrams: 0.001, label: "sodium" },
  saturated_fat_content: { id: "1258", toGrams: 1, label: "saturated fat" },
  trans_fat_content: { id: "1257", toGrams: 1, label: "trans fat" },
};

/**
 * The limits a European pack is silent on **by law**, and therefore the ones a
 * fill is not covering for a failed capture.
 *
 * EU Regulation 1169/2011's mandatory nutrition declaration is energy, fat,
 * saturates, carbohydrate, sugars, protein and salt. Trans fat is not in it. It IS
 * mandatory on a US panel (21 CFR 101.9(c)), as are sodium and saturated fat — so
 * sodium and saturated fat are mandatory under every declaration this app meets,
 * and their silence is a defect wherever the jar was sold.
 *
 * **This set held two limits until #506.** Cholesterol was the other, and it is
 * gone from here because it is gone from {@link BAKED_NUTRIENT_LIMITS_G}: the WHO
 * publishes no dietary-cholesterol ceiling, so the nutrient has no cap to fill
 * toward and this script has nothing to measure about it. That follows from #506
 * and revises nothing #495 decided — #495 settled that a fill may supply a limit,
 * partitioned by nutrient, and that rule now reaches one lawfully-silent limit
 * rather than two. The shipped never-fill rule is unaffected either way: it keys
 * off the EU declaration in `src/lib/food/marked-panel.ts`, not off this set or
 * `LIMIT_KEYS`.
 */
const LAWFULLY_SILENT = new Set(["trans_fat_content"]);

/**
 * The OFF record behind a twin, under either spelling of the attribute that
 * holds it, and which spelling that was.
 *
 * ADR-0086 §5 renamed `twin/raw_provenance` to `provenance/raw` and accepted in
 * terms that the datoms already written stay "under names nothing will read
 * again". So a real ledger carries both, and the app reads only the newer one —
 * which is the difference between a fact a rule could stand on and one it
 * cannot.
 */
function offRecord(attrs) {
  const legacy = attrs?.["twin/raw_provenance"];
  const current = attrs?.["provenance/raw"];
  const provenance = current ?? legacy ?? null;
  return {
    product: provenance?.raw_data?.product ?? provenance?.raw_data ?? null,
    readableByTheApp: Boolean(current),
  };
}

/** A consumption event still standing: not retracted, not superseded. */
function isLive(attrs) {
  return !attrs["event/status"] && !attrs["event/replaced_by"];
}

/** The grams an event consumed, or null where it was logged by volume. */
function gramsOf(attrs) {
  const match = /^([\d.]+)\s*g$/.exec(String(attrs["event/quantity"] ?? ""));
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const store = JSON.parse(readFileSync(STORE_PATH, "utf8")).foods;
const ledger = foldLedgerExport(EXPORT_PATH);

const paired = Object.entries(ADJUDICATION).filter(
  ([, entry]) => entry.verdict === "paired"
);

console.log(
  `\n=== Which silences are real (${paired.length} paired twins) ===\n`
);

const silences = new Map(Object.keys(LIMITS).map((key) => [key, 0]));
let withCountries = 0;
let withoutOffRecord = 0;
let readableByTheApp = 0;

for (const [gtin, entry] of paired) {
  const attrs = ledger.get(`gtin:${gtin}`) ?? {};
  const panel = attrs["nutrition/info"] ?? {};
  const { product, readableByTheApp: readable } = offRecord(attrs);
  const countries = product?.countries_tags ?? null;
  if (countries?.length) withCountries += 1;
  if (!product) withoutOffRecord += 1;
  if (readable) readableByTheApp += 1;

  const silent = Object.keys(LIMITS).filter(
    (key) => panel[key] === undefined || panel[key] === null
  );
  for (const key of silent) silences.set(key, silences.get(key) + 1);

  console.log(
    `${entry.name.padEnd(34)} silent: ${
      silent.map((key) => LIMITS[key].label).join(", ") || "nothing"
    }`
  );
  console.log(
    `${" ".repeat(34)} countries_tags: ${
      countries?.join(", ") ?? (product ? "(absent)" : "(no OFF record)")
    }`
  );
}

console.log(`\nSilent on each limit, of ${paired.length}:`);
for (const [key, count] of silences)
  console.log(
    `  ${LIMITS[key].label.padEnd(15)} ${String(count).padStart(2)}  ${
      LAWFULLY_SILENT.has(key)
        ? "not declarable on an EU pack"
        : "mandatory everywhere — silence is a capture defect"
    }`
  );
console.log(
  `\ncountries_tags present on ${withCountries} of ${paired.length}; ` +
    `${withoutOffRecord} carry no OFF record at all.`
);
console.log(
  `Of those records, ${readableByTheApp} sit under \`provenance/raw\`, the name the app reads; ` +
    `the other ${paired.length - withoutOffRecord - readableByTheApp} are under ADR-0086 §5's ` +
    `superseded \`twin/raw_provenance\` and are dark to the shipped code.`
);

// --- What the fill moves -----------------------------------------------------

const days = new Map();
const spenders = new Map(Object.keys(LIMITS).map((key) => [key, []]));
let liveEvents = 0;
let byVolume = 0;

for (const [entity, attrs] of ledger) {
  if (!entity.startsWith("event:consume_")) continue;
  if (!isLive(attrs)) continue;
  liveEvents += 1;

  const day = new Date(Number(entity.split("_").pop()))
    .toISOString()
    .slice(0, 10);
  const totals = days.get(day) ?? { standing: {}, lawful: {}, everything: {} };
  days.set(day, totals);

  const metrics = attrs["event/metrics"] ?? {};
  for (const key of Object.keys(LIMITS)) {
    const value = metrics[key] ?? 0;
    for (const arm of ["standing", "lawful", "everything"])
      totals[arm][key] = (totals[arm][key] ?? 0) + value;
    if (value > 0)
      spenders.get(key).push({ day, target: attrs["event/target"], value });
  }

  const target = String(attrs["event/target"] ?? "");
  const entry = target.startsWith("gtin:")
    ? ADJUDICATION[target.slice("gtin:".length)]
    : null;
  if (entry?.verdict !== "paired") continue;

  const grams = gramsOf(attrs);
  if (grams === null) {
    byVolume += 1;
    continue;
  }

  const row = store[String(entry.fdcId)];
  const panel = ledger.get(target)?.["nutrition/info"] ?? {};
  for (const [key, limit] of Object.entries(LIMITS)) {
    if (panel[key] !== undefined && panel[key] !== null) continue;
    const filled = ((row?.[limit.id] ?? 0) * limit.toGrams * grams) / 100;
    totals.everything[key] += filled;
    if (LAWFULLY_SILENT.has(key)) totals.lawful[key] += filled;
  }
}

console.log(
  `\n=== What the fill moves (${liveEvents} live events over ${days.size} days; ${byVolume} logged by volume, not filled) ===\n`
);
console.log(
  "Per day: as it stands → EU-lawful silences filled → every silence filled\n"
);
for (const [day, totals] of [...days].sort())
  console.log(
    `  ${day}  ` +
      Object.entries(LIMITS)
        .map(
          ([key, limit]) =>
            `${limit.label} ${totals.standing[key].toFixed(2)}→${totals.lawful[
              key
            ].toFixed(2)}→${totals.everything[key].toFixed(2)}`
        )
        .join("  ")
  );

console.log("\nDays over cap, the number that tints a meter:\n");
for (const [key, limit] of Object.entries(LIMITS)) {
  const cap = BAKED_NUTRIENT_LIMITS_G[key];
  const over = (arm) =>
    [...days.values()].filter((totals) => totals[arm][key] > cap).length;
  console.log(
    `  ${limit.label.padEnd(15)} cap ${String(cap).padStart(5)} g   ` +
      `standing ${over("standing")}   lawful ${over("lawful")}   everything ${over("everything")}`
  );
}

console.log("\n=== What already spends each cap ===\n");
for (const [key, limit] of Object.entries(LIMITS)) {
  const top = spenders.get(key).sort((a, b) => b.value - a.value)[0];
  if (!top) {
    console.log(`  ${limit.label.padEnd(15)} nothing logged`);
    continue;
  }
  const name = ledger.get(top.target)?.["food/name"] ?? top.target;
  const cap = BAKED_NUTRIENT_LIMITS_G[key];
  console.log(
    `  ${limit.label.padEnd(15)} ${top.value.toFixed(3)} g in one serving — ` +
      `${((top.value / cap) * 100).toFixed(0)}% of the cap — ${name} (${top.day})`
  );
}
console.log("");
