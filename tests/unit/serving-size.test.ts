import { describe, it, expect } from "vitest";
import {
  namesMoreThanOneMagnitude,
  soleMagnitudeUnit,
} from "../../src/lib/food/serving-size";

// The rule behind #433: a source's serving-size string that names more than one
// distinct magnitude cannot say which of them the quantity beside it was read
// from, so the portion built from that quantity is not trustworthy. Every string
// below is a real `serving_size` from Open Food Facts, quoted in #433's audit.
describe("namesMoreThanOneMagnitude", () => {
  it("is false for a string naming no magnitude at all", () => {
    // Nothing to disagree with. A label OFF could parse no unit out of — "1
    // serving", "15 biscuits" — leaves the portion exactly as it was.
    expect(namesMoreThanOneMagnitude(undefined)).toBe(false);
    expect(namesMoreThanOneMagnitude("")).toBe(false);
    expect(namesMoreThanOneMagnitude("1 serving")).toBe(false);
    expect(namesMoreThanOneMagnitude("15 biscuits")).toBe(false);
  });

  it("is false for a string naming exactly one", () => {
    expect(namesMoreThanOneMagnitude("100 g")).toBe(false);
    expect(namesMoreThanOneMagnitude("1 can (330 ml)")).toBe(false);
    expect(namesMoreThanOneMagnitude("30g")).toBe(false);
  });

  it("is false for a magnitude restated in its own unit", () => {
    // The harmless shape: the parenthesis re-says the figure it follows.
    expect(
      namesMoreThanOneMagnitude("35.7 g (1 tranche (environ 35.7 g))")
    ).toBe(false);
  });

  it("is false for a magnitude restated in another unit", () => {
    // The dual-unit shape US labels mandate. 2.998 oz IS 85 g, so the string
    // names one magnitude however many tokens it takes to say it.
    expect(namesMoreThanOneMagnitude("15 biscuits (85g/2,998 Oz)")).toBe(false);
    expect(namesMoreThanOneMagnitude("1 oz (28 g)")).toBe(false);
    expect(namesMoreThanOneMagnitude("14 g (0.5 oz)")).toBe(false);
    expect(namesMoreThanOneMagnitude("8 fl oz (240 ml)")).toBe(false);
  });

  it("is false for a restatement rounded to a number a person reads", () => {
    // The tolerance has to clear a label's own rounding, not just a precise
    // conversion. 8 fl oz is 236.6 ml and 2 oz is 56.7 g; both are printed as
    // the round number beside them, 5.4% and 5.5% out, and both are one
    // magnitude said twice.
    expect(namesMoreThanOneMagnitude("250 ml (8 fl oz)")).toBe(false);
    expect(namesMoreThanOneMagnitude("2 oz (60 g)")).toBe(false);
    expect(namesMoreThanOneMagnitude("30 g (1 oz)")).toBe(false);
  });

  it("reads a comma as a decimal point, as OFF's own parser does", () => {
    // `2,998 Oz` is 2.998 ounces. Read as two thousand nine hundred and ninety
    // eight it would disagree with the 85 g beside it and cost a good portion.
    expect(namesMoreThanOneMagnitude("85 g (2,998 Oz)")).toBe(false);
    expect(namesMoreThanOneMagnitude("1,5 L (1500 ml)")).toBe(false);
  });

  it("is true for a weight and a volume standing side by side", () => {
    // 19105994, the product #433 opens with: the 250 came from `250mL` and the
    // unit beside it says `g`.
    expect(namesMoreThanOneMagnitude("15g + 250mL")).toBe(true);
    expect(namesMoreThanOneMagnitude("15g + 200ml de lait")).toBe(true);
    expect(
      namesMoreThanOneMagnitude("60 g + 100 ml lait d'amande calcium Bjorg")
    ).toBe(true);
    expect(
      namesMoreThanOneMagnitude("200 ml semi-skimmed milk + 15 g powder")
    ).toBe(true);
    expect(namesMoreThanOneMagnitude("15 g (1 bol de 200 ml)")).toBe(true);
    expect(
      namesMoreThanOneMagnitude("221.4 g (1 tasse (15 g + 200 ml de lait…))")
    ).toBe(true);
  });

  it("is true for two magnitudes in one unit", () => {
    // `205 ml (4 g + 200 ml …)`: OFF's quantity is the milk, not the product.
    expect(
      namesMoreThanOneMagnitude("205 ml (4 g + 200 ml de lait demi-écrémé)")
    ).toBe(true);
    // The absent-unit rows the rule catches incidentally (#433's own note): a
    // volume that would otherwise have been stored as a weight.
    expect(namesMoreThanOneMagnitude("8 ml (240 ML)")).toBe(true);
    expect(namesMoreThanOneMagnitude("33.8 ml (1 L)")).toBe(true);
    expect(namesMoreThanOneMagnitude("180 ml (15 g)")).toBe(true);
  });

  it("ignores a token whose number is not a usable magnitude", () => {
    // A zero names nothing; it must not become a second magnitude that refuses
    // an otherwise fine string.
    expect(namesMoreThanOneMagnitude("0 g (100 g)")).toBe(false);
  });

  it("reads a unit spelling OFF knows and this app's own basis reader does not", () => {
    // The vocabulary is OFF's `taxonomies/units.txt`, not `g`/`ml`. A token the
    // reader cannot spell is invisible, and an invisible token cannot be the
    // second magnitude that refuses a string — so a narrow vocabulary would let
    // exactly the French shapes #433 measured through.
    expect(namesMoreThanOneMagnitude("15 gr + 250 mL")).toBe(true);
    expect(namesMoreThanOneMagnitude("60 grammes + 100 millilitres")).toBe(
      true
    );
    expect(namesMoreThanOneMagnitude("1 kilogramme + 200 ml de lait")).toBe(
      true
    );
    // And it converts across the widened vocabulary, so a restatement in two of
    // its units is still one magnitude: 2.2 lbs IS 1 kilo.
    expect(namesMoreThanOneMagnitude("1 kilo (2,2 lbs)")).toBe(false);
  });

  it("leaves a household measure out of the vocabulary", () => {
    // OFF prices a cup at 240 ml and a `tasse` the same, but those millilitres
    // are a convention. `1 cup (30 g)` is one serving stated two ways, and the
    // commonest good US label would otherwise become a refusal.
    expect(namesMoreThanOneMagnitude("1 cup (30 g)")).toBe(false);
    expect(namesMoreThanOneMagnitude("1 tasse (250 ml)")).toBe(false);
  });
});

