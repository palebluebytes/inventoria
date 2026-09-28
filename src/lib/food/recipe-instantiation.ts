import {
  deriveIngredientMacros,
  type IngredientSource,
  type ReferenceIngredient,
} from "./recipe-nutrition";
import type { AmountUnit, NutritionBreakdown } from "./nutrition";
import { sanitizeWeight } from "./batch-weight";

/**
 * One ingredient of a logged Recipe Instantiation, frozen (ADR-0022). It keeps
 * the pure `{ ref, amount, unit }` reference **plus** two things a bare reference
 * cannot survive on its own: a denormalized `name` for display resilience, and
 * the row's macros captured at log time. Freezing the macros is deliberate — a
 * logged occasion is a historical reading, so it must stay internally consistent
 * with its headline `event/metrics` and never move when the ingredient twin is
 * later corrected, renamed, or deleted. `ref` is retained but soft (may dangle).
 * The `{ calories, protein, fat, carbs }` headline matches `event/metrics`, and
 * the row carries the same full breakdown — every extra nutrient the ingredient
 * reported, scaled to its amount (ADR-0030 / #28) — a nutrient the ingredient
 * omitted stays absent, never 0.
 */
export interface InstantiationRow extends NutritionBreakdown {
  ref: string;
  name: string;
  amount: number;
  unit: AmountUnit;
}

/**
 * The `event/instantiation` blob on a Consumption Event (ADR-0022): a
 * self-contained snapshot of the one occasion a recipe was cooked. `based_on` is
 * the template it was seeded from (equal to `event/target`); `yield` is the
 * batch division used to reach the per-serving headline; `ingredients` are the
 * frozen rows. The projection reads this snapshot instead of live-deriving from
 * the (mutable) template, so logged history is immutable.
 */
export interface Instantiation {
  based_on: string;
  yield: number;
  ingredients: InstantiationRow[];
  /**
   * What the finished batch weighed, in grams, when the cook weighed one
   * (ADR-0106 §5). The rows are a fraction of it, so freezing it is what makes
   * this snapshot a self-contained historical reading: a logged occasion says
   * 160 g of a 480 g pot, and a correction reopening the editor to say
   * "actually I ate 200 g" has something to divide against. Without it the
   * snapshot would carry a numerator whose denominator is gone.
   *
   * Absent on every occasion nobody weighed, which is ordinary: the serving
   * count is the honest answer there (§7), and a zero would read as a
   * measurement the cook never took.
   */
  batch_weight?: number;
}

/**
 * Freezes a Recipe Instantiation snapshot from the live editor's reference
 * ingredients (ADR-0022) — the pure "snapshot on write" step. Each row's macros
 * are derived by the SAME {@link deriveIngredientMacros} formula the builder row
 * display and the headline `deriveRecipeNutrition` use, so the frozen rows sum
 * exactly to the batch total the headline is `÷ yield` of. `resolve` yields each
 * referenced twin's nutrition panel; `resolveName` its display name, denormalized
 * onto the row (falling back to the raw `ref` if the twin cannot be resolved);
 * it yields the twin's panel and density together, because a row's amount may be
 * stated in a unit that panel's basis is not (ADR-0108 §7).
 * Yield is only carried here, not applied to the rows: the rows are the batch as
 * cooked, and dividing by yield happens once, in the headline.
 *
 * `batch_weight` is what the caller's surface said the finished dish weighed,
 * carried onto the snapshot beside the rows it sized (ADR-0106 §5). It is
 * carried and never derived: a pot does not weigh what went into it, so the row
 * sum is a different quantity and could not stand in for it.
 */
export function buildInstantiation(
  based_on: string,
  ingredients: ReferenceIngredient[],
  recipeYield: number,
  resolve: (ref: string) => IngredientSource | undefined,
  resolveName: (ref: string) => string | undefined,
  batch_weight?: number
): Instantiation {
  const rows: InstantiationRow[] = ingredients.map((ing) => ({
    ref: ing.ref,
    name: resolveName(ing.ref) ?? ing.ref,
    amount: ing.amount,
    unit: ing.unit,
    ...deriveIngredientMacros(ing, resolve),
  }));
  const weighed = sanitizeWeight(batch_weight);
  return {
    based_on,
    yield: recipeYield > 0 ? recipeYield : 1,
    ingredients: rows,
    // Spread rather than assigned, so an unweighed occasion carries no key at
    // all. `batch_weight: undefined` would survive into the stored JSON shape
    // as a denominator that is present and unusable.
    ...(weighed !== undefined ? { batch_weight: weighed } : {}),
  };
}

/**
 * What to call a dish nobody named: its frozen ingredient rows, in the order
 * they were cooked in — "Olive oil, Lemon, Mustard" (ADR-0110 §3).
 *
 * The snapshot is the right source because it already denormalizes a
 * per-ingredient `name` for display resilience (ADR-0022 §2), so the label is
 * per-occasion, survives the twin being renamed or deleted, and needs no second
 * read. Names are joined exactly as they were frozen: they are what the
 * ingredient twins say, and lowercasing the tail to make the list read as a
 * sentence would quietly demote every brand and proper noun in it.
 *
 * **Nothing is stored.** A label written back to `recipe/name` would masquerade
 * as authorship — editable, promotable, indistinguishable from a name you typed
 * — and would put the dish in the library, which is the one place ADR-0110 §2
 * keeps it out of.
 *
 * `undefined` where there is no snapshot, which is every plain food log: those
 * have a twin to read a name off, and a nameless one is a row with nothing to
 * show rather than a dish to describe (#485).
 */
export function labelFromInstantiation(
  instantiation: Instantiation | undefined
): string | undefined {
  const names = instantiation?.ingredients.map((row) => row.name);
  return names?.length ? names.join(", ") : undefined;
}
