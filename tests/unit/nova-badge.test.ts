import { describe, it, expect } from "vitest";
import { novaBadgeView } from "../../src/lib/food/nova-badge";
import type { NovaBadgeView } from "../../src/lib/food/nova-badge";
import type { NovaVerdict } from "../../src/lib/food/nova-verdict";

// The badge presentation model (ADR-0041 §1–§3) is pure, so assert the word, pip
// numeral, tone bucket and the `·est` flag directly across every verdict face:
// the four OFF tiers, the reserved inferred NOVA-1, and the neutral not-rated.

describe("novaBadgeView — OFF-authoritative tiers", () => {
  const expected: Record<1 | 2 | 3 | 4, NovaBadgeView> = {
    1: { word: "Unprocessed", tier: 1, tone: "unprocessed", estimated: false },
    2: { word: "Ingredient", tier: 2, tone: "ingredient", estimated: false },
    3: { word: "Processed", tier: 3, tone: "processed", estimated: false },
    4: { word: "Ultra-processed", tier: 4, tone: "ultra", estimated: false },
  };
  for (const tier of [1, 2, 3, 4] as const) {
    it(`draws NOVA ${tier} word-first with its tone and pip`, () => {
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

describe("novaBadgeView — inferred NOVA-1 (·est, reserved for #93)", () => {
  it("keeps the tier-1 word but flags it estimated", () => {
    const verdict: NovaVerdict = {
      state: "rated",
      tier: 1,
      source: "inferred",
    };
    expect(novaBadgeView(verdict)).toEqual<NovaBadgeView>({
      word: "Unprocessed",
      tier: 1,
      tone: "unprocessed",
      estimated: true,
    });
  });
});

describe("novaBadgeView — not rated", () => {
  it("collapses to a neutral, pip-less greyed chip", () => {
    expect(novaBadgeView({ state: "not-rated" })).toEqual<NovaBadgeView>({
      word: "not rated",
      tier: null,
      tone: "not-rated",
      estimated: false,
    });
  });
});
