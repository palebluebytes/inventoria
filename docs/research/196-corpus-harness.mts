/**
 * The corpus builder behind `196-past-meal-closure-measurements.md`. Kept as a
 * research artifact so the note's figures can be reproduced, NOT as a
 * maintained tool: it is a Vitest file that was run from `tests/unit/`, and it
 * reads its Open Food Facts responses and photographs from a scratch directory
 * that no longer exists. To re-run it, copy it back to
 * `tests/unit/_measure196.test.ts`, re-fetch the sources named in §2 of the
 * note, and point `SCRATCH` at them.
 *
 * It calls the app's REAL mappers over REAL source data (the bundled USDA
 * archives, live Open Food Facts responses, real photographs processed at the
 * app's own MAX_PHOTO_EDGE/PHOTO_QUALITY) and writes an ADR-0064 NDJSON export.
 */
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
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
  "/tmp/claude-1000/-home-inkpotmonkey-code-inventoria--claude-worktrees-wayfinder-185-p2p-sync/130ece1a-3c5d-4049-a94c-5d801e5b4d05/scratchpad";

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

it("builds the #196 corpus", async () => {
  const index = readJson("public/usda/search-index.json");
  const store = readJson("public/usda/nutrient-store.json");
  const loadStore = async () => store;

  /** A real bundled row, by the description a person would have searched for. */
  const rowFor = (needle: string) => {
    const hit = index.foods.find((f: any) =>
      f.description.toLowerCase().includes(needle.toLowerCase())
    );
    if (!hit) throw new Error(`no bundled row for ${needle}`);
    return hit;
  };

  const datoms: any[] = [];
  let clock = new Date(2026, 7, 10, 8, 12, 0).getTime();
  const panels = new Map<string, any>();

  const emit = (payload: any, time: number) => {
    for (const d of ingestEntity(payload, time)) datoms.push({ ...d, time });
  };

  /** Stages a bundled USDA food exactly as the app does: row payload, then the
   *  full panel read out of the Nutrient store (ADR-0047 §2). */
  const fdcTwin = async (needle: string, time: number) => {
    const row = rowFor(needle);
    const base = mapIndexRowToPayload(row);
    const staged = await completeStagedPanel(base, loadStore);
    emit(base, time);
    // Staging supersedes the four-macro panel with the full one — a second,
    // larger `nutrition/info` datom, which is what the ledger really holds.
    emit(
      {
        entity: staged.entity,
        attributes: { "nutrition/info": staged.attributes["nutrition/info"] },
      },
      time + 40
    );
    panels.set(staged.entity, staged.attributes["nutrition/info"]);
    return staged.entity;
  };

  const offTwin = (barcode: string, time: number) => {
    const product = readJson(`${SCRATCH}/off-${barcode}.json`);
    const payload = mapOffProductToPayload(product);
    emit(payload, time);
    panels.set(payload.entity, payload.attributes["nutrition/info"]);
    return payload.entity;
  };

  /** A label-captured custom food (ADR-0034): photos, and a small envelope. */
  const labelTwin = (
    name: string,
    photoFile: string,
    panel: any,
    time: number
  ) => {
    const jpeg = readFileSync(`${SCRATCH}/${photoFile}`);
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const entity = `food:custom_${name.toLowerCase().replace(/\W+/g, "-")}-8f3c1a2b`;
    emit(
      {
        entity,
        attributes: {
          "food/name": name,
          "nutrition/info": panel,
          "food/label_photos": [dataUrl],
          "food/photo_base64": dataUrl,
          "food/label_capture": {
            adapter: "label",
            adapter_version: 1,
            method: "manual",
            basis: "100 g",
            fields: [
              "calories",
              "protein_content",
              "fat_content",
              "carbohydrate_content",
            ],
          },
        },
      },
      time
    );
    panels.set(entity, panel);
    return entity;
  };

  const resolve = (ref: string) => panels.get(ref);

  const logMeal = (
    meal_type: string,
    day: number,
    entries: { target: string; amount: number; unit: string }[],
    instantiation?: any
  ) => {
    for (const e of entries) {
      const b: any = deriveIngredientMacros(
        { ref: e.target, amount: e.amount, unit: e.unit as any },
        resolve
      );
      const metrics: Record<string, number> = { calories: b.calories };
      for (const k of ["protein", "fat", "carbs"] as const) {
        if (typeof b[k] === "number") metrics[k] = b[k];
      }
      for (const k of EXTRA_NUTRIENT_KEYS) {
        if (typeof b[k] === "number") metrics[k] = b[k];
      }
      const time = new Date(2026, 7, day, 8, 12, 0).getTime();
      const attributes: Record<string, unknown> = {
        "event/type": "ConsumeAction",
        "event/target": e.target,
        "event/quantity": `${e.amount}${e.unit}`,
        "event/meal_type": meal_type,
        "event/metrics": metrics,
      };
      if (instantiation) attributes["event/instantiation"] = instantiation;
      emit(
        {
          entity: `event:consume_${Math.random().toString(36).slice(2, 9)}_${time}`,
          attributes,
        },
        time
      );
    }
  };

  // --- the twins ----------------------------------------------------------
  const oats = await fdcTwin(
    "Oats, whole grain, rolled, old fashioned",
    (clock += 1000)
  );
  const milk = await fdcTwin("Milk, whole, 3.7% milkfat", (clock += 1000));
  const banana = await fdcTwin(
    "Bananas, ripe and slightly ripe, raw",
    (clock += 1000)
  );
  const egg = await fdcTwin(
    "Egg, whole, raw, frozen, pasteurized",
    (clock += 1000)
  );
  const spinach = await fdcTwin("Spinach, baby", (clock += 1000));
  const chicken = await fdcTwin(
    "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw",
    (clock += 1000)
  );
  const rice = await fdcTwin(
    "Rice, white, long-grain, regular, raw, enriched",
    (clock += 1000)
  );
  const oil = await fdcTwin("Oil, olive, salad or cooking", (clock += 1000));

  const nutella = offTwin("3017620422003", (clock += 1000));
  const pasta = offTwin("8076809513388", (clock += 1000));

  const sourdough = labelTwin(
    "Bakery sourdough loaf",
    "stored-p-4008400221328.jpg",
    {
      serving_size: "100 g",
      calories: 253,
      protein_content: 8.4,
      fat_content: 1.2,
      carbohydrate_content: 50.1,
    },
    (clock += 1000)
  );

  // --- a recipe twin, and the instantiation of cooking it ------------------
  const recipeIngredients = [
    { ref: chicken, amount: 400, unit: "g" as const },
    { ref: rice, amount: 300, unit: "g" as const },
    { ref: spinach, amount: 150, unit: "g" as const },
    { ref: oil, amount: 20, unit: "g" as const },
  ];
  const recipe = "recipe:4d9b0c17-2f5a-4e8b-9a13-6c2e7f01d8aa";
  emit(
    {
      entity: recipe,
      attributes: {
        "recipe/name": "Chicken and spinach rice",
        "recipe/yield": 4,
        "recipe/ingredients": recipeIngredients,
        "recipe/instructions": [
          "Season and sear the chicken until browned on both sides.",
          "Add the rice and twice its volume of water; simmer covered for 18 minutes.",
          "Fold the spinach through off the heat and rest for 5 minutes.",
        ],
      },
    },
    (clock += 1000)
  );
  const instantiation = buildInstantiation(
    recipe,
    recipeIngredients,
    4,
    resolve,
    (ref) => String(ref)
  );

  // --- the meals ----------------------------------------------------------
  logMeal("breakfast", 11, [
    { target: oats, amount: 60, unit: "g" },
    { target: milk, amount: 200, unit: "g" },
    { target: banana, amount: 120, unit: "g" },
  ]);
  logMeal("snack", 11, [{ target: nutella, amount: 30, unit: "g" }]);
  logMeal("lunch", 12, [
    { target: sourdough, amount: 90, unit: "g" },
    { target: egg, amount: 100, unit: "g" },
  ]);
  logMeal(
    "dinner",
    12,
    [{ target: recipe, amount: 1, unit: "serving" }],
    instantiation
  );
  logMeal("breakfast", 13, [
    { target: egg, amount: 120, unit: "g" },
    { target: spinach, amount: 80, unit: "g" },
  ]);
  logMeal("dinner", 13, [
    { target: pasta, amount: 125, unit: "g" },
    { target: oil, amount: 15, unit: "g" },
  ]);

  // --- write the export ---------------------------------------------------
  let ms = 1_756_000_000_000;
  const rows = datoms.map((d) => ({
    entity: d.entity,
    attribute: d.attribute,
    // The ledger stores every value as JSON.stringify(value) (db.core.ts:463),
    // strings included. The export writes that TEXT verbatim, so the wire bytes
    // carry the escaping — which is exactly what is being priced here.
    value: JSON.stringify(d.value),
    time: d.time,
    hlc_ms: ms++,
    hlc_ctr: 0,
    device_id: "dev_m196",
  }));
  const out =
    envelopeLine({
      artifact: "inventoria-ledger",
      schema_version: 1,
      exported_at: 1_756_000_100_000,
      device_id: "dev_m196",
      row_count: rows.length,
    }) + rows.map((r) => datomLine(r as any)).join("");
  writeFileSync(`${SCRATCH}/corpus-196.ndjson`, out);
  console.log(`wrote ${rows.length} datoms, ${out.length} bytes`);
});
