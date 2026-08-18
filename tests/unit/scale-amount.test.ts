import { describe, it, expect } from "vitest";
import {
  parseScaleFactor,
  scaleAmount,
  DEFAULT_SCALE_FACTOR,
} from "../../src/lib/food/scale-amount";

describe("parseScaleFactor", () => {
  it("reads a plain number", () => {
    expect(parseScaleFactor("2")).toBe(2);
    expect(parseScaleFactor("1.5")).toBe(1.5);
  });

  it("accepts the amount-field expression grammar", () => {
    expect(parseScaleFactor("3/2")).toBe(1.5);
    expect(parseScaleFactor(" 2 * 2 ")).toBe(4);
  });

  it("rejects a factor that isn't usable yet", () => {
    for (const input of ["", "  ", "2 *", "abc", "1.2.3"]) {
      expect(parseScaleFactor(input)).toBeNull();
    }
  });

  it("rejects zero and negative factors rather than clamping them", () => {
    expect(parseScaleFactor("0")).toBeNull();
    expect(parseScaleFactor("-2")).toBeNull();
    expect(parseScaleFactor("2 - 2")).toBeNull();
  });

  it("starts the field at a factor that parses", () => {
    expect(parseScaleFactor(DEFAULT_SCALE_FACTOR)).toBe(2);
  });
});

describe("scaleAmount", () => {
  it("multiplies and divides an amount", () => {
    expect(scaleAmount(150, 2, "multiply")).toBe(300);
    expect(scaleAmount(150, 2, "divide")).toBe(75);
  });

  it("scales by a fractional factor", () => {
    expect(scaleAmount(200, 1.5, "multiply")).toBe(300);
    expect(scaleAmount(200, 1.5, "divide")).toBeCloseTo(133.333, 3);
  });

  it("rounds to the stored food precision", () => {
    expect(scaleAmount(100, 3, "divide")).toBe(33.333);
    expect(scaleAmount(0.1, 3, "multiply")).toBe(0.3);
  });

  it("round-trips an amount through the opposite operation", () => {
    expect(scaleAmount(scaleAmount(80, 2, "multiply"), 2, "divide")).toBe(80);
  });

  it("keeps a positive amount positive at an extreme factor", () => {
    const scaled = scaleAmount(0.001, 1000, "divide");
    expect(scaled).toBeGreaterThan(0);
  });

  it("leaves a zero amount at zero", () => {
    expect(scaleAmount(0, 2, "multiply")).toBe(0);
    expect(scaleAmount(0, 2, "divide")).toBe(0);
  });
});
