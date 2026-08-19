import { describe, it, expect } from "vitest";
import {
  readReferenceFoodName,
  compileReferenceFoodQuery,
  compareRelevance,
} from "../../src/lib/food/reference-food-ranking";

// ADR-0042 §5's ordering, asserted on the two halves it is now built from: the
// query-independent reading of a name, and the query's score over it. The tiers
// themselves are exercised end-to-end over the committed corpus in
// `usda-corpus.test.ts`; these pin the pieces those cases rest on.

const rank = (query: string, description: string) =>
  compileReferenceFoodQuery(query)(readReferenceFoodName(description));

describe("readReferenceFoodName", () => {
  it("reads the head phrase as the words before the first comma", () => {
    const name = readReferenceFoodName("Grapes, red, seedless, raw");
    expect(name.words).toEqual(["grapes", "red", "seedless", "raw"]);
    expect(name.headLength).toBe(1);
  });

  it("treats a comma-less description as all head", () => {
    expect(readReferenceFoodName("Vinegar balsamic").headLength).toBe(2);
  });

  it("singularises the plurals food names are full of", () => {
    // A bare trailing "s" turned "potatoes" into "potatoe", which no spelling of
    // "potato" equals — so the food ranked below "Sweet potato leaves" on a
    // search for its own name.
    expect(readReferenceFoodName("Potatoes, raw").stems).toContain("potato");
    expect(readReferenceFoodName("Tomatoes, raw").stems).toContain("tomato");
    expect(readReferenceFoodName("Cherries, sour, raw").stems).toContain(
      "cherry"
    );
    // …without disturbing the words a bare "s" already got right. Both sides of
    // a comparison run through the same function, so a word that is not a plural
    // only has to stem consistently, not correctly.
    expect(readReferenceFoodName("Cheese, cheddar").stems).toContain("cheese");
    expect(readReferenceFoodName("Pies, apple").stems).toContain("pie");
  });

  it("stems only a trailing plural, so 'grapes' answers 'grape'", () => {
    expect(readReferenceFoodName("Grapes, raw").stems).toContain("grape");
    // Not a stemmer: "grapefruit" keeps its own identity, which is the whole
    // distinction a prefix search cannot draw.
    expect(readReferenceFoodName("Grapefruit, raw").stems).toContain(
      "grapefruit"
    );
  });

  it("settles the raw keys, which no query changes", () => {
    expect(readReferenceFoodName("Bananas, raw").simplicity).toBe(3);
    expect(readReferenceFoodName("Bananas, overripe, raw").simplicity).toBe(2);
    expect(readReferenceFoodName("Beef, raw, ground").simplicity).toBe(1);
    expect(readReferenceFoodName("Cheese, cheddar").raw).toBe(0);
  });
});

