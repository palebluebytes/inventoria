import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  SEARCH_RESULT_LIMIT,
  buildSearchCorpus,
  mapIndexRowToPayload,
  searchIndexRows,
  searchUsdaCorpus,
  type SearchIndex,
  type UsdaIndexRow,
} from "../../src/lib/food/usda-corpus";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  NUTRITION_INFO_ATTR,
  type NutritionInfo,
} from "../../src/lib/food/nutrition";
import type { RawProvenance } from "../../src/lib/food/provenance";

// The committed artifact itself is the fixture (ADR-0047 §3). Search is only
// keyless and offline if it answers from THIS file, so the ADR-0042 ordering
// cases are asserted over the 4,491 rows the app actually ships rather than
// over a hand-built stand-in that could agree with the code and not the data.
const index: SearchIndex = JSON.parse(
  readFileSync("public/usda/search-index.json", "utf8")
);
const corpus = buildSearchCorpus(index);
const descriptionsFor = (query: string): string[] =>
  searchIndexRows(corpus, query).map((row) => row.description);

describe("the bundled search index", () => {
  it("is the ADR-0042 survivors, and says which archives it came from", () => {
    expect(index.foods.length).toBe(4491);
    expect(index.generated_from.map((a) => a.dataset)).toEqual([
      "Foundation Foods",
      "SR Legacy",
    ]);
  });
});

// ── ADR-0042's ranking, over the corpus rather than over one FDC page ────────
// The ordering functions are unchanged and already unit-tested; what these
// assert is that ranking the whole local corpus reaches the same answers the
// API's boosted, paged query used to — the claim ADR-0047 makes when it retires
// the Lucene boost.

describe("searchIndexRows", () => {
  it("puts Grapes above Grapefruit", () => {
    const found = descriptionsFor("grape");
    const grapes = found.findIndex((d) => d.startsWith("Grapes,"));
    const grapefruit = found.findIndex((d) => d.startsWith("Grapefruit"));
    expect(grapes).toBeGreaterThanOrEqual(0);
    expect(grapefruit).toBeGreaterThan(grapes);
  });

  it("reaches Grapes from a three-character 'gra', with no boost to help it", () => {
    // The head-completeness tiebreak is what does this now; ADR-0042 §2's
    // `lowercaseDescription.keyword^500` existed only to win one FDC page.
    expect(descriptionsFor("gra")[0]).toMatch(/^Grapes,/);
  });

  it("reaches balsamic vinegar, which FDC's stemmed index could not", () => {
    // "balsamic" indexes as "balsam" at FDC, so `balsamic*` matched nothing and
    // a bare token had to ride alongside the wildcard (385d5df). A local index
    // is not stemmed, so the word is simply there.
    expect(descriptionsFor("balsamic")).toContain("Vinegar, balsamic");
  });

  it("leads with the base ingredient, not the food that merely mentions it", () => {
    // The corpus holds "Bread, banana, …" and "Pepper, banana, raw" alongside
    // the fruit; the head-phrase tier is what puts the bananas themselves first.
    expect(descriptionsFor("banana")[0]).toMatch(/^Bananas,/);
  });

  it("matches every token, not just one of them", () => {
    // A rice milk answers "milk" but not "soy milk"; an OR-of-prefixes query
    // returned it and the ranking had to bury it. Locally it never matches.
    expect(descriptionsFor("soy milk")).not.toContain("Beverages, rice milk");
  });

  it("returns nothing for a query no reference food answers", () => {
    expect(descriptionsFor("gorgonzola nibs of the sea")).toEqual([]);
  });

  it("returns nothing for an empty query rather than the whole corpus", () => {
    expect(searchIndexRows(corpus, "   ")).toEqual([]);
  });

  it("caps a broad query at one page rather than handing over the corpus", () => {
    // A bare "b" matches thousands of rows. The list is rendered one option per
    // row, so the cap is what the FDC page size used to be.
    const broad = searchIndexRows(corpus, "b");
    expect(broad.length).toBe(SEARCH_RESULT_LIMIT);
  });
});

