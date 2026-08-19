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
    expect(rank("grape", "Grapes, raw").tier).toBe(40);
    expect(rank("grape", "Grape leaves, raw").tier).toBeLessThan(40);
  });

  it("scores a whole-word match above a bare prefix one", () => {
    // "grape" is a whole word of "Juice, grape, canned" but the head is "juice";
    // it is only a prefix of "grapefruit".
    expect(rank("grape", "Juice, grape, canned").tier).toBe(20);
    expect(rank("grapefruit", "Grapefruit juice, white").tier).toBe(20);
    expect(rank("grape", "Grapefruit, raw").tier).toBe(10);
  });

  it("scores a name no token reaches as no match at all", () => {
    expect(rank("gorgonzola", "Bananas, raw").tier).toBe(0);
  });

  it("requires EVERY token, not just one", () => {
    expect(rank("soy milk", "Beverages, rice milk").tier).toBe(0);
    expect(rank("soy milk", "Soy milk, unsweetened").tier).toBe(40);
  });

  it("prefers the head the query fills most completely, mid-word", () => {
    // "grap" cannot stem-match "grapes" yet, so both collapse into the prefix
    // tier and head-completeness is what separates them.
    const grapes = rank("grap", "Grapes, raw");
    const grapefruit = rank("grap", "Grapefruit, raw");
    expect(grapes.tier).toBe(grapefruit.tier);
    expect(grapes.head).toBeGreaterThan(grapefruit.head);
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
    expect(rank("Banana", "Bananas, raw").tier).toBe(40);
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
