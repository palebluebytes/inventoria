import { describe, it, expect } from "vitest";
import { importersOf } from "./support/importers";
import {
  isBrandSpecific,
  isProcessedProduct,
  isPreparedProduct,
  isDryBasisRecord,
  isManufacturingInput,
} from "../../src/lib/food/usda-food-kind";
// The five judgements that decide whether a USDA record is a reference food at
// all, each pinned by the rows it was measured against (#131, #133, #144).
// Every case here is a real corpus description, because a filter tuned against
// invented descriptions is tuned against nothing.
//
// They run ONCE per generation (ADR-0047 §4), never in the app, so this file is
// also where that arrangement is asserted — see the last block.

describe("isBrandSpecific", () => {
  it("flags an SR Legacy record with a brand baked into the description", () => {
    // brandOwner/brandName are null on these records; the ALL-CAPS token is the
    // only signal that this is a specific product, not a generic food.
    expect(
      isBrandSpecific(
        "Grapefruit juice, white, bottled, unsweetened, OCEAN SPRAY"
      )
    ).toBe(true);
  });

  it("keeps generic foods that carry no brand token", () => {
    expect(isBrandSpecific("Grapes, red, seedless, raw")).toBe(false);
    expect(isBrandSpecific("Beef, ground, 80% lean, raw")).toBe(false);
  });

  it("never flags on a two-letter all-caps token (unit / state code)", () => {
    // "NY" here is a cut of beef, not a brand — the >=3-letter guard protects it.
    expect(isBrandSpecific("Beef, short loin (NY strip steak), raw")).toBe(
      false
    );
  });

  it("never flags a generic all-caps acronym (USDA commodity, DHA/ARA)", () => {
    expect(isBrandSpecific("Cheese, cheddar, USDA commodity")).toBe(false);
  });

  it("drops a brand whose only caps token is the country it trades under", () => {
    // #131: "USA" sat in the generic-acronym safelist, so every "Vitasoy USA …"
    // record was waved through the caps rule — sixteen branded tofu and soymilk
    // rows reached the corpus. The safelist is for acronyms that describe a food
    // (USDA commodity, DHA/ARA), not for the incorporation suffix on a brand.
    expect(isBrandSpecific("Vitasoy USA, Nasoya Lite Firm Tofu")).toBe(true);
    expect(isBrandSpecific("Vitasoy USA Azumaya, Firm Tofu")).toBe(true);
    expect(
      isBrandSpecific("Vitasoy USA, Vitasoy Organic Creamy Original Soymilk")
    ).toBe(true);
    // The generic tofu the corpus keeps instead carries no caps token at all.
    expect(
      isBrandSpecific("Tofu, raw, firm, prepared with calcium sulfate")
    ).toBe(false);
  });

  it("drops a Title-Case trademark the caps rule cannot see", () => {
    // #131's other hole: a trademark USDA did not shout. There is no ALL-CAPS
    // token to find and no processing marker in the description, so only the
    // denylist catches these five entries — six rows, because #152's takes two.
    expect(
      isBrandSpecific(
        "Beverages, Powerade Zero Ion4, calorie-free, assorted flavors"
      )
    ).toBe(true);
    expect(isBrandSpecific("Reddi Wip Fat Free Whipped Topping")).toBe(true);
    expect(isBrandSpecific("Light ice cream, Creamsicle")).toBe(true);
    expect(
      isBrandSpecific(
        "Oil, vegetable, Natreon canola, high stability, non trans, high oleic (70%)"
      )
    ).toBe(true);
    // #152. One entry takes both rows, the base product and its Light variant,
    // because the denylist matches a lowercased substring.
    expect(
      isBrandSpecific("Protein supplement, milk based, Muscle Milk, powder")
    ).toBe(true);
    expect(
      isBrandSpecific(
        "Protein supplement, milk based, Muscle Milk Light, powder"
      )
    ).toBe(true);
  });

  it("keeps the generic protein supplements the Muscle Milk entry stands next to", () => {
    // #152's other half: the denylist names a trademark, not a food kind. A
    // powder or supplement marker was refused (ADR-0055 §7), so these three
    // have to answer "protein powder" with no brand in front of them.
    expect(isBrandSpecific("Beverages, Whey protein powder isolate")).toBe(
      false
    );
    expect(isBrandSpecific("Beverages, Protein powder whey based")).toBe(false);
    expect(isBrandSpecific("Beverages, Protein powder soy based")).toBe(false);
  });

  it("keeps the Title-Case cultivars and grades a proper-noun rule would eat", () => {
    // Why the denylist names trademarks one at a time instead of widening to
    // Title Case: 697 corpus rows carry a mid-description Title-Case token and
    // nearly all name a cultivar, grade, geography or varietal rather than a
    // brand. #131 measured it, #152 paid the price of it again, and the rule is
    // still not worth having.
    expect(isBrandSpecific("Mango, Tommy Atkins, peeled, raw")).toBe(false);
    expect(isBrandSpecific("Eggs, Grade A, Large, egg white")).toBe(false);
    expect(
      isBrandSpecific("Alcoholic Beverage, wine, table, red, Pinot Noir")
    ).toBe(false);
  });

  it("drops trademark cereals but keeps USDA's generic 'assorted brands' composite", () => {
    // Cream of Wheat / Cream of Rice are trademarked products -> dropped.
    expect(isBrandSpecific("Cereals, CREAM OF WHEAT, dry")).toBe(true);
    expect(isBrandSpecific("Cereals, CREAM OF RICE, dry")).toBe(true);
    // The generic farina composite that merely names the brand is kept.
    expect(
      isBrandSpecific(
        "Cereals, farina, enriched, assorted brands including CREAM OF WHEAT, dry"
      )
    ).toBe(false);
  });

  it("always drops a brand, even one the query names (brands -> OFF path)", () => {
    // Brands belong to the OFF barcode path, so USDA search drops them whether
    // or not the query names them — generic equivalents win instead.
    expect(isBrandSpecific("Beverages, OCEAN SPRAY, Cran Grape")).toBe(true);
    expect(isBrandSpecific("Babyfood, GERBER, 2nd Foods, apple")).toBe(true);
  });

  it("drops a brand a query merely prefix-matches (apple -> APPLEBEE'S)", () => {
    // "apple" prefixes "applebee's" and "almond" == the capitalised ALMOND in a
    // candy brand — both must still drop, so the fruit/nut search stays clean.
    expect(isBrandSpecific("APPLEBEE'S, chicken tenders platter")).toBe(true);
    expect(isBrandSpecific("Candies, ALMOND JOY Candy Bar")).toBe(true);
    expect(
      isBrandSpecific("Cereals ready-to-eat, POST, GRAPE-NUTS Cereal")
    ).toBe(true);
  });
});

