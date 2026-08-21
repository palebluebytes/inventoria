import { describe, it, expect } from "vitest";
import {
  CURATED_CEILING,
  CURATED_STAND_INS,
  curatedMatches,
  curatedStandInFor,
  curatedStandInNote,
} from "../../src/lib/food/curated-foods";
import { macrosFromNutrition } from "../../src/lib/food/nutrition";
import type { NutritionInfo } from "../../src/lib/food/nutrition";

// Curated stand-ins (ADR-0046): a base ingredient no reference table carries,
// pinned to one vetted OFF record. The rules worth locking down are the ones a
// later edit could quietly break — the two-tier match (an exact hit leads, a
// broad one trails), the entity being the REAL barcode so a scan of the same
// pack collapses onto the same twin, and the ceiling that keeps this an
// exception list rather than a second composition table.

describe("curatedMatches", () => {
  it("returns the stand-in for the food's own name, as an exact hit", () => {
    const matches = curatedMatches(["cacao nibs"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].entry.food).toBe("cacao nibs");
    expect(matches[0].exact).toBe(true);
  });

  it("matches plural-tolerantly, so a singular query still lands", () => {
    expect(curatedMatches(["cacao nib"])[0]?.exact).toBe(true);
  });

  it("matches mid-type, as a partial hit", () => {
    const matches = curatedMatches(["cacao ni"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].exact).toBe(false);
  });

  it("treats a broad query as partial, so USDA keeps the lead for it", () => {
    // "cocoa" must not displace USDA's cocoa powder — the food a user typing
    // that word is most likely after.
    const matches = curatedMatches(["cocoa"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].exact).toBe(false);
  });

  it("does not match a different food that shares a word", () => {
    expect(curatedMatches(["cocoa butter"])).toEqual([]);
    expect(curatedMatches(["cacao powder"])).toEqual([]);
  });

  it("ignores case, punctuation and surrounding space", () => {
    expect(curatedMatches(["  Cacao-Nibs "])[0]?.exact).toBe(true);
  });

  it("returns nothing for an empty or wordless query", () => {
    expect(curatedMatches([""])).toEqual([]);
    expect(curatedMatches(["   "])).toEqual([]);
    expect(curatedMatches(["!!"])).toEqual([]);
  });
});

// Double cream is the second entry (#116), and the one that shows the list is
// about a FOOD rather than a name: USDA carries cream at four fat levels and
// stops at 35.6 g, where the UK compositional standard for double cream starts
// at 48. The queries below are the ones that could go wrong — a UK shelf name
// must land, and the American name for a food USDA DOES carry must not.
describe("curatedMatches, on double cream", () => {
  it("returns the stand-in for the name a UK user types", () => {
    const matches = curatedMatches(["double cream"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].entry.food).toBe("double cream");
    expect(matches[0].exact).toBe(true);
  });

  it("lands on the thick variants the same shelf sells", () => {
    expect(curatedMatches(["extra thick double cream"])[0]?.exact).toBe(true);
    expect(curatedMatches(["thick double cream"])[0]?.exact).toBe(true);
  });

  it("leaves `heavy cream` to USDA, which has that food", () => {
    // `Cream, heavy` is a real reference food at 35.6 g fat. Aliasing the
    // American name onto a 50.5 g British one would swap a record the corpus
    // holds for a branded stand-in — the opposite of what ADR-0046 §1 admits.
    expect(curatedMatches(["heavy cream"])).toEqual([]);
  });

  it("leaves `clotted cream` alone, curated or not", () => {
    // Absent from every table too, and deliberately NOT curated (#116 §7): a
    // second absent cream is a second admission, not a free ride on this one.
    expect(curatedMatches(["clotted cream"])).toEqual([]);
  });

  it("treats a bare `cream` as partial, so USDA keeps the lead for it", () => {
    const matches = curatedMatches(["cream"]);
    expect(matches).toHaveLength(1);
    expect(matches[0].entry.food).toBe("double cream");
    expect(matches[0].exact).toBe(false);
  });
});

