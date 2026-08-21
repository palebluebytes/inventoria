import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// bundle and backup scripts beside it.
// @ts-ignore
import {
  APP_EXPORTS,
  RANKING_EXPORTS,
  VOCABULARY_EXPORTS,
} from "../../scripts/usda-app-module.mjs";
import * as usdaFdc from "../../src/lib/food/usda-fdc";
import * as ranking from "../../src/lib/food/reference-food-ranking";
import { DENIED_VOCABULARY_TAGS } from "../../src/lib/food/food-vocabulary";

// ADR-0047 §4's import-don't-copy rule, over the one module that carries it.
// The corpus is produced by the app's own filters, ranked by the app's own
// ranking and screened by the app's own deny-list, so a rename in any of the
// three has to be followed here. Failing as a test beats failing as a
// regeneration nobody runs for months.

describe("the app seam — the scripts borrow the app instead of copying it", () => {
  it("names only real exports of usda-fdc.ts", () => {
    for (const name of APP_EXPORTS)
      expect(typeof (usdaFdc as Record<string, unknown>)[name]).toBe(
        "function"
      );
  });

  it("names only real exports of the ranking", () => {
    for (const name of RANKING_EXPORTS)
      expect(typeof (ranking as Record<string, unknown>)[name]).toBe(
        "function"
      );
  });

  it("names the one input to the vocabulary a machine cannot supply", () => {
    expect(VOCABULARY_EXPORTS).toEqual(["DENIED_VOCABULARY_TAGS"]);
    expect(Array.isArray(DENIED_VOCABULARY_TAGS)).toBe(true);
  });

  it("borrows each name from exactly one module", () => {
    // Three rosters composed into one bundle: a name in two of them would make
    // whichever module the entry re-exports last silently win.
    const all = [...APP_EXPORTS, ...RANKING_EXPORTS, ...VOCABULARY_EXPORTS];
    expect(new Set(all).size).toBe(all.length);
  });
});
