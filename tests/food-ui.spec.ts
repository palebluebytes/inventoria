/// <reference types="node" />
import { test, expect } from "@playwright/test";

test.describe("Calorie Tracker & Food Logging UI", () => {
  test.beforeEach(async ({ page }) => {
    // Capture page console messages
    page.on("console", (msg) => {
      console.log(`[BROWSER CONSOLE - ${msg.type()}]:`, msg.text());
    });

    // Serve the bundled USDA corpus (ADR-0047) as a fixture. Food search reads
    // the committed Search index and staging reads the Nutrient store, so these
    // two routes are the whole of what the suite has to pin — there is no API
    // to intercept, no key to enter and no quota to explain. Fixed foods keep
    // the arithmetic below the suite's own rather than USDA's.
    await page.route("**/usda/search-index.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          artifact: "usda-search-index",
          schema_version: 2,
          generated_from: [],
          // Structurally required since ADR-0049 §4 put the Vocabulary map in
          // this artifact: `buildSearchCorpus` reads the section, so a fixture
          // without one throws before a single search runs. Deliberately EMPTY —
          // these specs are about the food flows, and an expansion here would
          // make them depend on a retrieval fallback they do not exercise.
          vocabulary_off: {
            licence: "ODbL",
            source: "Open Food Facts",
            url: "https://static.openfoodfacts.org/data/taxonomies/ingredients.full.json",
            sha256: "fixture",
            expansions: {},
          },
          vocabulary_local: {
            source: "Inventoria, hand-written",
            expansions: {},
          },
          foods: [
            {
              fdcId: 171705,
              description: "Mock Banana",
              dataType: "Foundation",
              macros: {
                calories: 89,
                protein_content: 1.1,
                fat_content: 0.3,
                carbohydrate_content: 22.8,
              },
              // Household portions ride on the row (ADR-0047 §6). Mock Oats
              // carries none, so the picker renders its gram controls unchanged.
              portions: [
                { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
                { label: "1 large", amount: 1, unit: "large", grams: 150 },
              ],
            },
            {
              fdcId: 1102706,
              description: "Mock Oats",
              dataType: "Foundation",
              macros: {
                calories: 379,
                protein_content: 13.1,
                fat_content: 6.5,
                carbohydrate_content: 67.7,
              },
            },
            {
              fdcId: 200001,
              description: "Black Urad Dal",
              dataType: "SR Legacy",
              macros: {
                calories: 341,
                protein_content: 25,
                fat_content: 1.5,
                carbohydrate_content: 59,
              },
            },
          ],
        }),
      });
    });

    // The Nutrient store carries USDA's own amounts in USDA's own units, and a
    // staged food's whole panel is rebuilt from it — so each food repeats its
    // macros here, and Mock Banana adds two micronutrients (ADR-0030) so the
    // full breakdown (#30) has vitamin/mineral data to show.
    await page.route("**/usda/nutrient-store.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          artifact: "usda-nutrient-store",
          schema_version: 2,
          generated_from: [],
          nutrients: {
            1003: { name: "Protein", unit: "g" },
            1004: { name: "Total lipid (fat)", unit: "g" },
            1005: { name: "Carbohydrate, by difference", unit: "g" },
            1008: { name: "Energy", unit: "kcal" },
            1087: { name: "Calcium, Ca", unit: "mg" },
            1089: { name: "Iron, Fe", unit: "mg" },
          },
          foods: {
            171705: {
              1003: 1.1,
              1004: 0.3,
              1005: 22.8,
              1008: 89,
              1087: 5,
              1089: 0.26,
            },
            1102706: { 1003: 13.1, 1004: 6.5, 1005: 67.7, 1008: 379 },
            200001: { 1003: 25, 1004: 1.5, 1005: 59, 1008: 341 },
          },
        }),
      });
    });

    // Intercept Open Food Facts barcode route
    await page.route("**/api/v3/product/*.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: "3017620422003",
          status: "success",
          product: {
            product_name: "Mock Nutella",
            nutriments: {
              "energy-kcal_100g": 539,
              proteins_100g: 6.3,
              fat_100g: 30.9,
              carbohydrates_100g: 57.5,
            },
          },
        }),
      });
    });

    page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  });

  async function waitForDbReady(page: import("@playwright/test").Page) {
    await page.waitForFunction(
      () => {
        const badge = document.querySelector(".db-badge");
        return badge?.textContent?.includes("DB Ready");
      },
      { timeout: 10000 }
    );
  }

  // Open the food screen's own settings sheet (the top-right gear) — home now to
  // the USDA/OFF credentials, contribution consent, and the nutrition-target
  // editor that used to live on the global Settings tab.
  async function openFoodSettings(page: import("@playwright/test").Page) {
    await page.locator("#food-settings-btn").click();
    await expect(
      page.getByRole("heading", { name: "Food Settings" })
    ).toBeVisible();
  }

  async function closeFoodSettings(page: import("@playwright/test").Page) {
    await page.locator(".bottom-sheet-content .close-btn").first().click();
    await expect(
      page.getByRole("heading", { name: "Food Settings" })
    ).toBeHidden();
  }

  async function setupApiKeys(page: import("@playwright/test").Page) {
    // TMDB + scraper stay on the global Settings tab…
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await page.locator("#tmdb-api-key").fill("test-tmdb-key");
    await page.locator("#scraper-proxy-url").fill("/api/proxy?url=");
    await page
      .locator("button[type='submit']", { hasText: "Save Settings" })
      .click();
    await expect(page.locator(".saved-badge")).toBeVisible();
    // …while the Food screen's own settings sheet is where whole-number rounding
    // is turned OFF: it defaults ON, but the logging/recipe tests below assert
    // the projection's exact 2-dp math (e.g. 89 × 1.5 = 133.5), which is a
    // computation check, not a display-preference one. Rounding itself is
    // covered by the unit tests. USDA needs nothing here — its corpus is
    // bundled, so there is no key to enter (ADR-0047 §1).
    await page.locator(".nav-item", { hasText: "Food" }).click();
    await openFoodSettings(page);
    await page.locator("#round-nutrition-toggle").uncheck();
    await closeFoodSettings(page);
  }

  // Long-press a locator to start item selection on the dashboard.
  async function longPress(
    page: import("@playwright/test").Page,
    locator: import("@playwright/test").Locator
  ) {
    // page.mouse uses viewport coords and does not auto-scroll, so bring the
    // element into view first.
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error("element not visible for long-press");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
  }

  // Log one USDA food into a meal via the direct log sheet.
  async function logUsdaFood(
    page: import("@playwright/test").Page,
    meal: string,
    query: string,
    resultName: string,
    grams: string
  ) {
    // The `+` is gone (ADR-0059 §1): the header carries one control per way
    // into the meal, and each names its meal, so the search control opens the
    // sheet straight onto search. This is `wayInLabel("search", meal)`.
    await page
      .getByRole("button", { name: `Search for a ${meal} food` })
      .click();
    await page.locator("#food-search-input").fill(query);
    await page.locator(".result-item", { hasText: resultName }).click();
    await page.getByLabel("Amount in grams").fill(grams);
    await page.locator("#log-food-btn").click();
  }

  // Set a recipe/instantiation ingredient's gram amount via the tap-to-open
  // amount picker sheet (tapping the row opens the picker).
  async function setIngredientGrams(
    page: import("@playwright/test").Page,
    name: string,
    grams: string
  ) {
    await page.locator(".recipe-ingredient", { hasText: name }).click();
    const sheet = page.locator(".amount-sheet");
    await sheet.getByLabel("Amount in grams").fill(grams);
    await sheet.locator("#amount-done-btn").click();
    await expect(sheet).toBeHidden();
  }

  test("loads the calorie tracker dashboard with initial empty target progress", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Verify page header
    const dashboardTitle = page.getByRole("heading", {
      name: "Food",
      exact: true,
    });
    await expect(dashboardTitle).toBeVisible();

    // Verify macro target details are present (.calories-num should be 0, calories-sub / 2000 kcal)
    await expect(page.locator(".calories-num")).toHaveText("0");
    await expect(page.locator(".calories-sub")).toContainText("2000");
  });

  test("the Today button appears off-today and snaps the strip back", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    const header = page.locator(".dashboard-header h2");
    const todayHeader = (await header.textContent())?.trim() ?? "";
    const todayBtn = page.getByRole("button", { name: "Today", exact: true });

    // On today there is nothing to snap back to — the button is absent.
    await expect(todayBtn).toHaveCount(0);

    // Page back a week: the selected day leaves today, so the header changes and
    // the button appears.
    await page.getByRole("button", { name: "Previous Week" }).click();
    await expect(header).not.toHaveText(todayHeader);
    await expect(todayBtn).toBeVisible();

    // Tapping Today returns to the current day and the button hides again.
    await todayBtn.click();
    await expect(header).toHaveText(todayHeader);
    await expect(todayBtn).toHaveCount(0);
  });

  test("opens the log sheet directly and logs a USDA food", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // The header carries one control per way into the meal and no `+`
    // (ADR-0059 §1), so the search control opens straight onto search. Every
    // control names its meal, because the header repeats for all four.
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await expect(page.locator("#food-search-input")).toBeVisible();

    // Search (debounced) and select the result.
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();

    // The log flow carries no method dock at all now (ADR-0059 §2): the header
    // already chose, so a sheet reached from it does one thing.
    await expect(page.locator(".method")).toHaveCount(0);

    // Staging uses the numeric+slider amount control (ADR-0023): a real slider
    // (role="slider", from bits-ui) alongside the typed field. Set 150 g and log.
    await expect(page.getByRole("slider")).toBeVisible();
    await page.getByLabel("Amount in grams").fill("150");
    await page.locator("#log-food-btn").click();

    // Verify on the dashboard.
    const breakfastSection = page.locator(".meal-section", {
      hasText: "BREAKFAST",
    });
    await expect(breakfastSection).toContainText("Mock Banana");
    await expect(breakfastSection).toContainText("150g");
    await expect(breakfastSection).toContainText("133.5 kcal"); // 89 * 1.5 = 133.5
    await expect(page.locator(".calories-num")).toHaveText("133.5");
  });

  test("copies a past meal wholesale into the day being viewed (ADR-0058)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const copyBreakfast = page.getByRole("button", {
      name: "Copy a past breakfast",
    });

    // §7 — with no breakfast on any other day the control is ABSENT, not
    // disabled. A button that could only disappoint is worse than none.
    await expect(copyBreakfast).toHaveCount(0);

    // Log a breakfast a week back, so there is a past meal to copy.
    await page.getByRole("button", { name: "Previous Week" }).click();
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();
    await page.getByLabel("Amount in grams").fill("150");
    await page.locator("#log-food-btn").click();

    // Back to today, where that breakfast is now history.
    await page.getByRole("button", { name: "Today", exact: true }).click();
    const breakfast = page.locator(".meal-section", { hasText: "BREAKFAST" });
    await expect(breakfast).toContainText("No breakfast logged yet");
    await expect(copyBreakfast).toBeVisible();

    // §12 — the picker spells the meal out with its amount, so the row shows
    // what it is about to copy without a second tap.
    await copyBreakfast.click();
    const picker = page.getByTestId("past-meal-list");
    await expect(picker).toBeVisible();
    await expect(picker).toContainText("Mock Banana");
    await expect(picker).toContainText("150g");

    // §3 — the tap on the row IS the commit; there is no confirm step. §5 — it
    // appends, and §2 — at the amount it was logged at.
    await picker.locator(".pm-row").first().click();
    await expect(picker).toHaveCount(0);
    await expect(breakfast).toContainText("Mock Banana");
    await expect(breakfast).toContainText("150g");
    await expect(page.locator(".calories-num")).toHaveText("133.5");

    // §11 — a clean copy says nothing at all.
    await expect(breakfast.locator(".meal-note")).toHaveCount(0);
  });

  test("expands a staged food's full nutrient breakdown, scaled and omitting absent fields (#30)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Stage Mock Banana — it carries two micronutrients (calcium + iron) but no
    // fibre/sugar/sodium, so the breakdown must show the former and omit the latter.
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();

    const breakdown = page.locator('[data-testid="food-nutrient-breakdown"]');
    await expect(breakdown).toBeVisible();
    // Collapsed by default — rows hidden until the disclosure is opened.
    await expect(breakdown.locator(".nutrient-calcium")).toBeHidden();

    // Expand it. At 100 g the micronutrients read at their per-100g values,
    // reformatted from stored grams back to mg (5 mg calcium, 0.26 mg iron).
    await breakdown.locator("summary").click();
    await expect(breakdown.locator(".nutrient-calcium")).toContainText(
      "Calcium"
    );
    await expect(breakdown.locator(".nutrient-calcium")).toContainText("5 mg");
    await expect(breakdown.locator(".nutrient-iron")).toContainText("0.26 mg");

    // Fields the food never reported are omitted — no fibre/sugar/sodium row.
    await expect(breakdown.locator(".nutrient-fiber_content")).toHaveCount(0);
    await expect(breakdown.locator(".nutrient-sugar_content")).toHaveCount(0);
    await expect(breakdown.locator(".nutrient-sodium_content")).toHaveCount(0);

    // Values scale with amount: double to 200 g → calcium doubles to 10 mg.
    await page.getByLabel("Amount in grams").fill("200");
    await expect(breakdown.locator(".nutrient-calcium")).toContainText("10 mg");
    await expect(breakdown.locator(".nutrient-iron")).toContainText("0.52 mg");
  });

  test("reveals the day's full nutrient breakdown on tap, totalling every logged food and omitting absent nutrients (#31)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Log two bananas (each carries calcium + iron, but no fibre/sodium) and one
    // oats (macros only). At 100 g each, the two bananas total to 10 mg calcium
    // and 0.52 mg iron; oats adds macros but no fabricated micronutrient zeros.
    await logUsdaFood(page, "breakfast", "banana", "Mock Banana", "100");
    await logUsdaFood(page, "lunch", "banana", "Mock Banana", "100");
    await logUsdaFood(page, "dinner", "oats", "Mock Oats", "100");

    // The full breakdown is not on the page until the aggregates are tapped —
    // there is no always-on disclosure below the ring anymore.
    const breakdown = page.locator('[data-testid="day-nutrient-breakdown"]');
    await expect(breakdown).toHaveCount(0);

    // Tap the ring + meters block to open the full day RDA-vs-target modal (#42):
    // the day totals for the macros AND the micronutrients the foods carried are
    // shown against target, summed across the day's frozen event snapshots (#28).
    await page.getByRole("button", { name: "Show full day nutrition" }).click();
    await expect(breakdown).toBeVisible();
    await expect(
      breakdown.locator(".nutrient-card.nutrient-calories")
    ).toBeVisible();
    // Calcium/iron total across just the two bananas that carried them, each shown
    // against its baked target (#42 renders `value / target`).
    await expect(breakdown.locator(".nutrient-calcium")).toContainText(
      "Calcium"
    );
    await expect(breakdown.locator(".nutrient-calcium")).toContainText("10 mg");
    await expect(breakdown.locator(".nutrient-iron")).toContainText("0.52 mg");
    // A macro every food carries is present too.
    await expect(
      breakdown.locator(".nutrient-card.nutrient-protein")
    ).toBeVisible();

    // A reach-toward nutrient no food carried is NOT omitted under #42 — it shows
    // against its target with the absent marker (`— / 28 g`), distinct from a 0.
    await expect(
      breakdown.locator(".nutrient-card.nutrient-fiber_content")
    ).toContainText("— / 28 g");
    // Limit nutrients no food carried have no target, so with none logged they
    // stay off the modal entirely (the "Not tracked" section only lists carried
    // ones) — never shown as 0.
    await expect(breakdown.locator(".nutrient-sodium_content")).toHaveCount(0);
    await expect(breakdown.locator(".nutrient-sugar_content")).toHaveCount(0);
  });

  test("a visible micronutrient fills against its baked target (#40)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Make Calcium a visible meter — the default selection is the three macros
    // plus fibre, so calcium has no meter until it is toggled on.
    await openFoodSettings(page);
    await page.locator('input[data-nutrient="calcium"]').check();
    await closeFoodSettings(page);

    // Log a banana — it carries 5 mg calcium per 100 g. Before #40 a visible
    // micronutrient had no target, so its meter rendered an empty (no-target)
    // track; now it fills against its baked FDA Daily Value (1300 mg).
    await logUsdaFood(page, "breakfast", "banana", "Mock Banana", "100");

    const calcium = page.locator(".macro-item.calcium");
    await expect(calcium).toContainText("Calcium");
    // The meter now shows a formatted target and a fill bar — neither existed
    // before this ticket. Assert on presence (not pixel width) so a small fill
    // percent can't flake the check.
    await expect(calcium).toContainText("/ 1300 mg");
    await expect(calcium.locator(".meter-fill")).toHaveCount(1);
    await expect(calcium.locator('[data-meter-state="empty"]')).toHaveCount(0);
  });

  // Seam 3 (ticket #41): the Nutrition Display card's per-row target editor.
  // These drive the visible behaviour end-to-end — what a save writes is proven
  // by the dashboard reading it back through the ledger, not by inspecting state.
  // (A true reload can't verify persistence here: `?mem=1` is an in-memory DB
  // that a reload wipes, so the round-trip Settings → ledger → dashboard is the
  // persistence proof.)
  test("a custom macro target overrides the baked default on the dashboard (#41)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Protein reaches toward the baked 125 g by default.
    const protein = page.locator(".macro-item.protein");
    await expect(protein).toContainText("/ 125 g");

    // Set a custom protein target; the field shows the baked 125 as placeholder.
    await openFoodSettings(page);
    const proteinTarget = page.locator('input[data-target="protein"]');
    await expect(proteinTarget).toHaveAttribute("placeholder", "125");
    await proteinTarget.fill("100");
    await proteinTarget.blur();

    // Back on the dashboard the meter now reaches toward the override, and the
    // baked default is gone — the write reached the resolver via the ledger.
    await closeFoodSettings(page);
    await expect(protein).toContainText("/ 100 g");
    await expect(protein).not.toContainText("/ 125 g");
  });

  test("the reset control restores a target to its baked default and disables itself (#41)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    await openFoodSettings(page);
    const proteinTarget = page.locator('input[data-target="protein"]');
    const proteinReset = page.locator('button[data-reset="protein"]');

    // At the baked default the field is blank (placeholder only) and ↺ is off.
    await expect(proteinTarget).toHaveValue("");
    await expect(proteinReset).toBeDisabled();

    // An override fills the value and enables ↺.
    await proteinTarget.fill("100");
    await proteinTarget.blur();
    await expect(proteinTarget).toHaveValue("100");
    await expect(proteinReset).toBeEnabled();

    // ↺ clears it: blank field showing the placeholder again, ↺ back to disabled.
    await proteinReset.click();
    await expect(proteinTarget).toHaveValue("");
    await expect(proteinTarget).toHaveAttribute("placeholder", "125");
    await expect(proteinReset).toBeDisabled();
  });

  test("entering 0 opts a nutrient out: a hidden hint and no dashboard bar (#41)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Make Calcium a visible meter, then opt its target out with a 0.
    await openFoodSettings(page);
    await page.locator('input[data-nutrient="calcium"]').check();
    const calciumTarget = page.locator('input[data-target="calcium"]');
    await calciumTarget.fill("0");
    await calciumTarget.blur();
    // The row flags the opt-out inline (text, not a chip or a live meter).
    await expect(page.locator('[data-nutrient-row="calcium"]')).toContainText(
      "hidden"
    );

    // A logged calcium-bearing food now renders its meter bar-less (no target),
    // not a fill — the 0 resolved to "no target" for the dashboard.
    await closeFoodSettings(page);
    await logUsdaFood(page, "breakfast", "banana", "Mock Banana", "100");
    const calcium = page.locator(".macro-item.calcium");
    await expect(calcium.locator('[data-meter-state="empty"]')).toHaveCount(1);
    await expect(calcium.locator(".meter-fill")).toHaveCount(0);
  });

  test("customising a target tracks that nutrient; the two prefs stay per-nutrient (#41)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    await openFoodSettings(page);

    // Calcium is off by default. Setting a custom target auto-tracks it — adds
    // its dashboard meter — because customising something implies "show it".
    const calcium = page.locator('input[data-nutrient="calcium"]');
    await expect(calcium).not.toBeChecked();
    const calciumTarget = page.locator('input[data-target="calcium"]');
    await calciumTarget.fill("1500");
    await calciumTarget.blur();
    await expect(calcium).toBeChecked();

    // The auto-track is per-nutrient — it never touches another nutrient's
    // visibility (iron stays off).
    await expect(page.locator('input[data-nutrient="iron"]')).not.toBeChecked();

    // And toggling a nutrient's visibility off leaves its target override intact.
    await calcium.uncheck();
    await expect(calciumTarget).toHaveValue("1500");
  });

  test("the calculator applies a personalized energy/macro set as the new defaults (#45)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Protein reaches toward the baked 125 g before the calculator ever runs.
    await expect(page.locator(".macro-item.protein")).toContainText("/ 125 g");

    // Open the calculator from its action card in the Energy & macros grid.
    await openFoodSettings(page);
    await page.locator("button[data-open-calculator]").click();

    // The live preview stays empty until the body metrics are complete.
    await expect(page.locator("[data-preview]")).toContainText(
      "Enter your sex"
    );

    // Worked Example A (ADR-0033 / #44): 35 y ♀, 70 kg, 170 cm, Active, Maintain.
    await page
      .locator('[data-testid="calc-sex"] [data-value="female"]')
      .click();
    await page.locator('input[data-field="age"]').fill("35");
    await page.locator('input[data-field="height"]').fill("170");
    await page.locator('input[data-field="weight"]').fill("70");
    await page
      .locator('[data-testid="calc-activity"] [data-value="active"]')
      .click();
    await page
      .locator('[data-testid="calc-goal"] [data-value="maintain"]')
      .click();

    // The preview shows the protein anchor (1.6 g/kg × 70 = 112 g exactly — the
    // one whole-number figure of Example A, robust against display rounding).
    await expect(page.locator("[data-preview-protein]")).toContainText("112 g");

    // Apply writes the set and closes the sheet.
    await page.locator("button[data-apply]").click();
    await expect(page.locator("button[data-apply]")).toHaveCount(0);

    // Back in the editor the applied figure is the new DEFAULT layer (ADR-0033
    // Amendment), not an override — so the field is blank with 112 greyed in as
    // the placeholder and ↺ stays disabled (there is no override to clear).
    const proteinTarget = page.locator('input[data-target="protein"]');
    await expect(proteinTarget).toHaveValue("");
    await expect(proteinTarget).toHaveAttribute("placeholder", "112");
    await expect(page.locator('button[data-reset="protein"]')).toBeDisabled();

    // On the dashboard the protein meter now reaches toward the computed 112 g,
    // and the baked 125 default is gone — the write reached the resolver.
    await closeFoodSettings(page);
    const protein = page.locator(".macro-item.protein");
    await expect(protein).toContainText("/ 112 g");
    await expect(protein).not.toContainText("/ 125 g");
  });

  test("a stay-under limit override saves and resets to its baked cap (#43)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    await openFoodSettings(page);
    const satFat = page.locator('input[data-limit="saturated_fat_content"]');
    const satFatReset = page.locator(
      'button[data-reset-limit="saturated_fat_content"]'
    );

    // At the baked cap the field is blank (placeholder = the FDA 20 g DRV) and
    // ↺ is off — a limit has no dashboard meter, only this stay-under cap.
    await expect(satFat).toHaveValue("");
    await expect(satFat).toHaveAttribute("placeholder", "20");
    await expect(satFatReset).toBeDisabled();

    // A tighter override fills the value and enables ↺.
    await satFat.fill("15");
    await satFat.blur();
    await expect(satFat).toHaveValue("15");
    await expect(satFatReset).toBeEnabled();

    // ↺ clears it back to the baked cap placeholder and disables itself again.
    await satFatReset.click();
    await expect(satFat).toHaveValue("");
    await expect(satFat).toHaveAttribute("placeholder", "20");
    await expect(satFatReset).toBeDisabled();
  });

  test("an info button opens the sourced rationale for a section (#46)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    await openFoodSettings(page);

    // The Limits section head carries a "Why these defaults?" ⓘ.
    await page
      .locator('button[data-info="docs/reference/daily-nutrient-limits.md"]')
      .click();

    // Its sheet names the source it was transcribed from and lists clickable
    // citations (offline-first baked copy, ADR-0033 §5).
    await expect(
      page.locator(".subhead", { hasText: "Sources" })
    ).toBeVisible();
    await expect(
      page.getByText("docs/reference/daily-nutrient-limits.md")
    ).toBeVisible();
    await expect(
      page.locator('.sources a[href][target="_blank"]').first()
    ).toBeVisible();
  });

  test("stages a food's household portions as amount-picker presets (ADR-0030)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Stage a food WITH portions — they came bundled with the row, so selecting
    // it fetches nothing.
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();

    // Default 100 g of Mock Banana (89 kcal/100 g). The log button is a plain
    // "Log" now; the scaled total is surfaced in the staged macro preview grid.
    await expect(page.locator("#log-food-btn")).toHaveText("Log");
    await expect(
      page.locator(".staged .nutrients .n", { hasText: "Calories" })
    ).toContainText("89 kcal");

    // The row's portions appear as presets alongside the gram control.
    const portions = page.locator('[data-testid="portion-presets"]');
    await expect(
      portions.getByRole("button", { name: "1 medium — 118 g" })
    ).toBeVisible();

    // Tapping a preset fills its resolved grams and updates the shown total:
    // 118 g of 89 kcal/100 g → 89 × 1.18 = 105.02 kcal.
    await portions.getByRole("button", { name: "1 medium — 118 g" }).click();
    await expect(page.getByLabel("Amount in grams")).toHaveValue("118");
    await expect(
      page.locator(".staged .nutrients .n", { hasText: "Calories" })
    ).toContainText("105.02 kcal");

    // The logged Consumption Event stays gram-valued — no "portion" unit.
    await page.locator("#log-food-btn").click();
    const breakfast = page.locator(".meal-section", { hasText: "BREAKFAST" });
    await expect(breakfast).toContainText("Mock Banana");
    await expect(breakfast).toContainText("118g");
    await expect(breakfast).toContainText("105.02 kcal");
  });

  test("a food without portions renders the amount picker unchanged", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Stage a food whose bundled row carries no portions.
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("oats");
    await page.locator(".result-item", { hasText: "Mock Oats" }).click();

    // No preset chips; the gram field + slider are the whole control, as today.
    await expect(page.locator('[data-testid="portion-presets"]')).toHaveCount(
      0
    );
    await expect(page.getByRole("slider")).toBeVisible();
    await expect(page.getByLabel("Amount in grams")).toHaveValue("100");
  });

  test("keeps the search results when returning from a staged food", async ({
    page,
  }) => {
    // The Search index is fetched once at startup and every search runs over it
    // in memory (ADR-0047 §2), so a return trip must re-fetch nothing — and the
    // results must still be on screen without retyping the query.
    let indexFetches = 0;
    page.on("request", (req) => {
      if (req.url().includes("/usda/search-index.json")) indexFetches++;
    });

    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();

    // "Change food" returns to the list; the results show straight away.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(
      page.locator(".result-item", { hasText: "Mock Banana" })
    ).toBeVisible();
    await page.waitForTimeout(700); // past the search debounce
    expect(indexFetches).toBe(1);
  });

  test("removes a logged food via the card's ✕ button", async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    await logUsdaFood(page, "breakfast", "banana", "Mock Banana", "150");
    const breakfast = page.locator(".meal-section", { hasText: "BREAKFAST" });
    await expect(breakfast).toContainText("Mock Banana");
    await expect(page.locator(".calories-num")).toHaveText("133.5");

    // The ✕ retracts the entry (append-only) — it must not open the editor.
    await breakfast
      .locator(".meal-item-card", { hasText: "Mock Banana" })
      .getByRole("button", { name: /Remove/ })
      .click();

    await expect(breakfast).not.toContainText("Mock Banana");
    await expect(breakfast).toContainText("No breakfast logged yet.");
    await expect(page.locator(".calories-num")).toHaveText("0");
  });

  test("edits a logged food's amount by tapping its card", async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    await logUsdaFood(page, "breakfast", "banana", "Mock Banana", "150"); // 133.5
    const breakfast = page.locator(".meal-section", { hasText: "BREAKFAST" });

    // Tapping a logged gram food opens the SAME amount picker a recipe row uses,
    // seeded from its logged amount.
    await breakfast
      .locator(".meal-item-card", { hasText: "Mock Banana" })
      .click();
    const sheet = page.locator(".amount-sheet");
    await expect(sheet.getByLabel("Amount in grams")).toHaveValue("150");
    await expect(sheet.getByRole("slider")).toBeVisible();

    // Change the amount and confirm; the entry is replaced (append-only, not
    // duplicated) with macros re-derived from the twin at the new amount.
    await sheet.getByLabel("Amount in grams").fill("300"); // 89 * 3 = 267
    await sheet.locator("#amount-done-btn").click();
    await expect(sheet).toBeHidden();

    await expect(
      breakfast.locator(".meal-item-card", { hasText: "Mock Banana" })
    ).toHaveCount(1);
    await expect(breakfast).toContainText("300g");
    await expect(breakfast).toContainText("267 kcal");
    await expect(page.locator(".calories-num")).toHaveText("267");
  });

  test("logs a custom food with macros and a photo", async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Open the sheet for lunch, switch to the Custom method, then pick the
    // "Quick estimate" intent. Per ADR-0035 the Custom tab is now an intent
    // chooser and a manual entry is calories-only (no macros).
    await page.getByRole("button", { name: "Enter a lunch yourself" }).click();
    await page.locator('[data-testid="intent-quick_estimate"]').click();

    await page.locator("#custom-cal").fill("300");
    await page.locator("#custom-name").fill("Avocado Salad");

    // Attach a photo (optional attribute of the custom entry).
    await page.setInputFiles(".hidden-file-input", {
      name: "salad.png",
      mimeType: "image/png",
      buffer: Buffer.from("dummy-image-data-base64"),
    });
    await expect(page.locator(".mini-thumb")).toBeVisible();

    await page.locator("#log-food-btn").click();

    const lunchSection = page.locator(".meal-section", { hasText: "LUNCH" });
    await expect(lunchSection).toContainText("Avocado Salad");
    await expect(lunchSection).toContainText("1 serving");
    await expect(lunchSection).toContainText("300 kcal");
    await expect(lunchSection.locator(".meal-item-thumb")).toBeVisible();
  });

  test("captures a full-panel custom food from the Read-along form (#57)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // The Read-along full-panel form is reached via a barcode door now (ADR-0035
    // §2: the direct-log Custom tab is the intent chooser; the label form lives on
    // the scan doors). Scan a code OFF doesn't have → the "missing" door opens the
    // empty Read-along form keyed to that barcode.
    const MISSING_CODE = "0000000000017";
    await page.route(
      `**/api/v3/product/${MISSING_CODE}.json`,
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ code: MISSING_CODE, status: 0 }),
        });
      }
    );

    await page
      .getByRole("button", { name: "Scan a barcode for lunch" })
      .click();
    await page.locator("#barcode-input").fill(MISSING_CODE);
    await page.locator("#barcode-input").press("Enter");

    // The missing door explains why it landed here; the read-along body then lays
    // every panel row out grouped, macros first, so a micronutrient row (Iron) is
    // present without a mode switch (§3).
    await expect(page.locator('[data-testid="capture-reason"]')).toContainText(
      "Open Food Facts"
    );
    await expect(
      page.locator(".cf-group", { hasText: "Vitamins" })
    ).toBeVisible();

    // All three bases are offered on a fresh capture (ADR-0060 §7). The 100 ml
    // cell used to appear only on a form seeded from a drink OFF already
    // published by volume, which left a bottle printing "per 100 ml" no way to
    // say so — and this door, having no OFF record at all, never seeded one.
    const basis = page.locator('[data-testid="cf-basis"]');
    await expect(basis.locator("[data-value]")).toHaveCount(3);
    await expect(basis.locator('[data-value="per_100ml"]')).toBeVisible();

    // Fast path plus one micro: name + calories, then Iron typed in mg (grams are
    // stored via the parseNutrientEntry round-trip, §3). Protein/fat/carbs and
    // every other micro are left untouched — absent, never 0.
    await page.locator("#custom-name").fill("Homemade Dal");
    await page.locator("#custom-cal").fill("180");
    await page.locator("#cf-iron").fill("2.6");

    // The thumb-zone Save bar tracks the running kcal (§3).
    await expect(page.locator(".cf-sum")).toContainText("180");

    // "none on label" bulk-skips a section's still-empty rows without touching the
    // filled ones — dismiss the twelve micros the label omits in one tap (§3).
    await page
      .locator(".cf-group", { hasText: "Vitamins" })
      .getByRole("button", { name: "none on label" })
      .click();
    // Iron stays filled; an omitted micro (Calcium) is now skipped + locked.
    await expect(page.locator("#cf-iron")).toHaveValue("2.6");
    await expect(page.locator("#cf-calcium")).toBeDisabled();

    await page.locator("#log-food-btn").click();

    // The captured food logs into the meal exactly like any other (§6).
    const lunchSection = page.locator(".meal-section", { hasText: "LUNCH" });
    await expect(lunchSection).toContainText("Homemade Dal");
    await expect(lunchSection).toContainText("1 serving");
    await expect(lunchSection).toContainText("180 kcal");
  });

  test("captures multiple label photos, reads across them, removes one, and mirrors the first (#58)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Reach the Read-along form via the "missing" barcode door (ADR-0035 §2).
    const MISSING_CODE = "0000000000024";
    await page.route(
      `**/api/v3/product/${MISSING_CODE}.json`,
      async (route) => {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ code: MISSING_CODE, status: 0 }),
        });
      }
    );

    await page
      .getByRole("button", { name: "Scan a barcode for lunch" })
      .click();
    await page.locator("#barcode-input").fill(MISSING_CODE);
    await page.locator("#barcode-input").press("Enter");
    await expect(page.locator('[data-testid="capture-reason"]')).toBeVisible();

    await page.locator("#custom-name").fill("Olive Oil");
    await page.locator("#custom-cal").fill("823");

    // A label can span several faces (panel on one, barcode on another) — attach
    // three ordered shots in one pick; the input takes `multiple` (§5).
    const front = Buffer.from("front-face-photo");
    const middle = Buffer.from("middle-photo");
    const back = Buffer.from("back-face-photo");
    const frontUrl = `data:image/png;base64,${front.toString("base64")}`;
    await page.setInputFiles(".hidden-file-input", [
      { name: "front.png", mimeType: "image/png", buffer: front },
      { name: "middle.png", mimeType: "image/png", buffer: middle },
      { name: "back.png", mimeType: "image/png", buffer: back },
    ]);

    // The identity thumb shows the first with a "+N" badge (N = extras) (§5).
    await expect(page.locator(".photo-preview")).toBeVisible();
    await expect(page.locator('[data-testid="photo-count-badge"]')).toHaveText(
      "+2"
    );

    // Tapping the thumb opens the swipeable full-screen reader across all three.
    await page.locator(".cf-thumb").click();
    const reader = page.locator('[data-testid="label-photo-reader"]');
    await expect(reader).toBeVisible();
    await expect(page.locator('[data-testid="lpr-counter"]')).toHaveText(
      "1 / 3"
    );

    // Page forward to the middle shot with the reader-local carousel key
    // (ArrowRight), then remove it — leaving [front, back] ordered (a bad shot
    // doesn't persist) (§5). Keyboard rather than a synthetic click on the arrow:
    // the arrow sits inside .lpr-stage, whose pointerdown setPointerCapture (for
    // swipe) swallows Playwright's synthetic click; real pointers/swipe are fine.
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-testid="lpr-counter"]')).toHaveText(
      "2 / 3"
    );
    await page.locator('[data-testid="lpr-remove"]').click();
    await expect(page.locator('[data-testid="lpr-counter"]')).toHaveText(
      "2 / 2"
    );
    await reader.getByRole("button", { name: "Close photos" }).click();
    await expect(reader).toBeHidden();

    // Two remain, so the badge now reads "+1".
    await expect(page.locator('[data-testid="photo-count-badge"]')).toHaveText(
      "+1"
    );

    await page.locator("#log-food-btn").click();

    // The food logs like any other, and the meal thumb — an existing display
    // surface reading the singular `food/photo_base64` — shows the FIRST photo
    // unchanged, proving the mirror + ordering survived the removal (§5).
    const lunchSection = page.locator(".meal-section", { hasText: "LUNCH" });
    await expect(lunchSection).toContainText("Olive Oil");
    await expect(lunchSection.locator(".meal-item-thumb")).toHaveAttribute(
      "src",
      frontUrl
    );
  });

  test("routes a found-but-poor scan into the Custom form, saves a correction, and badges the enriched twin (#59)", async ({
    page,
  }) => {
    const POOR_CODE = "8710411045003";
    // Override the beforeEach OFF route for this barcode: a real found-but-poor
    // record — a blank product name over a complete-enough panel — the exact gap
    // the grounding investigation photographed. A blank name trips the predicate.
    await page.route(`**/api/v3/product/${POOR_CODE}.json`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          code: POOR_CODE,
          status: "success",
          product: {
            product_name: "",
            completeness: 0.9,
            image_front_url: "https://images.openfoodfacts.org/mock-front.jpg",
            image_nutrition_url:
              "https://images.openfoodfacts.org/mock-nutrition.jpg",
            nutriments: {
              "energy-kcal_100g": 600,
              proteins_100g: 25,
              fat_100g: 50,
              carbohydrates_100g: 12,
            },
          },
        }),
      });
    });

    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Scan the poor barcode (typed, since headless has no camera).
    await page
      .getByRole("button", { name: "Scan a barcode for breakfast" })
      .click();
    await page.locator("#barcode-input").fill(POOR_CODE);
    await page.locator("#barcode-input").press("Enter");

    // The found-but-poor door raises the soft nudge on the staged card (§1). It
    // never blocks logging — the Log button stays live — but here we accept it.
    await expect(page.locator('[data-testid="poor-nudge"]')).toBeVisible();
    await page.locator('[data-testid="poor-nudge-improve"]').click();

    // Improve opens the Custom form, keyed to the barcode, prefilled with whatever
    // OFF had: the blank name arrives empty to fix, the macros arrive filled.
    await expect(page.locator('[data-testid="capture-reason"]')).toContainText(
      "Open Food Facts"
    );
    await expect(page.locator("#custom-name")).toHaveValue("");
    await expect(page.locator("#custom-cal")).toHaveValue("600");

    // OFF's own photos surface as a read-only reference strip to read the label
    // off (§8) — front + nutrition here — without becoming the user's own photos.
    const offRef = page.locator('[data-testid="off-reference-photos"]');
    await expect(offRef).toBeVisible();
    await expect(offRef.locator("img")).toHaveCount(2);
    // Tapping one opens the reader read-only: no Remove/Add affordances.
    await offRef.locator("button").first().click();
    await expect(
      page.locator('[data-testid="label-photo-reader"]')
    ).toBeVisible();
    await expect(page.locator('[data-testid="lpr-remove"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="lpr-add"]')).toHaveCount(0);
    await page.locator('[data-testid="label-photo-reader"] .lpr-close').click();

    // Fix the name and save. The key follows the barcode → the `gtin:` twin is
    // enriched in place (§6), OFF's provenance preserved beside the correction.
    await page.locator("#custom-name").fill("Crunchy Peanut Butter");
    await page.locator("#log-food-btn").click();

    const breakfast = page.locator(".meal-section", { hasText: "BREAKFAST" });
    await expect(breakfast).toContainText("Crunchy Peanut Butter");
    await expect(breakfast).toContainText("600 kcal");

    // Re-scan the same barcode: the local corrected twin is returned (latest-wins,
    // §6), so the corrected name surfaces — never the poor OFF name again — and
    // the origin badge marks it as an OFF twin the user edited from the label (§7).
    await page
      .getByRole("button", { name: "Scan a barcode for breakfast" })
      .click();
    await page.locator("#barcode-input").fill(POOR_CODE);
    await page.locator("#barcode-input").press("Enter");

    await expect(page.locator(".staged h3")).toHaveText(
      "Crunchy Peanut Butter"
    );
    await expect(page.locator('[data-testid="poor-nudge"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="origin-badge"]')).toHaveText(
      "✏️ edited from label"
    );
  });

  // Select two logged foods and start building a recipe from them.
  async function selectTwoAndBuild(page: import("@playwright/test").Page) {
    await logUsdaFood(page, "dinner", "oats", "Mock Oats", "50"); // 379 * .5 = 189.5
    await logUsdaFood(page, "dinner", "banana", "Mock Banana", "150"); // 89 * 1.5 = 133.5

    // Scope by the exact meal title, not a substring — recipe names can contain
    // a meal word (e.g. "Dinner Combo") and would otherwise match other sections.
    const dinnerSection = page.locator(
      '.meal-section:has(.meal-title:text-is("DINNER"))'
    );
    await longPress(
      page,
      dinnerSection.locator(".meal-item-card", { hasText: "Mock Oats" })
    );
    await expect(page.locator(".selbar")).toContainText("1 selected");
    await dinnerSection
      .locator(".meal-item-card", { hasText: "Mock Banana" })
      .click();
    await expect(page.locator(".selbar")).toContainText("2 selected");

    await page.locator("#build-recipe-btn").click();
    return dinnerSection;
  }

  test("builds a recipe that replaces the selected foods", async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await selectTwoAndBuild(page);

    // Seeded with both foods: 189.5 + 133.5 = 323 kcal.
    await page.locator("#recipe-name").fill("Dinner Combo");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");
    await page.locator("#save-recipe-btn").click();

    // The recipe appears; the two originals are replaced (retracted).
    await expect(dinnerSection).toContainText("Dinner Combo");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    await expect(dinnerSection).not.toContainText("Mock Banana");
    // Only the recipe is counted now.
    await expect(page.locator(".calories-num")).toHaveText("323");
  });

  test("keeps an ingredient logged when removed from the recipe", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await selectTwoAndBuild(page);

    // Remove Banana from the recipe — it should stay logged on its own.
    await page
      .locator(".recipe-ingredient", { hasText: "Mock Banana" })
      .locator(".fi-remove")
      .click();
    await page.locator("#recipe-name").fill("Just Oats");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("189.5 kcal");

    // Add a discrete step for good measure.
    await page.locator('[data-section="steps"]').click();
    await page.locator(".recipe-step").first().fill("Soak the oats");

    await page.locator("#save-recipe-btn").click();

    // Oats replaced by the recipe; Banana still logged separately.
    await expect(dinnerSection).toContainText("Just Oats");
    await expect(dinnerSection).toContainText("Mock Banana");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    // Recipe 189.5 + kept Banana 133.5 = 323.
    await expect(page.locator(".calories-num")).toHaveText("323");
  });

  // The servings (yield) control is on the recipe surface now, so this covers it
  // end to end again: the batch above it, the per-serving figures below, and the
  // frozen snapshot on save.
  test("servings control drives live per-serving totals and freezes them on save", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");

    // The builder's figures are the recipe as listed: oats 189.5 + banana 133.5
    // = 323, whatever the serving count says.
    const figuresCal = page.locator(
      '[data-testid="recipe-figures"] .nutrient-calories strong'
    );
    await expect(page.locator("#recipe-yield")).toHaveValue("1");
    await expect(figuresCal).toHaveText("323 kcal");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    // Saying the batch makes 2 moves nothing on this surface — not the amounts,
    // not the figures. It is recorded on the template and divides at log time.
    await page.locator("#recipe-yield").fill("2");
    await expect(figuresCal).toHaveText("323 kcal");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    // Removing an ingredient does re-derive them live: just oats now.
    await page
      .locator(".recipe-ingredient", { hasText: "Mock Banana" })
      .locator(".fi-remove")
      .click();
    await expect(figuresCal).toHaveText("189.5 kcal");

    // Save at yield 2: the log records ONE serving, so the frozen snapshot is
    // the listed 189.5 divided by the 2 the batch makes. Oats (still an ingredient) is replaced/retracted; Banana
    // (removed from the builder) stays logged on its own.
    await page.locator("#save-recipe-btn").click();

    await expect(dinnerSection).toContainText("Dinner Combo");
    await expect(dinnerSection).toContainText("Mock Banana");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    // Recipe 94.75 (per serving, yield 2) + kept Banana 133.5 = 228.25.
    await expect(page.locator(".calories-num")).toHaveText("228.25");
  });

  test("editing an ingredient amount re-derives per-serving totals live and freezes them on save", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");

    // Seeded with oats 50 g (189.5) + banana 150 g (133.5); yield 1 → 323 per serving.
    const figuresCal = page.locator(
      '[data-testid="recipe-figures"] .nutrient-calories strong'
    );
    await expect(figuresCal).toHaveText("323 kcal");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    // The oats row shows a "50g" quantity subtitle; tapping the row opens the
    // picker.
    const oatsRow = page.locator(".recipe-ingredient", {
      hasText: "Mock Oats",
    });
    const oatsQty = oatsRow.locator(".fi-qty");
    await expect(oatsQty).toHaveText("50g");
    await expect(oatsRow).toContainText("189.5 kcal");

    // Tapping the row opens the numeric+slider picker for this ingredient;
    // setting 100 g re-derives this row AND the totals. Oats per-100g is 379
    // kcal, so 100 g → 379. Banana unchanged at 133.5.
    await oatsRow.click();
    await expect(
      page.locator(".amount-sheet").getByRole("slider")
    ).toBeVisible();
    await page
      .locator(".amount-sheet")
      .getByLabel("Amount in grams")
      .fill("100");
    await page.locator(".amount-sheet #amount-done-btn").click();
    await expect(page.locator(".amount-sheet")).toBeHidden();
    await expect(oatsQty).toHaveText("100g");
    await expect(oatsRow).toContainText("379 kcal");
    await expect(figuresCal).toHaveText("512.5 kcal"); // 379 + 133.5
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("512.5 kcal");

    // Save (yield 1): the frozen snapshot reflects the edited amounts. Both
    // ingredients are replaced/retracted, so only the recipe counts.
    await page.locator("#save-recipe-btn").click();

    await expect(dinnerSection).toContainText("Dinner Combo");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    await expect(dinnerSection).not.toContainText("Mock Banana");
    await expect(page.locator(".calories-num")).toHaveText("512.5");
  });

  test("the add-ingredient back button returns to the recipe builder", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");

    // Open the add-ingredient sheet from the recipe builder.
    await page.locator("#add-ingredient-btn").click();
    const addSheet = page.locator(".add-ingredient-sheet");
    await expect(addSheet).toBeVisible();

    // The header back button (aria-label "Cancel" before a food is staged)
    // must close the sheet and return to the still-open recipe builder.
    await addSheet.getByRole("button", { name: "Cancel" }).click();

    await expect(addSheet).toBeHidden();
    await expect(page.locator("#recipe-name")).toHaveValue("Dinner Combo");
  });

  test("sets an ingredient amount with the quantity control and adds it", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Recipe builder open, seeded with oats 50 g (189.5) + banana 150 g (133.5) = 323.
    await selectTwoAndBuild(page);
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    // Open the add-ingredient sheet and stage a food via search.
    await page.locator("#add-ingredient-btn").click();
    const addSheet = page.locator(".add-ingredient-sheet");
    // Stage a food NOT already in the recipe (the seed has oats + banana).
    await addSheet.locator("#ai-search").fill("urad");
    await addSheet
      .locator(".result-item", { hasText: "Black Urad Dal" })
      .click();

    // The staged card shows the quantity control: a numeric field + a real
    // slider (role="slider", from bits-ui) + preset chips. Default 100 g of
    // Black Urad Dal (341 kcal/100 g) → the confirm button reflects 341 kcal.
    const confirm = addSheet.locator("#add-ingredient-confirm");
    await expect(addSheet.getByRole("slider")).toBeVisible();
    await expect(confirm).toHaveText("Add 341 kcal");

    // Typing an exact amount flows straight through (no step snapping): 50 → 170.5.
    await addSheet.getByLabel("Amount in grams").fill("50");
    await expect(confirm).toHaveText("Add 170.5 kcal");

    // Typing 100 g back in returns to the full amount: 100 g → 341.
    await addSheet.getByLabel("Amount in grams").fill("100");
    await expect(confirm).toHaveText("Add 341 kcal");

    // Adding folds the ingredient into the recipe: 323 + 341 = 664.
    await confirm.click();
    await expect(addSheet).toBeHidden();
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("664 kcal");
  });

  test("re-adding a food already in the recipe merges into its row (issue #14)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Recipe builder open, seeded with oats 50 g + banana 150 g = 323 kcal.
    await selectTwoAndBuild(page);
    await expect(page.locator(".ing-head .fl")).toHaveText("Ingredients (2)");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    // Re-add Mock Oats — a food ALREADY in the recipe. The keyed ingredient list
    // is entity-keyed, so this used to mint a duplicate key and abort the render:
    // the sheet stayed open and the add was silently dropped.
    await page.locator("#add-ingredient-btn").click();
    const addSheet = page.locator(".add-ingredient-sheet");
    await addSheet.locator("#ai-search").fill("oats");
    await addSheet.locator(".result-item", { hasText: "Mock Oats" }).click();
    await addSheet.getByLabel("Amount in grams").fill("50");
    await addSheet.locator("#add-ingredient-confirm").click();

    // The sheet closes and the add sticks: still one Oats row (no duplicate),
    // its amount folded 50 g + 50 g → 100 g, and the total reflects the merge.
    await expect(addSheet).toBeHidden();
    await expect(page.locator(".ing-head .fl")).toHaveText("Ingredients (2)");
    const oatsRow = page.locator(".recipe-ingredient", {
      hasText: "Mock Oats",
    });
    await expect(oatsRow.locator(".fi-qty")).toHaveText("100g");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("512.5 kcal");
  });

  // ── Seam 3: Instantiate a Recipe Twin + correct an instantiation (ADR-0022) ──

  // Build and save "Dinner Combo" (oats 50 g = 189.5 + banana 150 g = 133.5 = 323)
  // in dinner, leaving one logged instantiation of it on the day.
  async function buildDinnerCombo(page: import("@playwright/test").Page) {
    const dinnerSection = await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");
    await page.locator("#save-recipe-btn").click();
    await expect(dinnerSection).toContainText("Dinner Combo");
    await expect(page.locator(".calories-num")).toHaveText("323");
    return dinnerSection;
  }

  test("instantiates a saved recipe into a day, diverging for that occasion (additive)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await buildDinnerCombo(page);

    // Add the SAME recipe to a different meal via the Recipe browser.
    await page
      .getByRole("button", { name: "Log a recipe for breakfast" })
      .click();
    await page.locator(".recipe-pick", { hasText: "Dinner Combo" }).click();

    // The instantiation editor opens seeded from the template's ingredients and
    // yield (oats 50 g + banana 150 g → 323 per serving).
    await expect(page.locator('[data-testid="instantiation-name"]')).toHaveText(
      "Dinner Combo"
    );
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    // Diverge for THIS occasion only: bump the oats to 100 g → 379 + 133.5 = 512.5.
    await setIngredientGrams(page, "Mock Oats", "100");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("512.5 kcal");

    // Logging is purely additive — it writes a new instantiation and retracts
    // nothing. The dinner instantiation stays put at 323.
    await page.locator("#log-recipe-btn").click();

    const breakfastSection = page.locator(
      '.meal-section:has(.meal-title:text-is("BREAKFAST"))'
    );
    await expect(breakfastSection).toContainText("Dinner Combo");
    await expect(breakfastSection).toContainText("512.5 kcal");
    await expect(dinnerSection).toContainText("Dinner Combo");
    // Both occasions counted: 512.5 (breakfast) + 323 (dinner) = 835.5.
    await expect(page.locator(".calories-num")).toHaveText("835.5");
  });

  test("corrects a past instantiation by supersession (retract-and-replace)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await buildDinnerCombo(page);

    // Tap the logged recipe card to open the correction editor (not the amount
    // picker — a recipe instantiation is corrected on its own surface).
    await dinnerSection
      .locator(".meal-item-card", { hasText: "Dinner Combo" })
      .locator(".fi-name")
      .click();
    // The correction sheet heads with the thing, not the verb (`text-is`, since
    // "Recipe" is a substring of the add flow's "Log recipe").
    await expect(page.locator('h2:text-is("Recipe")')).toBeVisible();
    await expect(page.locator('[data-testid="instantiation-name"]')).toHaveText(
      "Dinner Combo"
    );

    // Correct the amount — re-derived from the current ingredient twins.
    await expect(
      page
        .locator(".recipe-ingredient", { hasText: "Mock Oats" })
        .locator(".fi-qty")
    ).toHaveText("50g");
    await setIngredientGrams(page, "Mock Oats", "100"); // 379 + 133.5 = 512.5
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("512.5 kcal");

    await page.locator("#save-instantiation-btn").click();

    // Exactly one instantiation remains (the old is retracted, a superseding one
    // appended), now at the corrected total.
    await expect(
      dinnerSection.locator(".meal-item-card", { hasText: "Dinner Combo" })
    ).toHaveCount(1);
    await expect(dinnerSection).toContainText("512.5 kcal");
    await expect(page.locator(".calories-num")).toHaveText("512.5");
  });

  // ── Seam 3: Define a Recipe Twin without logging + edit a template (#13) ──

  // Add one searched food to the OPEN recipe builder via the add-ingredient sheet.
  async function addSearchedIngredient(
    page: import("@playwright/test").Page,
    query: string,
    resultName: string,
    grams: string
  ) {
    await page.locator("#add-ingredient-btn").click();
    const addSheet = page.locator(".add-ingredient-sheet");
    await addSheet.locator("#ai-search").fill(query);
    await addSheet.locator(".result-item", { hasText: resultName }).click();
    await addSheet.getByLabel("Amount in grams").fill(grams);
    await addSheet.locator("#add-ingredient-confirm").click();
    await expect(addSheet).toBeHidden();
  }

  test("defines a Recipe Twin from scratch, logging one serving onto the day (ADR-0022 amended)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Open the log sheet's Recipe browser and start a brand-new template.
    await page
      .getByRole("button", { name: "Log a recipe for breakfast" })
      .click();
    await page.locator("#define-recipe-btn").click();

    // The builder opens empty in Define mode — saving here logs nothing.
    await expect(page.locator("#recipe-name")).toBeVisible();
    await expect(page.locator("#recipe-name")).toHaveValue("");
    await page.locator("#recipe-name").fill("Scratch Bowl");

    // Build it from search: oats 50 g (189.5) + banana 150 g (133.5) = 323/serving.
    await addSearchedIngredient(page, "oats", "Mock Oats", "50");
    await addSearchedIngredient(page, "banana", "Mock Banana", "150");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    await page.locator("#log-recipe-btn").click();

    // Define now ALSO logs one serving onto the day it was built (ADR-0022
    // amended): the breakfast it was opened from carries the 323 kcal serving.
    await expect(page.locator(".calories-num")).toHaveText("323");
    await expect(
      page.locator('.meal-section:has(.meal-title:text-is("BREAKFAST"))')
    ).toContainText("Scratch Bowl");

    // And the template now exists in the browser, ready to instantiate again later.
    await page.getByRole("button", { name: "Log a recipe for lunch" }).click();
    await expect(
      page.locator(".recipe-pick", { hasText: "Scratch Bowl" })
    ).toBeVisible();
  });

  test("edits a template so future instantiations re-seed while past ones stay frozen", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // One logged instantiation of Dinner Combo (323) already sits in dinner.
    const dinnerSection = await buildDinnerCombo(page);
    await expect(page.locator(".calories-num")).toHaveText("323");

    // Edit the TEMPLATE (not the logged occasion) via the Recipe browser.
    await page.getByRole("button", { name: "Log a recipe for lunch" }).click();
    // Editing now lives inside the opened recipe: pick it, then Edit by its title.
    await page.locator(".recipe-pick", { hasText: "Dinner Combo" }).click();
    await page.getByRole("button", { name: "Edit Dinner Combo" }).click();

    // Edit mode seeds from the template's CURRENT ingredients (323/serving).
    await expect(page.locator("#log-recipe-btn")).toContainText("Save changes");
    await expect(page.locator("#recipe-name")).toHaveValue("Dinner Combo");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("323 kcal");

    // Bump the oats 50 → 100 g (379 + 133.5 = 512.5/serving) and save the template.
    await expect(
      page
        .locator(".recipe-ingredient", { hasText: "Mock Oats" })
        .locator(".fi-qty")
    ).toHaveText("50g");
    await setIngredientGrams(page, "Mock Oats", "100");
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("512.5 kcal");
    await page.locator("#log-recipe-btn").click();

    // The edit logs nothing and never disturbs history: the already-logged
    // instantiation is a snapshot, so it stays frozen at 323.
    await expect(dinnerSection).toContainText("323 kcal");
    await expect(page.locator(".calories-num")).toHaveText("323");

    // A NEW instantiation, however, seeds from the edited template (512.5).
    await page
      .getByRole("button", { name: "Log a recipe for breakfast" })
      .click();
    await page.locator(".recipe-pick", { hasText: "Dinner Combo" }).click();
    await expect(page.locator('[data-testid="instantiation-name"]')).toHaveText(
      "Dinner Combo"
    );
    await expect(
      page.locator('[data-testid="recipe-figures"] .nutrient-calories strong')
    ).toContainText("512.5 kcal");
    await page.locator("#log-recipe-btn").click();

    const breakfastSection = page.locator(
      '.meal-section:has(.meal-title:text-is("BREAKFAST"))'
    );
    await expect(breakfastSection).toContainText("512.5 kcal");
    // Frozen past (323) + freshly-seeded future (512.5) = 835.5.
    await expect(page.locator(".calories-num")).toHaveText("835.5");
  });

  test("configurable visible nutrients: fibre by default, toggling updates the summary (#29)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // By default (no user setting) the dashboard summary shows Protein/Fat/Carbs
    // AND a Fibre meter — the calorie ring stays always-on.
    await expect(
      page.locator(".macro-name", { hasText: "Protein" })
    ).toBeVisible();
    await expect(
      page.locator(".macro-name", { hasText: "Fibre" })
    ).toBeVisible();
    // Calcium is in the catalogue but not selected by default.
    await expect(
      page.locator(".macro-name", { hasText: "Calcium" })
    ).toHaveCount(0);

    // Turn Calcium ON and Fibre OFF in the Food settings sheet.
    await openFoodSettings(page);
    await page.locator('input[data-nutrient="calcium"]').check();
    await page.locator('input[data-nutrient="fiber_content"]').uncheck();

    // Back on the dashboard the summary reflects the new selection exactly.
    await closeFoodSettings(page);
    await expect(
      page.locator(".macro-name", { hasText: "Calcium" })
    ).toBeVisible();
    await expect(page.locator(".macro-name", { hasText: "Fibre" })).toHaveCount(
      0
    );
    // Protein (a macro with a target) is untouched.
    await expect(
      page.locator(".macro-name", { hasText: "Protein" })
    ).toBeVisible();
  });

  test("shows a per-meal macro subtotal that sums just that section on one line", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Empty section: no subtotal, just the empty-state prompt.
    await expect(
      page.locator('[data-testid="meal-total-breakfast"]')
    ).toHaveCount(0);

    // Two breakfast items; the subtotal totals only this section's macros.
    await logUsdaFood(page, "breakfast", "banana", "Mock Banana", "150");
    await logUsdaFood(page, "breakfast", "oats", "Mock Oats", "80");
    // Lunch item must NOT bleed into the breakfast subtotal.
    await logUsdaFood(page, "lunch", "banana", "Mock Banana", "100");

    const total = page.locator('[data-testid="meal-total-breakfast"]');
    await expect(total).toBeVisible();
    // Calories lead (value only), then the chosen macros with compact labels.
    await expect(total).toContainText("436.7 kcal");
    await expect(total.locator(".nutrient-protein")).toContainText("Prot");
    await expect(total.locator(".nutrient-protein")).toContainText("12.13 g");
    await expect(total.locator(".nutrient-carbs")).toContainText("88.36 g");

    // It stays a single visual line and never wraps, whatever the width.
    const lines = await total.evaluate((el) => el.getClientRects().length);
    expect(lines).toBe(1);
  });
});
