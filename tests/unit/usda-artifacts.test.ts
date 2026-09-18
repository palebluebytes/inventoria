import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig, like the
// bundle and backup scripts beside it.
// @ts-ignore
import {
  SCHEMA_VERSION,
  kib,
  measure,
  serialiseIndex,
  serialiseNutrientStore,
  serialisePairingIndex,
  serialisePairingNutrientStore,
} from "../../scripts/usda-artifacts.mjs";

// ADR-0047 §3: both artifacts are committed, so their bytes are a review
// surface. The layout is what makes a mirror refresh diff as the foods that
// moved rather than as one changed line nobody can read.

describe("serialisation — stable, diffable, one food per line", () => {
  const index = {
    schema_version: SCHEMA_VERSION,
    generated_from: [{ dataset: "SR Legacy", release: "2018-04" }],
    state_qualifiers: ["raw", "raw or frozen", "uncooked"],
    vocabulary_off: {
      licence: "ODbL",
      source: "Open Food Facts",
      url: "https://static.openfoodfacts.org/x.json",
      sha256: "abc",
      expansions: { aubergine: ["eggplant"], courgette: ["zucchini"] },
    },
    vocabulary_local: {
      source: "Inventoria, hand-written",
      expansions: { gammon: ["pork cured ham"] },
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

  it("keeps each vocabulary a section of its own, beside foods", () => {
    const parsed = JSON.parse(serialiseIndex(index));
    expect(parsed.vocabulary_off).toEqual(index.vocabulary_off);
    expect(parsed.vocabulary_local).toEqual(index.vocabulary_local);
    expect(Object.keys(parsed)).toEqual([
      "artifact",
      "schema_version",
      "generated_from",
      "state_qualifiers",
      "vocabulary_off",
      "vocabulary_local",
      "foods",
    ]);
  });

  it("writes the state roster on one line, because it is read whole", () => {
    // Not one phrase per line, unlike the two vocabularies next to it. Those are
    // the review gate for a source rewritten in place upstream (ADR-0049 §2), so
    // a moved taxonomy has to diff as the phrases that moved. This roster is six
    // words written by hand in `usda-shipped-name.ts`, and a change to it is
    // already a reviewed diff there; here it is a copy, and a copy diffs best as
    // the one line it is.
    expect(serialiseIndex(index).trimEnd().split("\n")).toContain(
      '"state_qualifiers": ["raw","raw or frozen","uncooked"],'
    );
  });

  it("renders the fields a section has rather than the fields ODbL needs", () => {
    // The hand-written section has no upstream to pin and no ODbL obligation to
    // declare, which is the whole reason it is a section of its own (ADR-0049
    // section 4). A renderer with the derived section's four fields baked in
    // would emit `"licence": undefined` for the half whose point is the absence.
    const lines = serialiseIndex(index).trimEnd().split("\n");
    expect(lines).toContain('"source": "Inventoria, hand-written",');
    expect(lines).toContain('"gammon": ["pork cured ham"]');
    expect(serialiseIndex(index)).not.toContain("undefined");
  });
});

describe("the pairing artifacts — the same rows, one section fewer", () => {
  // ADR-0113 §11. The cooked records ship as their own two files, and the
  // Vocabulary map is shared from the shipped index rather than duplicated:
  // there is no path to declaring a pack cooked that has not already loaded it.
  const index = {
    schema_version: SCHEMA_VERSION,
    generated_from: [{ dataset: "SR Legacy", release: "2018-04" }],
    foods: [
      { fdcId: 173735, description: "Beans, black, dried, cooked, boiled" },
      { fdcId: 173740, description: "Beans, kidney, dried, cooked, boiled" },
    ],
  };
  const store = {
    schema_version: SCHEMA_VERSION,
    generated_from: [{ dataset: "SR Legacy", release: "2018-04" }],
    nutrients: { 1003: { name: "Protein", unit: "g" } },
    foods: { 173735: { 1003: 8.86 } },
  };

  it("names itself as the artifact a reader would refuse a search on", () => {
    expect(JSON.parse(serialisePairingIndex(index)).artifact).toBe(
      "usda-pairing-index"
    );
    expect(JSON.parse(serialisePairingNutrientStore(store)).artifact).toBe(
      "usda-pairing-nutrient-store"
    );
  });

  it("carries no vocabulary and no state roster of its own", () => {
    expect(Object.keys(JSON.parse(serialisePairingIndex(index)))).toEqual([
      "artifact",
      "schema_version",
      "generated_from",
      "foods",
    ]);
  });

  it("puts each food on its own line, like the file it mirrors", () => {
    const lines = serialisePairingIndex(index).trimEnd().split("\n");
    expect(lines).toContain(
      '{"fdcId":173735,"description":"Beans, black, dried, cooked, boiled"},'
    );
    expect(
      serialisePairingNutrientStore(store).trimEnd().split("\n")
    ).toContain('"173735": {"1003":8.86}');
  });

  it("carries the schema version the shipped pair carries", () => {
    // One corpus, one generation, one number: a pair that disagreed about their
    // version would be the bug the number exists to catch, and so would a pair
    // of pairs.
    expect(JSON.parse(serialisePairingIndex(index)).schema_version).toBe(
      SCHEMA_VERSION
    );
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