// One table per entry rather than one block per entry, so the third stand-in
// adds a row instead of a copy of these four cases. What the entry's own
// evidence has to say is asserted below, over the whole list.
const MAPPED = [
  {
    query: "cacao nibs",
    entity: "gtin:5400706613279",
    macros: { calories: 652, protein: 12, fat: 55, carbs: 29.5 },
    nova: 1,
    ingredients: "100% organic cacao nibs",
    allergens: undefined,
  },
  {
    query: "double cream",
    entity: "gtin:5010251341352",
    macros: { calories: 467, protein: 1.5, fat: 50.5, carbs: 1.6 },
    nova: 1,
    ingredients: "pasteurised double cream",
    allergens: ["en:milk"],
  },
] as const;

describe.each(MAPPED)("the mapped payload for $query", (entry) => {
  const payload = curatedMatches([entry.query])[0].payload;

  it("is keyed by the real barcode, so scanning the pack finds the same twin", () => {
    // ADR-0046 §3: deliberately NOT a `curated:` prefix of its own.
    expect(payload.entity).toBe(entry.entity);
  });

  it("carries the panel the record was vetted on", () => {
    const macros = macrosFromNutrition(
      payload.attributes["nutrition/info"] as NutritionInfo
    );
    expect(macros).toEqual(entry.macros);
  });

  it("goes through the ordinary OFF mapper, so derived readings work", () => {
    // NOVA and allergens ride `food/assessment`; the badge, the explainer and
    // the allergen block read it with no special case for curated foods.
    const assessment = payload.attributes["food/assessment"] as {
      nova_group?: number;
      allergens?: string[];
    };
    expect(assessment.nova_group).toBe(entry.nova);
    expect(assessment.allergens).toEqual(entry.allergens);
    expect(payload.attributes["food/ingredients_text"]).toBe(entry.ingredients);
  });

  it("keeps the OFF record as provenance, so the source tag reads OFF", () => {
    const provenance = payload.attributes["twin/raw_provenance"] as {
      adapter: string;
      source_uri: string;
    };
    expect(provenance.adapter).toBe("off");
    expect(provenance.source_uri).toContain(entry.entity.slice("gtin:".length));
  });
});

describe("curatedStandInFor", () => {
  it("recognises a curated twin by its entity", () => {
    expect(curatedStandInFor("gtin:5400706613279")?.food).toBe("cacao nibs");
  });

  it("returns undefined for every other food", () => {
    expect(curatedStandInFor("gtin:3017620422003")).toBeUndefined();
    expect(curatedStandInFor("fdc:171711")).toBeUndefined();
    expect(curatedStandInFor(undefined)).toBeUndefined();
  });
});

describe("curatedStandInNote", () => {
  const note = curatedStandInNote(CURATED_STAND_INS[0]);

  it("names the missing food, the product standing in, and the capture date", () => {
    expect(note.headline).toContain("cacao nibs");
    expect(note.body).toContain("Purasana");
    expect(note.body).toContain("2026-08-18");
  });
});

describe("the list itself", () => {
  it("stays under the ceiling that keeps it an exception list", () => {
    // ADR-0046 §6: reaching this is a signal to adopt a real second table, not
    // a cap to raise.
    expect(CURATED_STAND_INS.length).toBeLessThanOrEqual(CURATED_CEILING);
  });

  it("carries its admission evidence with every entry", () => {
    // ADR-0046 §2 — the bar is evidential, and the evidence lives with the entry
    // rather than in the commit that added it.
    for (const entry of CURATED_STAND_INS) {
      expect(entry.absence.length).toBeGreaterThan(40);
      expect(entry.corroboration.length).toBeGreaterThan(40);
      expect(entry.captured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("pins only single-ingredient records", () => {
    // ADR-0046 §2, admission 2: a compound product never stands in for an
    // ingredient. Not a general parser — an ingredients list with a separator is
    // more than one thing, which is all this needs to catch.
    for (const entry of CURATED_STAND_INS) {
      const ingredients = entry.snapshot.product.ingredients_text ?? "";
      expect(ingredients).not.toBe("");
      expect(ingredients).not.toMatch(/[,;]|\band\b/);
    }
  });

  it("carries the four core macros on every entry", () => {
    for (const entry of CURATED_STAND_INS) {
      const n = entry.snapshot.product.nutriments ?? {};
      expect(n["energy-kcal_100g"]).toBeTypeOf("number");
      expect(n.proteins_100g).toBeTypeOf("number");
      expect(n.fat_100g).toBeTypeOf("number");
      expect(n.carbohydrates_100g).toBeTypeOf("number");
    }
  });

  it("has no two entries claiming the same barcode", () => {
    const codes = CURATED_STAND_INS.map((e) => e.snapshot.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
