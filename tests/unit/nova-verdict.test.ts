import { describe, it, expect } from "vitest";
import { deriveNovaVerdict } from "../../src/lib/food/nova-verdict";
import type { NovaVerdict } from "../../src/lib/food/nova-verdict";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";
import { mapIndexRowToPayload } from "../../src/lib/food/usda-corpus";
import type { FoodAssessment } from "../../src/lib/food/open-food-facts";

// The NOVA read-back selector (ADR-0041 §4) is the first reader of the write-only
// `food/assessment` blob. Pure, so assert its verdict directly across the cases
// the ADR fixes: OFF-authoritative tiers 1–4, OFF-blank, non-OFF foods (which read
// "not rated"), and the one constrained inference — NOVA 1 for basic USDA whole
// foods, gated on the category allow-list + deny guard (rule → #89).

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

/**
 * A USDA FDC food twin, minted through the corpus mapper rather than hand-built,
 * so the twin under test carries what a real one carries — `food/name`, the
 * optional `food/category`, and the `twin/raw_provenance` blob holding USDA's
 * untouched row (ADR-0047 §7).
 *
 * The provenance is not decoration here. The inference reads its `description`
 * rather than `food/name`, because a display name may carry a vocabulary alias
 * (ADR-0049's #140 Amendment), and a hand-built twin without one would have made
 * that unreadable distinction look like it did not exist.
 */
function fdcFood(
  name: string,
  category?: string,
  alias?: string
): EntityPayload {
  return mapIndexRowToPayload(
    {
      fdcId: 173944,
      description: name,
      dataType: "SR Legacy",
      macros: { calories: 89 },
      ...(category !== undefined ? { foodCategory: category } : {}),
    },
    alias
  );
}

/**
 * The same food as a payload with no source record: `seedRowFromRef`'s
 * placeholder for a dangling recipe reference, which is the one shape that
 * reaches the selector carrying a name and nothing to check it against.
 */
function refPlaceholder(name: string, category?: string): EntityPayload {
  const attributes: Record<string, unknown> = { "food/name": name };
  if (category !== undefined) attributes["food/category"] = category;
  return { entity: "fdc:173944", attributes };
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

  it("is not-rated for an out-of-range NOVA value (guards a stray 0)", () => {
    const verdict = deriveNovaVerdict(offFoodWithAssessment({ nova_group: 0 }));
    expect(verdict).toEqual<NovaVerdict>({ state: "not-rated" });
  });
});

