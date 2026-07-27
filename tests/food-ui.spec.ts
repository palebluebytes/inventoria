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
    await page.locator(".nav-item", { hasText: "Food Twins" }).click();
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
    await page.locator("button", { hasText: `+ Add ${meal}` }).click();
    await page.locator("#food-search-input").fill(query);
    await page.locator(".result-item-btn", { hasText: resultName }).click();
    await page.locator("#quantity-input").fill(grams);
    await page.locator("#log-food-btn").click();
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

  test("opens the log sheet directly and logs a USDA food", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // "+ Add breakfast" opens the log sheet directly — no chooser step.
    await page.locator("button", { hasText: "+ Add breakfast" }).click();
    await expect(page.locator("#food-search-input")).toBeVisible();

    // Search (debounced) and select the result.
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();

    // Type the quantity (no steppers) and log.
    await page.locator("#quantity-input").fill("150");
    await page.locator("#log-food-btn").click();

    // Verify on the dashboard.
    const breakfastSection = page.locator(".meal-section", {
      hasText: "BREAKFAST",
    });
    await expect(breakfastSection).toContainText("Mock Banana");
    await expect(breakfastSection).toContainText("150g");
    await expect(breakfastSection).toContainText("134 kcal"); // 89 * 1.5 = 133.5 -> 134
    await expect(page.locator(".calories-num")).toHaveText("134");
  });

  test("logs a custom food with macros and a photo", async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Open the sheet for lunch and switch to the Custom method.
    await page.locator("button", { hasText: "+ Add lunch" }).click();
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
    await logUsdaFood(page, "dinner", "oats", "Mock Oats", "50"); // 379 * .5 = 190
    await logUsdaFood(page, "dinner", "banana", "Mock Banana", "150"); // 89 * 1.5 = 134

    const dinnerSection = page.locator(".meal-section", { hasText: "DINNER" });
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

    // Seeded with both foods: 190 + 134 = 324 kcal.
    await page.locator("#recipe-name").fill("Dinner Combo");
    await expect(page.locator(".recipe-total")).toContainText("324 kcal");
    await page.locator("#save-recipe-btn").click();

    // The recipe appears; the two originals are replaced (retracted).
    await expect(dinnerSection).toContainText("Dinner Combo");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    await expect(dinnerSection).not.toContainText("Mock Banana");
    // Only the recipe is counted now.
    await expect(page.locator(".calories-num")).toHaveText("324");
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
      .locator(".remove-ingredient")
      .click();
    await page.locator("#recipe-name").fill("Just Oats");
    await expect(page.locator(".recipe-total")).toContainText("190 kcal");

    // Add a discrete step for good measure.
    await page.locator('[data-section="steps"]').click();
    await page.locator(".recipe-step").first().fill("Soak the oats");

    await page.locator("#save-recipe-btn").click();

    // Oats replaced by the recipe; Banana still logged separately.
    await expect(dinnerSection).toContainText("Just Oats");
    await expect(dinnerSection).toContainText("Mock Banana");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    // Recipe 190 + kept Banana 134 = 324.
    await expect(page.locator(".calories-num")).toHaveText("324");
  });

  test("yield control drives live per-serving totals and freezes them on save", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");

    // The builder derives per-serving nutrition, not batch totals. Yield defaults
    // to 1, so per-serving equals the batch: oats 190 + banana 134 = 324.
    const perServingCal = page.locator(
      '[data-testid="per-serving"] .cal .pill-val'
    );
    await expect(page.locator("#recipe-yield")).toHaveValue("1");
    await expect(perServingCal).toHaveText("324 kcal");
    await expect(page.locator(".recipe-total")).toContainText("324 kcal");

    // Raising the yield halves the per-serving totals live — no save needed.
    await page.locator("#recipe-yield").fill("2");
    await expect(perServingCal).toHaveText("162 kcal"); // 324 / 2
    await expect(page.locator(".recipe-total")).toContainText("162 kcal");

    // Removing an ingredient re-derives live too, composing with the yield:
    // just oats now, 190 / 2 = 95 per serving.
    await page
      .locator(".recipe-ingredient", { hasText: "Mock Banana" })
      .locator(".remove-ingredient")
      .click();
    await expect(perServingCal).toHaveText("95 kcal");

    // Save at yield 2: the frozen snapshot is the 95 kcal per-serving figure the
    // builder showed. Oats (still an ingredient) is replaced/retracted; Banana
    // (removed from the builder) stays logged on its own.
    await page.locator("#save-recipe-btn").click();

    await expect(dinnerSection).toContainText("Dinner Combo");
    await expect(dinnerSection).toContainText("Mock Banana");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    // Recipe 95 (per serving, yield 2) + kept Banana 134 = 229.
    await expect(page.locator(".calories-num")).toHaveText("229");
  });

  test("editing an ingredient amount re-derives per-serving totals live and freezes them on save", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    const dinnerSection = await selectTwoAndBuild(page);
    await page.locator("#recipe-name").fill("Dinner Combo");

    // Seeded with oats 50 g (190) + banana 150 g (134); yield 1 → 324 per serving.
    const perServingCal = page.locator(
      '[data-testid="per-serving"] .cal .pill-val'
    );
    await expect(perServingCal).toHaveText("324 kcal");
    await expect(page.locator(".recipe-total")).toContainText("324 kcal");

    // The oats row exposes an inline, unit-aware amount editor bound to `amount`.
    const oatsRow = page.locator(".recipe-ingredient", {
      hasText: "Mock Oats",
    });
    const oatsAmount = oatsRow.locator(".edit-amount");
    await expect(oatsAmount).toHaveValue("50");
    await expect(oatsRow).toContainText("190 kcal");

    // Editing the amount re-derives this row AND the totals live — no re-add.
    // Oats per-100g is 379 kcal, so 100 g → 379. Banana unchanged at 134.
    await oatsAmount.fill("100");
    await expect(oatsAmount).toHaveValue("100");
    await expect(oatsRow).toContainText("379 kcal");
    await expect(oatsRow).toContainText("g · 379 kcal"); // unit stays "g"
    await expect(perServingCal).toHaveText("513 kcal"); // 379 + 134
    await expect(page.locator(".recipe-total")).toContainText("513 kcal");

    // Save (yield 1): the frozen snapshot reflects the edited amounts. Both
    // ingredients are replaced/retracted, so only the recipe counts.
    await page.locator("#save-recipe-btn").click();

    await expect(dinnerSection).toContainText("Dinner Combo");
    await expect(dinnerSection).not.toContainText("Mock Oats");
    await expect(dinnerSection).not.toContainText("Mock Banana");
    await expect(page.locator(".calories-num")).toHaveText("513");
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
    const addSheet = page.locator(
      '.sheet:has(> header h2:text-is("Add ingredient"))'
    );
    await expect(addSheet).toBeVisible();

    // The header back button (aria-label "Cancel" before a food is staged)
    // must close the sheet and return to the still-open recipe builder.
    await addSheet.getByRole("button", { name: "Cancel" }).click();

    await expect(addSheet).toBeHidden();
    await expect(page.locator("#recipe-name")).toHaveValue("Dinner Combo");
  });
});
