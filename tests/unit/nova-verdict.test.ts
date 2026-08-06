import { describe, it, expect } from "vitest";
import { deriveNovaVerdict } from "../../src/lib/food/nova-verdict";
import type { NovaVerdict } from "../../src/lib/food/nova-verdict";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";
import type { FoodAssessment } from "../../src/lib/food/open-food-facts";

// The NOVA read-back selector (ADR-0041 §4) is the first reader of the write-only
// `food/assessment` blob. Pure, so assert its verdict directly across the cases
// the ADR fixes: OFF-authoritative tiers 1–4, OFF-blank, and non-OFF foods (which
// read "not rated" — the `· est` USDA inference is ticket D/#93, not this one).

/** A minimal OFF food twin carrying `attrs` as its attribute bag. */
function offFood(attrs: Record<string, unknown>): EntityPayload {
  return { entity: "gtin:1234567890123", attributes: attrs };
}

/** An OFF twin whose `food/assessment` holds exactly `assessment`. */
function offFoodWithAssessment(assessment: FoodAssessment): EntityPayload {
  return offFood({
    "food/name": "Some Product",
    "food/assessment": assessment,
  });
}

describe("deriveNovaVerdict — OFF-authoritative tiers", () => {
  const tiers = [1, 2, 3, 4] as const;
  for (const tier of tiers) {
    it(`rates NOVA ${tier} as an authoritative off verdict`, () => {
      const verdict = deriveNovaVerdict(
        offFoodWithAssessment({ nova_group: tier })
      );
      expect(verdict).toEqual<NovaVerdict>({
        state: "rated",
        tier,
        source: "off",
        evidence: {},
      });
    });
  }

  it("carries additives and the nova_group_debug trail as evidence", () => {
    const verdict = deriveNovaVerdict(
      offFoodWithAssessment({
        nova_group: 4,
        additives: ["en:e322", "en:e471"],
        nova_group_debug: "additives: en:e471 -> 4",
      })
    );
    expect(verdict).toEqual<NovaVerdict>({
      state: "rated",
      tier: 4,
      source: "off",
      evidence: {
        additives: ["en:e322", "en:e471"],
        debug: "additives: en:e471 -> 4",
      },
    });
  });

  it("includes only the evidence faces the assessment carries (additives only)", () => {
    const verdict = deriveNovaVerdict(
      offFoodWithAssessment({ nova_group: 3, additives: ["en:e330"] })
    );
    expect(verdict).toEqual<NovaVerdict>({
      state: "rated",
      tier: 3,
      source: "off",
      evidence: { additives: ["en:e330"] },
    });
  });

  it("includes only the evidence faces the assessment carries (debug only)", () => {
    // Forward-only debug trail without any flagged additive (ADR-0041 §7).
    const verdict = deriveNovaVerdict(
      offFoodWithAssessment({ nova_group: 1, nova_group_debug: "no markers" })
    );
    expect(verdict).toEqual<NovaVerdict>({
      state: "rated",
      tier: 1,
      source: "off",
      evidence: { debug: "no markers" },
    });
  });

  it("rates on nova_group alone even with a thin (pre-v6) evidence trail", () => {
    // A food captured before the mapper widening still rates from its tier, with
    // an empty evidence section — the explainer degrades gracefully (§7).
    const verdict = deriveNovaVerdict(
      offFoodWithAssessment({ nova_group: 2, nutri_score: "c" })
    );
    expect(verdict).toEqual<NovaVerdict>({
      state: "rated",
      tier: 2,
      source: "off",
      evidence: {},
    });
  });

  it("treats an empty additives list as no additive evidence", () => {
    const verdict = deriveNovaVerdict(
      offFoodWithAssessment({ nova_group: 4, additives: [] })
    );
    expect(verdict).toEqual<NovaVerdict>({
      state: "rated",
      tier: 4,
      source: "off",
      evidence: {},
    });
  });
});

describe("deriveNovaVerdict — not rated", () => {
  it("is not-rated when the assessment carries no NOVA group (the ~75%)", () => {
    // An OFF product OFF could not classify: assessment present, nova_group absent.
    const verdict = deriveNovaVerdict(
      offFoodWithAssessment({ nutri_score: "b", additives: ["en:e300"] })
    );
    expect(verdict).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("is not-rated when there is no assessment blob at all", () => {
    const verdict = deriveNovaVerdict(
      offFood({ "food/name": "Plain Product" })
    );
    expect(verdict).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("is not-rated for a manual entry (non-OFF food)", () => {
    const verdict = deriveNovaVerdict({
      entity: "food:local-abc",
      attributes: {
        "food/name": "Homemade Soup",
        "food/manual_entry": { kind: "menu" },
      },
    });
    expect(verdict).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("is not-rated for a USDA food (the `· est` inference is ticket #93, not here)", () => {
    // The reserved `inferred` slot stays UNFILLED in this ticket: a banana reads
    // not-rated until #93 lands the USDA category rule.
    const verdict = deriveNovaVerdict({
      entity: "fdc:173944",
      attributes: {
        "food/name": "Bananas, raw",
        "food/category": "Fruits and Fruit Juices",
      },
    });
    expect(verdict).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("is not-rated for an out-of-range NOVA value (guards a stray 0)", () => {
    const verdict = deriveNovaVerdict(offFoodWithAssessment({ nova_group: 0 }));
    expect(verdict).toEqual<NovaVerdict>({ state: "not-rated" });
  });
});
