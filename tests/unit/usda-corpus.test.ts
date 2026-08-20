import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  SEARCH_RESULT_LIMIT,
  buildSearchCorpus,
  mapIndexRowToPayload,
  searchIndexRows,
  searchUsdaCorpus,
  storedPanelFor,
  completeStagedPanel,
  type NutrientStore,
  type SearchIndex,
  type UsdaIndexRow,
} from "../../src/lib/food/usda-corpus";
import {
  PER_100G,
  FOOD_PORTIONS_ATTR,
  NUTRITION_INFO_ATTR,
  reportsNoEnergy,
  type NutritionInfo,
} from "../../src/lib/food/nutrition";
import { isDryBasisRecord } from "../../src/lib/food/usda-fdc";
import type { RawProvenance } from "../../src/lib/food/provenance";
import type { EntityPayload } from "../../src/lib/ingestion/ingest";

// The committed artifact itself is the fixture (ADR-0047 §3). Search is only
// keyless and offline if it answers from THIS file, so the ADR-0042 ordering
// cases are asserted over the 4,461 rows the app actually ships rather than
// over a hand-built stand-in that could agree with the code and not the data.
const index: SearchIndex = JSON.parse(
  readFileSync("public/usda/search-index.json", "utf8")
);
const corpus = buildSearchCorpus(index);
const descriptionsFor = (query: string): string[] =>
  searchIndexRows(corpus, query).map((row) => row.description);

