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
 * A weight as a field holds it while the cook types: a number once there is one,
 * the empty string before that and between two edits. The shape of every weight
 * this module is asked about except the ones it reads back off the ledger, which
 * arrive untyped and are {@link sanitizeWeight}'s alone to narrow.
 */
export type EnteredWeight = number | string | undefined;

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
 *
 * `unknown` rather than {@link EnteredWeight} because this is the boundary: it
 * is handed `recipe/batch_weight` straight off a twin's attribute blob and
 * `batch_weight` off a frozen snapshot, neither of which the type system has
 * ever seen. Narrowing happens here, once, and every sibling below takes the
 * narrow type instead (CODING_STANDARDS §3.2).
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
  portion: EnteredWeight,
  batch: EnteredWeight
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
/**
 * How big one Recipe Instantiation was, as the surface that asked settled it
 * (ADR-0106). Three numbers rather than one because a cook with a scale knows
 * two different facts: a pot divided into portions, and what went on the plate.
 *
 * Nothing here is a divisor. An occasion's rows are scaled before this shape is
 * built, so these say what the occasion *was* rather than doing anything to it.
 */
export interface OccasionSize {
  /**
   * How many servings the occasion was. The fallback quantity, and the only one
   * a recipe nobody weighed has (ADR-0106 §7) — never derived from the row sum,
   * which is a different quantity from a pot's weight.
   */
  servings?: number;
  /** What the finished dish weighed, in grams, frozen onto the snapshot (§5). */
  batch_weight?: number;
  /** How much of that dish was eaten, in grams. The quantity, when present (§8). */
  portion_weight?: number;
}

/** An occasion the cook weighed: both numbers, narrowed and present. */
export interface WeighedOccasion {
  batch_weight: number;
  portion_weight: number;
}

/**
 * The pair, or nothing. A portion is a fraction *of* something, so neither half
 * means anything alone: a portion with no batch behind it is a numerator whose
 * denominator is gone, which is the very state ADR-0106 §5 freezes
 * `batch_weight` to prevent. Both halves present, or the occasion is sized by
 * its count instead.
 *
 * The single reading of that rule. The surface asks it to decide whether it may
 * still be saved, and the write path asks it to decide what reaches the ledger;
 * two spellings of one rule could answer differently and log an occasion the
 * editor thought it had refused.
 */
export function weighedOccasion(
  occasion: OccasionSize
): WeighedOccasion | undefined {
  const batch_weight = sanitizeWeight(occasion.batch_weight);
  const portion_weight = sanitizeWeight(occasion.portion_weight);
  return batch_weight !== undefined && portion_weight !== undefined
    ? { batch_weight, portion_weight }
    : undefined;
}

export function servingsOfOccasion(
  portion: EnteredWeight,
  batch: EnteredWeight,
  templateYield: number | string
): number | undefined {
  const fraction = occasionFraction(portion, batch);
  return fraction === undefined
    ? undefined
    : roundFood(fraction * sanitizeYield(templateYield));
}
