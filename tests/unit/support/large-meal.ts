/**
 * One large complex meal, synthesised from the committed USDA bundle.
 *
 * ADR-0073 §9 sets the payload ceiling at 1 MiB and pins the test that guards
 * it to the **invariant** rather than to a figure: a meal of this shape stays
 * under the ceiling, so the guard fires if the payload rules ever widen. The
 * measured sizes live in `docs/research/199-large-meal-payload-measurements.md`
 * and its harness, dated and named there, and are deliberately not restated as
 * assertions — they move on every corpus regeneration.
 *
 * Two things this borrows from #199's harness, both of which make the bound
 * meaningful rather than merely large:
 *
 *   - **The widest rows in the corpus**, sorted by serialised size and taken
 *     from the top. A ceiling proved against these cannot be beaten by an
 *     honest food.
 *   - **The app's own mappers**, over the committed artifacts, so the bytes are
 *     the bytes the app would really produce rather than a hand-built stand-in
 *     that could agree with the code and not the data.
 *
 * It is `gtin:`-free for the reason the #199 note gives: ADR-0073 §2 takes a
 * `gtin:` twin from 58x an `fdc:` twin to rough parity, so an all-USDA meal of
 * the same food count now costs the same order as a mixed one — and a live Open
 * Food Facts fetch has no place in a unit test.
 */

import { readFileSync } from "node:fs";
import {
  buildSearchCorpus,
  completeStagedPanel,
  mapIndexRowToPayload,
  type NutrientStore,
  type SearchIndex,
} from "../../../src/lib/food/usda-corpus";
import {
  buildInstantiation,
  type Instantiation,
} from "../../../src/lib/food/recipe-instantiation";
import { deriveIngredientMacros } from "../../../src/lib/food/recipe-nutrition";
import {
  EXTRA_NUTRIENT_KEYS,
  NUTRITION_INFO_ATTR,
  type NutritionInfo,
} from "../../../src/lib/food/nutrition";
import {
  ingestEntity,
  type EntityPayload,
} from "../../../src/lib/ingestion/ingest";
import type { LedgerRow } from "../../../src/lib/db/db.core";

/** A meal as it sits in a ledger: every datom it wrote, and its roots. */
export interface SynthesisedMeal {
  /** The `event:consume_` ids that constitute the meal. */
  roots: string[];
  /** Every row the meal wrote, superseded facts included. */
  rows: LedgerRow[];
}

/**
 * The Christmas dinner ADR-0073 §9 anchors its 8.9x margin on: thirty distinct
 * foods and three cooked dishes. Exported so a test can say what it expects the
 * meal to be without restating a number the fixture owns.
 */
export const LARGE_MEAL_FOODS = 30;
export const LARGE_MEAL_RECIPES = 3;

export async function synthesiseLargeMeal(): Promise<SynthesisedMeal> {
  const index: SearchIndex = JSON.parse(
    readFileSync("public/usda/search-index.json", "utf8")
  );
  const store: NutrientStore = JSON.parse(
    readFileSync("public/usda/nutrient-store.json", "utf8")
  );
  const loadStore = async () => store;

  const widest = buildSearchCorpus(index)
    .foods.map((f) => ({ row: f.row, size: JSON.stringify(f.row).length }))
    .sort((a, b) => b.size - a.size)
    .map((x) => x.row);

  const rows: LedgerRow[] = [];
  const roots: string[] = [];
  const panels = new Map<string, NutritionInfo>();
  const names = new Map<string, string>();
  let hlc_ms = 1_756_000_000_000;
  let logged_at = new Date(2026, 11, 25, 13, 0, 0).getTime();

  const emit = (payload: EntityPayload, time: number) => {
    for (const d of ingestEntity(payload, time)) {
      rows.push({
        entity: d.entity,
        attribute: d.attribute,
        // The ledger stores every value as JSON.stringify(value) and the wire
        // carries that TEXT verbatim, so the escaping is priced rather than
        // skipped.
        value: JSON.stringify(d.value),
        time,
        hlc_ms: hlc_ms++,
        hlc_ctr: 0,
        device_id: "dev_sender",
      });
    }
  };

  /**
   * Staging as the app does it: the search row's four-macro panel is written
   * first and the Nutrient store's full panel supersedes it, so the ledger holds
   * two `nutrition/info` datoms for every food and the payload must send one.
   */
  const stageFood = async (payload: EntityPayload) => {
    const staged = await completeStagedPanel(payload, loadStore);
    emit(payload, (logged_at += 1000));
    emit(
      {
        entity: staged.entity,
        attributes: {
          [NUTRITION_INFO_ATTR]: staged.attributes[NUTRITION_INFO_ATTR],
        },
      },
      (logged_at += 40)
    );
    panels.set(staged.entity, staged.attributes[NUTRITION_INFO_ATTR]);
    names.set(staged.entity, String(staged.attributes["food/name"]));
    return staged.entity;
  };

  const resolve = (ref: string) => panels.get(ref);
  const resolveName = (ref: string) => names.get(ref);

  const logEntry = (
    target: string,
    amount: number,
    unit: "g" | "serving",
    instantiation?: Instantiation
  ) => {
    const breakdown = deriveIngredientMacros(
      { ref: target, amount, unit },
      resolve
    );
    const metrics: Record<string, number> = {
      calories: breakdown.calories,
      protein: breakdown.protein,
      fat: breakdown.fat,
      carbs: breakdown.carbs,
    };
    for (const key of EXTRA_NUTRIENT_KEYS) {
      const value = breakdown[key];
      if (typeof value === "number") metrics[key] = value;
    }
    const entity = `event:consume_${hlc_ms.toString(36)}_${logged_at}`;
    const attributes: Record<string, unknown> = {
      "event/type": "ConsumeAction",
      "event/target": target,
      "event/quantity": `${amount}${unit}`,
      "event/meal_type": "dinner",
      "event/metrics": metrics,
    };
    if (instantiation) attributes["event/instantiation"] = instantiation;
    emit({ entity, attributes }, (logged_at += 1000));
    roots.push(entity);
  };

  const ids: string[] = [];
  for (let i = 0; i < LARGE_MEAL_FOODS; i++) {
    ids.push(await stageFood(mapIndexRowToPayload(widest[i])));
  }

  const perRecipe = Math.floor(ids.length / LARGE_MEAL_RECIPES);
  for (let r = 0; r < LARGE_MEAL_RECIPES; r++) {
    const ingredients = ids
      .slice(r * perRecipe, (r + 1) * perRecipe)
      .map((ref, i) => ({ ref, amount: 80 + i * 15, unit: "g" as const }));
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
      (logged_at += 1000)
    );
    logEntry(
      entity,
      1,
      "serving",
      buildInstantiation(entity, ingredients, 8, resolve, resolveName)
    );
  }
  for (const id of ids) logEntry(id, 90, "g");

  return { roots, rows };
}
