/**
 * #199 — price a LARGE COMPLEX meal on the wire, after #197's narrowing, so the
 * payload ceiling can be set from a measurement rather than from a guess.
 *
 * The harness behind `199-large-meal-payload-measurements.md`. Kept as a
 * research artifact so the note's figures can be reproduced, NOT as a
 * maintained tool: it is a Vitest file that was run from `tests/unit/`, and it
 * reads its Open Food Facts responses from a scratch directory that no longer
 * exists. To re-run it, copy it back to `tests/unit/_measure199.test.ts`,
 * re-fetch the six barcodes in `BARCODES` from the v3 product API into
 * `SCRATCH` as `off-<barcode>.json`, and point `SCRATCH` at them.
 *
 * It uses the app's REAL mappers over REAL source data (the bundled USDA
 * archives; live Open Food Facts responses). Writes a report; never touches
 * the ledger.
 */
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import {
  mapIndexRowToPayload,
  completeStagedPanel,
} from "../../src/lib/food/usda-corpus";
import { mapOffProductToPayload } from "../../src/lib/food/open-food-facts";
import { buildInstantiation } from "../../src/lib/food/recipe-instantiation";
import { deriveIngredientMacros } from "../../src/lib/food/recipe-nutrition";
import { EXTRA_NUTRIENT_KEYS } from "../../src/lib/food/nutrition";
import { ingestEntity } from "../../src/lib/ingestion/ingest";
import { datomLine, envelopeLine } from "../../src/lib/db/ledger-export";

const SCRATCH =
  "/tmp/claude-1000/-home-inkpotmonkey-code-inventoria--claude-worktrees-wayfinder-185-p2p-sync/24a17f30-ffe9-4062-b955-6777ffa74fa5/scratchpad";

/** #197 §1.2 / §1.3 — the three attributes that never cross. */
const FORBIDDEN = new Set([
  "twin/raw_provenance",
  "food/label_photos",
  "food/photo_base64",
]);

const BARCODES = [
  "20724696",
  "3228857000166",
  "8000500310427",
  "5449000000996",
  "7622210449283",
  "3017620422003",
];

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

type Row = {
  entity: string;
  attribute: string;
  value: string;
  time: number;
  hlc_ms: number;
  hlc_ctr: number;
  device_id: string;
};

type Case = {
  label: string;
  foods: number;
  recipes: number;
  entities: number;
  lines: number;
  raw: number;
  gz: number;
  ls: number;
  perKind: Map<string, { n: number; bytes: number }>;
};