describe("isProcessedProduct", () => {
  it("flags packaged/processed forms that carry a barcode (OFF's job)", () => {
    expect(
      isProcessedProduct("Grapes, canned, thompson seedless, heavy syrup pack")
    ).toBe(true);
    expect(isProcessedProduct("Beverages, carbonated, grape soda")).toBe(true);
    expect(isProcessedProduct("Beverages, grape drink, canned")).toBe(true);
    expect(isProcessedProduct("Fruit cocktail, (peach and pear), canned")).toBe(
      true
    );
    // packaged cereals and juices are barcoded products too
    expect(isProcessedProduct("Cereals ready-to-eat, corn flakes")).toBe(true);
    expect(
      isProcessedProduct("Grape juice, canned or bottled, unsweetened")
    ).toBe(true);
  });

  it("keeps base ingredients that never carry a marker", () => {
    expect(isProcessedProduct("Grapes, red, seedless, raw")).toBe(false);
    expect(isProcessedProduct("Oil, grapeseed")).toBe(false);
    expect(isProcessedProduct("Cheese, cheddar")).toBe(false);
    expect(isProcessedProduct("Spices, cinnamon, ground")).toBe(false);
    // raw-pressed juice is a base ingredient — the raw exemption keeps it
    expect(isProcessedProduct("Lemon juice, raw")).toBe(false);
  });

  it("never drops a food described 'raw', even a retail cut sold frozen", () => {
    // "frozen" is a marker, but the raw NZ lamb is a base ingredient, so the
    // raw exemption keeps it.
    expect(
      isProcessedProduct("Lamb, New Zealand, imported, frozen, loin, raw")
    ).toBe(false);
  });

  it("uses 'carbonated' (not 'soda') so baking soda survives", () => {
    expect(isProcessedProduct("Leavening agents, baking soda")).toBe(false);
  });

  it("drops a boxed dry mix, and the food reconstituted from one (#144)", () => {
    // §5's head-word keep list was letting two cornbread mixes through under
    // `bread`; a dry mix is a boxed, barcoded product, so it is §4's line, not
    // §5's. All nine corpus rows carrying the phrase are mixes or a serving
    // made up from one.
    expect(
      isProcessedProduct(
        "Bread, cornbread, dry mix, enriched (includes corn muffin mix)"
      )
    ).toBe(true);
    expect(isProcessedProduct("Bread, stuffing, dry mix")).toBe(true);
    expect(
      isProcessedProduct("Biscuits, plain or buttermilk, dry mix, prepared")
    ).toBe(true);
    // The from-scratch cornbread beside them is a bready staple and stays.
    expect(
      isProcessedProduct(
        "Bread, cornbread, prepared from recipe, made with low fat (2%) milk"
      )
    ).toBe(false);
    // "mix" alone is not the marker: a dry seasoning is a pantry staple.
    expect(
      isProcessedProduct("Seasoning mix, dry, sazon, coriander & annatto")
    ).toBe(false);
  });
});

