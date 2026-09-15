import { describe, it, expect } from "vitest";
import { namesMoreThanOneMagnitude } from "../../src/lib/food/serving-size";

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
});
