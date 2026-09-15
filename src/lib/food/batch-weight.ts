// What a batch of a recipe weighed, and how one occasion is sized against it
// (ADR-0106). A pot of stew divided into portions is one fact; 250 g of it on a
// plate is another, and neither follows from the other without knowing what the
// pot weighed.
//
// None of this is derivable from the ingredient rows. A pot does not weigh what
// went into it — a stew simmers off water, rice absorbs it, a roast renders — so
// Σ of the raw amounts and the finished weight are different quantities rather
// than approximations of one another (ADR-0106 §7). That is why every number
// here comes from a scale and none of it is computed from the list.

import { roundFood } from "./nutrition";
import { sanitizeYield } from "./recipe-nutrition";

/**
 * Where a Recipe Twin remembers its batch weight: a recipe cooked weekly comes
 * out about the same weight each time, and retyping it is a tax (ADR-0106 §3).
 * It is a **default** and never a governor — an occasion may override it, and
 * that override never reaches back to the template (ADR-0022 §3).
 */
export const RECIPE_BATCH_WEIGHT_ATTR = "recipe/batch_weight";

/**
 * A weight the cook read off a scale, in **grams**, or `undefined` where nothing
 * usable was said.
 *
 * Grams and no `g | ml` union, deliberately (ADR-0106 §2): a batch weight has no
 * Panel to read an Amount Unit off and exactly one honest source, so admitting
 * millilitres would mean asking "which?" about a number that can only have come
 * from one place. A cordial measured in a marked jug is what that loses.
 *
 * Absent rather than zero is the whole point of the return type. "I didn't weigh
 * this" is the standing case and has an honest answer already — the serving
 * count (§7) — so every spelling of it (never entered, cleared mid-type, the
 * `0` an edit writes to clear the attribute, a non-positive figure no scale
 * could show) collapses here to the one signal the callers branch on.
 */
export function sanitizeWeight(value: unknown): number | undefined {
  const grams = Number(value);
  // `Number(null)` and `Number("")` are both 0, which the positivity test takes
  // out along with the cleared field and the clearing sentinel.
  return Number.isFinite(grams) && grams > 0 ? roundFood(grams) : undefined;
}

/**
 * The fraction of the batch this occasion was: what was eaten over what the
 * finished dish weighed (ADR-0106 §1). It is what scales the instantiation's
 * rows, and nothing about it needs converting — the ingredients' own units stop
 * bearing on the question entirely, so a recipe mixing grams and millilitres is
 * sized exactly like one that does not.
 *
 * Undefined until **both** numbers are present. A numerator whose denominator is
 * missing sizes nothing, which is precisely why the denominator is frozen onto
 * the snapshot beside it (§5).
 */
export function occasionFraction(
  portion: unknown,
  batch: unknown
): number | undefined {
  const eaten = sanitizeWeight(portion);
  const cooked = sanitizeWeight(batch);
  return eaten !== undefined && cooked !== undefined
    ? eaten / cooked
    : undefined;
}

/**
 * How many servings the occasion was, read out of the weight rather than typed
 * into (ADR-0106 §6): the fraction of the batch times what the recipe says the
 * batch makes. 250 g of a 400 g serving reads 0.625 of one.
 *
 * `templateYield` is the Recipe Twin's own `recipe/yield`, which the batch
 * weight never derives and is never derived from — 900 g in the pot says nothing
 * about whether the cook thinks in four portions or six (§4). It goes through
 * the one divisor rule every per-serving division uses, so an unusable yield
 * reads as a single-serving batch here exactly as it does everywhere else.
 */
export function servingsOfOccasion(
  portion: unknown,
  batch: unknown,
  templateYield: number | string
): number | undefined {
  const fraction = occasionFraction(portion, batch);
  return fraction === undefined
    ? undefined
    : roundFood(fraction * sanitizeYield(templateYield));
}