describe("the bundled search index", () => {
  it("is the surviving reference foods, and says which archives it came from", () => {
    expect(index.foods.length).toBe(4461);
    expect(index.generated_from.map((a) => a.dataset)).toEqual([
      "Foundation Foods",
      "SR Legacy",
    ]);
  });

  // ── ADR-0048's invariant, over the artifact itself ────────────────────────
  // Locked here rather than in the generator because a mirror refresh is the
  // way it would come back: the filters run at generation, and a refresh that
  // reintroduced a calorie-less record would otherwise ship it silently — which
  // is exactly how `Oil, olive, extra virgin` reached the corpus in the first
  // place (#126).

  it("carries an energy value on every row — an absent measurement is not a zero", () => {
    // PRESENCE, not non-zero (ADR-0048 §1). Nine rows report a measured 0 and
    // are correct: tap water, iodised salt, decaffeinated coffee and tea.
    const silent = index.foods.filter((row) =>
      reportsNoEnergy({ serving_size: PER_100G, ...row.macros })
    );
    expect(silent.map((row) => row.description)).toEqual([]);

    // Not vacuous, and the distinction is the whole point: the measured zeros
    // are still here.
    const measuredZero = index.foods.filter((row) => row.macros.calories === 0);
    expect(measuredZero.map((row) => row.description)).toContain(
      "Beverages, water, tap, drinking"
    );
    expect(measuredZero).toHaveLength(9);
  });

  it("keeps the five twinned oils, on their twin's energy and their twin's fat", () => {
    // ADR-0048 §5's ordering, verified against the shipped artifact rather than
    // a fixture: each of these reports no energy of its own and borrows it from
    // an SR Legacy twin, so a filter placed before `resolveFdcGroup` would have
    // dropped all five. `fat 100` is the twin's `1004` — §2 declined to read the
    // `1085` these records carry, which would have shipped 884 kcal beside 94.5 g.
    const oils = ["canola", "corn", "soybean", "peanut", "safflower"].map(
      (kind) => index.foods.find((row) => row.description === `Oil, ${kind}`)
    );
    expect(oils.map((row) => row?.macros.fat_content)).toEqual([
      100, 100, 100, 100, 100,
    ]);
    expect(oils.map((row) => row?.macros.calories)).toEqual([
      884, 900, 884, 884, 884,
    ]);
    for (const oil of oils)
      expect(oil?.merged_from?.[0].filled_fields).toContain("calories");
  });

  it("offers no dry-basis assay as a food", () => {
    // The seventeen `Beans, Dry, … (0% moisture)` records: per 100 g of dry
    // matter, published to compare cultivars, and not a food anyone eats
    // (ADR-0048 §5). The dried beans as sold stay.
    expect(
      index.foods.filter((row) => isDryBasisRecord(row.description))
    ).toEqual([]);
    expect(
      index.foods.filter((row) => /mature seeds, raw$/.test(row.description))
        .length
    ).toBeGreaterThan(30);
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

  it("reaches the food a partial query is naming, not a qualifier it lands on", () => {
    // "pot" used to return "Beef, chuck, arm pot roast, …" first, with the first
    // "Potatoes," row at position 40 — the retired ADR-0042 §2 boost had been
    // doing this job, and ranking the whole corpus had no equivalent.
    expect(descriptionsFor("pot")[0]).toMatch(/^Potatoes,/);
    expect(descriptionsFor("potato")[0]).toMatch(/^Potatoes,/);
    expect(descriptionsFor("tomato")[0]).toMatch(/^Tomatoes,/);
  });

  it("leads with the food the whole query names, not one word of it", () => {
    expect(descriptionsFor("soy milk")[0]).toMatch(/^Soy milk,/);
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

// ── Staging: the full panel, read out of the Nutrient store (#114) ───────────
// A search row renders four macros (ADR-0047 §2), so the other nineteen panel
// fields are read from the Nutrient store when the food is staged. These assert
// the store answers with the SAME panel the mapper builds from a live record —
// the drift the two artifacts could otherwise develop is invisible in the app
// and permanent in the ledger, because a log freezes its own macros (ADR-0022).

const store: NutrientStore = JSON.parse(
  readFileSync("public/usda/nutrient-store.json", "utf8")
);

/** A Nutrient store holding one food, for the normalisation cases. */
const storeOf = (
  amounts: Record<string, number>,
  nutrients: NutrientStore["nutrients"]
): NutrientStore => ({
  artifact: "usda-nutrient-store",
  schema_version: 1,
  generated_from: [],
  nutrients,
  foods: { "1": amounts },
});

describe("storedPanelFor", () => {
  it("fills the nineteen panel fields a search row does not carry", () => {
    const panel = storedPanelFor(store, 1105314);
    expect(panel?.serving_size).toBe(PER_100G);
    // The row carries these four; the store has to reproduce them exactly, or a
    // staged food's panel would disagree with the list it was chosen from.
    expect(panel).toMatchObject(rowFor(BANANA).macros);
    // And these nineteen are what staging is for.
    expect(panel?.fiber_content).toBe(1.7);
    expect(panel?.sugar_content).toBe(15.8);
    expect(panel?.saturated_fat_content).toBe(0.112);
    expect(panel?.potassium).toBeCloseTo(0.326, 6);
    expect(panel?.vitamin_c).toBeCloseTo(0.0123, 6);
  });

  it("rebuilds every row's macros exactly, across the whole corpus", () => {
    // The two artifacts are generated from one merged record, so a row's macros
    // and the store's amounts are the same numbers twice. Assert it over all
    // 4,461 rather than on one food: a generator change that filled one artifact
    // and not the other would otherwise ship silently.
    const disagreeing = index.foods.filter((row) => {
      const panel = storedPanelFor(store, row.fdcId);
      return (
        !panel ||
        Object.entries(row.macros).some(
          ([key, value]) => panel[key as keyof NutritionInfo] !== value
        )
      );
    });
    expect(disagreeing).toEqual([]);
  });

  it("carries the fields a merged food borrowed from its SR Legacy twin", () => {
    // ADR-0045 §2 merges at panel-field granularity and the store holds the
    // merged record's nutrients, so a borrowed field has to survive into the
    // staged panel — `merged_from` naming a field the panel then lacks would be
    // a provenance claim about a value nobody can see.
    const merged = index.foods.find((f) => f.merged_from);
    const panel = storedPanelFor(store, merged!.fdcId);
    for (const field of merged!.merged_from![0].filled_fields)
      expect(panel?.[field as keyof NutritionInfo]).toBeDefined();
  });

  it("normalises USDA's published units to the panel's grams", () => {
    // The archives write micrograms as "µg" where the API wrote "UG", and the
    // panel's fixed unit is grams (ADR-0021).
    const panel = storedPanelFor(
      storeOf(
        { "1087": 5, "1106": 1 },
        {
          "1087": { name: "Calcium, Ca", unit: "mg" },
          "1106": { name: "Vitamin A, RAE", unit: "µg" },
        }
      ),
      1
    );
    expect(panel?.calcium).toBeCloseTo(0.005, 9);
    expect(panel?.vitamin_a).toBeCloseTo(0.000001, 12);
  });

  it("reads energy through the Atwater fallback a Foundation food needs", () => {
    // Foundation records omit 1008 and publish Atwater factors instead, so a
    // stored panel that only looked at 1008 would stage them at no calories.
    const panel = storedPanelFor(
      storeOf(
        { "2047": 88 },
        { "2047": { name: "Energy (Atwater General Factors)", unit: "kcal" } }
      ),
      1
    );
    expect(panel?.calories).toBe(88);
  });

  it("sums mono and poly into the one unsaturated fat the panel has", () => {
    const panel = storedPanelFor(
      storeOf(
        { "1292": 0.032, "1293": 0.073 },
        {
          "1292": { name: "Fatty acids, total monounsaturated", unit: "g" },
          "1293": { name: "Fatty acids, total polyunsaturated", unit: "g" },
        }
      ),
      1
    );
    expect(panel?.unsaturated_fat_content).toBeCloseTo(0.105, 6);
  });

  it("has no panel for a food the store does not carry", () => {
    expect(storedPanelFor(store, 4242424242)).toBeUndefined();
  });
});

describe("completeStagedPanel", () => {
  const loadStore = async () => store;

  it("stages a searched food on its full panel, with no key and no network", async () => {
    // No fetch is stubbed: the panel comes out of the committed artifact or the
    // call fails. This is the ADR-0047 §6 claim — staging needs no second
    // request now that the archives ship with the app.
    const staged = await completeStagedPanel(
      mapIndexRowToPayload(rowFor(BANANA)),
      loadStore
    );
    const panel = staged.attributes[NUTRITION_INFO_ATTR] as NutritionInfo;
    expect(panel.potassium).toBeCloseTo(0.326, 6);
    expect(panel.calories).toBe(rowFor(BANANA).macros.calories);
  });

  it("leaves identity, portions and provenance exactly as the row wrote them", async () => {
    // Only the panel deepens. `twin/raw_provenance` stays present and stays the
    // generated row (ADR-0047 §7) — the origin badge reads its adapter and
    // FoodCard reads that it is there.
    const before = mapIndexRowToPayload(rowFor(BANANA));
    const after = await completeStagedPanel(before, loadStore);
    expect(after.entity).toBe(before.entity);
    expect(after.attributes["food/name"]).toBe(before.attributes["food/name"]);
    expect(after.attributes[FOOD_PORTIONS_ATTR]).toEqual(
      before.attributes[FOOD_PORTIONS_ATTR]
    );
    const provenance = after.attributes[
      "twin/raw_provenance"
    ] as RawProvenance<UsdaIndexRow>;
    expect(provenance.raw_data.fdcId).toBe(1105314);
    expect(provenance.merged_from?.[0].source_uri).toContain("173944");
  });

  it("does not read the store for a food that did not come from the corpus", async () => {
    // A scanned OFF product or a manual entry carries its own panel and has no
    // row in the store; loading a 4 MB artifact to learn that would be a cost
    // paid on every scan.
    const off: EntityPayload = {
      entity: "off:5000112637922",
      attributes: { "food/name": "Cola" },
    };
    const untouched = await completeStagedPanel(off, () => {
      throw new Error("the Nutrient store was loaded for a non-USDA food");
    });
    expect(untouched).toBe(off);
  });

  it("keeps the row's macros when the store carries no entry for the food", async () => {
    // A row the store has no nutrients for still stages and still logs, on the
    // four macros it carries — a partial artifact degrades the panel, never the
    // food.
    const row: UsdaIndexRow = { ...rowFor(BANANA), fdcId: 4242424242 };
    const staged = await completeStagedPanel(
      mapIndexRowToPayload(row),
      loadStore
    );
    expect(staged.attributes[NUTRITION_INFO_ATTR]).toEqual({
      serving_size: PER_100G,
      ...row.macros,
    });
  });
});

// ── Loading the artifacts ───────────────────────────────────────────────────

describe("loadNutrientStore", () => {
  it("retries after a failed load instead of caching the failure", async () => {
    // The store is warmed at startup, where the likeliest failure is a service
    // worker that has not taken control yet. A cached rejection would then stage
    // every food of the session on four macros — silently, and permanently once
    // logged (ADR-0022).
    vi.resetModules();
    const { loadNutrientStore } =
      await import("../../src/lib/food/usda-corpus");
    const fetches = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValue({ ok: true, json: async () => store } as Response);

    await expect(loadNutrientStore()).rejects.toThrow(/503/);
    await expect(loadNutrientStore()).resolves.toBe(store);
    // ...and the load that succeeded IS memoised: one parse per session.
    await loadNutrientStore();
    expect(fetches).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});
