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
 * Every unit a serving-size string may name, with what one of it amounts to in
 * that unit's standard unit.
 *
 * It is Open Food Facts' own vocabulary, derived from `taxonomies/units.txt`
 * (read 2026-09-15): every entry whose `standard_unit:en` is `g` or `ml`, with
 * that entry's `conversion_factor:en`, and every one of its synonyms in any
 * language that is written in unaccented Latin letters. 303 spellings over
 * twelve units, and no two of them disagree about what they mean.
 *
 * The source matters twice over. `serving_quantity` exists at all only where
 * `normalize_serving_size` matched a unit from this vocabulary, and the value it
 * holds has already been converted to the standard unit by `unit_to_g($q, $u)` —
 * so reading the sole token's standard unit is reading the unit the quantity
 * beside it is actually in.
 *
 * The breadth is load-bearing rather than thorough for its own sake, and it is
 * what {@link soleMagnitudeUnit} needs: `30 gramos` is grams to OFF and a
 * `g`-and-`ml` reader would refuse it, losing a portion that was never wrong.
 * It cuts the other way too — a token this table cannot spell is invisible, and
 * an invisible token cannot be the second magnitude that refuses `15 gr + 250mL`.
 *
 * Two families are deliberately left out. OFF gives `cup`/`tasse`, the teaspoon
 * and the pinch a fixed conversion too, but those are household measures whose
 * millilitres are a convention rather than a measurement: a cereal label reading
 * `1 cup (30 g)` is one serving stated two ways, and admitting the cup would turn
 * the commonest good label into a refusal. `metric-pound` is a taxonomy id nobody
 * writes on a pack.
 */
interface UnitSpellings {
  amount: number;
  unit: MeasuredUnit;
  /**
   * How the unit is written. Where one spelling separates words with spaces or
   * dots, it is the most-separated form OFF lists: {@link MAGNITUDE_TOKEN} makes
   * every separator optional, so `fl. oz.` also matches `fl oz`, `fl.oz` and
   * `floz`, and {@link normaliseUnit} folds all four back to one key.
   */
  spellings: readonly string[];
}

