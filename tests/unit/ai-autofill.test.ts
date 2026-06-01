import { describe, it, expect, vi } from "vitest";
import { autofillFromPackageImage } from "../../src/lib/food/ai-autofill";

describe("autofillFromPackageImage", () => {
  it("simulates analyzing a package image and returns guessed product data", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await autofillFromPackageImage(
      "data:image/png;base64,abcdefg"
    );

    expect(result).toEqual({
      name: "AI Guessed Product (Stub)",
      calories: 250,
      protein: 15,
      fat: 8,
      carbs: 30,
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "[V2 STUB] autofillFromPackageImage called with image size:",
      expect.any(Number)
    );
    infoSpy.mockRestore();
  });
});
