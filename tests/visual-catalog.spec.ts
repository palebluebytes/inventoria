/// <reference types="node" />
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
        /* Freeze all motion so captures are deterministic. The calorie ring
           animates its stroke-dashoffset via a CSS transition driven by async
           DB data; without this the screenshot can land mid-transition and
           flake run-to-run. Snap every animation/transition to its end state. */
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }
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
        .add-habit-sheet {
          position: absolute !important;
          height: auto !important;
          max-height: none !important;
          min-height: 100% !important;
          overflow-y: visible !important;
        }
        .add-habit-sheet .bottom-sheet-body {
          overflow-y: visible !important;
        }
      `,
    });
    try {
      await expect(page).toHaveScreenshot(name, {
        fullPage: true,
        // The calorie ring is an SVG arc whose antialiased rounded cap renders
        // at slightly different sub-pixels run-to-run, flaking the comparison
        // even frozen. Mask it (a solid box) — its value is asserted directly in
        // food-ui.spec.ts. The locator is a no-op on non-food dashboards.
        mask: [page.locator(".ring-container")],
      });
    } finally {
      await styleHandle.evaluate((el) => (el as Element).remove());
    }
  }

  test("generates visual catalog screenshots of all dashboards", async ({
    page,
  }) => {
    // Install deterministic clock
    await page.clock.install({ time: new Date("2026-06-05T08:30:00Z") });

    // 1. Initial Load & Setup
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Verify all registered screens are covered by this visual catalog test
    const EXPECTED_SCREENS = [
      "food twins",
      "media",
      "items",
      "agenda",
      "notes",
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

    // 2. Populate Food Dashboard (Log a Breakfast item via the direct sheet)
    await page.locator(".nav-item", { hasText: "Food Twins" }).click();
    await page.getByRole("button", { name: "Add breakfast" }).click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item-btn", { hasText: "Mock Banana" }).click();
    await page.getByLabel("Quantity in grams").fill("150");
    await page.locator("#log-food-btn").click();

    // Take Food Dashboard Screenshot
    await takeFullPageScreenshot(page, "food-dashboard.png");

    // 3. Populate Habits Dashboard (Add blueprints & log executions)
    await page.locator(".nav-item", { hasText: "Agenda" }).click();

    // 3.1. General Daily - Logged (Read Philosophy)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Read Philosophy");
    await page.locator(".category-chip", { hasText: "MIND" }).click();
    await page.locator(".segment-btn", { hasText: "DAILY" }).click();
    await takeFullPageScreenshot(page, "add-habit-screen.png");
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // 3.2. General Daily - Unlogged (Morning Meditation)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Morning Meditation");
    await page.locator(".category-chip", { hasText: "MIND" }).click();
    await page.locator(".segment-btn", { hasText: "DAILY" }).click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // 3.3. Daily with Multiple Reps - Logged 1/3 (Pushups Daily)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Pushups Daily");
    await page.locator(".category-chip", { hasText: "FITNESS" }).click();
    await page.locator(".segment-btn", { hasText: "DAILY" }).click();
    await page
      .locator(".reps-counter-container")
      .filter({ hasText: "TARGET REPS PER DAY" })
      .locator("button", { hasText: "+" })
      .click();
    await page
      .locator(".reps-counter-container")
      .filter({ hasText: "TARGET REPS PER DAY" })
      .locator("button", { hasText: "+" })
      .click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // 3.4. Daily with Specific Subtargets (Hydration Routine)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Hydration Routine");
    await page.locator(".category-chip", { hasText: "HEALTH" }).click();
    await page.locator(".segment-btn", { hasText: "DAILY" }).click();
    await page.locator(".specific-times-btn").click();
    await page.locator("button", { hasText: "+ ADD TIME SLOT" }).click();
    await page
      .locator(".subtarget-row-brutal")
      .nth(2)
      .locator("input")
      .fill("22:00");
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // 3.5. Weekly Days - Active (Gym Workout)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Gym Workout");
    await page.locator(".category-chip", { hasText: "FITNESS" }).click();
    await page.locator(".segment-btn", { hasText: "SPECIFIC DAYS" }).click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // 3.6. Weekly Days - OFF Today (Weekend Hike)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Weekend Hike");
    await page.locator(".category-chip", { hasText: "FITNESS" }).click();
    await page.locator(".segment-btn", { hasText: "SPECIFIC DAYS" }).click();
    await page.locator(".day-btn-brutal", { hasText: "THU" }).click(); // Deselect Thursday to make it OFF today
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // 3.7. Weekly Flexible - Logged 1/3 (Read 20 Pages)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Read 20 Pages");
    await page.locator(".category-chip", { hasText: "PRODUCTIVITY" }).click();
    await page.locator(".segment-btn", { hasText: "FLEXIBLE" }).click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // Helper to add calendar events
    async function addCalendarEvent(payload: {
      title: string;
      timed?: boolean;
      startTime?: string;
      endTime?: string;
      tracking?: boolean;
      timeSlots?: string[];
    }) {
      await page
        .locator("section:has-text('SCHEDULE')")
        .locator("button", { hasText: "+ ADD EVENT" })
        .click();
      await page.locator(".hero-input").fill(payload.title);

      if (payload.timed === false) {
        await page
          .locator(".field-card")
          .filter({ hasText: "START" })
          .locator("button:has-text('TIMED')")
          .click();
      } else {
        if (payload.startTime) {
          await page
            .locator(".field-card:has-text('START')")
            .locator("input.time-input")
            .fill(payload.startTime);
        }
        if (payload.endTime) {
          // Clicking "+ ADD END" auto-fills the end date (= start date) and
          // an end time of start + 1h. The date field is a bits-ui segmented
          // control (not a native input), so we only override the end time,
          // which is the second native time input in the START & END card.
          await page
            .locator(".field-card")
            .filter({ hasText: "START" })
            .locator("button:has-text('+ ADD END')")
            .click();
          await page
            .locator(".field-card")
            .filter({ hasText: "START" })
            .locator("input.time-input")
            .nth(1)
            .fill(payload.endTime);
        }
        if (payload.timeSlots) {
          // Fill first time slot into the START input
          await page
            .locator(".field-card:has-text('START')")
            .locator("input.time-input")
            .fill(payload.timeSlots[0]);
          // Add remaining slots
          for (let i = 1; i < payload.timeSlots.length; i++) {
            await page.locator("button:has-text('+ ADD ANOTHER TIME')").click();
            await page
              .locator(".slot-row")
              .nth(i - 1)
              .locator("input.time-input")
              .fill(payload.timeSlots[i]);
          }
        }
      }

      if (payload.tracking !== undefined) {
        const isChecked = await page
          .locator(".field-card:has-text('REQUIRES CONFIRMATION') .checkbox")
          .evaluate((el) => el.classList.contains("checked"));
        if (isChecked !== payload.tracking) {
          await page
            .locator(
              ".field-card:has-text('REQUIRES CONFIRMATION') button.toggle-row"
            )
            .click();
        }
      }

      await page.locator(".add-event-sheet .bottom-sheet-header h2").click();
      await page.locator(".save-btn").click();
      await expect(page.locator(".add-event-sheet")).not.toBeVisible();
    }

    // Add overlapping events, block durations, untimed events
    await addCalendarEvent({
      title: "Take Medication",
      timed: true,
      tracking: true,
      timeSlots: ["08:00", "20:00"],
    });
    await addCalendarEvent({
      title: "Deep Work Session",
      timed: true,
      startTime: "09:00",
      endTime: "12:00",
      tracking: false,
    });
    await addCalendarEvent({
      title: "Team Standup",
      timed: true,
      startTime: "09:30",
      endTime: "10:00",
      tracking: false,
    });
    await addCalendarEvent({
      title: "Coffee Break",
      timed: true,
      startTime: "10:15",
      tracking: true,
    });
    await addCalendarEvent({
      title: "Project Sync",
      timed: true,
      startTime: "11:00",
      endTime: "12:30",
      tracking: false,
    });
    await addCalendarEvent({
      title: "Read Book",
      timed: false,
      tracking: true,
    });

    // 3.8. Execute Quick Logs to show progress states
    // Log Take Medication morning target (08:00)
    const medicationMorningTarget = page
      .locator(".schedule-row")
      .filter({ hasText: "08:00" })
      .locator(".event-item.is-tracking")
      .first();
    await expect(medicationMorningTarget).toBeVisible();
    await medicationMorningTarget.click();
    await expect(medicationMorningTarget).toHaveClass(/is-confirmed/);

    // Log Read Philosophy
    const readPhilosophyItem = page.locator(".agenda-row", {
      hasText: "Read Philosophy",
    });
    await expect(readPhilosophyItem).toBeVisible();
    await readPhilosophyItem.click();
    await expect(readPhilosophyItem).toHaveClass(/completed/);

    // Log Pushups Daily once
    const pushupsItem = page.locator(".agenda-row", {
      hasText: "Pushups Daily",
    });
    await expect(pushupsItem).toBeVisible();
    await pushupsItem.click();
    await expect(pushupsItem.locator(".reps-pill")).toHaveText("1/3");

    // Log Hydration Routine morning target (08:00)
    // In the time-gutter layout the time lives in .time-gutter; select the row then the habit inside
    const hydrationMorningTarget = page
      .locator(".schedule-row")
      .filter({ hasText: "08:00" })
      .locator(".agenda-row")
      .first();
    await expect(hydrationMorningTarget).toBeVisible();
    await hydrationMorningTarget.click();
    await expect(hydrationMorningTarget).toHaveClass(/completed/);

    // Log Read 20 Pages once
    const read20PagesItem = page.locator(".agenda-row", {
      hasText: "Read 20 Pages",
    });
    await expect(read20PagesItem).toBeVisible();
    await read20PagesItem.click();
    await expect(read20PagesItem.locator(".reps-pill")).toHaveText("1/3");

    // Take Habits Dashboard Screenshot
    await takeFullPageScreenshot(page, "agenda-dashboard.png");

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

    // 6. Populate Notes Dashboard (a checklist item & a note)
    await page.locator(".nav-item", { hasText: "Notes" }).click();
    const checklistInput = page.getByTestId("new-item-input");
    await checklistInput.fill("Buy groceries");
    await checklistInput.press("Enter");
    await expect(
      page.getByTestId("checklist-item").filter({ hasText: "Buy groceries" })
    ).toBeVisible();

    await page.locator(".tab-btn", { hasText: "Notes" }).click();
    await page.locator("button", { hasText: "+ New note" }).click();
    const noteBody = page.getByTestId("note-body");
    await noteBody.fill("Weekly review: ship the settings reveal toggle.");
    await expect(noteBody).toHaveValue(
      "Weekly review: ship the settings reveal toggle."
    );

    // Take Notes Dashboard Screenshot
    await takeFullPageScreenshot(page, "notes-dashboard.png");

    // 7. Settings Page Screenshot
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await takeFullPageScreenshot(page, "settings-page.png");
  });
});
