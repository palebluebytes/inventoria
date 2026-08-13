import { describe, it, expect } from "vitest";
import {
  deriveDietaryVerdict,
  deriveAllergenVerdict,
  type DietaryVerdict,
  type AllergenVerdict,
} from "../../src/lib/food/off-signals";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";
import type { FoodAssessment } from "../../src/lib/food/open-food-facts";

// The OFF assessment read-back selectors (ADR-0043 §4) — pure, so assert their
// verdicts directly across the cases the ADR fixes: present-only dietary tags
// (vegan ⟹ suppress vegetarian), the three precedence-ordered allergen lines
// (Contains › May-contain › Free-from) with the `no-gluten` de-dup, and
// silent-on-empty ("absent", never "not rated") for both.

/** An OFF food twin whose `food/assessment` holds exactly `assessment`. */
function offFoodWithAssessment(assessment: FoodAssessment): EntityPayload {
  return {
    entity: "gtin:1234567890123",
    attributes: {
      "food/name": "Some Product",
      "food/assessment": assessment,
    },
  };
}

/** An OFF food twin carrying `attrs` as its whole attribute bag. */
function offFood(attrs: Record<string, unknown>): EntityPayload {
  return { entity: "gtin:1234567890123", attributes: attrs };
}

describe("deriveDietaryVerdict — present dietary claims", () => {
  it("surfaces vegan / vegetarian / organic in canonical order", () => {
    // Deliberately shuffled input order; the selector imposes its own order.
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({
        labels: ["en:organic", "en:vegetarian"],
      })
    );
    expect(verdict).toEqual<DietaryVerdict>({
      state: "present",
      tags: ["en:vegetarian", "en:organic"],
      additivesCount: 0,
    });
  });

  it("suppresses vegetarian when vegan is present (vegan ⟹ vegetarian)", () => {
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({
        labels: ["en:vegan", "en:vegetarian", "en:organic"],
      })
    );
    expect(verdict).toEqual<DietaryVerdict>({
      state: "present",
      tags: ["en:vegan", "en:organic"],
      additivesCount: 0,
    });
  });

  it("carries the additives count alongside present tags", () => {
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({
        labels: ["en:vegan"],
        additives: ["en:e322", "en:e471", "en:e330"],
      })
    );
    expect(verdict).toEqual<DietaryVerdict>({
      state: "present",
      tags: ["en:vegan"],
      additivesCount: 3,
    });
  });

  it("returns en: tags, never display names", () => {
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({ labels: ["en:organic"] })
    );
    expect(verdict.state).toBe("present");
    if (verdict.state === "present") {
      expect(verdict.tags).toEqual(["en:organic"]);
    }
  });

  it("does NOT surface gluten-free as a dietary tag (en:no-gluten de-duped away)", () => {
    // en:no-gluten belongs to the allergen Free-from line, not the dietary row.
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({ labels: ["en:no-gluten"] })
    );
    // No recognised dietary claim → absent (the no-gluten label alone is not one).
    expect(verdict).toEqual<DietaryVerdict>({
      state: "absent",
      additivesCount: 0,
    });
  });

  it("ignores unrelated labels (certifications, packaging marks)", () => {
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({
        labels: ["en:certified-b-corporation", "en:fsc", "en:green-dot"],
      })
    );
    expect(verdict).toEqual<DietaryVerdict>({
      state: "absent",
      additivesCount: 0,
    });
  });
});

describe("deriveDietaryVerdict — absent (silent, never 'not rated')", () => {
  it("is absent when the assessment carries no labels", () => {
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({ nova_group: 4 })
    );
    expect(verdict).toEqual<DietaryVerdict>({
      state: "absent",
      additivesCount: 0,
    });
  });

  it("is absent when there is no assessment blob at all", () => {
    const verdict = deriveDietaryVerdict(offFood({ "food/name": "Plain" }));
    expect(verdict).toEqual<DietaryVerdict>({
      state: "absent",
      additivesCount: 0,
    });
  });

  it("still reports the additives count while absent of dietary claims", () => {
    // Additives drive a mark on the NOVA tag independent of dietary presence.
    const verdict = deriveDietaryVerdict(
      offFoodWithAssessment({ additives: ["en:e150d", "en:e338"] })
    );
    expect(verdict).toEqual<DietaryVerdict>({
      state: "absent",
      additivesCount: 2,
    });
  });
});

