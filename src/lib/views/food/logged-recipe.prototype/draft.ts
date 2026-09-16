/**
 * THROWAWAY. Branch `prototype/logged-recipe-inline`. See `variants.ts` for the
 * question.
 *
 * The in-memory edit model all three variants share, and the demo instantiation
 * they fall back on. **Nothing here touches the ledger**: a Draft is seeded from
 * a logged event's frozen `event/instantiation` snapshot, edited freely, and
 * thrown away on reload. What it exists to surface is the shape of the write
 * that WOULD happen (`snapshotLine`), because the thing worth watching while
 * you tap an amount is ADR-0022's invariant — the headline is `Σrows ÷ yield`,
 * and this surface holds yield at 1 the way the real instantiator does.
 *
 * **Two honest simplifications, both of which the real editor does properly.**
 *   • A row's macros are scaled LINEARLY off the frozen figure, rather than
 *     re-derived from the ingredient twin's current panel — which is async, and
 *     which is the only reason `RecipeInstantiator` has a loading state at all.
 *     For a gram-basis ingredient the two agree; for a `serving` one they can
 *     drift, and that drift is not what any of these variants are being judged
 *     on.
 *   • Only calories are carried. The frozen row holds the whole
 *     `NutritionBreakdown` (ADR-0030) and a real inline editor would scale all
 *     of it; the day's row shows kcal, so kcal is what the prototype moves.
 */

import {
  getLocalFoodTwin,
  type ConsumptionEvent,
} from "../../../stores/calorie.store";
import type { MealType } from "../../../food/meal-type";
import {
  ingredientFromTwin,
  type RecipeIngredient,
} from "../../../food/recipe-ingredient";
import {
  PER_SERVING,
  roundFood,
  type AmountUnit,
  type NutritionInfo,
} from "../../../food/nutrition";
import { scaleAmount } from "../../../food/scale-amount";

/** One editable ingredient line, seeded from a frozen `InstantiationRow`. */
export interface DraftRow {
  /** Stable across edits, so a list keyed on it does not remount on retype. */
  key: string;
  ref: string;
  name: string;
  amount: number;
  unit: AmountUnit;
  calories: number;
  /** What the snapshot froze, so every scale is taken from the stored figure
   *  rather than compounding rounding through repeated taps. */
  base: { amount: number; calories: number };
}

/** One logged occasion, open for editing. */
export interface Draft {
  /** The Consumption Event this was seeded from. */
  id: string;
  name: string;
  based_on: string;
  /** How many servings this occasion is — the instantiator's "portions" count,
   *  which scales the AMOUNTS rather than dividing the total (ADR-0022's
   *  servings amendment). */
  servings: number;
  rows: DraftRow[];
  /** The headline the event actually carries, for the "was → is" line. */
  frozenCalories: number;
  /**
   * How many Ledger writes this occasion has taken since the screen opened.
   *
   * It exists because the write model is the decision this prototype was kept
   * open for, and a count is the only honest way to show its price. An
   * instantiation's ingredients are ONE frozen blob (ADR-0022) — no Datom holds
   * a single row — so every act appends a whole fresh copy of the list and
   * retracts the one before it. Correct three amounts and the Ledger holds
   * three snapshots of six ingredients, not three amounts.
   */
  writes: number;
}

let keySeq = 0;

export function draftFromEvent(event: ConsumptionEvent): Draft {
  const inst = event.instantiation;
  const storedYield = inst && inst.yield > 0 ? inst.yield : 1;
  const rows = (inst?.ingredients ?? []).map((r) => {
    // Open at ONE serving, exactly as `RecipeInstantiator.openAtOneServing`
    // does: the stored rows are the batch, and a surface whose count says 1 has
    // to show one serving's worth beside it.
    const amount =
      storedYield === 1
        ? r.amount
        : scaleAmount(r.amount, storedYield, "divide");
    const calories = (r.calories ?? 0) / storedYield;
    return {
      key: `k${keySeq++}`,
      ref: r.ref,
      name: r.name,
      amount,
      unit: r.unit,
      calories,
      base: { amount, calories },
    };
  });
  return {
    id: event.id,
    name: event.foodName || "Recipe",
    based_on: inst?.based_on || event.target || "",
    servings: 1,
    rows,
    frozenCalories: Number(event.calories) || 0,
    writes: 0,
  };
}

