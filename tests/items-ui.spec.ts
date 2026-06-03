import { test, expect } from "@playwright/test";

test("Physical Digital Twins UI - manual create, scrape, status toggling, and web share target", async ({
  page,
}) => {
  // Capture page console logs for debugging
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) =>
    console.log("PAGE UNCAUGHT ERROR:", err.message)
  );

  // Mock corsproxy.io requests for scraping
  await page.route("**/corsproxy.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `
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
      `,
    });
  });

  // 1. Test basic navigation and manual creation
  await page.goto("/");

  // Wait for DB ready
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );

  // Click on the Items tab in Sidebar
  await page.locator(".nav-item", { hasText: "Items" }).click();

  // Open manual entry form
  await page.locator("button", { hasText: "Create Manual Entry" }).click();

  // Fill manual entry fields
  await page.locator("#manual-name").fill("Manual Keychron K2");
  await page.locator("#manual-brand").fill("Keychron");
  await page.locator("#manual-desc").fill("Wireless mechanical keyboard.");
  await page.locator("#manual-status").selectOption("wanted");

  // Submit manual form
  await page
    .locator("button[type='submit']", { hasText: "Save Digital Twin" })
    .click();

  // Verify it exists in the Wanted tab
  await page.locator("#tab-wanted-btn").click();
  const wantedLibrary = page.locator("#twins-library");
  await expect(
    wantedLibrary.locator(".item-card", { hasText: "Manual Keychron K2" })
  ).toBeVisible();

  // Change status of the Keychron keyboard to Owned (Acquired)
  const itemCard = wantedLibrary.locator(".item-card", {
    hasText: "Manual Keychron K2",
  });
  await itemCard.locator("button", { hasText: "Acquired" }).click();

  // Switch to Owned tab and verify it's there
  await page.locator("#tab-owned-btn").click();
  const ownedLibrary = page.locator("#twins-library");
  await expect(
    ownedLibrary.locator(".item-card", { hasText: "Manual Keychron K2" })
  ).toBeVisible();

  // 2. Test URL Ingestion via the Input Field
  await page
    .locator("#scrape-url-input")
    .fill("https://example.com/products/lamp");
  await page.locator("#scrape-submit-btn").click();

  // Wait for scraping success message
  await expect(page.locator(".alert-success")).toContainText(
    "Successfully imported"
  );

  // Scraped item should default to Wanted
  await page.locator("#tab-wanted-btn").click();
  await expect(
    wantedLibrary.locator(".item-card", { hasText: "Scraped Brutalist Lamp" })
  ).toBeVisible();

  // Verify brand and description are displayed
  const scrapedCard = wantedLibrary.locator(".item-card", {
    hasText: "Scraped Brutalist Lamp",
  });
  await expect(scrapedCard.locator(".item-brand")).toHaveText("ConcreteLab");
  await expect(scrapedCard.locator(".item-desc")).toContainText(
    "Concrete lamp with raw aesthetics."
  );

  // 3. Test Web Share Target parameter interception
  // Share target sends us to /?url=https://example.com/products/lamp
  await page.goto("/?url=https%3A%2F%2Fexample.com%2Fproducts%2Flamp");

  // Wait for DB ready
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );

  // App should automatically switch to Items view
  const mainHeader = page.locator("header.page-header h1").first();
  await expect(mainHeader).toHaveText("Physical Digital Twins");
});