describe("deriveAllergenVerdict — precedence-ordered lines", () => {
  it("assembles Contains / May-contain / Free-from from the three sources", () => {
    const verdict = deriveAllergenVerdict(
      offFoodWithAssessment({
        allergens: ["en:milk", "en:nuts"],
        traces: ["en:soybeans"],
        labels: ["en:no-gluten", "en:vegan"],
      })
    );
    expect(verdict).toEqual<AllergenVerdict>({
      state: "present",
      contains: ["en:milk", "en:nuts"],
      mayContain: ["en:soybeans"],
      freeFrom: ["en:no-gluten"],
    });
  });

  it("de-dups a traces tag already present in Contains (Contains › May-contain)", () => {
    const verdict = deriveAllergenVerdict(
      offFoodWithAssessment({
        allergens: ["en:milk"],
        traces: ["en:milk", "en:nuts"],
      })
    );
    expect(verdict).toEqual<AllergenVerdict>({
      state: "present",
      contains: ["en:milk"],
      mayContain: ["en:nuts"],
      freeFrom: [],
    });
  });

  it("keeps en:no-gluten on the Free-from line only (the de-dup destination)", () => {
    // The dietary selector drops en:no-gluten; the allergen block owns it.
    const food = offFoodWithAssessment({ labels: ["en:no-gluten"] });
    const verdict = deriveAllergenVerdict(food);
    expect(verdict).toEqual<AllergenVerdict>({
      state: "present",
      contains: [],
      mayContain: [],
      freeFrom: ["en:no-gluten"],
    });
    // ... and the dietary verdict does NOT carry it.
    expect(deriveDietaryVerdict(food)).toEqual<DietaryVerdict>({
      state: "absent",
      additivesCount: 0,
    });
  });

  it("takes only en:no-* labels as Free-from, never other labels", () => {
    const verdict = deriveAllergenVerdict(
      offFoodWithAssessment({
        labels: ["en:vegan", "en:no-milk", "en:organic", "en:no-lactose"],
      })
    );
    expect(verdict).toEqual<AllergenVerdict>({
      state: "present",
      contains: [],
      mayContain: [],
      freeFrom: ["en:no-milk", "en:no-lactose"],
    });
  });

  it("returns en: tags, never display names", () => {
    const verdict = deriveAllergenVerdict(
      offFoodWithAssessment({ allergens: ["en:peanuts"] })
    );
    expect(verdict.state).toBe("present");
    if (verdict.state === "present") {
      expect(verdict.contains).toEqual(["en:peanuts"]);
    }
  });
});

describe("deriveAllergenVerdict — absent, never inferred from absence", () => {
  it("is absent when the assessment carries no allergen/traces/free-from data", () => {
    // An assessment with only nutrition signals → allergen block stays silent.
    const verdict = deriveAllergenVerdict(
      offFoodWithAssessment({ nova_group: 1, nutri_score: "a" })
    );
    expect(verdict).toEqual<AllergenVerdict>({ state: "absent" });
  });

  it("is absent for an empty allergens list — NEVER 'allergen-free'", () => {
    // The single most dangerous misread: [] means "none found in the parsed
    // ingredients", not "safe". The block is silent, not reassuring.
    const verdict = deriveAllergenVerdict(
      offFoodWithAssessment({ allergens: [], traces: [], labels: [] })
    );
    expect(verdict).toEqual<AllergenVerdict>({ state: "absent" });
  });

  it("is absent when there is no assessment blob at all", () => {
    const verdict = deriveAllergenVerdict(offFood({ "food/name": "Plain" }));
    expect(verdict).toEqual<AllergenVerdict>({ state: "absent" });
  });

  it("is present when only Free-from data exists (a bare free-from claim)", () => {
    const verdict = deriveAllergenVerdict(
      offFoodWithAssessment({ labels: ["en:no-gluten"] })
    );
    expect(verdict.state).toBe("present");
  });
});