describe("soleMagnitudeUnit", () => {
  it("is the unit of the one magnitude the string names", () => {
    expect(soleMagnitudeUnit("240 ml")).toBe("ml");
    expect(soleMagnitudeUnit("1 bouteille (33 cl)")).toBe("ml");
    expect(soleMagnitudeUnit("30 gr")).toBe("g");
    expect(soleMagnitudeUnit("1 lb")).toBe("g");
  });

  it("is the STANDARD unit, which is what OFF's quantity is already in", () => {
    // `normalize_serving_size` returns `unit_to_g($q, $u)`, so a `33 cl` serving
    // arrives as the number 330 and the unit to read is millilitres, not
    // centilitres. The same for `2 oz`, which arrives as 56.7 grams.
    expect(soleMagnitudeUnit("33 cl")).toBe("ml");
    expect(soleMagnitudeUnit("2 oz")).toBe("g");
    expect(soleMagnitudeUnit("8 fl oz")).toBe("ml");
  });

  it("is undefined where the label names no unit at all", () => {
    expect(soleMagnitudeUnit(undefined)).toBeUndefined();
    expect(soleMagnitudeUnit("1 portion")).toBeUndefined();
    expect(soleMagnitudeUnit("15 biscuits")).toBeUndefined();
  });

  it("refuses to pick where the label names several", () => {
    // The evidence of last resort declines rather than guesses: re-reading the
    // unit out of a multi-magnitude string was measured and rejected (#433).
    expect(soleMagnitudeUnit("15g + 250mL")).toBeUndefined();
    expect(soleMagnitudeUnit("8 ml (240 ML)")).toBeUndefined();
  });

  it("reads the unit in any language OFF spells in Latin letters", () => {
    // The vocabulary is all 303 Latin-script synonyms in OFF's units taxonomy,
    // not the English and French ones. Narrower, and a Spanish or German label
    // with no stated unit loses a portion that was never wrong.
    expect(soleMagnitudeUnit("30 gramos")).toBe("g");
    expect(soleMagnitudeUnit("30 Gramm")).toBe("g");
    expect(soleMagnitudeUnit("30 grammi")).toBe("g");
    expect(soleMagnitudeUnit("1 litro")).toBe("ml");
    expect(soleMagnitudeUnit("250 millilitros")).toBe("ml");
  });

  it("folds every spelling of a unit onto one meaning", () => {
    // OFF lists `fl oz`, `floz`, `fl.oz`, `fl. oz`, `fl. oz.` and `fl.oz.`. The
    // table carries the most-separated form and the matcher makes each separator
    // optional, so one entry covers all six.
    for (const label of [
      "8 fl oz",
      "8 floz",
      "8 fl.oz",
      "8 fl. oz.",
      "8 FL OZ",
    ])
      expect(soleMagnitudeUnit(label)).toBe("ml");
  });

  it("answers through a restatement, which names one magnitude", () => {
    expect(soleMagnitudeUnit("15 biscuits (85g/2,998 Oz)")).toBe("g");
    expect(soleMagnitudeUnit("250 ml (8 fl oz)")).toBe("ml");
  });
});
