/**
 * PROTOTYPE (#244) — the four paired foods the variants are drawn against.
 *
 * Throwaway. Nothing here may be imported by app code, and nothing here is a
 * proposal about a schema: it is hard-coded so that three panel treatments can
 * be looked at side by side.
 *
 * **Where the numbers come from.** The `label` panels are the real
 * `nutrition/info` datoms of four packs in #241's ledger export — the panel a
 * manufacturer printed, and nothing else: no timestamps, no amounts, no
 * consumption events. The `reference` panels are read out of the committed
 * `public/usda/nutrient-store.json` + `search-index.json` at the fdcIds
 * `scripts/pairing-census.mjs` adjudicated, converted into `NutritionInfo`'s
 * own units (everything in grams, calories in kcal).
 *
 * **Why these four.** #243 found three shapes of pairing and they read
 * differently on a screen, which is the whole question:
 *
 * - `oil` — the clean case. Label and reference agree on every macro to the
 *   decimal (884 kcal, 100 g fat), and the reference brings exactly one thing
 *   worth having: vitamin E at 96% of a day in 100 g.
 * - `syrup` — the clean case with an overlap DISAGREEMENT. The label prints
 *   sodium 0; USDA reports 12 mg. #240's rule hides that row. Variant A is the
 *   only one that shows it, which is what makes the "honest or suspicious"
 *   question answerable.
 * - `kefir` — the rich case. Eleven of the twelve metered micronutrients, off a
 *   reference food that is not the same ferment.
 * - `beans` — the state gap (#489). The corpus holds the pulse DRIED and the
 *   jar is cooked, so the reference food carries 3.20x the jar's energy. The
 *   pairing is arithmetically wrong and looks exactly like the other three.
 */

import type { NutritionInfo, Portion } from "../../../food/nutrition";

export interface PairedFood {
  id: string;
  /** The pack, as the twin names it. */
  name: string;
  gtin: string;
  /** The manufacturer's printed panel — the food, unmixed. */
  label: NutritionInfo;
  reference: {
    fdcId: number;
    description: string;
    dataType: string;
    panel: NutritionInfo;
    portions: Portion[];
  };
  /** Reference energy ÷ label energy. 1.00 is the same food in the same state. */
  energyRatio: number;
  /** What this food is in the set to show. */
  note: string;
}

