import {
  deriveIngredientMacros,
  type IngredientSource,
  type ReferenceIngredient,
} from "./recipe-nutrition";
import type { AmountUnit, NutritionBreakdown } from "./nutrition";
import type { FrozenPairing } from "./provenance";
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
  /**
   * What a **Pack pairing** on this ingredient's twin supplied into this row's
   * frozen figures (ADR-0113 §6). Nested here, on the row, so `ref` and `name`
   * keep meaning the ingredient twin and the reference food is named separately
   * from it.
   *
   * **A dish carries no `event/pairing` at all** — the account lives per row and
   * nowhere else. A top-level list over the rows was refused because it is not
   * reconstructible: the row's numbers are frozen, so a reader sums the marked
   * rows and divides by the snapshot's own `yield` and gets the exact borrowed
   * share, where a list can only say that somewhere inside a sum something was
   * borrowed. The measurement that decided it (#498, `pnpm recipes:census`): one
   * live occasion froze twelve rows naming four reference foods, and in that dish
   * folate is 100% borrowed and calcium 2.3%. A list would have said both with
   * equal weight.
   *
   * Absent on every unpaired ingredient and on every pairing that filled nothing.
   */
  pairing?: FrozenPairing;
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
 * A row whose twin carries a **Pack pairing** freezes that pairing's account
 * beside its figures, read off the same `resolve` (ADR-0113 §6). A dish writes
 * no `event/pairing`: the account is per row, because the rows are what a reader
 * reconstructs the borrowed share from.
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
  const rows: InstantiationRow[] = ingredients.map((ing) => {
    // The account of what a Pack pairing put into this row's macros, off the
    // same resolver that supplied the panel they were derived from (ADR-0113
    // §6). It travels with the figures or not at all: `resolve` hands back the
    // widened panel and this envelope together, so a row can never carry
    // borrowed numbers with nothing naming them.
    const pairing = resolve(ing.ref)?.pairing;
    return {
      ref: ing.ref,
      name: resolveName(ing.ref) ?? ing.ref,
      amount: ing.amount,
      unit: ing.unit,
      ...deriveIngredientMacros(ing, resolve),
      // Spread rather than assigned, so an unpaired row carries no key at all.
      // `pairing: undefined` would survive into the stored JSON shape as an
      // account of nothing, which §6 reserves for the one meaning it has.
      ...(pairing ? { pairing } : {}),
    };
  });
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