describe("isPreparedProduct", () => {
  it("drops wholly-prepared categories (composite foods with no brand/marker)", () => {
    expect(
      isPreparedProduct(
        "Breakfast Cereals",
        "Cereals ready-to-eat, corn flakes"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Soups, Sauces, and Gravies", "Sauce, barbecue")
    ).toBe(true);
    expect(
      isPreparedProduct("Meals, Entrees, and Side Dishes", "Lasagna, cheese")
    ).toBe(true);
    expect(isPreparedProduct("Snacks", "Snacks, potato chips")).toBe(true);
  });

  it("keeps generic beverages (coffee/tea) — packaged drinks fall to markers", () => {
    expect(isPreparedProduct("Beverages", "Beverages, coffee, brewed")).toBe(
      false
    );
    expect(
      isPreparedProduct("Beverages", "Beverages, tea, black, brewed")
    ).toBe(false);
  });

  it("drops composite dishes that leak into base categories (potato salad)", () => {
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Potato salad, home-prepared"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Potatoes, au gratin, home-prepared from recipe using butter"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Finfish and Shellfish Products", "Fish, tuna salad")
    ).toBe(true);
  });

  it("drops a fast-food item USDA filed outside Fast Foods", () => {
    // #133: USDA filed both milkshakes under Beverages, so PREPARED_CATEGORIES
    // never saw them and no dish marker described them — the marker set was
    // built for home-prepared dishes, and a milkshake is neither home-prepared
    // nor a base ingredient.
    expect(isPreparedProduct("Beverages", "Shake, fast food, vanilla")).toBe(
      true
    );
    expect(
      isPreparedProduct("Beverages", "Beverages, shake, fast food, strawberry")
    ).toBe(true);
  });

  it("drops an ice cream that names an assembled form, keeps the plain tub", () => {
    // #133: the signal is the wafer, biscuit, stick or coating around the ice
    // cream, not the ice cream. A plain tub is a base dairy food on the same
    // reasoning that keeps cheese and butter.
    const DAIRY = "Dairy and Egg Products";
    expect(isPreparedProduct(DAIRY, "Ice cream sandwich")).toBe(true);
    expect(isPreparedProduct(DAIRY, "Ice cream cookie sandwich")).toBe(true);
    expect(
      isPreparedProduct(
        DAIRY,
        "Ice cream bar, stick or nugget, with crunch coating"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(DAIRY, "Ice cream, bar or stick, chocolate covered")
    ).toBe(true);
    expect(isPreparedProduct(DAIRY, "Ice cream sundae cone")).toBe(true);
    expect(
      isPreparedProduct(
        DAIRY,
        "Ice cream, lowfat, no sugar added, cone, added peanuts and chocolate sauce"
      )
    ).toBe(true);

    expect(isPreparedProduct(DAIRY, "Ice cream, soft serve, chocolate")).toBe(
      false
    );
    expect(
      isPreparedProduct(DAIRY, "Ice cream, light, soft serve, chocolate")
    ).toBe(false);
    expect(
      isPreparedProduct(
        DAIRY,
        "Fat free ice cream, no sugar added, flavors other than chocolate"
      )
    ).toBe(false);
  });

  it("never matches 'sandwich' on its own — three base foods carry the word", () => {
    // Why the novelty rule is anchored to ice cream. A bare \\bsandwich\\b marker
    // would take a spread, a raw beef cut and a Navajo tortilla with it.
    expect(
      isPreparedProduct(
        "Legumes and Legume Products",
        "Sandwich spread, meatless"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Beef Products",
        "Beef, sandwich steaks, flaked, chopped, formed and thinly sliced, raw"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Tortilla, includes plain and from mutton sandwich (Navajo)"
      )
    ).toBe(false);
  });

  it("drops breaded/battered fried dishes but keeps simple cooked foods", () => {
    // Breaded fried chicken ("cooked, fried, flour") only matched a "flour"
    // search via its coating — a dish. French fries and breaded fish likewise.
    expect(
      isPreparedProduct(
        "Poultry Products",
        "Chicken, broilers or fryers, meat and skin, cooked, fried, flour"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Potatoes, french fried, all types, salt added in processing"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Finfish and Shellfish Products",
        "Fish, fried, breaded"
      )
    ).toBe(true);
    // Simple cooked preparations stay — a plain fried egg is a reference food
    // like a scrambled egg, and a roast/pan-fried meat like a roast.
    expect(
      isPreparedProduct("Dairy and Egg Products", "Egg, whole, cooked, fried")
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Poultry Products",
        "Chicken, broilers or fryers, breast, meat only, cooked, roasted"
      )
    ).toBe(false);
  });

  it("keeps a base cooking oil that uses 'salad' as a descriptor", () => {
    // "salad or cooking" names a base oil, not a salad dish.
    expect(
      isPreparedProduct("Fats and Oils", "Oil, olive, salad or cooking")
    ).toBe(false);
    expect(
      isPreparedProduct("Fats and Oils", "Oil, soybean, salad or cooking")
    ).toBe(false);
  });

  it("drops confections in the mixed Sweets category", () => {
    expect(
      isPreparedProduct("Sweets", "Candies, milk chocolate, with almonds")
    ).toBe(true);
    expect(isPreparedProduct("Sweets", "Chocolate, dark, 70-85% cacao")).toBe(
      true
    );
    expect(isPreparedProduct("Sweets", "Jams and preserves")).toBe(true);
  });

  it("keeps bready staples in Baked Products, drops the sweet treats", () => {
    // Reference foods like a croissant stay; cake/cookies/doughnuts go.
    expect(isPreparedProduct("Baked Products", "Croissants, butter")).toBe(
      false
    );
    expect(
      isPreparedProduct("Baked Products", "Bread, 100% whole wheat, commercial")
    ).toBe(false);
    expect(isPreparedProduct("Baked Products", "Bagels, plain, enriched")).toBe(
      false
    );
    expect(
      isPreparedProduct("Baked Products", "English muffins, plain, enriched")
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Baked Products",
        "Cake, angelfood, commercially prepared"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Baked Products", "Doughnuts, cake-type, plain, glazed")
    ).toBe(true);
    expect(isPreparedProduct("Baked Products", "Cookies, chocolate")).toBe(
      true
    );
  });

  it("keeps single-ingredient sweeteners in Sweets (honey, sugar, cocoa)", () => {
    expect(isPreparedProduct("Sweets", "Honey")).toBe(false);
    expect(isPreparedProduct("Sweets", "Sugars, granulated")).toBe(false);
    expect(isPreparedProduct("Sweets", "Cocoa, dry powder, unsweetened")).toBe(
      false
    );
    expect(isPreparedProduct("Sweets", "Molasses")).toBe(false);
  });

  it("drops a confection the head-word keep list named after a staple (#144)", () => {
    // §5 keeps two mixed categories by head word, which cannot tell a staple
    // from a confection USDA happened to name after one. A pound cake filed as
    // "Bread, …" and a pancake table blend filed as "Syrups, …" both escaped.
    expect(
      isPreparedProduct(
        "Baked Products",
        "Bread, pound cake type, pan de torta salvadoran"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Baked Products",
        "Bread, salvadoran sweet cheese (quesadilla salvadorena)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct("Baked Products", "Bread, pan dulce, sweet yeast bread")
    ).toBe(true);
    expect(isPreparedProduct("Baked Products", "Rolls, dinner, sweet")).toBe(
      true
    );
    expect(
      isPreparedProduct("Sweets", "Syrups, table blends, pancake, with butter")
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Sweets",
        "Syrups, table blends, corn, refiner, and sugar"
      )
    ).toBe(true);
    expect(isPreparedProduct("Sweets", "Syrups, chocolate, fudge-type")).toBe(
      true
    );
  });

  it("scopes the confection markers to the two mixed categories (#144)", () => {
    // "sweet" and "cake" are ordinary English elsewhere: 37 corpus rows say
    // "sweet" and 34 of them are not baked — sweet potatoes, sweetcorn, sweet
    // peppers, sweet cherries — and cake flour is flour. None of those rows is
    // in a category the escape hatch is consulted for, so none can be taken.
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Sweet potato, raw, unprepared"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Vegetables and Vegetable Products",
        "Corn, sweet, white, raw"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Cereal Grains and Pasta",
        "Wheat flour, white, cake, enriched"
      )
    ).toBe(false);
    // And the markers leave the staples the keep lists were written for.
    expect(
      isPreparedProduct(
        "Baked Products",
        "Bread, whole-wheat, commercially prepared"
      )
    ).toBe(false);
    expect(isPreparedProduct("Sweets", "Syrups, maple")).toBe(false);
  });

  it("drops a stew but keeps the raw cut sold for one (#144)", () => {
    // Eight composite stews sit in `American Indian/Alaska Native Foods`, which
    // is not a prepared category, with no dish marker between them. The word is
    // the marker; "for stew" names what a raw retail cut is SOLD for, which is
    // the same shape as the salad-oil exemption beside it.
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Stew, mutton, corn, squash (Navajo)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Stew/soup, caribou (Alaska Native)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "American Indian/Alaska Native Foods",
        "Acorn stew (Apache)"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Beef Products",
        "Beef, chuck for stew, separable lean and fat, select, raw"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Lamb, Veal, and Game Products",
        'Lamb, cubed for stew or kabob (leg and shoulder), separable lean only, trimmed to 1/4" fat, cooked, braised'
      )
    ).toBe(false);
  });

  it("drops a packaged dessert topping but keeps real whipped cream (#144)", () => {
    // USDA files the three whipped-topping products beside the dairy they
    // imitate. They are packaged desserts and belong to the barcode path; the
    // cream and the grated parmesan beside them are base dairy foods.
    expect(
      isPreparedProduct("Dairy and Egg Products", "Dessert topping, powdered")
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Dairy and Egg Products",
        "Dessert topping, pressurized"
      )
    ).toBe(true);
    expect(
      isPreparedProduct(
        "Dairy and Egg Products",
        "Cream, whipped, cream topping, pressurized"
      )
    ).toBe(false);
    expect(
      isPreparedProduct(
        "Dairy and Egg Products",
        "Parmesan cheese topping, fat free"
      )
    ).toBe(false);
  });

  it("keeps base-ingredient categories and records with no category", () => {
    expect(
      isPreparedProduct("Fruits and Fruit Juices", "Apples, fuji, raw")
    ).toBe(false);
    expect(isPreparedProduct("Dairy and Egg Products", "Cheese, cheddar")).toBe(
      false
    );
    expect(isPreparedProduct("Fats and Oils", "Oil, olive")).toBe(false);
    expect(isPreparedProduct(undefined, "Some food, raw")).toBe(false);
  });
});

