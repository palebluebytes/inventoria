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

  test("can search USDA and log consumption of a food item", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Open logging menu for Breakfast
    await page.locator("button", { hasText: "+ Add breakfast" }).click();

    // Select USDA Search
    await page.locator(".menu-option-btn", { hasText: "Search FDC" }).click();

    // Query for banana
    await page.locator("#usda-modal-input").fill("banana");

    // Exact button selector in search-section
    await page.locator(".search-section button", { hasText: "Search" }).click();

    // Select Mock Banana from results
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();

    // Set quantity
    await page.locator("#quantity-input").fill("150");

    // Log the food
    await page.locator("button", { hasText: "Log Food" }).click();

    // Verify food listed on dashboard
    const breakfastSection = page.locator(".meal-section", {
      hasText: "BREAKFAST",
    });
    await expect(breakfastSection).toContainText("Mock Banana");
    await expect(breakfastSection).toContainText("150g");
    await expect(breakfastSection).toContainText("134 kcal"); // 89 * 1.5 = 133.5 -> 134 kcal

    // Verify progress update
    await expect(page.locator(".calories-num")).toHaveText("134");
  });

  test("can log a custom food with details and a photo", async ({ page }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Open logging menu for Lunch
    await page.locator("button", { hasText: "+ Add lunch" }).click();

    // Select Custom Entry
    await page.locator(".menu-option-btn", { hasText: "Add Photo" }).click();

    // Input details
    await page.locator("#photo-name-input").fill("Avocado Salad");
    await page.locator("#photo-cal-input").fill("300");
    await page.locator("#photo-prot-input").fill("6");
    await page.locator("#photo-fat-input").fill("25");
    await page.locator("#photo-carb-input").fill("12");

    // Simulate photo upload
    await page.setInputFiles(".hidden-file-input", {
      name: "salad.png",
      mimeType: "image/png",
      buffer: Buffer.from("dummy-image-data-base64"),
    });

    // Check preview is rendered
    const previewImg = page.locator(".photo-preview");
    await expect(previewImg).toBeVisible();

    // Log food
    await page.locator("button", { hasText: "Log Food" }).click();

    // Verify food twin listed on dashboard with thumbnail
    const lunchSection = page.locator(".meal-section", { hasText: "LUNCH" });
    await expect(lunchSection).toContainText("Avocado Salad");
    await expect(lunchSection).toContainText("1 serving");
    await expect(lunchSection).toContainText("300 kcal");
    await expect(lunchSection.locator(".meal-item-thumb")).toBeVisible();
  });

  test("can build a recipe twin, scrape steps, and log it with multiple ingredients", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Open logging menu for Dinner
    await page.locator("button", { hasText: "+ Add dinner" }).click();

    // Select Build Recipe
    await page.locator(".menu-option-btn", { hasText: "Build Recipe" }).click();

    // Recipe Meta details
    await page.locator("#recipe-name").fill("Oat Smoothie");
    await page.locator("#recipe-desc").fill("Post-run snack");
    await page
      .locator("#recipe-source")
      .fill("https://epicurious.com/smoothie-source");
    await page.locator("#recipe-url").fill("https://epicurious.com/smoothie");

    // Scrape steps
    await page.locator("button", { hasText: "Scrape" }).click();
    const stepsArea = page.locator("#recipe-steps");
    await expect(stepsArea).toHaveValue(
      /Scraped from: https:\/\/epicurious\.com\/smoothie/
    );

    // 1. Add USDA Ingredient (Oats)
    await page.locator("button", { hasText: "+ Add Ingredient" }).click();
    await page.locator("#recipe-usda-input").fill("oats");
    await page.locator(".search-section button", { hasText: "Search" }).click();
    await page.locator(".result-item-btn", { hasText: "Mock Oats" }).click();
    await page.locator("#ing-quantity-input").fill("50");
    await page.locator("button", { hasText: "Add to Recipe" }).click();

    // 2. Add Barcode Ingredient (Mock Nutella)
    await page.locator("button", { hasText: "+ Add Ingredient" }).click();
    await page.locator(".tab-btn", { hasText: "Barcode Lookup" }).click();
    await page.locator("#recipe-barcode-input").fill("3017620422003");
    await page.locator(".search-section button", { hasText: "Lookup" }).click();
    // Nutella returns directly to quantity screen as barcode is exact match
    await page.locator("#ing-quantity-input").fill("20");
    await page.locator("button", { hasText: "Add to Recipe" }).click();

    // Verify recipe aggregate totals on form
    // Oats 50g: (379 * 0.5) = 190 kcal. Nutella 20g: (539 * 0.2) = 108 kcal. Total: 298 kcal
    const totalCalsText = page.locator(".preview-pill.cal .pill-val");
    await expect(totalCalsText).toHaveText("298 kcal");

    // Save and Log Recipe
    await page.locator("button", { hasText: "Save & Log Recipe" }).click();

    // Verify on dashboard
    const dinnerSection = page.locator(".meal-section", { hasText: "DINNER" });
    await expect(dinnerSection).toContainText("Oat Smoothie");
    await expect(dinnerSection).toContainText("298 kcal");
  });

  test("can build a realistic Dal Makhani recipe twin with custom source URL and multiple ingredients", async ({
    page,
  }) => {
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await setupApiKeys(page);

    // Open logging menu for Dinner
    await page.locator("button", { hasText: "+ Add dinner" }).click();

    // Select Build Recipe
    await page.locator(".menu-option-btn", { hasText: "Build Recipe" }).click();

    // Recipe Meta details
    await page.locator("#recipe-name").fill("Dal Makhani");
    await page
      .locator("#recipe-desc")
      .fill("Classic buttery, creamy slow cooked black lentils");
    await page
      .locator("#recipe-source")
      .fill("https://www.indianhealthyrecipes.com/dal-makhani-recipe/");
    await page
      .locator("#recipe-url")
      .fill("https://www.indianhealthyrecipes.com/dal-makhani-recipe/");

    // Scrape steps
    await page.locator("button", { hasText: "Scrape" }).click();
    const stepsArea = page.locator("#recipe-steps");
    await expect(stepsArea).toHaveValue(
      /Scraped from: https:\/\/www\.indianhealthyrecipes\.com\/dal-makhani-recipe\//
    );

    // 1. Add Urad Dal (200g)
    await page.locator("button", { hasText: "+ Add Ingredient" }).click();
    await page.locator("#recipe-usda-input").fill("urad");
    await page.locator(".search-section button", { hasText: "Search" }).click();
    await page
      .locator(".result-item-btn", { hasText: "Black Urad Dal" })
      .click();
    await page.locator("#ing-quantity-input").fill("200");
    await page.locator("button", { hasText: "Add to Recipe" }).click();

    // 2. Add Rajma (55g)
    await page.locator("button", { hasText: "+ Add Ingredient" }).click();
    await page.locator("#recipe-usda-input").fill("rajma");
    await page.locator(".search-section button", { hasText: "Search" }).click();
    await page
      .locator(".result-item-btn", { hasText: "Red Kidney Beans (Rajma)" })
      .click();
    await page.locator("#ing-quantity-input").fill("55");
    await page.locator("button", { hasText: "Add to Recipe" }).click();

    // 3. Add Butter (42g)
    await page.locator("button", { hasText: "+ Add Ingredient" }).click();
    await page.locator("#recipe-usda-input").fill("butter");
    await page.locator(".search-section button", { hasText: "Search" }).click();
    await page
      .locator(".result-item-btn", { hasText: "Unsalted Butter" })
      .click();
    await page.locator("#ing-quantity-input").fill("42");
    await page.locator("button", { hasText: "Add to Recipe" }).click();

    // 4. Add Heavy Cream (80g)
    await page.locator("button", { hasText: "+ Add Ingredient" }).click();
    await page.locator("#recipe-usda-input").fill("cream");
    await page.locator(".search-section button", { hasText: "Search" }).click();
    await page
      .locator(".result-item-btn", { hasText: "Heavy Whipping Cream" })
      .click();
    await page.locator("#ing-quantity-input").fill("80");
    await page.locator("button", { hasText: "Add to Recipe" }).click();

    // Verify totals:
    // Urad Dal: 341 kcal/100g * 2 = 682 kcal
    // Rajma: 333 kcal/100g * 0.55 = 183.15 kcal -> 183 kcal
    // Butter: 717 kcal/100g * 0.42 = 301.14 kcal -> 301 kcal
    // Cream: 345 kcal/100g * 0.8 = 276 kcal
    // Total = 682 + 183 + 301 + 276 = 1442 kcal
    const totalCalsText = page.locator(".preview-pill.cal .pill-val");
    await expect(totalCalsText).toHaveText("1442 kcal");

    // Save and Log Recipe
    await page.locator("button", { hasText: "Save & Log Recipe" }).click();

    // Verify on dashboard
    const dinnerSection = page.locator(".meal-section", { hasText: "DINNER" });
    await expect(dinnerSection).toContainText("Dal Makhani");
    await expect(dinnerSection).toContainText("1442 kcal");
  });
});
