import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapOffProductToPayload,
  lookupBarcode,
  ProductNotFoundError,
  submitToOpenFoodFacts,
  buildOffWriteBody,
  offWriteHost,
  parseCategoryList,
  offReferenceImagesFromTwin,
  fetchCategorySuggestions,
  isEnglishCategory,
  type OFFProduct,
} from "../../src/lib/food/open-food-facts";
import { getSecret } from "../../src/lib/stores/secrets";
import type { NutritionInfo } from "../../src/lib/food/nutrition";
import nutellaProduct from "./support/fixtures/off-nutella.json";

// The contribution seam reads the user's OFF login from localStorage (#60) via
// getSecret; under the node unit runner there is no localStorage, so mock the
// accessor to control the login state per test.
vi.mock("../../src/lib/stores/secrets", () => ({
  getSecret: vi.fn(() => ""),
}));
const mockGetSecret = getSecret as unknown as ReturnType<typeof vi.fn>;
/** Make getSecret report a logged-in OFF user for the duration of a test. */
function loginAs(user_id: string, password: string) {
  mockGetSecret.mockImplementation((key: string) =>
    key === "off_user_id" ? user_id : key === "off_password" ? password : ""
  );
}

// Seam 1 (ADR-0016 isolated-Mapper contract): feed the mapper a saved copy of a
// real Open Food Facts v3 product response and assert the emitted
// `nutrition/info` panel. The fixture is a real captured response, so the
// mapping meets the real field shape — including OFF's quirk that `sodium_100g`
// (0.0428 g) is a separate value from `salt_100g`.

const nutella = nutellaProduct as unknown as OFFProduct;