describe("compileReferenceFoodQuery", () => {
  it("scores the food whose head IS the query above one that merely holds it", () => {
    expect(rank("grape", "Grapes, raw").tier).toBe(50);
    expect(rank("grape", "Grape leaves, raw").tier).toBeLessThan(50);
  });

  it("walks the whole ladder down one name at a time", () => {
    // Each rung asks how much of the food's own name the query accounts for.
    const grape = (d: string) => rank("grape", d).tier;
    expect(grape("Grapes, red, seedless, raw")).toBe(50); // the head IS "grape"
    expect(grape("Grape leaves, raw")).toBe(40); // a typed word IS a head word
    expect(grape("Grapefruit, raw")).toBe(30); // the head completes "grape"
    expect(grape("Tomatoes, grape, raw")).toBe(20); // whole word, qualifier only
    expect(grape("Cheese, cheddar")).toBe(0); // nothing
  });

  it("scores a head the query COMPLETES above a word the query lands on", () => {
    // The reported case: "pot" reached "Beef, chuck, arm pot roast" before it
    // reached potatoes, because "pot" is a whole word there and only a prefix in
    // "Potatoes". USDA names a food "Food, qualifier", so completing the head
    // names the food; landing on a qualifier does not.
    expect(rank("pot", "Potatoes, flesh and skin, raw").tier).toBe(30);
    expect(rank("pot", "Beef, chuck, arm pot roast, raw").tier).toBe(20);
    // And a typed word landing ON a head word still beats both.
    expect(rank("pot", "Pot roast, raw").tier).toBe(40);
  });

  it("scores a whole-word match above a bare prefix one", () => {
    // "grape" is a whole word of "Juice, grape, canned" but the head is "juice",
    // so neither head rung applies; a partial "grap" reaches "Juice,
    // grapefruit, …" by prefix alone and not through its head either.
    expect(rank("grape", "Juice, grape, canned").tier).toBe(20);
    expect(rank("grap", "Juice, grapefruit, canned").tier).toBe(10);
    // …while the same word inside the HEAD lifts the food a rung, even when the
    // head carries more than the query.
    expect(rank("grapefruit", "Grapefruit juice, white").tier).toBe(40);
  });

  it("keeps the settled head above the one the query only completes", () => {
    // Both name a food the query reaches through its head, but only one IS the
    // query — which is what keeps "grape" answering with grapes.
    expect(rank("grape", "Grapes, raw").tier).toBe(50);
    expect(rank("grape", "Grapefruit, raw").tier).toBe(30);
  });

  it("scores a name no token reaches as no match at all", () => {
    expect(rank("gorgonzola", "Bananas, raw").tier).toBe(0);
  });

  it("requires EVERY token, not just one", () => {
    expect(rank("soy milk", "Beverages, rice milk").tier).toBe(0);
    expect(rank("soy milk", "Soy milk, unsweetened").tier).toBe(50);
  });

  it("prefers the head the query fills most completely, mid-word", () => {
    // "grap" cannot stem-match "grapes" yet, so both collapse into the prefix
    // tier and head-completeness is what separates them.
    const grapes = rank("grap", "Grapes, raw");
    const grapefruit = rank("grap", "Grapefruit, raw");
    expect(grapes.tier).toBe(grapefruit.tier);
    expect(grapes.head).toBeGreaterThan(grapefruit.head);
  });

  it("counts a head SHORTER than the query as a mismatch too", () => {
    // A signed difference made a too-short head score highest of all: for
    // "soy milk", "Milk, imitation, non-soy" (head 4 characters) beat
    // "Soy milk, unsweetened" (head 7, an exact fill) on +3 against 0.
    const exact = rank("soy milk", "Soy milk, unsweetened, plain");
    const tooShort = rank("soy milk", "Milk, imitation, non-soy");
    expect(exact.head).toBeGreaterThan(tooShort.head);
    expect(exact.head).toBeCloseTo(0);
  });

  it("ranks a head the query does not cover below every head it does", () => {
    expect(rank("grape", "Juice, grape, canned").head).toBeLessThan(
      rank("grape", "Grapefruit, raw").head
    );
  });

  it("strips a wildcard the caller supplied, so 'bana*' is 'bana'", () => {
    expect(rank("bana*", "Bananas, raw").tier).toBe(
      rank("bana", "Bananas, raw").tier
    );
  });

  it("is case-blind, so a phone's capitalised first word still searches", () => {
    expect(rank("Banana", "Bananas, raw").tier).toBe(50);
  });
});

describe("compareRelevance", () => {
  it("consults each key only when the one before it ties", () => {
    const key = (
      tier: number,
      raw: number,
      head: number,
      simplicity: number
    ) => ({ tier, raw, head, simplicity });
    // A stronger tier wins even against a raw food.
    expect(compareRelevance(key(40, 0, 0, 0), key(20, 1, 0, 3))).toBeLessThan(
      0
    );
    // Within a tier, raw wins over head-completeness.
    expect(compareRelevance(key(20, 1, -9, 0), key(20, 0, 0, 3))).toBeLessThan(
      0
    );
    // Then head-completeness, then simplicity.
    expect(compareRelevance(key(20, 1, -1, 0), key(20, 1, -9, 3))).toBeLessThan(
      0
    );
    expect(compareRelevance(key(20, 1, -1, 3), key(20, 1, -1, 2))).toBeLessThan(
      0
    );
    expect(compareRelevance(key(20, 1, -1, 3), key(20, 1, -1, 3))).toBe(0);
  });
});