describe("deriveNovaVerdict — inferred NOVA 1 (USDA whole foods, rule → #89)", () => {
  const INFERRED: NovaVerdict = {
    state: "rated",
    tier: 1,
    source: "inferred",
  };

  // Allow-list categories → inferred NOVA 1. One representative food per group so a
  // rename or a dropped entry breaks a test (§4a of docs/research/89-*).
  const allowListed: ReadonlyArray<[string, string]> = [
    ["Bananas, raw", "Fruits and Fruit Juices"],
    ["Broccoli, raw", "Vegetables and Vegetable Products"],
    ["Beans, black, mature seeds, raw", "Legumes and Legume Products"],
    ["Almonds, raw", "Nut and Seed Products"],
    ["Basil, fresh", "Spices and Herbs"],
    ["Beef, ground, raw", "Beef Products"],
    ["Chicken, broilers, meat only, raw", "Poultry Products"],
    ["Lamb, ground, raw", "Lamb, Veal, and Game Products"],
    ["Salmon, Atlantic, wild, raw", "Finfish and Shellfish Products"],
    ["Pork, ground, raw", "Pork Products"],
  ];
  for (const [name, category] of allowListed) {
    it(`infers NOVA 1 for ${category} (${name})`, () => {
      expect(deriveNovaVerdict(fdcFood(name, category))).toEqual<NovaVerdict>(
        INFERRED
      );
    });
  }

  it("infers NOVA 1 for a plain egg despite Dairy & Egg being excluded", () => {
    // Targeted egg include: name matches /^eggs?,/i with no egg-specific deny.
    expect(
      deriveNovaVerdict(
        fdcFood("Egg, whole, raw, fresh", "Dairy and Egg Products")
      )
    ).toEqual<NovaVerdict>(INFERRED);
    expect(
      deriveNovaVerdict(
        fdcFood("Eggs, Grade A, large", "Dairy and Egg Products")
      )
    ).toEqual<NovaVerdict>(INFERRED);
  });

  it("still infers when the fdc food carries no category but is a plain egg", () => {
    // Pre-v6 twin without food/category: the egg regex alone carries it.
    expect(deriveNovaVerdict(fdcFood("Egg, whole, raw"))).toEqual<NovaVerdict>(
      INFERRED
    );
  });

  it("is not-rated for excluded categories (cheese, milk, dry pasta, soup)", () => {
    expect(
      deriveNovaVerdict(fdcFood("Cheese, cheddar", "Dairy and Egg Products"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(
      deriveNovaVerdict(fdcFood("Milk, whole", "Dairy and Egg Products"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(
      deriveNovaVerdict(fdcFood("Spaghetti, dry", "Cereal Grains and Pasta"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(
      deriveNovaVerdict(
        fdcFood("Soup, chicken noodle, canned", "Soups, Sauces, and Gravies")
      )
    ).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("is not-rated for an allow-listed category with a deny-substring in the name", () => {
    const denied: ReadonlyArray<[string, string]> = [
      ["Pineapple, canned", "Fruits and Fruit Juices"],
      ["Peaches, in syrup", "Fruits and Fruit Juices"],
      ["Ham, cured", "Pork Products"],
      ["Salmon, smoked", "Finfish and Shellfish Products"],
      ["Cucumber, pickled", "Vegetables and Vegetable Products"],
      ["Beef in gravy sauce", "Beef Products"],
      ["Chicken, breaded", "Poultry Products"],
      ["Onion rings, fried", "Vegetables and Vegetable Products"],
      ["Corn, creamed", "Vegetables and Vegetable Products"],
      ["Cheese-stuffed peppers", "Vegetables and Vegetable Products"],
      ["Tofu, firm", "Legumes and Legume Products"],
    ];
    for (const [name, category] of denied) {
      expect(deriveNovaVerdict(fdcFood(name, category))).toEqual<NovaVerdict>({
        state: "not-rated",
      });
    }
  });

  it("is case-insensitive on the deny-substring guard", () => {
    expect(
      deriveNovaVerdict(fdcFood("Pineapple, CANNED", "Fruits and Fruit Juices"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("matches the allow-list case-sensitively (a lowercased category falls through)", () => {
    expect(
      deriveNovaVerdict(fdcFood("Bananas, raw", "fruits and fruit juices"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("is not-rated for an egg-adjacent product caught by the egg deny-substrings", () => {
    expect(
      deriveNovaVerdict(
        fdcFood("Egg, substitute, liquid", "Dairy and Egg Products")
      )
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(
      deriveNovaVerdict(fdcFood("Egg roll, frozen", "Dairy and Egg Products"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(
      deriveNovaVerdict(fdcFood("Egg, powder, whole", "Dairy and Egg Products"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(
      deriveNovaVerdict(fdcFood("Eggnog", "Dairy and Egg Products"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("judges USDA's own description, not the name a vocabulary search widened", () => {
    // `ginger powder -> ground ginger` is one of nineteen keys carrying a
    // deny-substring. Read off the display name, "powder" would cost
    // `Ginger, ground` the NOVA 1 it has when reached by its own name.
    const widened = fdcFood(
      "Ginger, ground",
      "Spices and Herbs",
      "ginger powder"
    );
    expect(widened.attributes["food/name"]).toBe(
      "Ginger, ground (ginger powder)"
    );
    expect(deriveNovaVerdict(widened)).toEqual<NovaVerdict>({
      state: "rated",
      tier: 1,
      source: "inferred",
    });
    // And the alias cannot buy an inference either: it is not read at all.
    expect(
      deriveNovaVerdict(fdcFood("Cornflakes", "Breakfast Cereals", "eggs"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("declines to infer for a USDA payload carrying no source record", () => {
    // `seedRowFromRef`'s placeholder for a dangling recipe reference has a name
    // and nothing to check it against. Falling back to that name would reinstate
    // the miscall above; falling back to "" would skip the deny guard entirely
    // and infer NOVA 1 for a canned soup. A twin we cannot judge is not rated,
    // which ADR-0041 §2 makes neutral rather than a warning.
    expect(
      deriveNovaVerdict(
        refPlaceholder("Bananas, raw", "Fruits and Fruit Juices")
      )
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(
      deriveNovaVerdict(
        refPlaceholder("Ginger, ground (ginger powder)", "Spices and Herbs")
      )
    ).toEqual<NovaVerdict>({ state: "not-rated" });
  });

  it("is not-rated for a USDA food in no allow-listed category and not an egg", () => {
    expect(
      deriveNovaVerdict(fdcFood("Cornflakes", "Breakfast Cereals"))
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    expect(deriveNovaVerdict(fdcFood("Mystery dish"))).toEqual<NovaVerdict>({
      state: "not-rated",
    });
  });

  it("does not touch non-fdc foods (OFF verdict still wins; manual stays not-rated)", () => {
    expect(
      deriveNovaVerdict(
        offFood({
          "food/name": "Bananas, raw",
          "food/category": "Fruits and Fruit Juices",
        })
      )
    ).toEqual<NovaVerdict>({ state: "not-rated" });
    // An OFF food that IS rated keeps its authoritative off verdict — the USDA
    // inference never overrides it (OFF branch runs first).
    expect(
      deriveNovaVerdict(
        offFood({
          "food/name": "Bananas, raw",
          "food/category": "Fruits and Fruit Juices",
          "food/assessment": { nova_group: 4 } as FoodAssessment,
        })
      )
    ).toEqual<NovaVerdict>({
      state: "rated",
      tier: 4,
      source: "off",
      evidence: {},
    });
  });
});