describe("mapOffProductToPayload", () => {
  it("maps barcode to entity id with gtin: prefix", () => {
    expect(mapOffProductToPayload(nutella).entity).toBe("gtin:3017620422003");
  });

  it("maps product_name to food/name", () => {
    expect(mapOffProductToPayload(nutella).attributes["food/name"]).toBe(
      "Nutella"
    );
  });

  it("emits the nutrition/info panel from the real per-100g nutriments", () => {
    // Nutella carries every macro except fiber, so fiber_content is absent;
    // sodium is OFF's own 0.0428 g, not the salt figure (0.107 g). The fixture's
    // `*_100g` micronutriments (already in grams) map across unchanged.
    const n = mapOffProductToPayload(nutella).attributes["nutrition/info"];
    expect(n).toEqual({
      serving_size: "100 g",
      calories: 539,
      protein_content: 6.3,
      fat_content: 30.9,
      carbohydrate_content: 57.5,
      sugar_content: 56.3,
      sodium_content: 0.0428,
      saturated_fat_content: 10.6,
      calcium: 0.108,
      iron: 0.0079,
      potassium: 0.4,
      magnesium: 0.061,
      zinc: 0.0026,
      vitamin_e: 0.0067,
      vitamin_b6: 0.0002,
    });
    expect(n).not.toHaveProperty("fiber_content");
    // The fixture reports no vitamin A/C/D/B12 or folate, so those stay absent.
    expect(n).not.toHaveProperty("vitamin_a");
    expect(n).not.toHaveProperty("vitamin_c");
    expect(n).not.toHaveProperty("vitamin_d");
    expect(n).not.toHaveProperty("vitamin_b12");
    expect(n).not.toHaveProperty("folate");
  });

  it("maps trans fat, cholesterol and unsaturated (mono+poly) fat", () => {
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        nutriments: {
          "trans-fat_100g": 0.2,
          cholesterol_100g: 0.01,
          "monounsaturated-fat_100g": 9.1,
          "polyunsaturated-fat_100g": 3.4,
        },
      },
    };
    const n = mapOffProductToPayload(product).attributes["nutrition/info"];
    expect(n.trans_fat_content).toBe(0.2);
    expect(n.cholesterol_content).toBe(0.01);
    expect(n.unsaturated_fat_content).toBe(12.5); // 9.1 + 3.4
  });

  it("falls back to 'Unknown' when product_name is missing", () => {
    const product: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, product_name: "" },
    };
    expect(mapOffProductToPayload(product).attributes["food/name"]).toBe(
      "Unknown"
    );
  });

  it("emits only the serving basis when no nutriments are present", () => {
    const product: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, nutriments: {} },
    };
    const n = mapOffProductToPayload(product).attributes["nutrition/info"];
    expect(n).toEqual({ serving_size: "100 g" });
  });

  it("maps brands to twin/brand and categories to food/category (ADR-0030)", () => {
    const attrs = mapOffProductToPayload(nutella).attributes;
    expect(attrs["twin/brand"]).toBe("Nutella, Ferrero, Yum yum");
    expect(attrs["food/category"]).toBe(
      "Breakfasts, Spreads, Sweet spreads, Hazelnut spreads, Chocolate spreads, Cocoa and hazelnuts spreads"
    );
  });

  it("maps ingredients_text to a scalar food/ingredients_text", () => {
    // Distinct from a recipe's structured recipe/ingredients references — this
    // is the raw source ingredients string (ADR-0030 §4).
    const attrs = mapOffProductToPayload(nutella).attributes;
    expect(attrs["food/ingredients_text"]).toContain("hazelnuts");
  });

  it("emits the food/assessment blob with the OFF proprietary signals", () => {
    // One atomic blob (ADR-0030 §4), mirroring nutrition/info's corrected-as-a-
    // unit granularity. Nutella carries every sub-field.
    const attrs = mapOffProductToPayload(nutella).attributes;
    expect(attrs["food/assessment"]).toEqual({
      nova_group: 4,
      nutri_score: "e",
      eco_score: "d",
      nutrient_levels: {
        fat: "high",
        salt: "low",
        sugars: "high",
        "saturated-fat": "high",
      },
      allergens: ["en:milk", "en:nuts", "en:soybeans"],
      additives: ["en:e322"],
      labels: ["en:no-gluten"],
    });
  });

  it("folds traces_tags into the assessment blob (adapter v7, ADR-0043 §6)", () => {
    // Forward-only May-contain source, DISTINCT from allergens_tags. Present only
    // when the product carries it; older foods simply lack the field.
    const product: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, traces_tags: ["en:peanuts", "en:eggs"] },
    };
    const assessment = mapOffProductToPayload(product).attributes[
      "food/assessment"
    ] as { traces?: string[] };
    expect(assessment.traces).toEqual(["en:peanuts", "en:eggs"]);
  });

  it("omits traces from the assessment when traces_tags is absent or empty", () => {
    // The Nutella fixture carries no traces_tags → no traces key emitted.
    const bare = mapOffProductToPayload(nutella).attributes["food/assessment"];
    expect(bare).not.toHaveProperty("traces");
    const emptied: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, traces_tags: [] },
    };
    expect(
      mapOffProductToPayload(emptied).attributes["food/assessment"]
    ).not.toHaveProperty("traces");
  });

  it("includes only the assessment sub-fields the product carries", () => {
    // A product with just a Nutri-Score emits an assessment holding that one
    // key — empty/absent signals are omitted, not zeroed.
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        nova_group: undefined,
        ecoscore_grade: undefined,
        nutrient_levels: undefined,
        allergens_tags: [],
        additives_tags: undefined,
        labels_tags: undefined,
      },
    };
    const attrs = mapOffProductToPayload(product).attributes;
    expect(attrs["food/assessment"]).toEqual({ nutri_score: "e" });
  });

  it("captures the NOVA evidence trail forward-only (adapter v6, ADR-0041 §7)", () => {
    // A product looked up after the widening carries OFF's nova_group_debug
    // marker trail and the labelled nova_groups_tags alongside the numeric tier,
    // so the explainer (#92) can show why OFF landed on the verdict.
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        nova_group_debug: "additives: en:e322 -> 4",
        nova_groups_tags: ["4"],
      },
    };
    const assessment = mapOffProductToPayload(product).attributes[
      "food/assessment"
    ] as Record<string, unknown>;
    expect(assessment.nova_group).toBe(4);
    expect(assessment.nova_group_debug).toBe("additives: en:e322 -> 4");
    expect(assessment.nova_groups_tags).toEqual(["4"]);
  });

  it("omits the NOVA evidence fields when the product carries neither (forward-only)", () => {
    // Older/sparse records: the tier still rides in nova_group, but the debug
    // trail and tags are simply absent rather than emitted empty.
    const assessment = mapOffProductToPayload(nutella).attributes[
      "food/assessment"
    ] as Record<string, unknown>;
    expect(assessment).not.toHaveProperty("nova_group_debug");
    expect(assessment).not.toHaveProperty("nova_groups_tags");
  });

  it("surfaces OFF completeness as a read-through sibling, never a datom (ADR-0034 §1)", () => {
    // A product-level completeness rides the returned payload so the found-but-
    // poor predicate can read it — but it is NOT an attribute, so `ingestEntity`
    // (which only flattens `attributes`) never turns it into a datom.
    const product: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, completeness: 0.38 },
    };
    const payload = mapOffProductToPayload(product);
    expect(payload.completeness).toBe(0.38);
    expect(payload.attributes).not.toHaveProperty("completeness");
  });

  it("leaves completeness undefined when the product omits it", () => {
    // The base fixture carries no completeness field.
    expect(mapOffProductToPayload(nutella).completeness).toBeUndefined();
  });

  it("surfaces OFF photo URLs read-through in label-read order (ADR-0034 §8)", () => {
    // Front first (identity), then nutrition (the values), then the faces the
    // product has — dropping any it lacks. Never attributes, so never datoms.
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        image_front_url: "https://img.off/front.jpg",
        image_nutrition_url: "https://img.off/nutrition.jpg",
        image_packaging_url: "https://img.off/packaging.jpg",
        // no ingredients image
      },
    };
    const payload = mapOffProductToPayload(product);
    expect(payload.referenceImages).toEqual([
      "https://img.off/front.jpg",
      "https://img.off/nutrition.jpg",
      "https://img.off/packaging.jpg",
    ]);
    expect(payload.attributes).not.toHaveProperty("referenceImages");
  });

  it("surfaces an empty reference-image list when the product has no photos", () => {
    expect(mapOffProductToPayload(nutella).referenceImages).toEqual([]);
  });

  it("omits food/assessment, twin/brand, category and ingredients when absent", () => {
    const product: OFFProduct = {
      ...nutella,
      product: {
        product_name: "Bare Product",
        nutriments: {},
      },
    };
    const attrs = mapOffProductToPayload(product).attributes;
    expect(attrs).not.toHaveProperty("food/assessment");
    expect(attrs).not.toHaveProperty("twin/brand");
    expect(attrs).not.toHaveProperty("food/category");
    expect(attrs).not.toHaveProperty("food/ingredients_text");
  });

  it("stamps the 100 ml basis for a product OFF holds in millilitres (#148)", () => {
    // OFF publishes a liquid's nutriments per 100 ml under the same `*_100g`
    // keys. `nutrition_data_per` cannot say so — its enum is `serving | 100g` —
    // so the basis is read from the pack's own unit (ADR-0052 §1).
    const drink: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        product_quantity_unit: "ml",
      },
    };
    const n = mapOffProductToPayload(drink).attributes[
      "nutrition/info"
    ] as NutritionInfo;
    expect(n.serving_size).toBe("100 ml");
    // Carried as published: no density rescale of the values themselves.
    expect(n.calories).toBe(539);
  });

  it("keeps the 100 g basis for a gram product and when OFF states no unit", () => {
    expect(
      (
        mapOffProductToPayload({
          ...nutella,
          product: { ...nutella.product, product_quantity_unit: "g" },
        }).attributes["nutrition/info"] as NutritionInfo
      ).serving_size
    ).toBe("100 g");
    // The Nutella fixture carries no product_quantity_unit at all.
    expect(
      (
        mapOffProductToPayload(nutella).attributes[
          "nutrition/info"
        ] as NutritionInfo
      ).serving_size
    ).toBe("100 g");
  });

  it("does not read the panel basis off a drink powder's millilitre serving (#148)", () => {
    // A cocoa sold by the 260 g tin states its serving as the prepared 100 ml.
    // Its nutriments are per 100 g of POWDER, so the serving's unit must not
    // decide the panel's basis — only the pack's own unit does.
    const powder: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        product_quantity_unit: "g",
        serving_quantity: 100,
        serving_quantity_unit: "ml",
      },
    };
    const attrs = mapOffProductToPayload(powder).attributes;
    expect((attrs["nutrition/info"] as NutritionInfo).serving_size).toBe(
      "100 g"
    );
    expect(attrs).not.toHaveProperty("food/portions");
  });

  it("maps serving_quantity/serving_size to a single food/portions entry (ADR-0030)", () => {
    // OFF's one serving becomes one household portion resolving to its grams,
    // labelled by serving_size; no second network call is made.
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        serving_quantity: 15,
        serving_size: "15 g",
      },
    };
    const portions =
      mapOffProductToPayload(product).attributes["food/portions"];
    expect(portions).toEqual([
      { label: "15 g", amount: 1, unit: "serving", grams: 15 },
    ]);
  });

  it("parses a string serving_quantity and defaults a missing label", () => {
    const product: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        serving_quantity: "37",
        serving_size: undefined,
      },
    };
    const portions =
      mapOffProductToPayload(product).attributes["food/portions"];
    expect(portions).toEqual([
      { label: "1 serving", amount: 1, unit: "serving", grams: 37 },
    ]);
  });

  it("omits food/portions when the product has no serving data", () => {
    // The Nutella fixture reports serving_size: null and no serving_quantity.
    const attrs = mapOffProductToPayload(nutella).attributes;
    expect(attrs).not.toHaveProperty("food/portions");
  });

  it("omits food/portions when serving_quantity is zero or unparseable", () => {
    const zero: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, serving_quantity: 0, serving_size: "0 g" },
    };
    expect(mapOffProductToPayload(zero).attributes).not.toHaveProperty(
      "food/portions"
    );
    const bad: OFFProduct = {
      ...nutella,
      product: { ...nutella.product, serving_quantity: "n/a" },
    };
    expect(mapOffProductToPayload(bad).attributes).not.toHaveProperty(
      "food/portions"
    );
  });

  it("emits no portion for a serving OFF measured in millilitres (#148)", () => {
    // A Portion resolves to grams, so a 330 ml can stored as `grams: 330` would
    // be a volume masquerading as a weight. Better no portion (ADR-0052 §2).
    const can: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        product_quantity_unit: "ml",
        serving_quantity: 330,
        serving_quantity_unit: "ml",
        serving_size: "1 can (330 ml)",
      },
    };
    expect(mapOffProductToPayload(can).attributes).not.toHaveProperty(
      "food/portions"
    );
  });

  it("keeps a gram serving on a millilitre product (#148)", () => {
    // Alpro's oat milks are 1 L cartons whose serving OFF holds as 100 g. The
    // panel is per 100 ml and the portion is a genuine weight — two fields
    // answering two questions.
    const oat: OFFProduct = {
      ...nutella,
      product: {
        ...nutella.product,
        product_quantity_unit: "ml",
        serving_quantity: 100,
        serving_quantity_unit: "g",
        serving_size: "100 g",
      },
    };
    const attrs = mapOffProductToPayload(oat).attributes;
    expect((attrs["nutrition/info"] as NutritionInfo).serving_size).toBe(
      "100 ml"
    );
    expect(attrs["food/portions"]).toEqual([
      { label: "100 g", amount: 1, unit: "serving", grams: 100 },
    ]);
  });

  it("stores the raw source response as twin/raw_provenance (ADR-0016)", () => {
    // Provenance keeps the untouched OFF response — every nutriment, not just
    // the eight panel fields — so nutrients absent from the panel today can be
    // backfilled later with no network re-fetch. raw_data is the verbatim
    // fixture (the full response, including code/status/product).
    const prov =
      mapOffProductToPayload(nutella).attributes["twin/raw_provenance"];
    expect(prov.raw_data).toEqual(nutella);
  });

  it("wraps provenance in an extraction-metadata envelope", () => {
    const prov =
      mapOffProductToPayload(nutella).attributes["twin/raw_provenance"];
    expect(prov.source_uri).toBe(
      "https://world.openfoodfacts.org/api/v3/product/3017620422003.json"
    );
    expect(prov.adapter).toBe("off");
    expect(prov.adapter_version).toEqual(expect.any(String));
    // No live timestamp in the pure mapper: the ledger stamps each Datom's
    // `time` at ingest, and that IS the capture basis (keeps this deterministic).
    expect(prov).not.toHaveProperty("timestamp");
    expect(prov).not.toHaveProperty("captured_at");
  });
});