/** A row's kcal follows its amount off the frozen figure. */
function reprice(row: DraftRow, amount: number): void {
  row.amount = amount;
  row.calories =
    row.base.amount > 0
      ? (row.base.calories * amount) / row.base.amount
      : row.base.calories;
}

export function setRowAmount(draft: Draft, key: string, amount: number): void {
  const row = draft.rows.find((r) => r.key === key);
  if (!row || !Number.isFinite(amount) || amount < 0) return;
  reprice(row, amount);
}

/** The ± steppers. A gram row moves in 5s, a counted one in whole servings. */
export function stepRowAmount(draft: Draft, key: string, by: 1 | -1): void {
  const row = draft.rows.find((r) => r.key === key);
  if (!row) return;
  const grain = row.unit === "serving" ? 1 : 5;
  reprice(row, Math.max(0, roundFood(row.amount + by * grain)));
}

export function removeRow(draft: Draft, key: string): void {
  draft.rows = draft.rows.filter((r) => r.key !== key);
}

/** How many servings this occasion is: the count scales every amount with it. */
export function setServings(draft: Draft, servings: number): void {
  if (!Number.isFinite(servings) || servings < 1) return;
  const from = draft.servings || 1;
  draft.servings = servings;
  for (const row of draft.rows) {
    reprice(row, scaleAmount(row.amount, servings / from, "multiply"));
  }
}

/** Σ of the rows on screen — with yield held at 1, this IS the headline. */
export function totalCalories(draft: Draft): number {
  return draft.rows.reduce((sum, r) => sum + Math.round(r.calories), 0);
}

export function isDirty(draft: Draft): boolean {
  return (
    totalCalories(draft) !== Math.round(draft.frozenCalories) ||
    draft.rows.some((r) => r.amount !== r.base.amount)
  );
}

/** What the commit would append, in one line, for the debug strip. */
export function snapshotLine(draft: Draft): string {
  return `retract ${draft.id.slice(0, 12)}… → append instantiation{based_on:${draft.based_on.slice(0, 14)}…, yield:1, rows:${draft.rows.length}} metrics.calories=${totalCalories(draft)}`;
}

// ── The add-an-ingredient stub ──────────────────────────────────────────────
//
// A real inline "add" reaches the food search, which is a whole screen of its
// own and the thing every one of these variants would have to find room for.
// The prototype stands three foods in for it, so the AFFORDANCE can be judged
// (where the control sits, what the list does when a row arrives) without the
// search being in the way of looking at it.

export interface PantryItem {
  ref: string;
  name: string;
  amount: number;
  unit: AmountUnit;
  calories: number;
}

export const PANTRY: PantryItem[] = [
  {
    ref: "fdc:171413",
    name: "Olive oil",
    amount: 15,
    unit: "g",
    calories: 133,
  },
  {
    ref: "fdc:170000",
    name: "Onion, raw",
    amount: 80,
    unit: "g",
    calories: 32,
  },
  {
    ref: "fdc:173735",
    name: "Chickpeas, cooked",
    amount: 120,
    unit: "g",
    calories: 197,
  },
];

export function addRow(draft: Draft, item: PantryItem): void {
  draft.rows = [
    ...draft.rows,
    {
      key: `k${keySeq++}`,
      ref: item.ref,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      calories: item.calories,
      base: { amount: item.amount, calories: item.calories },
    },
  ];
}

// ── The demo occasion ───────────────────────────────────────────────────────

/** Whether anything in this day is a Recipe Instantiation. */
function hasInstantiation(groups: Record<string, ConsumptionEvent[]>): boolean {
  return Object.values(groups).some((items) =>
    items.some((i) => i.instantiation)
  );
}

/**
 * A logged recipe that never reaches the ledger, for the days that have none.
 * Its id is the marker every call site tests on — the variants put a "DEMO" tag
 * on it, and the dashboard must never hand it to a real write.
 */
export const DEMO_ID = "consumption:proto-demo";