// ── ADR-0048 §5: two more shapes that are not a food ────────────────────────
// A laboratory basis and a factory input, both asked at generation time beside
// the three above. ADR-0048's other filter, `fdcReportsNoEnergy`, is NOT here:
// it is the nutrition panel's own question rather than a food-kind judgement,
// and it stays with the panel in `usda-fdc.test.ts` (§6, #146).

describe("isDryBasisRecord", () => {
  it("drops the dry-basis assays USDA marks (0% moisture)", () => {
    expect(isDryBasisRecord("Beans, Dry, Black (0% moisture)")).toBe(true);
    expect(isDryBasisRecord("Beans, Dry, Dark Red Kidney (0% moisture)")).toBe(
      true
    );
  });

  it("keeps the dried beans anyone actually buys", () => {
    // The corpus holds 38 of these, with complete panels; the dry-basis record
    // beside them is a laboratory basis, not a second food (ADR-0048 §5).
    expect(isDryBasisRecord("Beans, black, mature seeds, raw")).toBe(false);
    expect(isDryBasisRecord("Beans, pinto, mature seeds, raw")).toBe(false);
  });

  it("does not fire on a description that merely says the word", () => {
    // Seven corpus rows say "moisture" without being a dry-basis assay — four
    // "(may contain additives to retain moisture)" and three low-moisture
    // mozzarellas. A bare /moisture/ would have taken every one of them.
    expect(
      isDryBasisRecord(
        "Fish, cod, Pacific, cooked, dry heat (may contain additives to retain moisture)"
      )
    ).toBe(false);
    expect(
      isDryBasisRecord("Cheese, mozzarella, whole milk, low moisture")
    ).toBe(false);
    expect(isDryBasisRecord("Beans, Dry, Black (12% moisture)")).toBe(false);
  });
});

