import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// bundle and backup scripts beside it.
// @ts-ignore
import {
  APP_EXPORTS,
  FOOD_KIND_EXPORTS,
  VARIANT_DROP_EXPORTS,
  RANKING_EXPORTS,
  VOCABULARY_EXPORTS,
  CORPUS_EXPORTS,
  TWIN_LEDGER_EXPORTS,
} from "../../scripts/usda-app-module.mjs";
import * as usdaFdc from "../../src/lib/food/usda-fdc";
import * as foodKind from "../../src/lib/food/usda-food-kind";
import * as variantDrops from "../../src/lib/food/usda-variant-drops";
import * as ranking from "../../src/lib/food/reference-food-ranking";
import {
  DENIED_VOCABULARY_TAGS,
  LOCAL_VOCABULARY,
  LOCAL_VOCABULARY_CEILING,
} from "../../src/lib/food/food-vocabulary";
import * as corpus from "../../src/lib/food/usda-corpus";

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

  it("names only real exports of usda-food-kind.ts", () => {
    for (const name of FOOD_KIND_EXPORTS)
      expect(typeof (foodKind as Record<string, unknown>)[name]).toBe(
        "function"
      );
  });

  it("names the variant rule and the hand list behind it", () => {
    // ADR-0061's own module. One corpus-wide judgement, and one roster checked
    // the way `VOCABULARY_EXPORTS` checks its own two below, because a list is
    // not a function and a `typeof` sweep would wave it through.
    expect(VARIANT_DROP_EXPORTS).toEqual([
      "resolveVariantDrops",
      "ADJUDICATED_VARIANTS",
    ]);
    expect(typeof variantDrops.resolveVariantDrops).toBe("function");
    expect(Array.isArray(variantDrops.ADJUDICATED_VARIANTS)).toBe(true);
  });

  it("names only real exports of the ranking", () => {
    for (const name of RANKING_EXPORTS)
      expect(typeof (ranking as Record<string, unknown>)[name]).toBe(
        "function"
      );
  });

  it("names the inputs to the vocabulary a machine cannot supply", () => {
    expect(VOCABULARY_EXPORTS).toEqual([
      "DENIED_VOCABULARY_TAGS",
      "LOCAL_VOCABULARY",
      "LOCAL_VOCABULARY_CEILING",
    ]);
    expect(Array.isArray(DENIED_VOCABULARY_TAGS)).toBe(true);
    expect(Array.isArray(LOCAL_VOCABULARY)).toBe(true);
    expect(typeof LOCAL_VOCABULARY_CEILING).toBe("number");
  });

  it("names the search the hand list's expected rows are measured through", () => {
    // The hand-written vocabulary claims what a query LEADS with, which the
    // ranking alone cannot answer — the fallback and the matching tiers are
    // part of it (ADR-0049's #141 Amendment).
    for (const name of CORPUS_EXPORTS)
      expect(typeof (corpus as Record<string, unknown>)[name]).toBe("function");
  });

  it("borrows each name from exactly one module", () => {
    // Seven rosters composed into one bundle: a name in two of them would make
    // whichever module the entry re-exports last silently win. That is the
    // failure the #146 split could have introduced — a filter left behind in
    // `APP_EXPORTS` as well as named in the new one would still load, and would
    // load whichever copy esbuild wrote second.
    const all = [
      ...APP_EXPORTS,
      ...FOOD_KIND_EXPORTS,
      ...VARIANT_DROP_EXPORTS,
      ...RANKING_EXPORTS,
      ...VOCABULARY_EXPORTS,
      ...CORPUS_EXPORTS,
      ...TWIN_LEDGER_EXPORTS,
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});
