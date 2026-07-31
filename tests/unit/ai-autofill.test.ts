import { describe, it, expect, vi } from "vitest";
import {
  autofillFromPackageImage,
  type AIAutofillResult,
} from "../../src/lib/food/ai-autofill";

describe("autofillFromPackageImage (deferred seam)", () => {
  it("returns a full-panel proposal of the real shape from a label photo", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await autofillFromPackageImage(
      "data:image/png;base64,abcdefg"
    );

    // The seam's contract: name/brand, a printed basis, and a panel keyed by
    // NutritionInfo fields — not the four-macro shape the earlier stub returned.
    const expected: AIAutofillResult = {
      name: "AI Guessed Product (Stub)",
      brand: null,
      basis: "per_100g",
      nutrition: {
        calories: 250,
        protein_content: 15,
        fat_content: 8,
        saturated_fat_content: 2.5,
        carbohydrate_content: 30,
        sugar_content: 12,
        fiber_content: 3,
        sodium_content: 0.4,
        calcium: 0.12,
        iron: 0.0026,
      },
    };
    expect(result).toEqual(expected);

    // Absent-not-zero: a row the label omits is absent, never 0 — so the confirm
    // form can render "not measured". cholesterol and most micros are unset here.
    expect(result.nutrition).not.toHaveProperty("cholesterol_content");
    expect(result.nutrition).not.toHaveProperty("zinc");

    expect(infoSpy).toHaveBeenCalledWith(
      "[DEFERRED STUB] autofillFromPackageImage called with image size:",
      expect.any(Number)
    );
    infoSpy.mockRestore();
  });
});
