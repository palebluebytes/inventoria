import { describe, it, expect, vi } from "vitest";
import {
  emptyPlateEstimate,
  estimatePlate,
  type PlateEstimate,
} from "../../src/lib/food/plate-estimator";

// The plate-estimator seam (ADR-0035 §5) is deferred exactly like the label
// AI-autofill seam: v1 uses the EMPTY variant and fabricates nothing. These pin
// the empty contract the blank-on-capture flow relies on and the honest stub.
describe("emptyPlateEstimate (the v1 blank-on-capture variant)", () => {
  it("proposes nothing — no name, null calories, no ingredients", () => {
    const est: PlateEstimate = emptyPlateEstimate();
    expect(est).toEqual({ name: null, calories: null, ingredients: [] });
  });

  it("never fabricates a 0 calorie figure (absent ≠ 0)", () => {
    expect(emptyPlateEstimate().calories).toBeNull();
  });
});

describe("estimatePlate (deferred stub)", () => {
  it("makes no model call and fabricates no numbers — returns the empty estimate", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const est = await estimatePlate("data:image/png;base64,abcdefg");

    // Unlike a mock, the stub invents no calories — a real estimator replaces the
    // body under the same confirm-before-save contract.
    expect(est).toEqual({ name: null, calories: null, ingredients: [] });
    expect(infoSpy).toHaveBeenCalledWith(
      "[DEFERRED STUB] estimatePlate called with image size:",
      expect.any(Number)
    );
    infoSpy.mockRestore();
  });
});
