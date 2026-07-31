/// <reference types="node" />
import { test, expect } from "@playwright/test";

test.describe("Calorie Tracker & Food Logging UI", () => {
  test.beforeEach(async ({ page }) => {
    // Capture page console messages
    page.on("console", (msg) => {
      console.log(`[BROWSER CONSOLE - ${msg.type()}]:`, msg.text());
    });

    // Intercept USDA query route
    await page.route("**/fdc/v1/foods/search**", async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get("query")?.toLowerCase() || "";

      let foods = [];
      if (query.includes("banana")) {
        foods = [
          {
            fdcId: 171705,
            description: "Mock Banana",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 89,
                unitName: "kcal",
              },
              {
                nutrientId: 1003,
                nutrientName: "Protein",
                value: 1.1,
                unitName: "g",
              },
              {
                nutrientId: 1004,
                nutrientName: "Total lipid (fat)",
                value: 0.3,
                unitName: "g",
              },
              {
                nutrientId: 1005,
                nutrientName: "Carbohydrate, by difference",
                value: 22.8,
                unitName: "g",
              },
              // Two micronutrients (ADR-0030) so the full breakdown (#30) has
              // vitamin/mineral data to show; reported in mg like FDC does.
              {
                nutrientId: 1087,
                nutrientName: "Calcium, Ca",
                value: 5,
                unitName: "mg",
              },
              {
                nutrientId: 1089,
                nutrientName: "Iron, Fe",
                value: 0.26,
                unitName: "mg",
              },
            ],
          },
        ];
      } else if (query.includes("oats")) {
        foods = [
          {
            fdcId: 1102706,
            description: "Mock Oats",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 379,
                unitName: "kcal",
              },
              {
                nutrientId: 1003,
                nutrientName: "Protein",
                value: 13.1,
                unitName: "g",
              },
              {
                nutrientId: 1004,
                nutrientName: "Total lipid (fat)",
                value: 6.5,
                unitName: "g",
              },
              {
                nutrientId: 1005,
                nutrientName: "Carbohydrate, by difference",
                value: 67.7,
                unitName: "g",
              },
            ],
          },
        ];
      } else if (query.includes("urad")) {
        foods = [
          {
            fdcId: 200001,
            description: "Black Urad Dal",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 341,
                unitName: "kcal",
              },
              {
                nutrientId: 1003,
                nutrientName: "Protein",
                value: 25,
                unitName: "g",
              },
              {
                nutrientId: 1004,
                nutrientName: "Total lipid (fat)",
                value: 1.5,
                unitName: "g",
              },
              {
                nutrientId: 1005,
                nutrientName: "Carbohydrate, by difference",
                value: 59,
                unitName: "g",
              },
            ],
          },
        ];
      } else if (query.includes("rajma")) {
        foods = [
          {
            fdcId: 200002,
            description: "Red Kidney Beans (Rajma)",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 333,
                unitName: "kcal",
              },
              {
                nutrientId: 1003,
                nutrientName: "Protein",
                value: 24,
                unitName: "g",
              },
              {
                nutrientId: 1004,
                nutrientName: "Total lipid (fat)",
                value: 0.8,
                unitName: "g",
              },
              {
                nutrientId: 1005,
                nutrientName: "Carbohydrate, by difference",
                value: 60,
                unitName: "g",
              },
            ],
          },
        ];
      } else if (query.includes("butter")) {
        foods = [
          {
            fdcId: 200003,
            description: "Unsalted Butter",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 717,
                unitName: "kcal",
              },
              {
                nutrientId: 1003,
                nutrientName: "Protein",
                value: 0.9,
                unitName: "g",
              },
              {
                nutrientId: 1004,
                nutrientName: "Total lipid (fat)",
                value: 81,
                unitName: "g",
              },
              {
                nutrientId: 1005,
                nutrientName: "Carbohydrate, by difference",
                value: 0.1,
                unitName: "g",
              },
            ],
          },
        ];
      } else if (query.includes("cream")) {
        foods = [
          {
            fdcId: 200004,
            description: "Heavy Whipping Cream",
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 345,
                unitName: "kcal",
              },
              {
                nutrientId: 1003,
                nutrientName: "Protein",
                value: 2.8,
                unitName: "g",
              },
              {
                nutrientId: 1004,
                nutrientName: "Total lipid (fat)",
                value: 37,
                unitName: "g",
              },
              {
                nutrientId: 1005,
                nutrientName: "Carbohydrate, by difference",
                value: 2.8,
                unitName: "g",
              },
            ],
          },
        ];
      } else {
        foods = [
          {
            fdcId: 999999,
            description: `Mock ${query}`,
            foodNutrients: [
              {
                nutrientId: 1008,
                nutrientName: "Energy",
                value: 100,
                unitName: "kcal",
              },
              {
                nutrientId: 1003,
                nutrientName: "Protein",
                value: 10,
                unitName: "g",
              },
              {
                nutrientId: 1004,
                nutrientName: "Total lipid (fat)",
                value: 10,
                unitName: "g",
              },
              {
                nutrientId: 1005,
                nutrientName: "Carbohydrate, by difference",
                value: 10,
                unitName: "g",
              },
            ],
          },
        ];
      }

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ foods }),
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

  async function setupApiKeys(page: import("@playwright/test").Page) {
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await page.locator("#usda-api-key").fill("test-usda-key");
    await page.locator("#tmdb-api-key").fill("test-tmdb-key");
    await page.locator("#scraper-proxy-url").fill("/api/proxy?url=");
    await page
      .locator("button[type='submit']", { hasText: "Save Settings" })
      .click();
    await expect(page.locator(".saved-badge")).toBeVisible();
    await page.locator(".nav-item", { hasText: "Food" }).click();
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
    await page.getByRole("button", { name: `Add ${meal}` }).click();
    await page.locator("#food-search-input").fill(query);
    await page.locator(".result-item-btn", { hasText: resultName }).click();
    await page.getByLabel("Quantity in grams").fill(grams);
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
    await sheet.getByLabel("Quantity in grams").fill(grams);
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

    // The breakfast add button opens the log sheet directly — no chooser step.
    await page.getByRole("button", { name: "Add breakfast" }).click();
    await expect(page.locator("#food-search-input")).toBeVisible();

    // Search (debounced) and select the result.
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();

    // Staging a food hides the method switcher — the sheet is now just "log this".
    await expect(page.locator(".method")).toHaveCount(0);

    // Staging uses the numeric+slider amount control (ADR-0023): a real slider
    // (role="slider", from bits-ui) alongside the typed field. Set 150 g and log.
    await expect(page.getByRole("slider")).toBeVisible();
    await page.getByLabel("Quantity in grams").fill("150");
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

  test("expands a staged food's full nutrient breakdown, scaled and omitting absent fields (#30)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Stage Mock Banana — it carries two micronutrients (calcium + iron) but no
    // fibre/sugar/sodium, so the breakdown must show the former and omit the latter.
    await page.getByRole("button", { name: "Add breakfast" }).click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();

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
    await page.getByLabel("Quantity in grams").fill("200");
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
    await expect(breakdown.locator(".nutrient-calories")).toBeVisible();
    // Calcium/iron total across just the two bananas that carried them, each shown
    // against its baked target (#42 renders `value / target`).
    await expect(breakdown.locator(".nutrient-calcium")).toContainText(
      "Calcium"
    );
    await expect(breakdown.locator(".nutrient-calcium")).toContainText("10 mg");
    await expect(breakdown.locator(".nutrient-iron")).toContainText("0.52 mg");
    // A macro every food carries is present too.
    await expect(breakdown.locator(".nutrient-protein")).toBeVisible();

    // A reach-toward nutrient no food carried is NOT omitted under #42 — it shows
    // against its target with the absent marker (`— / 28 g`), distinct from a 0.
    await expect(breakdown.locator(".nutrient-fiber_content")).toContainText(
      "— / 28 g"
    );
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
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await page.locator('input[data-nutrient="calcium"]').check();
    await page.locator(".nav-item", { hasText: "Food" }).click();

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
    await expect(calcium.locator(".progress-bar-fill")).toHaveCount(1);
    await expect(calcium.locator(".progress-bar-bg.no-target")).toHaveCount(0);
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
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    const proteinTarget = page.locator('input[data-target="protein"]');
    await expect(proteinTarget).toHaveAttribute("placeholder", "125");
    await proteinTarget.fill("100");
    await proteinTarget.blur();

    // Back on the dashboard the meter now reaches toward the override, and the
    // baked default is gone — the write reached the resolver via the ledger.
    await page.locator(".nav-item", { hasText: "Food" }).click();
    await expect(protein).toContainText("/ 100 g");
    await expect(protein).not.toContainText("/ 125 g");
  });

  test("the reset control restores a target to its baked default and disables itself (#41)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    await page.locator(".nav-item", { hasText: "Settings" }).click();
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
    await page.locator(".nav-item", { hasText: "Settings" }).click();
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
    await page.locator(".nav-item", { hasText: "Food" }).click();
    await logUsdaFood(page, "breakfast", "banana", "Mock Banana", "100");
    const calcium = page.locator(".macro-item.calcium");
    await expect(calcium.locator(".progress-bar-bg.no-target")).toHaveCount(1);
    await expect(calcium.locator(".progress-bar-fill")).toHaveCount(0);
  });

  test("customising a target tracks that nutrient; the two prefs stay per-nutrient (#41)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    await page.locator(".nav-item", { hasText: "Settings" }).click();

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
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await page.locator("button[data-open-calculator]").click();

    // The live preview stays empty until the body metrics are complete.
    await expect(page.locator("[data-preview]")).toContainText(
      "Enter your sex"
    );

    // Worked Example A (ADR-0033 / #44): 35 y ♀, 70 kg, 170 cm, Active, Maintain.
    await page.locator('button[data-sex="female"]').click();
    await page.locator('input[data-field="age"]').fill("35");
    await page.locator('input[data-field="height"]').fill("170");
    await page.locator('input[data-field="weight"]').fill("70");
    await page.locator('button[data-activity="active"]').click();
    await page.locator('button[data-goal="maintain"]').click();

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
    await page.locator(".nav-item", { hasText: "Food" }).click();
    const protein = page.locator(".macro-item.protein");
    await expect(protein).toContainText("/ 112 g");
    await expect(protein).not.toContainText("/ 125 g");
  });

  test("a stay-under limit override saves and resets to its baked cap (#43)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    await page.locator(".nav-item", { hasText: "Settings" }).click();
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

    await page.locator(".nav-item", { hasText: "Settings" }).click();

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

  // Route the USDA detail endpoint (`/food/{fdcId}`) — the source of household
  // portions (ADR-0030 §5), absent from the search response. Banana (171705)
  // carries portions; every other food hydrates to none, so the picker renders
  // its gram controls unchanged.
  async function routeFdcDetail(page: import("@playwright/test").Page) {
    await page.route("**/fdc/v1/food/*", async (route) => {
      const url = new URL(route.request().url());
      const fdcId = Number(url.pathname.split("/").pop());
      const foodPortions =
        fdcId === 171705
          ? [
              { amount: 1, gramWeight: 118, modifier: "medium" },
              { amount: 1, gramWeight: 150, modifier: "large" },
            ]
          : [];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ fdcId, foodPortions }),
      });
    });
  }

  test("stages a food's household portions as amount-picker presets (ADR-0030)", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);
    await routeFdcDetail(page);

    // Stage a food WITH portions. Selecting it hydrates the detail record once.
    await page.getByRole("button", { name: "Add breakfast" }).click();
    const detail = page.waitForResponse((r) =>
      r.url().includes("/fdc/v1/food/171705")
    );
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();
    await detail;

    // Default 100 g of Mock Banana (89 kcal/100 g) → the log button shows 89.
    await expect(page.locator("#log-food-btn")).toHaveText("Log 89 kcal");

    // The hydrated portions appear as presets alongside the gram control.
    const portions = page.locator('[data-testid="portion-presets"]');
    await expect(
      portions.getByRole("button", { name: "1 medium — 118 g" })
    ).toBeVisible();

    // Tapping a preset fills its resolved grams and updates the shown total:
    // 118 g of 89 kcal/100 g → 89 × 1.18 = 105.02 kcal.
    await portions.getByRole("button", { name: "1 medium — 118 g" }).click();
    await expect(page.getByLabel("Quantity in grams")).toHaveValue("118");
    await expect(page.locator("#log-food-btn")).toHaveText("Log 105.02 kcal");

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
    await routeFdcDetail(page);

    // Stage a food whose detail record carries no portions.
    await page.getByRole("button", { name: "Add breakfast" }).click();
    const detail = page.waitForResponse((r) =>
      r.url().includes("/fdc/v1/food/1102706")
    );
    await page.locator("#food-search-input").fill("oats");
    await page.locator(".result-item-btn", { hasText: "Mock Oats" }).click();
    await detail;

    // No preset chips; the gram field + slider are the whole control, as today.
    await expect(page.locator('[data-testid="portion-presets"]')).toHaveCount(
      0
    );
    await expect(page.getByRole("slider")).toBeVisible();
    await expect(page.getByLabel("Quantity in grams")).toHaveValue("100");
  });

  test("caches search results when returning from a staged food", async ({
    page,
  }) => {
    let searches = 0;
    page.on("request", (req) => {
      if (req.url().includes("/fdc/v1/foods/search")) searches++;
    });

    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    await page.getByRole("button", { name: "Add breakfast" }).click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();
    const afterSearch = searches;
    expect(afterSearch).toBeGreaterThan(0);

    // "Change food" returns to the list; the cached results show without a
    // second network search.
    await page.getByRole("button", { name: "Change food" }).click();
    await expect(
      page.locator(".result-item-btn", { hasText: "Mock Banana" })
    ).toBeVisible();
    await page.waitForTimeout(700); // past the 400ms debounce
    expect(searches).toBe(afterSearch);
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
    await expect(sheet.getByLabel("Quantity in grams")).toHaveValue("150");
    await expect(sheet.getByRole("slider")).toBeVisible();

    // Change the amount and confirm; the entry is replaced (append-only, not
    // duplicated) with macros re-derived from the twin at the new amount.
    await sheet.getByLabel("Quantity in grams").fill("300"); // 89 * 3 = 267
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

    // Open the sheet for lunch and switch to the Custom method.
    await page.getByRole("button", { name: "Add lunch" }).click();
    await page.locator(".method", { hasText: "Custom" }).click();

    await page.locator("#custom-name").fill("Avocado Salad");
    await page.locator("#custom-cal").fill("300");
    await page.locator("#custom-prot").fill("6");
    await page.locator("#custom-fat").fill("25");
    await page.locator("#custom-carb").fill("12");

    // Attach a photo (optional attribute of the custom entry).
    await page.setInputFiles(".hidden-file-input", {
      name: "salad.png",
      mimeType: "image/png",
      buffer: Buffer.from("dummy-image-data-base64"),
    });
    await expect(page.locator(".photo-preview")).toBeVisible();

    await page.locator("#log-food-btn").click();

    const lunchSection = page.locator(".meal-section", { hasText: "LUNCH" });
    await expect(lunchSection).toContainText("Avocado Salad");
    await expect(lunchSection).toContainText("1 serving");
    await expect(lunchSection).toContainText("300 kcal");
    await expect(lunchSection.locator(".meal-item-thumb")).toBeVisible();
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
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");
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
    await expect(page.locator(".recipe-total")).toContainText("189.5 kcal");

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

  // Skipped while the yield control is hidden in the UI (IngredientListEditor's
  // `{#if false}` yield-row) — multi-serving isn't ready to expose. The yield
  // math itself stays covered at the store/derivation seam (calorie-store,
  // recipe-nutrition, recipe-instantiation unit tests). Re-enable when the
  // control returns.
  test.skip("yield control drives live per-serving totals and freezes them on save", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");

    // The builder derives per-serving nutrition, not batch totals. Yield defaults
    // to 1, so per-serving equals the batch: oats 189.5 + banana 133.5 = 323.
    const perServingCal = page.locator(
      '[data-testid="per-serving"] .cal .pill-val'
    );
    await expect(page.locator("#recipe-yield")).toHaveValue("1");
    await expect(perServingCal).toHaveText("323 kcal");
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");

    // Raising the yield halves the per-serving totals live — no save needed.
    await page.locator("#recipe-yield").fill("2");
    await expect(perServingCal).toHaveText("161.5 kcal"); // 323 / 2
    await expect(page.locator(".recipe-total")).toContainText("161.5 kcal");

    // Removing an ingredient re-derives live too, composing with the yield:
    // just oats now, 189.5 / 2 = 94.75 per serving.
    await page
      .locator(".recipe-ingredient", { hasText: "Mock Banana" })
      .locator(".fi-remove")
      .click();
    await expect(perServingCal).toHaveText("94.75 kcal");

    // Save at yield 2: the frozen snapshot is the 95 kcal per-serving figure the
    // builder showed. Oats (still an ingredient) is replaced/retracted; Banana
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
    const perServingCal = page.locator(
      '[data-testid="per-serving"] .cal .pill-val'
    );
    await expect(perServingCal).toHaveText("323 kcal");
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");

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
      .getByLabel("Quantity in grams")
      .fill("100");
    await page.locator(".amount-sheet #amount-done-btn").click();
    await expect(page.locator(".amount-sheet")).toBeHidden();
    await expect(oatsQty).toHaveText("100g");
    await expect(oatsRow).toContainText("379 kcal");
    await expect(perServingCal).toHaveText("512.5 kcal"); // 379 + 133.5
    await expect(page.locator(".recipe-total")).toContainText("512.5 kcal");

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
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");

    // Open the add-ingredient sheet and stage a food via search.
    await page.locator("#add-ingredient-btn").click();
    const addSheet = page.locator(".add-ingredient-sheet");
    // Stage a food NOT already in the recipe (the seed has oats + banana).
    await addSheet.locator("#ai-search").fill("urad");
    await addSheet
      .locator(".result-item-btn", { hasText: "Black Urad Dal" })
      .click();

    // The staged card shows the quantity control: a numeric field + a real
    // slider (role="slider", from bits-ui) + preset chips. Default 100 g of
    // Black Urad Dal (341 kcal/100 g) → the confirm button reflects 341 kcal.
    const confirm = addSheet.locator("#add-ingredient-confirm");
    await expect(addSheet.getByRole("slider")).toBeVisible();
    await expect(confirm).toHaveText("Add 341 kcal");

    // Typing an exact amount flows straight through (no step snapping): 50 → 170.5.
    await addSheet.getByLabel("Quantity in grams").fill("50");
    await expect(confirm).toHaveText("Add 170.5 kcal");

    // A preset chip jumps to a common amount: 100 g → 341.
    await addSheet.getByRole("button", { name: "100", exact: true }).click();
    await expect(confirm).toHaveText("Add 341 kcal");

    // Adding folds the ingredient into the recipe: 323 + 341 = 664.
    await confirm.click();
    await expect(addSheet).toBeHidden();
    await expect(page.locator(".recipe-total")).toContainText("664 kcal");
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
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");

    // Re-add Mock Oats — a food ALREADY in the recipe. The keyed ingredient list
    // is entity-keyed, so this used to mint a duplicate key and abort the render:
    // the sheet stayed open and the add was silently dropped.
    await page.locator("#add-ingredient-btn").click();
    const addSheet = page.locator(".add-ingredient-sheet");
    await addSheet.locator("#ai-search").fill("oats");
    await addSheet
      .locator(".result-item-btn", { hasText: "Mock Oats" })
      .click();
    await addSheet.getByLabel("Quantity in grams").fill("50");
    await addSheet.locator("#add-ingredient-confirm").click();

    // The sheet closes and the add sticks: still one Oats row (no duplicate),
    // its amount folded 50 g + 50 g → 100 g, and the total reflects the merge.
    await expect(addSheet).toBeHidden();
    await expect(page.locator(".ing-head .fl")).toHaveText("Ingredients (2)");
    const oatsRow = page.locator(".recipe-ingredient", {
      hasText: "Mock Oats",
    });
    await expect(oatsRow.locator(".fi-qty")).toHaveText("100g");
    await expect(page.locator(".recipe-total")).toContainText("512.5 kcal");
  });

  // ── Seam 3: Instantiate a Recipe Twin + correct an instantiation (ADR-0022) ──

  // Build and save "Dinner Combo" (oats 50 g = 189.5 + banana 150 g = 133.5 = 323)
  // in dinner, leaving one logged instantiation of it on the day.
  async function buildDinnerCombo(page: import("@playwright/test").Page) {
    const dinnerSection = await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");
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
    await page.getByRole("button", { name: "Add breakfast" }).click();
    await page.locator(".method", { hasText: "Recipe" }).click();
    await page.locator(".recipe-pick", { hasText: "Dinner Combo" }).click();

    // The instantiation editor opens seeded from the template's ingredients and
    // yield (oats 50 g + banana 150 g → 323 per serving).
    await expect(page.locator('[data-testid="instantiation-name"]')).toHaveText(
      "Dinner Combo"
    );
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");

    // Diverge for THIS occasion only: bump the oats to 100 g → 379 + 133.5 = 512.5.
    await setIngredientGrams(page, "Mock Oats", "100");
    await expect(page.locator(".recipe-total")).toContainText("512.5 kcal");

    // Logging is purely additive — it writes a new instantiation and retracts
    // nothing. The dinner instantiation stays put at 323.
    await page.locator("#save-instantiation-btn").click();

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
    await expect(page.locator("h2", { hasText: "Correct" })).toBeVisible();
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
    await expect(page.locator(".recipe-total")).toContainText("512.5 kcal");

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
    await addSheet.locator(".result-item-btn", { hasText: resultName }).click();
    await addSheet.getByLabel("Quantity in grams").fill(grams);
    await addSheet.locator("#add-ingredient-confirm").click();
    await expect(addSheet).toBeHidden();
  }

  test("defines a Recipe Twin from scratch without logging a consumption", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Open the log sheet's Recipe browser and start a brand-new template.
    await page.getByRole("button", { name: "Add breakfast" }).click();
    await page.locator(".method", { hasText: "Recipe" }).click();
    await page.locator("#define-recipe-btn").click();

    // The builder opens empty in Define mode — saving here logs nothing.
    await expect(page.locator("h2", { hasText: "New recipe" })).toBeVisible();
    await page.locator("#recipe-name").fill("Scratch Bowl");

    // Build it from search: oats 50 g (189.5) + banana 150 g (133.5) = 323/serving.
    await addSearchedIngredient(page, "oats", "Mock Oats", "50");
    await addSearchedIngredient(page, "banana", "Mock Banana", "150");
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");

    await page.locator("#save-recipe-btn").click();

    // Define logs NOTHING: the day stays empty (zero-instantiation template).
    await expect(page.locator(".calories-num")).toHaveText("0");
    await expect(
      page.locator('.meal-section:has(.meal-title:text-is("BREAKFAST"))')
    ).toContainText("No breakfast logged yet.");

    // Yet the template now exists in the browser, ready to instantiate later.
    await page.getByRole("button", { name: "Add lunch" }).click();
    await page.locator(".method", { hasText: "Recipe" }).click();
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
    await page.getByRole("button", { name: "Add lunch" }).click();
    await page.locator(".method", { hasText: "Recipe" }).click();
    await page.getByRole("button", { name: "Edit Dinner Combo" }).click();

    // Edit mode seeds from the template's CURRENT ingredients (323/serving).
    await expect(page.locator("h2", { hasText: "Edit recipe" })).toBeVisible();
    await expect(page.locator("#recipe-name")).toHaveValue("Dinner Combo");
    await expect(page.locator(".recipe-total")).toContainText("323 kcal");

    // Bump the oats 50 → 100 g (379 + 133.5 = 512.5/serving) and save the template.
    await expect(
      page
        .locator(".recipe-ingredient", { hasText: "Mock Oats" })
        .locator(".fi-qty")
    ).toHaveText("50g");
    await setIngredientGrams(page, "Mock Oats", "100");
    await expect(page.locator(".recipe-total")).toContainText("512.5 kcal");
    await page.locator("#save-recipe-btn").click();

    // The edit logs nothing and never disturbs history: the already-logged
    // instantiation is a snapshot, so it stays frozen at 323.
    await expect(dinnerSection).toContainText("323 kcal");
    await expect(page.locator(".calories-num")).toHaveText("323");

    // A NEW instantiation, however, seeds from the edited template (512.5).
    await page.getByRole("button", { name: "Add breakfast" }).click();
    await page.locator(".method", { hasText: "Recipe" }).click();
    await page.locator(".recipe-pick", { hasText: "Dinner Combo" }).click();
    await expect(page.locator('[data-testid="instantiation-name"]')).toHaveText(
      "Dinner Combo"
    );
    await expect(page.locator(".recipe-total")).toContainText("512.5 kcal");
    await page.locator("#save-instantiation-btn").click();

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

    // Turn Calcium ON and Fibre OFF in Settings.
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await page.locator('input[data-nutrient="calcium"]').check();
    await page.locator('input[data-nutrient="fiber_content"]').uncheck();

    // Back on the dashboard the summary reflects the new selection exactly.
    await page.locator(".nav-item", { hasText: "Food" }).click();
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
