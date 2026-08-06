import { describe, it, expect } from "vitest";
import { novaBadgeView } from "../../src/lib/food/nova-badge";
import type { NovaBadgeView } from "../../src/lib/food/nova-badge";
import type { NovaVerdict } from "../../src/lib/food/nova-verdict";

// The badge presentation model (ADR-0041 §1, §2) is pure, so assert the word,
// tier numeral and tone bucket directly across every verdict face: the four OFF
// tiers and the neutral not-rated.

describe("novaBadgeView — OFF-authoritative tiers", () => {
  const expected: Record<1 | 2 | 3 | 4, NovaBadgeView> = {
    1: { word: "Unprocessed", tier: 1, tone: "unprocessed" },
    2: { word: "Ingredient", tier: 2, tone: "ingredient" },
    3: { word: "Processed", tier: 3, tone: "processed" },
    4: { word: "Ultra-processed", tier: 4, tone: "ultra" },
  };
  for (const tier of [1, 2, 3, 4] as const) {
    it(`draws NOVA ${tier} word-first with its tone`, () => {
      const verdict: NovaVerdict = {
        state: "rated",
        tier,
        source: "off",
        evidence: {},
      };
      expect(novaBadgeView(verdict)).toEqual(expected[tier]);
    });
  }

  it("reads only tier 4 as the caution (red) tone", () => {
    const tones = ([1, 2, 3, 4] as const).map(
      (tier) =>
        novaBadgeView({ state: "rated", tier, source: "off", evidence: {} })
          .tone
    );
    expect(tones.filter((t) => t === "ultra")).toEqual(["ultra"]);
  });
});

describe("novaBadgeView — inferred NOVA-1 (USDA whole foods)", () => {
  it("renders exactly like a plain OFF NOVA-1 badge — no estimate marker", () => {
    expect(
      novaBadgeView({ state: "rated", tier: 1, source: "inferred" })
    ).toEqual<NovaBadgeView>({
      word: "Unprocessed",
      tier: 1,
      tone: "unprocessed",
    });
  });
});

describe("novaBadgeView — not rated", () => {
  it("collapses to a neutral greyed chip", () => {
    expect(novaBadgeView({ state: "not-rated" })).toEqual<NovaBadgeView>({
      word: "not rated",
      tier: null,
      tone: "not-rated",
    });
  });
});
