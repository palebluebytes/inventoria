// ---------------------------------------------------------------------------
// What a source's serving-size string actually names (ADR-0052 §2 Amendment)
// ---------------------------------------------------------------------------
//
// Open Food Facts derives `serving_quantity` and `serving_quantity_unit` from
// the same `serving_size` string with two different regexes, and they disagree
// about which token wins. `normalize_serving_size` anchors on a greedy prefix —
// `/^(.*[ \(])?(?<quantity>…)( )?(?<unit>…)\b/i` — so the LAST number+unit in the
// string wins; `extract_standard_unit` runs `parse_quantity_unit` unanchored, so
// the FIRST does (openfoodfacts-server#7768, open; `lib/ProductOpener/Units.pm`,
// read 2026-09-15). Where the string names one magnitude that disagreement is
// invisible, because both tokens say the same thing. Where it names two —
// `15g + 250mL`, a powder and the milk you prepare it with — the number and the
// unit can come from different tokens, and the number is usually the liquid.
//
// Nothing here repairs such a string. Two questions are asked of it, and both
// are read-only: whether it names more than one magnitude, and — when OFF states
// no unit at all — what unit the one magnitude it does name is in.
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
 * What one of each unit a serving-size string uses amounts to — the table
 * {@link MAGNITUDE_TOKEN} is built from, so a unit cannot be matched without
 * being convertible, and adding one is a line here rather than a line here and a
 * branch in a regex.
 *
 * It is Open Food Facts' own vocabulary, read off `taxonomies/units.txt`
 * (2026-09-15): every entry whose `standard_unit:en` is `g` or `ml`, with its
 * `conversion_factor:en` and its `xx:` symbols, restricted to the unaccented
 * Latin spellings plus the English and French synonyms. That source matters
 * twice over. `serving_quantity` exists at all only where
 * `normalize_serving_size` matched a unit from this vocabulary, and the value it
 * holds has already been converted to the standard unit by `unit_to_g($q, $u)` —
 * so reading the sole token's standard unit is reading the unit the quantity
 * beside it is actually in.
 *
 * Two families are deliberately left out. OFF gives `cup`/`tasse`, the teaspoon
 * and the pinch a fixed conversion too, but those are household measures whose
 * millilitres are a convention rather than a measurement: a cereal label reading
 * `1 cup (30 g)` is one serving stated two ways, and admitting the cup would turn
 * the commonest good label into a refusal. `metric-pound` is a taxonomy id nobody
 * writes on a pack, and the microgram's `µg` symbol is outside the Latin subset —
 * `mcg` carries it.
 */