// ── One index row -> the food twin payload the app ingests ──────────────────

// The Foundation banana, whose SR Legacy twin (173944, "Bananas, raw") filled
// the fields Foundation is silent about — so one row exercises every optional
// the mapper reads: category, scientific name, portions and `merged_from`.
const BANANA = "Bananas, ripe and slightly ripe, raw";

const rowFor = (description: string): UsdaIndexRow => {
  const row = index.foods.find((f) => f.description === description);
  if (!row) throw new Error(`no index row for “${description}”`);
  return row;
};

describe("mapIndexRowToPayload", () => {
  it("carries identity, the macros a result row renders, and the portions", () => {
    const payload = mapIndexRowToPayload(rowFor(BANANA));
    expect(payload.entity).toBe("fdc:1105314");
    expect(payload.attributes["food/name"]).toBe(BANANA);
    const panel = payload.attributes[NUTRITION_INFO_ATTR] as NutritionInfo;
    expect(panel.serving_size).toBe(PER_100G);
    expect(panel.calories).toBeGreaterThan(0);
    expect(panel.protein_content).toBeGreaterThan(0);
    expect(payload.attributes[FOOD_PORTIONS_ATTR]).toBeInstanceOf(Array);
  });

  it("keeps the food-identity scalars the source carried, and omits the rest", () => {
    const banana = mapIndexRowToPayload(rowFor(BANANA));
    expect(banana.attributes["food/category"]).toBe("Fruits and Fruit Juices");
    expect(banana.attributes["food/scientific_name"]).toBe(
      "Musa acuminata Colla"
    );
    // SR Legacy usually has no scientific name; absent stays absent, never "".
    const noScientificName = index.foods.find((f) => !f.scientificName);
    expect(noScientificName).toBeDefined();
    expect(
      mapIndexRowToPayload(noScientificName!).attributes
    ).not.toHaveProperty("food/scientific_name");
  });

  it("keeps twin/raw_provenance present, naming the canonical USDA URI", () => {
    // Its presence is load-bearing: the origin badge reads the envelope's
    // adapter and FoodCard reads that the blob is there (ADR-0047 §7).
    const provenance = mapIndexRowToPayload(rowFor(BANANA)).attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance.adapter).toBe("fdc");
    expect(provenance.source_uri).toBe(
      "https://api.nal.usda.gov/fdc/v1/food/1105314"
    );
    expect(provenance.raw_data.fdcId).toBe(1105314);
  });

  it("still names the SR Legacy twin whose values the panel borrowed", () => {
    // ADR-0045 §4: a merged panel must never read as one record USDA served,
    // and with hydration retired the generated row is the only carrier.
    const merged = index.foods.find((f) => f.merged_from);
    expect(merged).toBeDefined();
    const provenance = mapIndexRowToPayload(merged!).attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance.merged_from?.[0].filled_fields.length).toBeGreaterThan(0);
  });

  it("omits merged_from entirely for a food that merged nothing", () => {
    const unmerged = index.foods.find((f) => !f.merged_from);
    const provenance = mapIndexRowToPayload(unmerged!).attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance).not.toHaveProperty("merged_from");
  });
});

// ── The search a keystroke actually runs ─────────────────────────────────────

describe("searchUsdaCorpus", () => {
  const loadFixture = async () => corpus;

  it("answers from the bundled index, with no key and no network", async () => {
    // No fetch is stubbed and no key is configured: if either were reached the
    // call would throw rather than return foods.
    const foods = await searchUsdaCorpus("banana", loadFixture);
    expect(foods[0].attributes["food/name"]).toMatch(/^Bananas,/);
    expect(foods[0].attributes["nutrition/info"].calories).toBeGreaterThan(0);
  });

  it("returns nothing for an empty query", async () => {
    expect(await searchUsdaCorpus("  ", loadFixture)).toEqual([]);
  });
});
