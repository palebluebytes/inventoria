/**
 * What a cook put on the scale, and the arithmetic that sizes one occasion
 * against it (ADR-0106 §1, §2, §5, §6).
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeWeight,
  occasionFraction,
  servingsOfOccasion,
} from "../../src/lib/food/batch-weight";

describe("a weight is grams or it is nothing (ADR-0106 §2)", () => {
  it("takes a positive number of grams", () => {
    expect(sanitizeWeight(480)).toBe(480);
    expect(sanitizeWeight("480")).toBe(480);
    expect(sanitizeWeight(0.5)).toBe(0.5);
  });

  it("reads an unweighed batch as absent rather than as zero", () => {
    // Every "no batch weight" spelling the field and the ledger can produce —
    // never entered, cleared mid-type, or written as the edit's clearing
    // sentinel — collapses to the one absent answer §7 falls back on.
    expect(sanitizeWeight(undefined)).toBeUndefined();
    expect(sanitizeWeight("")).toBeUndefined();
    expect(sanitizeWeight(null)).toBeUndefined();
    expect(sanitizeWeight(0)).toBeUndefined();
  });

  it("refuses a weight no scale could have shown", () => {
    expect(sanitizeWeight(-200)).toBeUndefined();
    expect(sanitizeWeight("heavy")).toBeUndefined();
    expect(sanitizeWeight(Infinity)).toBeUndefined();
  });

  it("keeps the stored food precision, so a weight round-trips an editor", () => {
    expect(sanitizeWeight(480.1234)).toBe(480.123);
  });
});

describe("an occasion is a fraction of the batch (ADR-0106 §1)", () => {
  it("divides what was eaten by what the dish weighed", () => {
    expect(occasionFraction(160, 480)).toBeCloseTo(1 / 3, 10);
  });

  it("has no answer until both numbers are there", () => {
    // The defect §5 exists to prevent, seen from the editor's side: a numerator
    // whose denominator is gone sizes nothing.
    expect(occasionFraction(160, undefined)).toBeUndefined();
    expect(occasionFraction(undefined, 480)).toBeUndefined();
    expect(occasionFraction("", "")).toBeUndefined();
  });

  it("lets an occasion be the whole batch, or more than one of them", () => {
    expect(occasionFraction(480, 480)).toBe(1);
    expect(occasionFraction(960, 480)).toBe(2);
  });
});

describe("the serving count is read out of the weight (ADR-0106 §6)", () => {
  it("says 250 g of a 400 g serving is 0.625 of one", () => {
    // The record's own example: a 1,600 g batch the recipe calls four servings.
    expect(servingsOfOccasion(250, 1600, 4)).toBe(0.625);
  });

  it("counts a whole serving of a batch divided into four", () => {
    expect(servingsOfOccasion(120, 480, 4)).toBe(1);
  });

  it("is silent where the batch was never weighed", () => {
    expect(servingsOfOccasion(250, undefined, 4)).toBeUndefined();
  });

  it("treats an unusable yield as a single-serving batch, like every divisor", () => {
    expect(servingsOfOccasion(240, 480, 0)).toBe(0.5);
  });
});