const UNITS: Record<string, Magnitude> = {
  // Mass, standard unit `g`.
  g: { amount: 1, unit: "g" },
  gr: { amount: 1, unit: "g" },
  grs: { amount: 1, unit: "g" },
  grm: { amount: 1, unit: "g" },
  gram: { amount: 1, unit: "g" },
  grams: { amount: 1, unit: "g" },
  gramme: { amount: 1, unit: "g" },
  grammes: { amount: 1, unit: "g" },
  kg: { amount: 1000, unit: "g" },
  kgs: { amount: 1000, unit: "g" },
  kgr: { amount: 1000, unit: "g" },
  kilo: { amount: 1000, unit: "g" },
  kilos: { amount: 1000, unit: "g" },
  kilogram: { amount: 1000, unit: "g" },
  kilograms: { amount: 1000, unit: "g" },
  kilogramme: { amount: 1000, unit: "g" },
  kilogrammes: { amount: 1000, unit: "g" },
  mg: { amount: 0.001, unit: "g" },
  mgs: { amount: 0.001, unit: "g" },
  milligram: { amount: 0.001, unit: "g" },
  milligrams: { amount: 0.001, unit: "g" },
  milligramme: { amount: 0.001, unit: "g" },
  milligrammes: { amount: 0.001, unit: "g" },
  mcg: { amount: 0.000001, unit: "g" },
  mcgs: { amount: 0.000001, unit: "g" },
  microgram: { amount: 0.000001, unit: "g" },
  micrograms: { amount: 0.000001, unit: "g" },
  lb: { amount: 453.59237, unit: "g" },
  lbs: { amount: 453.59237, unit: "g" },
  pound: { amount: 453.59237, unit: "g" },
  pounds: { amount: 453.59237, unit: "g" },
  livre: { amount: 453.59237, unit: "g" },
  livres: { amount: 453.59237, unit: "g" },
  oz: { amount: 28.349523125, unit: "g" },
  ozs: { amount: 28.349523125, unit: "g" },
  onz: { amount: 28.349523125, unit: "g" },
  ounce: { amount: 28.349523125, unit: "g" },
  ounces: { amount: 28.349523125, unit: "g" },
  once: { amount: 28.349523125, unit: "g" },
  onces: { amount: 28.349523125, unit: "g" },
  // Volume, standard unit `ml`.
  ml: { amount: 1, unit: "ml" },
  mls: { amount: 1, unit: "ml" },
  milliliter: { amount: 1, unit: "ml" },
  milliliters: { amount: 1, unit: "ml" },
  millilitre: { amount: 1, unit: "ml" },
  millilitres: { amount: 1, unit: "ml" },
  cl: { amount: 10, unit: "ml" },
  cls: { amount: 10, unit: "ml" },
  centiliter: { amount: 10, unit: "ml" },
  centiliters: { amount: 10, unit: "ml" },
  centilitre: { amount: 10, unit: "ml" },
  centilitres: { amount: 10, unit: "ml" },
  dl: { amount: 100, unit: "ml" },
  dls: { amount: 100, unit: "ml" },
  deciliter: { amount: 100, unit: "ml" },
  deciliters: { amount: 100, unit: "ml" },
  l: { amount: 1000, unit: "ml" },
  ls: { amount: 1000, unit: "ml" },
  liter: { amount: 1000, unit: "ml" },
  liters: { amount: 1000, unit: "ml" },
  litre: { amount: 1000, unit: "ml" },
  litres: { amount: 1000, unit: "ml" },
  floz: { amount: 29.5735295625, unit: "ml" },
  oza: { amount: 29.5735295625, unit: "ml" },
  fluidounce: { amount: 29.5735295625, unit: "ml" },
  fluidounces: { amount: 29.5735295625, unit: "ml" },
  gal: { amount: 3785.41, unit: "ml" },
  gals: { amount: 3785.41, unit: "ml" },
  gallon: { amount: 3785.41, unit: "ml" },
  gallons: { amount: 3785.41, unit: "ml" },
};

/**
 * How a key above is written on a label, where that differs from the key. Two do:
 * OFF's taxonomy lists `fl oz`, `fl.oz`, `fl. oz`, `fl. oz.` and `fl.oz.` for the
 * fluid ounce, and `fluid ounce(s)` spells it out. {@link readMagnitudes}
 * normalises any of them back to the key by dropping dots and whitespace.
 */
const SPELLINGS: Record<string, string> = {
  floz: String.raw`fl\.?\s*oz\.?`,
  fluidounce: String.raw`fluid\s+ounce`,
  fluidounces: String.raw`fluid\s+ounces`,
};

/**
 * A number glued to one of {@link UNITS}' units. The alternation runs longest key
 * first so `grammes` is not read as a bare `gr` and `lbs` not as a bare `l`, and
 * every token ends on a word boundary so `200 ml lait` yields millilitres while
 * `1 lait` yields nothing.
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
 * magnitude said twice. Measured across the dual-unit shapes a US label mandates,
 * the widest is 5.5%; the same-unit disagreements this rule exists to catch stand
 * 96% apart or more (`8 ml (240 ML)`, `33.8 ml (1 L)`), and a disagreement across
 * units is refused on the unit whatever the tolerance. So the number is set above
 * every rounding rather than below the nearest defect.
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

/**
 * The unit of the one magnitude `serving_size` names, or `undefined` where it
 * names none — or names several, which {@link namesMoreThanOneMagnitude} is the
 * question for and which this answers `undefined` to rather than picking.
 *
 * This is the evidence of last resort, for a serving OFF states no
 * `serving_quantity_unit` for at all. It is sound precisely because it is asked
 * only of a single-magnitude string: there is one token, so the quantity and the
 * unit cannot have come from different ones. Re-reading the unit out of a string
 * naming SEVERAL was measured and rejected (#433) — it makes a different wrong
 * answer, not a right one.
 */
export function soleMagnitudeUnit(
  serving_size: string | undefined
): MeasuredUnit | undefined {
  if (!serving_size) return undefined;
  const [first, ...rest] = readMagnitudes(serving_size);
  if (first === undefined) return undefined;
  return rest.every((magnitude) => restates(first, magnitude))
    ? first.unit
    : undefined;
}