const UNITS: readonly UnitSpellings[] = [
  // microgram — one is 0.000001 g
  {
    amount: 0.000001,
    unit: "g",
    spellings: [
      "mcg",
      "mcgs",
      "micogram",
      "microgam",
      "microgram",
      "micrograma",
      "microgramas",
      "micrograme",
      "microgramme",
      "microgrammes",
      "microgrammi",
      "microgrammo",
      "microgramo",
      "microgramos",
      "micrograms",
      "mikrogram",
      "mikrograma",
      "mikrogramai",
      "mikrogramas",
      "mikrogrami",
      "mikrogramm",
      "mikrogramma",
      "mikrogrammaa",
      "mikrogrammi",
      "mikrogramov",
      "mikrogramu",
      "mikrogramy",
    ],
  },
  // milligram — one is 0.001 g
  {
    amount: 0.001,
    unit: "g",
    spellings: [
      "mg",
      "mgs",
      "miligam",
      "miligram",
      "miligrama",
      "miligramai",
      "miligramas",
      "miligrame",
      "miligrami",
      "miligramo",
      "miligramos",
      "miligramov",
      "miligramu",
      "miligramy",
      "milligram",
      "milligramm",
      "milligramma",
      "milligrammaa",
      "milligramme",
      "milligrammes",
      "milligrammi",
      "milligrammo",
      "milligrams",
    ],
  },
  // gram — one is 1 g
  {
    amount: 1,
    unit: "g",
    spellings: [
      "g",
      "gam",
      "gm",
      "gr",
      "gram",
      "grama",
      "gramai",
      "gramas",
      "grame",
      "grami",
      "gramm",
      "gramma",
      "grammaa",
      "gramme",
      "grammes",
      "grammi",
      "grammo",
      "gramo",
      "gramos",
      "gramov",
      "grams",
      "gramu",
      "gramy",
      "grm",
      "grs",
    ],
  },
  // oz — one is 28.349523125 g
  {
    amount: 28.349523125,
    unit: "g",
    spellings: [
      "mga ounce",
      "once",
      "onces",
      "oncia",
      "ons",
      "onz",
      "onza",
      "onzas",
      "ounce",
      "ounces",
      "owns",
      "ownsi",
      "ownsiau",
      "oz",
      "ozs",
      "unca",
      "unce",
      "unces",
      "uncia",
      "uncie",
      "uncijos",
      "uncja",
      "uncje",
      "uns",
      "unsar",
      "unssi",
      "unssia",
      "unts",
      "untsid",
      "unze",
      "unzen",
    ],
  },
  // pound — one is 453.59237 g
  {
    amount: 453.59237,
    unit: "g",
    spellings: [
      "font",
      "fontok",
      "funt",
      "funte",
      "funti",
      "funty",
      "lb",
      "lbs",
      "libbra",
      "libbre",
      "liber",
      "libra",
      "libras",
      "libry",
      "lire",
      "livre",
      "livres",
      "mga pound",
      "nael",
      "naela",
      "paun",
      "paunat",
      "pauni",
      "pfund",
      "ponden",
      "pound",
      "pounds",
      "pund",
      "punt",
      "punti",
      "pwysau",
      "svarai",
      "svaras",
    ],
  },
  // kilogram — one is 1000 g
  {
    amount: 1000,
    unit: "g",
    spellings: [
      "chilogrammi",
      "chilogrammo",
      "kg",
      "kgr",
      "kgs",
      "kilo",
      "kilogram",
      "kilograma",
      "kilogramai",
      "kilogramas",
      "kilograme",
      "kilogrami",
      "kilogramm",
      "kilogramma",
      "kilogrammaa",
      "kilogramme",
      "kilogrammes",
      "kilogrammi",
      "kilogramo",
      "kilogramos",
      "kilogramov",
      "kilograms",
      "kilogramu",
      "kilogramy",
      "kilos",
      "quilograma",
      "quilogramas",
      "quilograms",
    ],
  },
  // milliliter — one is 1 ml
  {
    amount: 1,
    unit: "ml",
    spellings: [
      "mililitr",
      "mililitra",
      "mililitre",
      "mililitreler",
      "mililitri",
      "mililitrs",
      "mililitru",
      "mililitry",
      "milliliiter",
      "milliliitrit",
      "millilit",
      "millilita",
      "milliliter",
      "milliliters",
      "millilitra",
      "millilitraa",
      "millilitrai",
      "millilitras",
      "millilitrau",
      "millilitre",
      "millilitres",
      "millilitri",
      "millilitro",
      "millilitros",
      "ml",
      "mls",
    ],
  },
  // centiliter — one is 10 ml
  {
    amount: 10,
    unit: "ml",
    spellings: [
      "centilit",
      "centiliter",
      "centiliters",
      "centilitr",
      "centilitra",
      "centilitrai",
      "centilitras",
      "centilitrau",
      "centilitre",
      "centilitres",
      "centilitri",
      "centilitro",
      "centilitros",
      "centilitrs",
      "centilitru",
      "centilitry",
      "centylitr",
      "cl",
      "cls",
      "santilitre",
      "santilitreler",
      "sentilita",
      "senttilitra",
      "senttilitraa",
      "tsentiliiter",
      "tsentiliitrit",
      "zentiliter",
    ],
  },
  // fluid ounce — one is 29.5735 ml
  {
    amount: 29.5735,
    unit: "ml",
    spellings: [
      "fl. oz.",
      "fluid ounce",
      "fluid ounces",
      "fluid uncia",
      "fluidunze",
      "fluidunzen",
      "nestetuumaa",
      "once liquide",
      "onces liquides",
      "oncia liquida",
      "owns lliw",
      "ownsi ya maji",
      "ownsi za maji",
      "ownsiau lliw",
      "oza",
      "skystasis uncijas",
      "uncie lichide",
      "vedelikuunts",
      "vedelikuuntse",
    ],
  },
  // deciliter — one is 100 ml
  {
    amount: 100,
    unit: "ml",
    spellings: [
      "deciliiter",
      "deciliitrit",
      "deciliter",
      "deciliters",
      "decilitr",
      "decilitra",
      "decilitrai",
      "decilitras",
      "decilitrau",
      "decilitre",
      "decilitri",
      "decilitro",
      "decilitros",
      "decilitrs",
      "decilitru",
      "decilitry",
      "decylitr",
      "desiliter",
      "desilitra",
      "desilitraa",
      "deziliter",
      "dl",
      "dls",
    ],
  },
  // liter — one is 1000 ml
  {
    amount: 1000,
    unit: "ml",
    spellings: [
      "l",
      "liiter",
      "liitrit",
      "lita",
      "litar",
      "litara",
      "liter",
      "liters",
      "litr",
      "litra",
      "litraa",
      "litrai",
      "litras",
      "litre",
      "litres",
      "litri",
      "litro",
      "litros",
      "litrov",
      "litru",
      "litry",
      "ls",
    ],
  },
  // gallon — one is 3785.41 ml
  {
    amount: 3785.41,
    unit: "ml",
    spellings: [
      "gal",
      "gallon",
      "gallona",
      "gallone",
      "galloneid",
      "gallonen",
      "galloni",
      "gallonia",
      "gallonok",
      "gallons",
      "galon",
      "galonai",
      "galonas",
      "galones",
      "galoni",
      "galony",
      "gals",
      "galwyn",
      "mga gallon",
    ],
  },
];

/** Folds a matched unit token onto its {@link UNITS} spelling. */
function normaliseUnit(token: string): string {
  return token.toLowerCase().replace(/[.\s]/g, "");
}

/** What one of each spelling amounts to, keyed by {@link normaliseUnit}. */
const UNIT_MAGNITUDES = new Map<string, Magnitude>(
  UNITS.flatMap(({ amount, unit, spellings }) =>
    spellings.map((spelling): [string, Magnitude] => [
      normaliseUnit(spelling),
      { amount, unit },
    ])
  )
);

/**
 * A number glued to one of {@link UNITS}' spellings. The alternation runs longest
 * spelling first so `grammes` is not read as a bare `gr` and `lbs` not as a bare
 * `l`, every separator inside a spelling is optional, and every token ends on a
 * word boundary so `200 ml lait` yields millilitres while `1 lait` yields nothing.
 */
const MAGNITUDE_TOKEN = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${UNITS.flatMap(({ spellings }) => spellings)
    .sort((a, b) => b.length - a.length)
    .map((spelling) => spelling.replace(/[.\s]+/g, "[.\\s]*"))
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
    const unit = UNIT_MAGNITUDES.get(normaliseUnit(spelling));
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
