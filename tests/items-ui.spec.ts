import { test, expect } from "@playwright/test";

test("Physical Digital Twins UI - manual create, scrape, status toggling, and web share target", async ({
  page,
}) => {
  // Capture page console logs for debugging
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) =>
    console.log("PAGE UNCAUGHT ERROR:", err.message)
  );

  // Mock proxy requests for scraping
  const mockBody = `
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

  await page.route("**/corsproxy.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: mockBody,
    });
  });

  await page.route("**/api/proxy?url=*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: mockBody,
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
  await page.locator("#manual-tags").fill("keyboard, electronics");
  await page.locator("#manual-desc").fill("Wireless mechanical keyboard.");
  await page.locator("#manual-note").fill("Original manual note.");
  await page.locator("#manual-status").selectOption("wanted");

  // Submit manual form
  await page
    .locator("button[type='submit']", { hasText: "Save Digital Twin" })
    .click();

  // Verify it exists in the Wanted tab
  await page.locator("#tab-wanted-btn").click();
  const slot = page.locator(
    'button.inventory-slot[aria-label="Manual Keychron K2"]'
  );
  await expect(slot).toBeVisible();

  // Click slot to open inspector
  await slot.click();

  const inspector = page.locator(".inspector-panel");
  await expect(inspector).toBeVisible();

  // Verify tags and note are visible
  await expect(inspector.locator(".item-tags")).toContainText("keyboard");
  await expect(inspector.locator(".item-tags")).toContainText("electronics");
  await expect(inspector.locator(".item-note-box")).toContainText(
    "Original manual note."
  );

  // Test editing tags and note
  await inspector.locator("button", { hasText: "Edit" }).click();
  await page.locator("#edit-tags").fill("keyboard, mechanical, custom");
  await page.locator("#edit-note").fill("Updated manual note.");
  await page
    .locator("button[type='submit']", { hasText: "Save Changes" })
    .click();

  // Verify edited values on card
  await expect(inspector.locator(".item-tags")).toContainText("mechanical");
  await expect(inspector.locator(".item-tags")).toContainText("custom");
  await expect(inspector.locator(".item-note-box")).toContainText(
    "Updated manual note."
  );

  // Change status of the Keychron keyboard to Owned (Acquired)
  await inspector.locator("button", { hasText: "Mark Acquired" }).click();

  // Switch to Owned tab and verify it's there
  await page.locator("#tab-owned-btn").click();
  const ownedSlot = page.locator(
    'button.inventory-slot[aria-label="Manual Keychron K2"]'
  );
  await expect(ownedSlot).toBeVisible();

  // 2. Test URL Ingestion via the Input Field
  await page
    .locator("#scrape-url-input")
    .fill("https://example.com/products/lamp");
  await page.locator("#scrape-submit-btn").click();

  // Wait for scraping success message
  await expect(
    page.locator(".alert-success", { hasText: "Successfully imported" })
  ).toBeVisible();

  // Scraped item should default to Wanted
  await page.locator("#tab-wanted-btn").click();
  const lampSlot = page.locator(
    'button.inventory-slot[aria-label="Scraped Brutalist Lamp"]'
  );
  await expect(lampSlot).toBeVisible();

  // Verify brand and description are displayed
  await lampSlot.click();
  await expect(inspector.locator(".item-brand")).toHaveText("ConcreteLab");
  await expect(inspector.locator(".item-desc")).toContainText(
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
