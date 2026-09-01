/// <reference types="node" />
import { test, expect } from "@playwright/test";

/** Shared by both catalogues below: nothing is worth capturing until the ledger
 *  has answered, and every screen here reads from it. */
async function waitForDbReady(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );
}

test.describe("Visual Catalog Generator", () => {
  test.beforeEach(async ({ page }) => {
    // Capture page console logs for debugging
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", (err) =>
      console.log("PAGE UNCAUGHT ERROR:", err.message)
    );

    // The bundled USDA corpus (ADR-0047), served as a fixture: food search reads
    // the committed Search index and staging reads the Nutrient store, so these
    // two routes pin the one food the catalogue logs. There is no API to
    // intercept and no key to enter.
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
            },
          ],
        }),
      });
    });

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
          },
          foods: {
            171705: { 1003: 1.1, 1004: 0.3, 1005: 22.8, 1008: 89 },
          },
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
    // The book cover the Open Library mock above implies: `cover_i: 12345`
    // becomes `covers.openlibrary.org/b/id/12345-L.jpg` (open-library.ts), which
    // was the one image request in this file still leaving the machine. Whether
    // it arrived before the shot decided what the media dashboard looked like —
    // the poster box is `background: var(--ink)` under the image, so a pending
    // fetch photographs as a black block and a finished one as somebody's real
    // cover art. The baseline held the black block; a runner with a faster hop
    // to Open Library photographed the cover and disagreed with it.
    //
    // MediaCard sets `crossorigin="anonymous"` on the poster, so the fulfilled
    // response needs the allow-origin header or the browser rejects it, `onerror`
    // fires, and the card falls back to its striped placeholder — a third
    // rendering, no more stable than the two it replaces.
    await page.route("**/covers.openlibrary.org/**", async (route) => {
      await route.fulfill({
        contentType: "image/gif",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: transparentPixel,
      });
    });
  });

  async function setupApiKeys(page: import("@playwright/test").Page) {
    // The TMDB key lives on the Media screen's own gear (ADR-0080 §4), and it
    // is the only key left to give: the scraper proxy field was deleted rather
    // than moved, and USDA's corpus is bundled so food search has no key to be
    // given (ADR-0047 §1).
    await page.locator(".nav-item", { hasText: "Media" }).click();
    await page.locator("#media-settings-btn").click();
    const tmdbField = page.locator("#tmdb-api-key");
    await tmdbField.fill("test-tmdb-key");
    // The sheet has no Save button: the field persists the moment it is left.
    await tmdbField.blur();
    await page.locator(".bottom-sheet-content .close-btn").first().click();
    await expect(
      page.getByRole("heading", { name: "Media settings" })
    ).toBeHidden();
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
        // A bounded pixel budget for antialiasing that lands on different
        // sub-pixels run-to-run. It was sized for the calorie ring's rounded arc
        // cap (~2372 px of observed flake); the ring is gone, but the budget is
        // kept for the rest. Any real content/layout change on a full-page shot
        // dwarfs it, so structural regressions still fail.
        maxDiffPixels: 5000,
      });
    } finally {
      await styleHandle.evaluate((el) => (el as Element).remove());
    }
  }

  test("generates visual catalog screenshots of all dashboards", async ({
    page,
  }) => {
    // One test drives every dashboard end to end and screenshots each one, so
    // the default 30s budget is too tight — especially under the slower Pixel 5
    // emulation, where it expired mid-run on the Notes tab.
    test.slow();

    // Install deterministic clock
    await page.clock.install({ time: new Date("2026-06-05T08:30:00Z") });

    // 1. Initial Load & Setup
    await page.goto("/?mem=1");
    await waitForDbReady(page);

    // Verify all registered screens are covered by this visual catalog test
    const EXPECTED_SCREENS = [
      "food",
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
    await page.locator(".nav-item", { hasText: "Food" }).click();
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();
    await page.getByLabel("Amount in grams").fill("150");
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

/**
 * The surfaces a meal opens — the second half of the catalogue.
 *
 * These are sheets, not screens, so they are catalogued differently on two
 * counts. Each is its OWN test rather than another leg of the monolith above:
 * that one takes its captures with a plain `expect`, so it stops at the first
 * image that differs and leaves every later one unverified — which is exactly
 * how `settings-page` sat stale behind `food-dashboard`. Six more captures on
 * the same thread would deepen that hole; six tests fail independently, and
 * `fullyParallel` runs them at once.
 *
 * And each captures the SHEET rather than the page. A sheet is a fixed overlay:
 * `fullPage` would photograph the dashboard behind it and make every one of
 * these baselines hostage to a dashboard change, which is the coupling the
 * monolith already suffers from.
 */
test.describe("Visual Catalog — the surfaces a meal opens", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) =>
      console.log("PAGE UNCAUGHT ERROR:", err.message)
    );

    // A fixture of this describe's own, deliberately NOT the one above. These
    // surfaces need a food the dashboard catalogue never asks for: a
    // `foodCategory` on the allow-list so the NOVA badge reads an inferred
    // tier 1 (ADR-0041 §3), household portions so the amount panel shows its
    // preset chips (ADR-0030), and two micronutrients so the breakdown has
    // rows. Widening the shared fixture instead would move `food-dashboard.png`
    // for reasons that have nothing to do with the dashboard.
    await page.route("**/usda/search-index.json", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          artifact: "usda-search-index",
          schema_version: 2,
          generated_from: [],
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
              // On the NOVA-1 allow-list, and the name carries none of the
              // deny-substrings, so this food infers "Unprocessed" — the one
              // tier the app ever infers for itself.
              foodCategory: "Fruits and Fruit Juices",
              macros: {
                calories: 89,
                protein_content: 1.1,
                fat_content: 0.3,
                carbohydrate_content: 22.8,
              },
              portions: [
                { label: "1 medium", amount: 1, unit: "medium", grams: 118 },
                { label: "1 large", amount: 1, unit: "large", grams: 150 },
              ],
            },
          ],
        }),
      });
    });

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
          },
        }),
      });
    });
  });

  /** The food screen on a pinned day. The clock is fixed for the same reason the
   *  catalogue above fixes it, and for one more: the past-meal picker prints the
   *  day it is offering, so a live clock would restale that baseline nightly. */
  async function openFood(page: import("@playwright/test").Page) {
    await page.clock.install({ time: new Date("2026-06-05T08:30:00Z") });
    await page.goto("/?mem=1");
    await waitForDbReady(page);
  }

  /** Search breakfast for the one food the fixture serves, and stage it. */
  async function stageBanana(page: import("@playwright/test").Page) {
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();
    await expect(page.locator(".staged")).toBeVisible();
    // The Log button is held while the full panel is read out of the Nutrient
    // store, and a hint says so. Capture before it clears and the card is
    // photographed mid-read.
    await expect(page.getByTestId("completing-panel")).toHaveCount(0);
  }

  async function takeSheetScreenshot(
    page: import("@playwright/test").Page,
    sheet: import("@playwright/test").Locator,
    name: string
  ) {
    const styleHandle = await page.addStyleTag({
      content: `
        /* A sheet slides and fades in, so a capture can land mid-transition and
           flake run-to-run. Snap it to its end state. The dashboard catalogue
           freezes motion the same way and then flattens the app shell as well,
           which an element capture has no need of. */
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }
      `,
    });
    try {
      await expect(sheet).toHaveScreenshot(name);
    } finally {
      await styleHandle.evaluate((el) => (el as Element).remove());
    }
  }

  /** The sheet a way in opened. Unique while one is open; the explainers below
   *  are elevated OVER this one and are matched by their own class instead. */
  const sheet = (page: import("@playwright/test").Page) =>
    page.locator(".bottom-sheet-content").first();

  test("the search way in, holding its results", async ({ page }) => {
    await openFood(page);
    await page
      .getByRole("button", { name: "Search for a breakfast food" })
      .click();
    await page.locator("#food-search-input").fill("banana");
    await expect(
      page.locator(".result-item", { hasText: "Mock Banana" })
    ).toBeVisible();

    await takeSheetScreenshot(page, sheet(page), "food-way-in-search.png");
  });

  test("a staged food, with its tags and its amount panel", async ({
    page,
  }) => {
    await openFood(page);
    await stageBanana(page);

    // The two framed marks over the name, which the two explainers below open.
    await expect(page.getByTestId("source-tag")).toBeVisible();
    await expect(page.getByTestId("nova-badge")).toContainText("Unprocessed");

    await takeSheetScreenshot(page, sheet(page), "food-staged-food.png");
  });

  test("the quick-entry intent chooser", async ({ page }) => {
    await openFood(page);
    await page
      .getByRole("button", { name: "Enter a breakfast yourself" })
      .click();
    await expect(page.getByTestId("manual-intent-chooser")).toBeVisible();

    await takeSheetScreenshot(page, sheet(page), "food-quick-entry.png");
  });

  test("the past-meal picker", async ({ page }) => {
    await openFood(page);

    // Give the day before something to copy: a breakfast a week back.
    await page.getByRole("button", { name: "Previous Week" }).click();
    await stageBanana(page);
    await page.getByLabel("Amount in grams").fill("150");
    await page.locator("#log-food-btn").click();
    await page.getByRole("button", { name: "Today", exact: true }).click();

    await page.getByRole("button", { name: "Copy a past breakfast" }).click();
    await expect(page.getByTestId("past-meal-list")).toBeVisible();

    await takeSheetScreenshot(page, sheet(page), "food-past-meal.png");
  });

  test("the source explainer, opened from the source tag", async ({ page }) => {
    await openFood(page);
    await stageBanana(page);
    await page.getByTestId("source-tag").click();

    const explainer = page.locator(".bottom-sheet-content.source-explainer");
    await expect(explainer).toBeVisible();
    await takeSheetScreenshot(page, explainer, "food-source-explainer.png");
  });

  test("the NOVA explainer, opened from the badge", async ({ page }) => {
    await openFood(page);
    await stageBanana(page);
    await page.getByTestId("nova-badge").click();

    const explainer = page.locator(".bottom-sheet-content.nova-explainer");
    await expect(explainer).toBeVisible();
    await takeSheetScreenshot(page, explainer, "food-nova-explainer.png");
  });
});