// ---- unit: lookupBarcode ---------------------------------------------------

describe("lookupBarcode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the correct Open Food Facts API URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "737628064502",
        status: "success",
        product: {
          product_name: "Test Food",
          nutriments: { "energy-kcal_100g": 100, proteins_100g: 5 },
        },
      }),
    } as Response);

    await lookupBarcode("737628064502");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://world.openfoodfacts.org/api/v3/product/737628064502.json"
    );
  });

  it("throws ProductNotFoundError when v3 status is 'failure'", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: "failure", code: "000", product: {} }),
    } as Response);

    await expect(lookupBarcode("000")).rejects.toThrow(ProductNotFoundError);
  });

  it("throws ProductNotFoundError when legacy v2 status is 0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0, code: "000", product: {} }),
    } as Response);

    await expect(lookupBarcode("000")).rejects.toThrow(ProductNotFoundError);
  });

  it("throws ProductNotFoundError on HTTP 404 (unknown barcode)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    await expect(lookupBarcode("9999999")).rejects.toThrow(
      ProductNotFoundError
    );
  });

  it("returns a valid EntityPayload on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "737628064502",
        status: "success",
        product: {
          product_name: "Test Food",
          nutriments: { "energy-kcal_100g": 100, proteins_100g: 5 },
        },
      }),
    } as Response);

    const payload = await lookupBarcode("737628064502");
    expect(payload.entity).toBe("gtin:737628064502");
    expect(payload.attributes["food/name"]).toBe("Test Food");
  });
});

