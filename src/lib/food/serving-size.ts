// ---------------------------------------------------------------------------
// What a source's serving-size string actually names (ADR-0052 §2 Amendment)
// ---------------------------------------------------------------------------
//
// Open Food Facts derives `serving_quantity` and `serving_quantity_unit` from
// the same `serving_size` string with two different regexes, and they disagree
// about which token wins: one prefers the last number+unit in the string, the
// other the first (openfoodfacts-server#7768, open). Where the string names one
// magnitude that disagreement is invisible, because both tokens say the same
// thing. Where it names two — `15g + 250mL`, a powder and the milk you prepare
// it with — the number and the unit can come from different tokens, and the
// number is usually the liquid rather than the food.
//
// Nothing here repairs such a string. The question this module answers is only
// whether a serving-size string is one the fields derived from it can be trusted
// against; #433 measured that re-reading the unit out of it produces a different
// wrong answer rather than a right one, so the caller's response to a `true` is
// to drop the portion (`offPortions`).
//
// This is deliberately NOT `nutrition.ts`'s `BASIS_QUANTITY` / `basisUnit` pair,
// which is anchored `^…$` over a whole string and knows only `g` and `ml`. That
// pair reads a panel basis THIS app wrote (`"100 ml"`); this reads a foreign
// label token by token, in ounces and litres the app never writes and never
// stores. Two questions, and the narrow one stays narrow.
// ---------------------------------------------------------------------------

import type { MeasuredUnit } from "./nutrition";

/**
 * A number a label names, in one of the two units a magnitude can be compared
 * in. `amount` is grams for a `"g"` and millilitres for an `"ml"`, so two
 * magnitudes of the same unit are directly comparable however they were spelled.
 */
interface Magnitude {
  amount: number;
  unit: MeasuredUnit;
}

/**
 * What one of each unit a serving-size string uses amounts to. `oz` and `lb` are
 * the international avoirdupois definitions, which is what a US label's `(3 oz)`
 * restates, and `floz` is the US fluid ounce rather than the imperial one.
 *
 * This table is the whole unit vocabulary: {@link MAGNITUDE_TOKEN} is built from
 * its keys, so a unit cannot be matched without being convertible, and adding one
 * is one line here rather than a line here and a branch in a regex.
 */
const UNITS: Record<string, Magnitude> = {
  mg: { amount: 0.001, unit: "g" },
  g: { amount: 1, unit: "g" },
  kg: { amount: 1000, unit: "g" },
  oz: { amount: 28.349523125, unit: "g" },
  lb: { amount: 453.59237, unit: "g" },
  lbs: { amount: 453.59237, unit: "g" },
  ml: { amount: 1, unit: "ml" },
  cl: { amount: 10, unit: "ml" },
  dl: { amount: 100, unit: "ml" },
  l: { amount: 1000, unit: "ml" },
  floz: { amount: 29.5735295625, unit: "ml" },
};

/**
 * How a key above is written on a label, where that differs from the key. Only
 * the fluid ounce does: it arrives as `fl oz` or `fl. oz`, which
 * {@link readMagnitudes} normalises back to the key by dropping dots and spaces.
 */
const SPELLINGS: Record<string, string> = { floz: "fl\\.?\\s*oz" };

/**
 * A number glued to one of {@link UNITS}' units. The alternation runs longest key
 * first so `lbs` is not read as a bare `l`, and every token ends on a word
 * boundary so `200 ml lait` yields millilitres while `1 lait` yields nothing.
 */
const MAGNITUDE_TOKEN = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${Object.keys(UNITS)
    .sort((a, b) => b.length - a.length)
    .map((key) => SPELLINGS[key] ?? key)
    .join("|")})\\b`,
  "gi"
);

/**
 * How far apart two tokens may stand and still be one magnitude restated. A label
 * rounds its conversion to a number a person reads, and rounding to the nearest
 * nice one is worth more than a percent or two: `1 oz (28 g)` is 1.2% out but
 * `2 oz (60 g)` is 5.5% and `250 ml (8 fl oz)` 5.4%, and all three are one
 * magnitude said twice. Measured across the dual-unit shapes a US label
 * mandates, the widest is 5.5%; the same-unit disagreements this rule exists to
 * catch stand 96% apart or more (`8 ml (240 ML)`, `33.8 ml (1 L)`), and a
 * disagreement across units is refused on the unit whatever the tolerance. So
 * the number is set above every rounding rather than below the nearest defect.
 */
const RESTATEMENT_TOLERANCE = 0.1;

function readMagnitudes(serving_size: string): Magnitude[] {
  const magnitudes: Magnitude[] = [];
  // OFF's own normaliser reads a comma as a decimal point (`2,998 Oz` is just
  // under three ounces), so a thousands separator is not a reading available
  // here; taking the other one would refuse the dual-unit labels §2 keeps.
  for (const [, digits, spelling] of serving_size.matchAll(MAGNITUDE_TOKEN)) {
    const amount = Number(digits.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const unit = UNITS[spelling.toLowerCase().replace(/[.\s]/g, "")];
    if (!unit) continue;
    magnitudes.push({ amount: amount * unit.amount, unit: unit.unit });
  }
  return magnitudes;
}

/** True when `b` is `a` said again — same unit, same size to a label's rounding. */
function restates(a: Magnitude, b: Magnitude): boolean {
  if (a.unit !== b.unit) return false;
  const spread = Math.abs(a.amount - b.amount);
  return spread <= RESTATEMENT_TOLERANCE * Math.max(a.amount, b.amount);
}

/**
 * True when `serving_size` names two number+unit tokens that are not the same
 * magnitude said twice — so a quantity parsed out of it cannot say which of them
 * it came from, and neither can the unit parsed beside it.
 *
 * False for a string naming one magnitude however many times it restates it, and
 * for one naming none at all, which is what a label like `"1 serving"` does and
 * leaves a portion exactly as it was. See ADR-0052 §2's Amendment (#433).
 */
export function namesMoreThanOneMagnitude(
  serving_size: string | undefined
): boolean {
  if (!serving_size) return false;
  const [first, ...rest] = readMagnitudes(serving_size);
  if (first === undefined) return false;
  return rest.some((magnitude) => !restates(first, magnitude));
}
