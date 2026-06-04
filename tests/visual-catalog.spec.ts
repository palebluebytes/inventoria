import { test, expect } from "@playwright/test";

test.describe("Visual Catalog Generator", () => {
  test.beforeEach(async ({ page }) => {
    // Capture page console logs for debugging
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", (err) =>
      console.log("PAGE UNCAUGHT ERROR:", err.message)
    );

    // USDA API intercept
    await page.route("**/fdc/v1/foods/search**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          foods: [
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
          ],
        }),
      });
    });

    // TMDB Search API intercept
    await page.route("**/3/search/movie*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [
            {
              id: 155,
              title: "The Dark Knight",
              release_date: "2008-07-16",
              poster_path: "/dark-knight-poster.jpg",
            },
          ],
        }),
      });
    });

    // TMDB Details API intercept
    await page.route("**/3/movie/155*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 155,
          title: "The Dark Knight",
          release_date: "2008-07-16",
          poster_path: "/dark-knight-poster.jpg",
          credits: {
            crew: [{ job: "Director", name: "Christopher Nolan" }],
          },
        }),
      });
    });

    // Open Library API intercept
    await page.route("**/search.json*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          docs: [
            {
              key: "/works/OL1168083W",
              title: "1984",
              author_name: ["George Orwell"],
              first_publish_year: 1949,
              cover_i: 12345,
              isbn: ["9780141187761"],
              subject: ["Classic Literature", "Dystopian"],
              description: "A dystopian social science fiction novel.",
            },
          ],
        }),
      });
    });

    // Custom scraping proxy route
    const mockScrapeBody = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "@id": "did:dpp:eu:custom_lamp_999",
              "name": "Scraped Brutalist Lamp",
              "image": "https://example.com/lamp.jpg",
              "description": "Concrete lamp with raw aesthetics.",
              "brand": {
                "@type": "Brand",
                "name": "ConcreteLab"
              }
            }
          </script>
        </head>
      </html>
    `;
    await page.route("**/api/proxy?url=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: mockScrapeBody,
      });
    });

    // Mock image requests to prevent 404s and broken image layout shifts/mismatches
    const transparentPixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    await page.route("**/dark-knight-poster.jpg", async (route) => {
      await route.fulfill({
        contentType: "image/gif",
        body: transparentPixel,
      });
    });
    await page.route("**/lamp.jpg", async (route) => {
      await route.fulfill({
        contentType: "image/gif",
        body: transparentPixel,
      });
    });
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
  }

  async function resetDatabase(page: import("@playwright/test").Page) {
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    const devToggle = page.locator("#dev-mode-toggle");
    await devToggle.check();
    const resetBtn = page.locator("#reset-test-btn");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await waitForDbReady(page);
  }

  async function takeFullPageScreenshot(
    page: import("@playwright/test").Page,
    name: string
  ) {
    const styleHandle = await page.addStyleTag({
      content: `
        .app {
          height: auto !important;
          min-height: 100svh !important;
        }
        .main {
          overflow-y: visible !important;
          height: auto !important;
        }
        .sidebar {
          position: static !important;
        }
      `,
    });
    try {
      await expect(page).toHaveScreenshot(name, { fullPage: true });
    } finally {
      await styleHandle.evaluate((el) => el.remove());
    }
  }

  test("generates visual catalog screenshots of all dashboards", async ({
    page,
  }) => {
    // 1. Initial Load & Setup
    await page.goto("/");
    await waitForDbReady(page);

    // Verify all registered screens are covered by this visual catalog test
    const EXPECTED_SCREENS = [
      "food twins",
      "media",
      "items",
      "habits",
      "settings",
    ];
    const navItems = await page.locator(".sidebar nav .nav-item").all();
    const discoveredScreens: string[] = [];
    for (const item of navItems) {
      const text = await item.innerText();
      const cleaned = text
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .trim();
      discoveredScreens.push(cleaned);
    }
    expect(discoveredScreens.sort()).toEqual(EXPECTED_SCREENS.sort());

    await resetDatabase(page);
    await setupApiKeys(page);

    // 2. Populate Food Dashboard (Log a Breakfast item)
    await page.locator(".nav-item", { hasText: "Food Twins" }).click();
    await page.locator("button", { hasText: "+ Add breakfast" }).click();
    await page.locator(".menu-option-btn", { hasText: "Search FDC" }).click();
    await page.locator("#usda-modal-input").fill("banana");
    await page.locator(".search-section button", { hasText: "Search" }).click();
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();
    await page.locator("#quantity-input").fill("150");
    await page.locator("button", { hasText: "Log Food" }).click();

    // Take Food Dashboard Screenshot
    await takeFullPageScreenshot(page, "food-dashboard.png");

    // 3. Populate Habits Dashboard (Add blueprint & log execution)
    await page.locator(".nav-item", { hasText: "Habits" }).click();
    await page.locator(".fab-btn").click();
    await page.locator("#habit-name-input").fill("Read Philosophy");
    await page.selectOption("#habit-category", "Mind");
    await page.selectOption("#habit-schedule", "daily_multiple");
    await page.locator(".btn-agenda-submit").click();

    // Quick Log habit
    const habitItem = page.locator(".agenda-row", {
      hasText: "Read Philosophy",
    });
    await expect(habitItem).toBeVisible();
    await habitItem.click();
    await expect(habitItem.locator(".meta-stats")).toContainText("🔥 1d");

    // Take Habits Dashboard Screenshot
    await takeFullPageScreenshot(page, "habits-dashboard.png");

    // 4. Populate Media Dashboard (Add Movie & Book)
    await page.locator(".nav-item", { hasText: "Media" }).click();

    // Add Movie
    await page
      .locator(".kanban-column", { hasText: "Saved" })
      .locator("button.add-btn")
      .click();
    await page.locator("#media-search-input").fill("Dark Knight");
    await page.locator("button[type='submit']", { hasText: "Search" }).click();
    await page
      .locator(".search-result-item", { hasText: "The Dark Knight" })
      .locator("button", { hasText: "Save" })
      .click();
    await page.locator(".close-btn").click();

    // Move Movie to Started
    const movieCard = page
      .locator(".kanban-column", { hasText: "Saved" })
      .locator(".media-card", { hasText: "The Dark Knight" });
    await movieCard.locator("button", { hasText: "Start →" }).click();

    // Add Book
    await page.locator(".tab-btn", { hasText: "Books" }).click();
    await page
      .locator(".kanban-column", { hasText: "Saved" })
      .locator("button.add-btn")
      .click();
    await page.locator("#media-search-input").fill("1984");
    await page.locator("button[type='submit']", { hasText: "Search" }).click();
    await page
      .locator(".search-result-item", { hasText: "1984" })
      .locator("button", { hasText: "Save" })
      .click();
    await page.locator(".close-btn").click();

    // Take Media Dashboard Screenshot
    await takeFullPageScreenshot(page, "media-dashboard.png");

    // 5. Populate Items Dashboard (Add Wanted item)
    await page.locator(".nav-item", { hasText: "Items" }).click();
    await page.locator("button", { hasText: "Create Manual Entry" }).click();
    await page.locator("#manual-name").fill("Manual Keychron K2");
    await page.locator("#manual-brand").fill("Keychron");
    await page.locator("#manual-tags").fill("keyboard, electronics");
    await page.locator("#manual-desc").fill("Wireless mechanical keyboard.");
    await page.locator("#manual-status").selectOption("wanted");
    await page
      .locator("button[type='submit']", { hasText: "Save Digital Twin" })
      .click();

    // Scrape an item
    await page
      .locator("#scrape-url-input")
      .fill("https://example.com/products/lamp");
    await page.locator("#scrape-submit-btn").click();
    await expect(
      page.locator(".alert-success", { hasText: "Successfully imported" })
    ).toBeVisible();

    // Take Items Dashboard Screenshot
    await takeFullPageScreenshot(page, "items-dashboard.png");

    // 6. Settings Page Screenshot
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await takeFullPageScreenshot(page, "settings-page.png");
  });
});