// ---- unit: OFF contribution (write) — ADR-0034 §8 --------------------------

// A per-100 g panel with a macro, a micronutrient and a summed unsaturated value
// (the last must NOT be contributed — OFF has no single id for it).
const PANEL: NutritionInfo = {
  serving_size: "100 g",
  calories: 539,
  protein_content: 6.3,
  fat_content: 30.9,
  carbohydrate_content: 57.5,
  unsaturated_fat_content: 4.2,
  calcium: 0.108,
};

describe("buildOffWriteBody", () => {
  it("maps a per-100g panel to the exact urlencoded upsert params", () => {
    const body = buildOffWriteBody(
      "3017620422003",
      { name: "Nutella", brand: "Ferrero", nutrition: PANEL },
      { user_id: "tester", password: "s3cret" }
    );

    // Upsert key + the user's own creds as body params (§8).
    expect(body.get("code")).toBe("3017620422003");
    expect(body.get("user_id")).toBe("tester");
    expect(body.get("password")).toBe("s3cret");
    // A browser can't always set the UA header, so it rides the body (#50).
    expect(body.get("user_agent")).toContain("Inventoria/");
    // Name REPLACES; brand APPENDS via add_ so a poor product's list survives.
    expect(body.get("product_name")).toBe("Nutella");
    expect(body.get("add_brands")).toBe("Ferrero");
    expect(body.get("brands")).toBeNull();
    // The whole panel shares one basis (§8/#50).
    expect(body.get("nutrition_data_per")).toBe("100g");
    // Energy in kcal, masses in grams — our stored units.
    expect(body.get("nutriment_energy-kcal")).toBe("539");
    expect(body.get("nutriment_energy-kcal_unit")).toBe("kcal");
    expect(body.get("nutriment_proteins")).toBe("6.3");
    expect(body.get("nutriment_proteins_unit")).toBe("g");
    // Folate is OFF's vitamin-b9; calcium rides as grams.
    expect(body.get("nutriment_calcium")).toBe("0.108");
    // A summed unsaturated value has no clean OFF id — never contributed.
    expect(body.get("nutriment_unsaturated-fat")).toBeNull();
    // Structured data only — no photo in v1.
    expect(body.get("imgupload_front")).toBeNull();
    expect(body.get("image_data_base64")).toBeNull();
  });

  it("omits absent panel keys rather than writing phantom zeroes", () => {
    const body = buildOffWriteBody(
      "000",
      { name: "Sparse", nutrition: { serving_size: "100 g", calories: 10 } },
      { user_id: "t", password: "p" }
    );
    expect(body.get("nutriment_energy-kcal")).toBe("10");
    // Fibre wasn't on the panel, so it isn't posted at all (absent ≠ 0).
    expect(body.get("nutriment_fiber")).toBeNull();
  });

  it("appends a category via add_categories (never the replacing `categories`)", () => {
    const body = buildOffWriteBody(
      "3017620422003",
      { name: "Nutella", category: "en:peanut-butters", nutrition: PANEL },
      { user_id: "t", password: "p" }
    );
    // Identity the name can't carry ("this is peanut butter") appends, so a poor
    // product's existing taxonomy survives (§8) — never the clobbering `categories`.
    expect(body.get("add_categories")).toBe("en:peanut-butters");
    expect(body.get("categories")).toBeNull();
  });

  it("splits and trims a comma-bearing category into distinct values", () => {
    const body = buildOffWriteBody(
      "3017620422003",
      {
        name: "Nutella",
        // OFF's own read `food/category` is a comma-separated list — comma is OFF's
        // multi-value separator, so it is split-and-trimmed, never posted raw.
        category: "Plant-based foods,  Spreads , ,Peanut butters",
        nutrition: PANEL,
      },
      { user_id: "t", password: "p" }
    );
    expect(body.get("add_categories")).toBe(
      "Plant-based foods, Spreads, Peanut butters"
    );
  });

  it("omits add_categories when no category is supplied", () => {
    const body = buildOffWriteBody(
      "3017620422003",
      { name: "Nutella", nutrition: PANEL },
      { user_id: "t", password: "p" }
    );
    expect(body.get("add_categories")).toBeNull();
  });

  it("sends corrected ingredients as a bare ingredients_text (REPLACE, never _en)", () => {
    const body = buildOffWriteBody(
      "3017620422003",
      {
        name: "Nutella",
        // The corrected transcription the user read off the label — REPLACES OFF's
        // parsed ingredients (like product_name), so the whole point of the fix works.
        ingredientsText:
          "Sugar, palm oil, hazelnuts (13%), skimmed milk powder",
        nutrition: PANEL,
      },
      { user_id: "t", password: "p" }
    );
    expect(body.get("ingredients_text")).toBe(
      "Sugar, palm oil, hazelnuts (13%), skimmed milk powder"
    );
    // Never the language-slotted param — that would mislabel a non-English label
    // as English (ADR-0043 §5). Round-trip the bare main-language slot only.
    expect(body.get("ingredients_text_en")).toBeNull();
  });

  it("suppresses ingredients_text when the field is untouched (absent, not empty)", () => {
    const body = buildOffWriteBody(
      "3017620422003",
      { name: "Nutella", nutrition: PANEL },
      { user_id: "t", password: "p" }
    );
    // An untouched field never posts, so it can't wipe OFF's existing ingredients.
    expect(body.has("ingredients_text")).toBe(false);
  });

  it("suppresses ingredients_text for a whitespace-only field", () => {
    const body = buildOffWriteBody(
      "3017620422003",
      { name: "Nutella", ingredientsText: "   ", nutrition: PANEL },
      { user_id: "t", password: "p" }
    );
    expect(body.has("ingredients_text")).toBe(false);
  });

  it("posts OFF's 100g for a per-100 ml panel, which has no OFF value (#148)", () => {
    // `nutrition_data_per`'s enum is `serving | 100g` and OFF resolves that 100
    // to the product's own base unit — which is why a 330 ml Coca-Cola reads
    // back `"100g"`. Posting our `100 ml` verbatim would be out of enum, and
    // falling through to `serving` would declare the set as one 100 ml serving.
    const body = buildOffWriteBody(
      "5449000000996",
      { name: "Cola", nutrition: { serving_size: "100 ml", calories: 42 } },
      { user_id: "t", password: "p" }
    );
    expect(body.get("nutrition_data_per")).toBe("100g");
    expect(body.get("serving_size")).toBeNull();
    expect(body.get("nutriment_energy-kcal")).toBe("42");
  });

  it("maps a per-serving basis to serving + serving_size", () => {
    const body = buildOffWriteBody(
      "111",
      {
        name: "Bar",
        nutrition: { serving_size: "40 g", calories: 200 },
      },
      { user_id: "t", password: "p" }
    );
    expect(body.get("nutrition_data_per")).toBe("serving");
    expect(body.get("serving_size")).toBe("40 g");
  });
});