export const PAIRED_FOODS: PairedFood[] = [
  {
    id: "oil",
    name: "Aceite de oliva virgen extra",
    gtin: "8436578483167",
    label: {
      serving_size: "100 g",
      calories: 884,
      protein_content: 0,
      fat_content: 100,
      carbohydrate_content: 0,
      sugar_content: 0,
      sodium_content: 0,
      saturated_fat_content: 13.808,
    },
    reference: {
      fdcId: 171413,
      description: "Oil, olive, salad or cooking",
      dataType: "SR Legacy",
      panel: {
        serving_size: "100 g",
        calories: 884,
        protein_content: 0,
        fat_content: 100,
        carbohydrate_content: 0,
        fiber_content: 0,
        sugar_content: 0,
        sodium_content: 0.002,
        saturated_fat_content: 13.8,
        cholesterol_content: 0,
        unsaturated_fat_content: 83.5,
        vitamin_d: 0,
        calcium: 0.001,
        iron: 0.00056,
        potassium: 0.001,
        vitamin_a: 0,
        vitamin_c: 0,
        vitamin_e: 0.0144,
        vitamin_b6: 0,
        vitamin_b12: 0,
        folate: 0,
        magnesium: 0,
        zinc: 0,
      },
      portions: [{ label: "1 tbsp", amount: 1, unit: "tbsp", grams: 13.5 }],
    },
    energyRatio: 1.0,
    note: "The clean pairing. Every macro agrees to the decimal, and one nutrient — vitamin E at 96% of a day per 100 g — is the whole prize.",
  },
  {
    id: "syrup",
    name: "Jarabe de arce",
    gtin: "0060032101083",
    label: {
      serving_size: "100 g",
      calories: 252,
      protein_content: 0,
      fat_content: 0.1,
      carbohydrate_content: 67,
      sugar_content: 61.5,
      sodium_content: 0,
      saturated_fat_content: 0,
    },
    reference: {
      fdcId: 169661,
      description: "Syrups, maple",
      dataType: "SR Legacy",
      panel: {
        serving_size: "100 g",
        calories: 260,
        protein_content: 0.04,
        fat_content: 0.06,
        carbohydrate_content: 67,
        fiber_content: 0,
        sugar_content: 60.5,
        sodium_content: 0.012,
        saturated_fat_content: 0.007,
        cholesterol_content: 0,
        unsaturated_fat_content: 0.028,
        vitamin_d: 0,
        calcium: 0.102,
        iron: 0.00011,
        potassium: 0.212,
        vitamin_a: 0,
        vitamin_c: 0,
        vitamin_e: 0,
        vitamin_b6: 0.000002,
        vitamin_b12: 0,
        folate: 0,
        magnesium: 0.021,
        zinc: 0.00147,
      },
      portions: [{ label: "1 tbsp", amount: 1, unit: "tbsp", grams: 20 }],
    },
    energyRatio: 1.03,
    note: "The overlap disagreement. The label prints sodium 0; USDA reports 12 mg. #240's rule hides that row — variant A is the only one that does not.",
  },
  {
    id: "kefir",
    name: "Kéfir",
    gtin: "8424790111005",
    label: {
      serving_size: "100 g",
      calories: 65,
      protein_content: 3.4,
      fat_content: 3.8,
      carbohydrate_content: 3.8,
      sugar_content: 3.8,
      sodium_content: 0.04,
      saturated_fat_content: 2.7,
    },
    reference: {
      fdcId: 2259793,
      description: "Yogurt, plain, whole milk",
      dataType: "Foundation",
      panel: {
        serving_size: "100 g",
        calories: 78,
        protein_content: 3.82,
        fat_content: 4.48,
        carbohydrate_content: 5.57,
        fiber_content: 0,
        sodium_content: 0.0418,
        saturated_fat_content: 2.32,
        cholesterol_content: 0.0142,
        unsaturated_fat_content: 0.874,
        vitamin_d: 0.00000078,
        calcium: 0.127,
        iron: 0,
        potassium: 0.164,
        vitamin_a: 0.000027,
        vitamin_c: 0.0005,
        vitamin_e: 0.00006,
        vitamin_b6: 0.000045,
        vitamin_b12: 0.00000037,
        folate: 0.000007,
        magnesium: 0.0114,
        zinc: 0.000428,
      },
      portions: [{ label: "1 RACC", amount: 1, unit: "RACC", grams: 170 }],
    },
    energyRatio: 1.2,
    note: "The rich pairing. Eleven of the twelve meters move — off a reference food that is a different ferment of the same milk.",
  },
  {
    id: "beans",
    name: "Alubia roja cocida",
    gtin: "4068263049675",
    label: {
      serving_size: "100 g",
      calories: 104,
      protein_content: 7.2,
      fat_content: 0.8,
      carbohydrate_content: 14,
      fiber_content: 6.4,
    },
    reference: {
      fdcId: 175193,
      description: "Beans, kidney, all types, dried",
      dataType: "SR Legacy",
      panel: {
        serving_size: "100 g",
        calories: 333,
        protein_content: 23.6,
        fat_content: 0.83,
        carbohydrate_content: 60,
        fiber_content: 24.9,
        sugar_content: 2.23,
        sodium_content: 0.024,
        saturated_fat_content: 0.12,
        trans_fat_content: 0,
        cholesterol_content: 0,
        unsaturated_fat_content: 0.521,
        vitamin_d: 0,
        calcium: 0.143,
        iron: 0.0082,
        potassium: 1.41,
        vitamin_a: 0,
        vitamin_c: 0.0045,
        vitamin_e: 0.00022,
        vitamin_b6: 0.000397,
        vitamin_b12: 0,
        folate: 0.000394,
        magnesium: 0.14,
        zinc: 0.00279,
      },
      portions: [{ label: "1 cup", amount: 1, unit: "cup", grams: 184 }],
    },
    energyRatio: 3.2,
    note: "The state gap (#489). The corpus holds the pulse dried; the jar is cooked. Every figure in the second band is out by the water the cooking added — and it looks exactly like the other three.",
  },
];

/** The amount each food opens on, so a panel is never read at a silly weight. */
export const OPENING_AMOUNT: Record<string, number> = {
  oil: 14,
  syrup: 20,
  kefir: 200,
  beans: 120,
};
