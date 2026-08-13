import { describe, it, expect } from "vitest";
import {
  dietaryTagsView,
  type DietaryTagView,
} from "../../src/lib/food/dietary-tag";
import type { DietaryVerdict } from "../../src/lib/food/off-signals";

// The dietary-tags presentation model (ADR-0043 §2) is pure: it attaches a
// placeholder glyph + short form to each `en:` tag the selector already ordered,
// drops unknown tags, and returns an empty list when the verdict is absent (so
// the row degrades to just the source + NOVA marks).

describe("dietaryTagsView — present verdict", () => {
  it("maps each tag to its glyph + short form, preserving selector order", () => {
    const verdict: DietaryVerdict = {
      state: "present",
      tags: ["en:vegan", "en:organic"],
      additivesCount: 0,
    };
    expect(dietaryTagsView(verdict)).toEqual<DietaryTagView[]>([
      { tag: "en:vegan", glyph: "🌱", shortForm: "Vegan" },
      { tag: "en:organic", glyph: "🏵️", shortForm: "Organic" },
    ]);
  });

  it("resolves the vegetarian glyph too", () => {
    const view = dietaryTagsView({
      state: "present",
      tags: ["en:vegetarian"],
      additivesCount: 0,
    });
    expect(view).toEqual<DietaryTagView[]>([
      { tag: "en:vegetarian", glyph: "Ⓥ", shortForm: "Vegetarian" },
    ]);
  });

  it("silently drops a tag it has no glyph for", () => {
    const view = dietaryTagsView({
      state: "present",
      tags: ["en:vegan", "en:palm-oil-free"],
      additivesCount: 0,
    });
    expect(view).toEqual<DietaryTagView[]>([
      { tag: "en:vegan", glyph: "🌱", shortForm: "Vegan" },
    ]);
  });
});

describe("dietaryTagsView — absent verdict", () => {
  it("returns an empty list (row shows no dietary tags)", () => {
    expect(dietaryTagsView({ state: "absent", additivesCount: 3 })).toEqual<
      DietaryTagView[]
    >([]);
  });
});