describe("offWriteHost", () => {
  it("honours an explicit VITE_OFF_WRITE_HOST override, trailing slash trimmed", () => {
    vi.stubEnv("VITE_OFF_WRITE_HOST", "https://example.test/");
    expect(offWriteHost()).toBe("https://example.test");
    vi.unstubAllEnvs();
  });
});

describe("parseCategoryList", () => {
  it("splits OFF's comma value into trimmed, non-empty entries", () => {
    expect(parseCategoryList("Peanut butters, Nut butters")).toEqual([
      "Peanut butters",
      "Nut butters",
    ]);
    // Extra whitespace and empty pieces are dropped, not kept as blanks.
    expect(parseCategoryList("  Spreads ,, Peanut butters ,")).toEqual([
      "Spreads",
      "Peanut butters",
    ]);
  });

  it("returns an empty list for undefined or blank", () => {
    expect(parseCategoryList(undefined)).toEqual([]);
    expect(parseCategoryList("   ")).toEqual([]);
  });
});

describe("fetchCategorySuggestions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("short-circuits an empty prefix to [] with no request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await fetchCategorySuggestions("   ")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("queries the categories taxonomy in English and returns the suggestions", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: ["Peanut butters", "Peanut oils"] }),
    } as Response);

    const out = await fetchCategorySuggestions("peanut", 6);
    expect(out).toEqual(["Peanut butters", "Peanut oils"]);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/taxonomy_suggestions");
    expect(url).toContain("tagtype=categories");
    expect(url).toContain("string=peanut");
    expect(url).toContain("lc=en");
    expect(url).toContain("limit=6");
  });

  it("degrades to [] on a non-ok response, a throw, or a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);
    expect(await fetchCategorySuggestions("peanut")).toEqual([]);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    expect(await fetchCategorySuggestions("peanut")).toEqual([]);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ suggestions: "nope" }),
    } as Response);
    expect(await fetchCategorySuggestions("peanut")).toEqual([]);
  });
});