export function demoEvent(meal_type: MealType): ConsumptionEvent {
  const rows = [
    {
      ref: "fdc:173735",
      name: "Chickpeas, cooked",
      amount: 240,
      unit: "g" as AmountUnit,
      calories: 394,
    },
    {
      ref: "fdc:168462",
      name: "Spinach, raw",
      amount: 120,
      unit: "g" as AmountUnit,
      calories: 28,
    },
    {
      ref: "fdc:170000",
      name: "Onion, raw",
      amount: 110,
      unit: "g" as AmountUnit,
      calories: 44,
    },
    {
      ref: "fdc:171413",
      name: "Olive oil",
      amount: 22,
      unit: "g" as AmountUnit,
      calories: 195,
    },
    {
      ref: "fdc:170931",
      name: "Tomatoes, tinned",
      amount: 400,
      unit: "g" as AmountUnit,
      calories: 72,
    },
    {
      ref: "custom:cumin",
      name: "Cumin, ground",
      amount: 1,
      unit: "serving" as AmountUnit,
      calories: 8,
    },
  ];
  const calories = rows.reduce((s, r) => s + r.calories, 0);
  return {
    id: DEMO_ID,
    time: Date.now(),
    type: "consumption",
    target: "recipe:proto-demo",
    quantity: "1 serving",
    meal_type,
    // The mark rides the NAME rather than the row's second line: that line
    // truncates on a phone, and a demo row has to stay identifiable there.
    foodName: "Chickpea & spinach stew (DEMO)",
    calories,
    protein: 34,
    fat: 41,
    carbs: 96,
    metrics: { calories, protein: 34, fat: 41, carbs: 96 },
    instantiation: {
      based_on: "recipe:proto-demo",
      yield: 1,
      ingredients: rows.map((r) => ({ ...r, protein: 0, fat: 0, carbs: 0 })),
    },
  };
}

/**
 * The day as the variants should see it: untouched when it already carries a
 * logged recipe, and with one demo occasion in lunch when it does not. Called
 * only while a variant is on.
 */
export function withDemo(
  groups: Record<MealType, ConsumptionEvent[]>
): Record<MealType, ConsumptionEvent[]> {
  if (hasInstantiation(groups)) return groups;
  return { ...groups, lunch: [...groups.lunch, demoEvent("lunch")] };
}

/**
 * What the app's own amount sheet needs to open on a frozen row: a food-twin
 * payload with a nutrition panel and a basis to scale against.
 *
 * **The ledger first.** A row whose ingredient twin is still there resolves
 * through `ingredientFromTwin`, exactly as `seedRowFromRef` does for the real
 * instantiation editor, so the sheet gets the food's real panel, its portions
 * and its source marks.
 *
 * **A panel synthesised from the frozen row otherwise** — every demo row, and
 * any real row whose ingredient has been deleted since. `seedRowFromRef`'s own
 * fallback is per-SERVING, which would open a gram row's picker at "240
 * servings"; the frozen row knows better than that, because it carries both an
 * amount and the kcal at that amount. Dividing one by the other gives a per-100
 * basis, which puts the sheet in the unit the row is actually in (ADR-0060 §1
 * reads the unit off `serving_size`). Nothing is claimed beyond calories: the
 * prototype only moves kcal.
 */
export async function ingredientFor(row: DraftRow): Promise<RecipeIngredient> {
  // A read that throws is the same case as a twin that is gone: the row still
  // has to open. Swallowed rather than handled, because a prototype that cannot
  // open its own picker teaches nothing about the picker.
  const twin = await getLocalFoodTwin(row.ref).catch(() => null);
  const real = ingredientFromTwin(twin, row.amount, row.unit);
  if (real) return real;
  const measured = row.unit !== "serving" && row.base.amount > 0;
  const info: NutritionInfo = measured
    ? {
        serving_size: `100 ${row.unit}`,
        calories: roundFood((row.base.calories / row.base.amount) * 100),
      }
    : { serving_size: PER_SERVING, calories: roundFood(row.base.calories) };
  return {
    entity: row.ref,
    name: row.name,
    amount: row.amount,
    unit: row.unit,
    payload: {
      entity: row.ref,
      attributes: { "food/name": row.name, "nutrition/info": info },
    },
  };
}

/**
 * The commit, stubbed. The real one is `correctInstantiation` — append a
 * superseding instantiation, retract the old (ADR-0008, ADR-0022) — and wiring
 * it here would answer a question the ledger already answers. This just makes
 * the edit the new baseline, so the surface behaves as though the write landed
 * and `isDirty` goes quiet.
 *
 * **Called by every act in variant F**, which is the write model that was
 * chosen: the amount sheet's Done, the ✕, and an added row each commit on their
 * own, exactly as a logged food does. So the tally it keeps is a count of real
 * retract-and-replace pairs the shipped version would write.
 */
export function pretendCommit(draft: Draft): void {
  for (const row of draft.rows) {
    row.base = { amount: row.amount, calories: row.calories };
  }
  draft.frozenCalories = totalCalories(draft);
  draft.writes += 1;
}