describe("isManufacturingInput", () => {
  it("drops the ingredient specifications USDA marks 'industrial' (#144)", () => {
    // USDA's own word for a food-manufacturing input sold to a factory rather
    // than a food anyone logs. #144 named one row; the corpus held 45.
    expect(
      isManufacturingInput(
        "Oil, industrial, coconut, principal uses candy coatings, oil sprays, roasting nuts"
      )
    ).toBe(true);
    expect(
      isManufacturingInput(
        "Oil, industrial, palm kernel (hydrogenated), confection fat, intermediate grade product"
      )
    ).toBe(true);
    expect(
      isManufacturingInput(
        "Wheat flour, white (industrial), 11.5% protein, bleached, enriched"
      )
    ).toBe(true);
    expect(
      isManufacturingInput("Shortening industrial, lard and vegetable oil")
    ).toBe(true);
    expect(
      isManufacturingInput(
        "Margarine, industrial, soy and partially hydrogenated soy oil, use for baking, sauces and candy"
      )
    ).toBe(true);
  });

  it("keeps the retail forms of everything it drops", () => {
    // A drop is only correct because a generic equivalent stayed: the flours
    // come back as Foundation's own rows, and the household fats keep theirs.
    expect(
      isManufacturingInput("Flour, wheat, all-purpose, enriched, bleached")
    ).toBe(false);
    expect(isManufacturingInput("Oil, olive, salad or cooking")).toBe(false);
    expect(
      isManufacturingInput("Shortening, vegetable, household, composite")
    ).toBe(false);
    expect(
      isManufacturingInput(
        "Margarine, regular, 80% fat, composite, stick, with salt"
      )
    ).toBe(false);
  });
});

describe("the roster stays out of the app's bundle", () => {
  it("is reached only through the generator's esbuild seam", () => {
    // The arrangement `food-vocabulary.ts` documents and `usda-twin-ledger.ts`
    // already follows: the corpus is filtered once, ahead of time, and what
    // ships is the survivors. 400 lines of editorial roster in the app bundle
    // would be dead weight on every page load (#146).
    expect(importersOf("usda-food-kind")).toEqual([]);
  });
});