it("prices a large complex meal (#199)", async () => {
  const index = readJson("public/usda/search-index.json");
  const store = readJson("public/usda/nutrient-store.json");
  const loadStore = async () => store;

  /**
   * The conservative population: corpus rows whose staged panel serialises
   * largest. A ceiling set against these can never be beaten by an honest
   * food, which is the point of the exercise.
   */
  const widest = [...index.foods]
    .map((f: any) => ({ f, size: JSON.stringify(f).length }))
    .sort((a, b) => b.size - a.size)
    .map((x) => x.f);

  const measure = async (label: string, nFoods: number, nRecipes: number) => {
    const rows: Row[] = [];
    let hlc = 1_756_000_000_000;
    let clock = new Date(2026, 11, 25, 13, 0, 0).getTime();
    const panels = new Map<string, any>();
    const events: string[] = [];

    const emit = (payload: any, time: number) => {
      for (const d of ingestEntity(payload, time)) {
        rows.push({
          entity: d.entity,
          attribute: d.attribute,
          // The ledger stores every value as JSON.stringify(value); the export
          // writes that TEXT verbatim, so the wire carries the escaping.
          value: JSON.stringify(d.value),
          time,
          hlc_ms: hlc++,
          hlc_ctr: 0,
          device_id: "dev_m199",
        });
      }
    };

    const fdcTwin = async (row: any) => {
      const base = mapIndexRowToPayload(row);
      const staged = await completeStagedPanel(base, loadStore);
      emit(base, (clock += 1000));
      // Staging supersedes the four-macro panel with the full one — a second,
      // larger `nutrition/info` datom. Both sit in the ledger; #197 §1.1 sends
      // only the winner, which the narrowing below reproduces.
      emit(
        {
          entity: staged.entity,
          attributes: { "nutrition/info": staged.attributes["nutrition/info"] },
        },
        (clock += 40)
      );
      panels.set(staged.entity, staged.attributes["nutrition/info"]);
      return staged.entity;
    };

    const offTwin = (barcode: string) => {
      const payload = mapOffProductToPayload(
        readJson(`${SCRATCH}/off-${barcode}.json`)
      );
      emit(payload, (clock += 1000));
      panels.set(payload.entity, payload.attributes["nutrition/info"]);
      return payload.entity;
    };

    const resolve = (ref: string) => panels.get(ref);

    const logEntry = (
      target: string,
      amount: number,
      unit: string,
      instantiation?: any
    ) => {
      const b: any = deriveIngredientMacros(
        { ref: target, amount, unit: unit as any },
        resolve
      );
      const metrics: Record<string, number> = { calories: b.calories };
      for (const k of ["protein", "fat", "carbs"] as const)
        if (typeof b[k] === "number") metrics[k] = b[k];
      for (const k of EXTRA_NUTRIENT_KEYS)
        if (typeof b[k] === "number") metrics[k] = b[k];
      const entity = `event:consume_${(hlc % 1e7).toString(36)}_${clock}`;
      const attributes: Record<string, unknown> = {
        "event/type": "ConsumeAction",
        "event/target": target,
        "event/quantity": `${amount}${unit}`,
        "event/meal_type": "dinner",
        "event/metrics": metrics,
      };
      if (instantiation) attributes["event/instantiation"] = instantiation;
      emit({ entity, attributes }, (clock += 1000));
      events.push(entity);
    };

    // Packaged goods first (the dearer twin), then USDA rows to fill.
    const packaged = BARCODES.slice(0, Math.min(BARCODES.length, nFoods)).map(
      offTwin
    );
    const ids: string[] = [];
    for (let i = 0; i < nFoods - packaged.length; i++)
      ids.push(await fdcTwin(widest[i]));

    // Cooked dishes. The frozen ingredient rows on the instantiation are the
    // dearest single thing in a meal, and they scale with the ingredient count.
    const perRecipe = Math.max(
      4,
      Math.floor(ids.length / Math.max(1, nRecipes))
    );
    for (let r = 0; r < nRecipes; r++) {
      const refs = ids.slice(r * perRecipe, (r + 1) * perRecipe);
      if (refs.length === 0) break;
      const ingredients = refs.map((ref, i) => ({
        ref,
        amount: 80 + i * 15,
        unit: "g" as const,
      }));
      const entity = `recipe:dish-${r}-4d9b0c17-2f5a-4e8b-9a13-6c2e7f01d8aa`;
      emit(
        {
          entity,
          attributes: {
            "recipe/name": `Roast course number ${r + 1}`,
            "recipe/yield": 8,
            "recipe/ingredients": ingredients,
            "recipe/instructions": [
              "Heat the oven to 190C and prepare the tray.",
              "Combine the aromatics and cook until softened, about ten minutes.",
              "Add the remaining ingredients, season, and roast until done.",
              "Rest before serving.",
            ],
          },
        },
        (clock += 1000)
      );
      logEntry(
        entity,
        1,
        "serving",
        buildInstantiation(entity, ingredients, 8, resolve, (ref) =>
          String(ref)
        )
      );
    }
    for (const id of [...ids, ...packaged]) logEntry(id, 90, "g");

    // ── Narrow it the way #197 decided ────────────────────────────────────
    const byEntity = new Map<string, Row[]>();
    for (const r of rows) {
      if (!byEntity.has(r.entity)) byEntity.set(r.entity, []);
      byEntity.get(r.entity)!.push(r);
    }
    const winning = (entity: string) => {
      const seen = new Map<string, Row>();
      for (const r of byEntity.get(entity) ?? []) {
        const prev = seen.get(r.attribute);
        if (!prev || r.hlc_ms > prev.hlc_ms) seen.set(r.attribute, r);
      }
      return [...seen.values()];
    };
    const closure = new Set<string>();
    const walk = (entity: string) => {
      if (closure.has(entity)) return;
      closure.add(entity);
      for (const r of winning(entity)) {
        const v = JSON.parse(r.value);
        if (r.attribute === "event/target") walk(v);
        if (r.attribute === "event/instantiation") {
          if (v.based_on) walk(v.based_on);
          for (const ing of v.ingredients ?? []) if (ing.ref) walk(ing.ref);
        }
        if (r.attribute === "recipe/ingredients")
          for (const ing of v ?? []) if (ing.ref) walk(ing.ref);
      }
    };
    for (const e of events) walk(e);

    const payloadRows: Row[] = [];
    for (const entity of closure)
      for (const r of winning(entity))
        if (!FORBIDDEN.has(r.attribute)) payloadRows.push(r);

    const ndjson =
      envelopeLine({
        artifact: "inventoria-meal",
        schema_version: 1,
        exported_at: 1_756_000_100_000,
        device_id: "dev_m199",
        row_count: payloadRows.length,
      } as any) + payloadRows.map((r) => datomLine(r as any)).join("");

    const kindOf = (e: string) =>
      e.startsWith("fdc:")
        ? "fdc:"
        : e.startsWith("gtin:")
          ? "gtin:"
          : e.startsWith("recipe:")
            ? "recipe:"
            : "event:consume_";
    const perKind = new Map<string, { n: number; bytes: number }>();
    const perEntity = new Map<string, number>();
    for (const r of payloadRows) {
      const b = Buffer.byteLength(datomLine(r as any), "utf8");
      perEntity.set(r.entity, (perEntity.get(r.entity) ?? 0) + b);
      const acc = perKind.get(kindOf(r.entity)) ?? { n: 0, bytes: 0 };
      acc.bytes += b;
      perKind.set(kindOf(r.entity), acc);
    }
    for (const [e] of perEntity) perKind.get(kindOf(e))!.n += 1;

    return {
      label,
      foods: nFoods,
      recipes: nRecipes,
      entities: closure.size,
      lines: payloadRows.length,
      raw: Buffer.byteLength(ndjson, "utf8"),
      gz: gzipSync(ndjson, { level: 9 }).length,
      // What the localStorage inbox actually stores: the payload as a JSON
      // string value, so every quote and newline in it is escaped again.
      ls: Buffer.byteLength(JSON.stringify(ndjson), "utf8"),
      perKind,
      ndjson,
    } satisfies Case & { ndjson: string };
  };

  const cases = [
    await measure("a normal meal", 4, 0),
    await measure("a cooked dinner", 10, 1),
    await measure("a large complex meal (Christmas dinner)", 30, 3),
    await measure("an implausibly large feast", 60, 6),
    await measure("beyond any honest meal", 120, 12),
  ];

  const out: string[] = [];
  const kib = (n: number) => (n / 1024).toFixed(1).padStart(8);
  out.push(
    "case                                      foods  ents  lines     raw KiB   gzip KiB     localStorage KiB"
  );
  for (const c of cases)
    out.push(
      `${c.label.padEnd(42)}${String(c.foods).padStart(4)}${String(c.entities).padStart(6)}${String(c.lines).padStart(7)}   ${kib(c.raw)}   ${kib(c.gz)}         ${kib(c.ls)}`
    );

  const big = cases[2];
  out.push("");
  out.push(`── ${big.label}: where the bytes go (raw) ──`);
  for (const [k, v] of [...big.perKind].sort((a, b) => b[1].bytes - a[1].bytes))
    out.push(
      `  ${k.padEnd(16)} n=${String(v.n).padStart(3)}  total=${String(v.bytes).padStart(7)}  mean=${Math.round(v.bytes / v.n)}  (${((v.bytes / big.raw) * 100).toFixed(1)}%)`
    );

  const a = cases[2],
    b = cases[4];
  const marginal = (b.raw - a.raw) / (b.foods - a.foods);
  out.push("");
  out.push(`marginal cost of one more food: ${Math.round(marginal)} raw bytes`);
  out.push("");
  out.push(
    "headroom over the large complex meal, and the food count it allows:"
  );
  for (const c of [256, 512, 1024, 2048, 4096, 8192])
    out.push(
      `  ${String(c).padStart(5)} KiB  ->  ${((c * 1024) / a.raw).toFixed(1)}x   ~${Math.floor((c * 1024) / marginal)} foods`
    );

  const report = out.join("\n");
  console.log("\n" + report + "\n");
  writeFileSync(`${SCRATCH}/199-large-meal.txt`, report + "\n");
  writeFileSync(`${SCRATCH}/199-large-meal.ndjson`, cases[2].ndjson);
});
