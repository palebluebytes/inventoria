/**
 * Scaling an amount by a factor — the calculation behind the ×/÷ controls that
 * rescale every selected Consumption Event on the dashboard and every
 * ingredient of a recipe at once.
 *
 * It is deliberately only the arithmetic: what an amount *is* (grams of a food,
 * servings of a custom ingredient) and what rescaling one *costs* (a
 * retract-and-replace on the ledger, a rederived nutrition panel) belong to the
 * caller. Both call sites share the factor grammar with the amount fields
 * (ADR-0023) by parsing through {@link evaluateAmount}, so "1.5" and "3/2" are
 * the same factor here as they are there.
 */

import { evaluateAmount } from "./amount-expression";
import { roundFood, type AmountUnit } from "./nutrition";

/** Which way a factor is applied to an amount. */
export type ScaleOp = "multiply" | "divide";

/**
 * What one food would read at if a live Scale preview were applied (ADR-0088
 * §5) — the amount, the unit it would be *logged* in, and the kcal figure
 * derived from its panel at that amount.
 *
 * The unit is carried rather than assumed because it is not always the unit the
 * row reads now: a weightless "1 serving" entry against a per-100 panel is
 * written back as a measurement, so the preview has to say so before the write
 * rather than surprise the reader after it.
 */
export interface ScalePreview {
  amount: number;
  unit: AmountUnit;
  calories: number;
}

/** What the factor field starts at — halving and doubling are the common cases. */
export const DEFAULT_SCALE_FACTOR = "2";

/**
 * Reads the factor field into a usable factor, or `null` when it isn't one
 * (yet): an empty or mid-typed field, a malformed expression, and any
 * non-positive value all collapse to the single "not usable" signal the
 * controls disable themselves on. Zero and negatives are rejected rather than
 * clamped — a food logged at −200 g, or scaled away to nothing, is not a
 * correction the user meant to make.
 */
export function parseScaleFactor(input: string): number | null {
  const value = evaluateAmount(input);
  if (value === null || value <= 0) return null;
  return value;
}

/**
 * Applies `factor` to one amount, at the stored food precision so a rescaled
 * amount round-trips through an editor unchanged.
 */
export function scaleAmount(
  amount: number,
  factor: number,
  op: ScaleOp
): number {
  const scaled = op === "multiply" ? amount * factor : amount / factor;
  const rounded = roundFood(scaled);
  // A positive amount stays positive: dividing a tiny amount by a large factor
  // would otherwise round to 0 and silently log nothing at all.
  return rounded === 0 && scaled > 0 ? scaled : rounded;
}
