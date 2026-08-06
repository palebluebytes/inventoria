import { describe, it, expect } from "vitest";
import {
  novaExplainerView,
  formatAdditive,
  NOVA_SCALE,
} from "../../src/lib/food/nova-explainer";
import type { NovaVerdict } from "../../src/lib/food/nova-verdict";

// The explainer presentation model (ADR-0041 §6) is pure, so assert the face it
// selects, the tier/word it heads with, and — crucially — how the OFF evidence
// section SHAPES and DEGRADES: E-number formatting, and the `present` flag that
// thins the section for pre-#90 foods carrying a tier but no evidence trail.

describe("formatAdditive — OFF additives_tags → E-numbers", () => {
  it("strips the language prefix and uppercases", () => {
    expect(formatAdditive("en:e330")).toBe("E330");
    expect(formatAdditive("fr:e500ii")).toBe("E500II");
  });
  it("passes a prefix-less tag through, uppercased", () => {
    expect(formatAdditive("e100")).toBe("E100");
  });
});

describe("novaExplainerView — rated / OFF-authoritative", () => {
  it("heads with the hero tier + word + the four-group scale", () => {
    const verdict: NovaVerdict = {
      state: "rated",
      tier: 4,
      source: "off",
      evidence: { additives: ["en:e330"], debug: "additives: en:e330" },
    };
    const view = novaExplainerView(verdict);
    expect(view.face).toBe("rated");
    if (view.face !== "rated") throw new Error("expected rated");
    expect(view.tier).toBe(4);
    expect(view.word).toBe("Ultra-processed");
    expect(view.tone).toBe("ultra");
    expect(view.scale).toBe(NOVA_SCALE);
    expect(view.scale).toHaveLength(4);
  });

  it("formats additives to E-numbers and keeps the debug trail, present=true", () => {
    const view = novaExplainerView({
      state: "rated",
      tier: 4,
      source: "off",
      evidence: { additives: ["en:e330", "en:e500"], debug: "some trail" },
    });
    if (view.face !== "rated") throw new Error("expected rated");
    expect(view.evidence.additives).toEqual(["E330", "E500"]);
    expect(view.evidence.debug).toBe("some trail");
    expect(view.evidence.present).toBe(true);
  });

  it("degrades gracefully when evidence is absent (pre-#90 food): tier stays, present=false", () => {
    const view = novaExplainerView({
      state: "rated",
      tier: 2,
      source: "off",
      evidence: {},
    });
    if (view.face !== "rated") throw new Error("expected rated");
    expect(view.tier).toBe(2);
    expect(view.word).toBe("Ingredient");
    expect(view.evidence.additives).toEqual([]);
    expect(view.evidence.debug).toBeUndefined();
    expect(view.evidence.present).toBe(false);
  });

  it("marks present=true with only a debug trail (no additives)", () => {
    const view = novaExplainerView({
      state: "rated",
      tier: 3,
      source: "off",
      evidence: { debug: "category matched" },
    });
    if (view.face !== "rated") throw new Error("expected rated");
    expect(view.evidence.additives).toEqual([]);
    expect(view.evidence.present).toBe(true);
  });
});

describe("novaExplainerView — inferred and not-rated", () => {
  it("renders the inferred NOVA-1 face with tier 1 + scale, no evidence", () => {
    const view = novaExplainerView({
      state: "rated",
      tier: 1,
      source: "inferred",
    });
    expect(view.face).toBe("inferred");
    if (view.face !== "inferred") throw new Error("expected inferred");
    expect(view.tier).toBe(1);
    expect(view.word).toBe("Unprocessed");
    expect(view.tone).toBe("unprocessed");
    expect(view.scale).toBe(NOVA_SCALE);
  });

  it("renders the neutral not-rated face", () => {
    const view = novaExplainerView({ state: "not-rated" });
    expect(view.face).toBe("not-rated");
  });
});