describe("isEnglishCategory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is true when the term exactly matches an English taxonomy suggestion", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      // Prefix search returns the term itself plus siblings.
      json: async () => ({ suggestions: ["Nut butters", "Cashew butters"] }),
    } as Response);
    expect(await isEnglishCategory("Nut butters")).toBe(true);
  });

  it("is false when the English taxonomy has no match (a non-English seed)", async () => {
    // OFF returns an empty list for non-English input under lc=en.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [] }),
    } as Response);
    expect(await isEnglishCategory("Pindakazen")).toBe(false);
  });

  it("is null when OFF can't be reached, so the caller keeps the category", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    expect(await isEnglishCategory("Peanut butters")).toBeNull();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);
    expect(await isEnglishCategory("Peanut butters")).toBeNull();
  });

  it("is false for a blank category without asking OFF", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await isEnglishCategory("  ")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("submitToOpenFoodFacts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGetSecret.mockReset();
    mockGetSecret.mockReturnValue("");
  });

  it("posts the urlencoded panel to product_jqm2.pl and maps a JSON success", async () => {
    loginAs("tester", "s3cret");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ status: 1, status_verbose: "fields saved" }),
    } as Response);

    const result = await submitToOpenFoodFacts("3017620422003", {
      name: "Nutella",
      brand: "Ferrero",
      nutrition: PANEL,
    });

    expect(result).toEqual({
      ok: true,
      kind: "success",
      message: expect.any(String),
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/cgi/product_jqm2.pl");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    const body = init.body as URLSearchParams;
    expect(body.get("code")).toBe("3017620422003");
    expect(body.get("user_id")).toBe("tester");
    expect(body.get("password")).toBe("s3cret");
    expect(body.get("nutriment_energy-kcal")).toBe("539");
  });

  it("defensively maps an HTML 403 to an auth outcome (never crashes on res.json)", async () => {
    loginAs("tester", "wrong");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      // Bad creds come back as an HTML page, not JSON (§8).
      text: async () => "<html><body>Forbidden</body></html>",
    } as Response);

    const result = await submitToOpenFoodFacts("3017620422003", {
      name: "Nutella",
      nutrition: PANEL,
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, kind: "auth" });
  });

  it("maps a JSON status:0 to a data-quality outcome, surfacing OFF's reason", async () => {
    loginAs("tester", "s3cret");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: 0,
          status_verbose: "Sugars higher than carbohydrates",
        }),
    } as Response);

    const result = await submitToOpenFoodFacts("3017620422003", {
      name: "Nutella",
      nutrition: PANEL,
    });
    expect(result).toMatchObject({
      ok: false,
      kind: "data-quality",
      message: "Sugars higher than carbohydrates",
    });
  });

  it("maps a fetch failure to a network outcome", async () => {
    loginAs("tester", "s3cret");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    const result = await submitToOpenFoodFacts("3017620422003", {
      name: "Nutella",
      nutrition: PANEL,
    });
    expect(result).toMatchObject({ ok: false, kind: "network" });
  });

  it("returns a config outcome and never POSTs when no OFF login is set", async () => {
    // getSecret returns "" (the beforeEach default) — no login.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await submitToOpenFoodFacts("3017620422003", {
      name: "Nutella",
      nutrition: PANEL,
    });
    expect(result).toMatchObject({ ok: false, kind: "config" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("offReferenceImagesFromTwin", () => {
  // A saved twin has no live `referenceImages` (they are a read-through, never a
  // datom), so the label shots have to come back out of the stored OFF response.
  const twin = (raw: unknown) => ({
    "twin/raw_provenance": {
      adapter: "off",
      adapter_version: "8",
      source_uri: "https://world.openfoodfacts.org/api/v0/product/123.json",
      raw_data: raw,
    },
  });

  it("recovers the label shots in read order", () => {
    expect(
      offReferenceImagesFromTwin(
        twin({
          code: "123",
          product: {
            image_front_url: "front.jpg",
            image_nutrition_url: "nutrition.jpg",
            image_ingredients_url: "ingredients.jpg",
          },
        })
      )
    ).toEqual(["front.jpg", "nutrition.jpg", "ingredients.jpg"]);
  });

  it("returns empty for a product carrying no photos", () => {
    expect(
      offReferenceImagesFromTwin(twin({ code: "1", product: {} }))
    ).toEqual([]);
  });

  it("returns empty for a twin from another source, or none at all", () => {
    expect(
      offReferenceImagesFromTwin({
        "twin/raw_provenance": { adapter: "fdc", raw_data: {} },
      })
    ).toEqual([]);
    expect(offReferenceImagesFromTwin({ "food/name": "X" })).toEqual([]);
    expect(offReferenceImagesFromTwin(undefined)).toEqual([]);
  });
});
