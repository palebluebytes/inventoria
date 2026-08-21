import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// bundle and backup scripts beside it.
// @ts-ignore
import {
  kib,
  measure,
  serialiseIndex,
  serialiseNutrientStore,
} from "../../scripts/usda-artifacts.mjs";
// @ts-ignore
import { SCHEMA_VERSION } from "../../scripts/usda-bundle.mjs";

// ADR-0047 §3: both artifacts are committed, so their bytes are a review
// surface. The layout is what makes a mirror refresh diff as the foods that
// moved rather than as one changed line nobody can read.

describe("serialisation — stable, diffable, one food per line", () => {
  const index = {
    schema_version: SCHEMA_VERSION,
    generated_from: [{ dataset: "SR Legacy", release: "2018-04" }],
    vocabulary_off: {
      licence: "ODbL",
      source: "Open Food Facts",
      url: "https://static.openfoodfacts.org/x.json",
      sha256: "abc",
      expansions: { aubergine: ["eggplant"], courgette: ["zucchini"] },
    },
    foods: [
      { fdcId: 100, description: "Apples, raw" },
      { fdcId: 900, description: "Pears, raw" },
    ],
  };
  const store = {
    schema_version: SCHEMA_VERSION,
    generated_from: [{ dataset: "SR Legacy", release: "2018-04" }],
    nutrients: { 1003: { name: "Protein", unit: "g" } },
    foods: { 100: { 1003: 0.3 }, 900: { 1003: 0.4 } },
  };

  it("puts each index food on its own line, so a refresh diffs as changed foods", () => {
    const lines = serialiseIndex(index).trimEnd().split("\n");
    expect(lines).toContain('{"fdcId":100,"description":"Apples, raw"},');
    expect(lines).toContain('{"fdcId":900,"description":"Pears, raw"}');
  });

  it("puts each nutrient-store food on its own line, keyed by fdcId", () => {
    const lines = serialiseNutrientStore(store).trimEnd().split("\n");
    expect(lines).toContain('"100": {"1003":0.3},');
    expect(lines).toContain('"900": {"1003":0.4}');
  });

  it("names which artifact it is, and the schema a reader has to understand", () => {
    expect(JSON.parse(serialiseIndex(index))).toMatchObject({
      artifact: "usda-search-index",
      schema_version: SCHEMA_VERSION,
    });
    expect(JSON.parse(serialiseNutrientStore(store))).toMatchObject({
      artifact: "usda-nutrient-store",
      schema_version: SCHEMA_VERSION,
    });
  });

  it("round-trips through JSON.parse with every field intact", () => {
    expect(JSON.parse(serialiseIndex(index)).foods).toEqual(index.foods);
    const parsed = JSON.parse(serialiseNutrientStore(store));
    expect(parsed.foods).toEqual({ 100: { 1003: 0.3 }, 900: { 1003: 0.4 } });
    expect(parsed.nutrients).toEqual(store.nutrients);
  });

  it("is byte-identical on a second run, so regenerating is a no-op diff", () => {
    expect(serialiseIndex(index)).toBe(serialiseIndex(index));
    expect(serialiseNutrientStore(store)).toBe(serialiseNutrientStore(store));
  });

  it("writes an empty corpus without emitting a stray blank line", () => {
    expect(serialiseIndex({ ...index, foods: [] })).toContain('"foods": []');
  });

  it("puts each vocabulary phrase on its own line, so a refresh diffs as words", () => {
    // The committed map IS the review gate for a source that is unversioned and
    // rewritten in place (ADR-0049 section 2), so a taxonomy that moves has to
    // diff as the handful of phrases that moved.
    const lines = serialiseIndex(index).trimEnd().split("\n");
    expect(lines).toContain('"aubergine": ["eggplant"],');
    expect(lines).toContain('"courgette": ["zucchini"]');
  });

  it("keeps the vocabulary a section of its own, beside foods", () => {
    const parsed = JSON.parse(serialiseIndex(index));
    expect(parsed.vocabulary_off).toEqual(index.vocabulary_off);
    expect(Object.keys(parsed)).toEqual([
      "artifact",
      "schema_version",
      "generated_from",
      "vocabulary_off",
      "foods",
    ]);
  });
});

describe("measure — a size is never quoted without its compressor", () => {
  // #120 found this artifact 40% larger than three ADRs claimed, and the two
  // figures that disagreed were the same bytes under gzip and brotli. All three
  // are returned so a caller cannot quote one and mean another.
  const sizes = measure("x".repeat(4096));

  it("returns raw, gzip and brotli for the same text", () => {
    expect(Object.keys(sizes).sort()).toEqual(["brotli", "gzip", "raw"]);
    expect(sizes.raw).toBe(4096);
    expect(sizes.gzip).toBeLessThan(sizes.raw);
    expect(sizes.brotli).toBeLessThan(sizes.raw);
  });

  it("counts bytes rather than characters", () => {
    expect(measure("µg").raw).toBe(3);
  });

  it("renders a byte count the way the run reports it", () => {
    expect(kib(4096)).toBe("4 KiB");
  });
});
