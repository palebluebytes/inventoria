import { describe, it, expect } from "vitest";
import {
  allergenBlockView,
  type AllergenBlockView,
} from "../../src/lib/food/allergen-block";
import type { AllergenVerdict } from "../../src/lib/food/off-signals";

// The allergen safety block's render-layer view model (ADR-0043 §3, #104). The
// pure `deriveAllergenVerdict` selector already imposed precedence order + the
// `no-gluten` de-dup and returns `en:` tags. This helper adds ONLY the display
// decision the ADR/#101 left to the render layer: narrow the Free-from line to
// declared ALLERGEN free-from claims, dropping OFF's non-allergen `en:no-*`
// claims (en:no-added-sugar, …) that would be noise in a safety block. It never
// touches Contains / May-contain, and it NEVER synthesises a claim from absence.

describe("allergenBlockView — present verdict", () => {
  it("passes through Contains and May-contain untouched, in order", () => {
    const verdict: AllergenVerdict = {
      state: "present",
      contains: ["en:milk", "en:peanuts"],
      mayContain: ["en:nuts"],
      freeFrom: [],
    };
    expect(allergenBlockView(verdict)).toEqual<AllergenBlockView>({
      state: "present",
      contains: ["en:milk", "en:peanuts"],
      mayContain: ["en:nuts"],
      freeFrom: [],
    });
  });

  it("keeps declared allergen free-from claims on the Free-from line", () => {
    const view = allergenBlockView({
      state: "present",
      contains: [],
      mayContain: [],
      freeFrom: ["en:no-gluten", "en:no-milk"],
    });
    expect(view).toEqual<AllergenBlockView>({
      state: "present",
      contains: [],
      mayContain: [],
      freeFrom: ["en:no-gluten", "en:no-milk"],
    });
  });

  it("drops non-allergen en:no-* claims from the Free-from line", () => {
    const view = allergenBlockView({
      state: "present",
      contains: ["en:milk"],
      mayContain: [],
      // en:no-added-sugar / en:no-preservatives are NOT allergen statements.
      freeFrom: ["en:no-gluten", "en:no-added-sugar", "en:no-preservatives"],
    });
    expect(view).toEqual<AllergenBlockView>({
      state: "present",
      contains: ["en:milk"],
      mayContain: [],
      freeFrom: ["en:no-gluten"],
    });
  });

  it("preserves the selector's free-from order after narrowing", () => {
    const view = allergenBlockView({
      state: "present",
      contains: [],
      mayContain: [],
      freeFrom: ["en:no-milk", "en:no-added-sugar", "en:no-gluten"],
    });
    expect(view.state === "present" && view.freeFrom).toEqual([
      "en:no-milk",
      "en:no-gluten",
    ]);
  });
});

describe("allergenBlockView — absent / degrades to absent", () => {
  it("returns absent for an absent verdict", () => {
    expect(allergenBlockView({ state: "absent" })).toEqual<AllergenBlockView>({
      state: "absent",
    });
  });

  it("degrades to absent when the only data was non-allergen free-from claims", () => {
    // Present ONLY because en:no-added-sugar rode the free-from list; once that is
    // filtered out there is nothing to show, so the block stays silent — never a
    // bare header, never a claim inferred from absence.
    const view = allergenBlockView({
      state: "present",
      contains: [],
      mayContain: [],
      freeFrom: ["en:no-added-sugar"],
    });
    expect(view).toEqual<AllergenBlockView>({ state: "absent" });
  });
});
