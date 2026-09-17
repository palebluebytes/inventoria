/// <reference types="node" />
import { test, expect } from "@playwright/test";
import { PAGES, iconIdOf, pageLabel } from "../src/lib/food/pages";
import { hasPagesAt, openRationsDay } from "./support/rations";
import { openWayIn } from "./support/ways-in";

/** Shared by the two catalogues that photograph the **root** Facet: nothing is
 *  worth capturing until the ledger has answered, and every screen there reads
 *  from it. Rations' own catalogue at the bottom of this file reads readiness
 *  off the day instead, because this badge is in a sidebar it does not have. */
async function waitForDbReady(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );
}

/**
 * The bundled USDA corpus (ADR-0047), served as a fixture.
 *
 * Food search reads the committed Search index and staging reads the Nutrient
 * store, so these two routes pin the one food a catalogue logs. There is no API
 * to intercept and no key to enter.
 *
 * Shared by the dashboard catalogue and by Rations' (#348), which photograph
 * the same screen in two shells and must therefore log the same breakfast. The
 * meal catalogue below keeps a fixture of its own on purpose, and says why: it
 * needs a food this one deliberately does not carry.
 */
async function routeUsdaCorpus(page: import("@playwright/test").Page) {
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
        state_qualifiers: [],
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
}

/**
 * Motion, frozen. A capture can otherwise land mid-transition and flake run to
 * run — the calorie ring animated its `stroke-dashoffset` from async DB data,
 * which is what this was written for. The ring is gone; everything else on these
 * screens that moves is still snapped to its end state.
 */
const NO_MOTION = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
`;

/**
 * The root Facet's shell, flattened for a full-page capture: the app box, the
 * scroll container inside it, and the Sidebar that is pinned beside them.
 */
const ROOT_SHELL_FLAT = `
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
  /* The day's Way-in bar is position:fixed below 768 (ADR-0101 S3), and a
     fixed box in a full-page capture is rendered once at the viewport's top
     whatever the page's height — so left pinned it would be photographed lying
     across the meters rather than at the foot of the screen. Un-pinned it falls
     into the slot it already occupies above 768, at the head of the day, which
     is a stable place and a true one. The same device as .sidebar above and
     .add-habit-sheet below, for the same reason. (No backticks -- template
     literal.) */
  .way-in-bar {
    position: static !important;
  }
  /* Un-pin the sheet so a full-page capture contains all of it: a
     position:fixed box is rendered once, at the top of the image,
     whatever the page's height. (No backticks in this block -- it is a
     template literal.)

     #333 asked for "height: auto !important" to come out of here, on the
     grounds that it insulates this shot from the height model ADR-0089 S5
     changed. The line was in fact INERT and is gone as dead CSS:
     .add-habit-sheet is a plain sheet, and .bottom-sheet-content declares
     no height at all -- only .flush / .fill do. What actually insulates
     the shot is position:absolute and max-height:none, and those are
     exactly what a full-page capture of the whole screen needs. The two
     requirements genuinely conflict, so this shot is not the witness: the
     twelve element screenshots of .bottom-sheet-content below are, and
     tests/keyboard-invariants.spec.ts carries the geometry the pixels
     cannot. */
  .add-habit-sheet {
    position: absolute !important;
    max-height: none !important;
    min-height: 100% !important;
    overflow-y: visible !important;
  }
  .add-habit-sheet .bottom-sheet-body {
    overflow-y: visible !important;
  }
`;

/**
 * Rations' shell, flattened the same way (#348).
 *
 * Its own selectors rather than the root's: there is no `.sidebar` here and the
 * outer box is `.rations` (ADR-0078 §1), so reusing the block above would be two
 * dead rules and one missing one. `.main` is the same shared rule in both
 * (ADR-0091 §2), and is the scroll box `tests/unit/shell.test.ts` holds it as.
 */
const RATIONS_SHELL_FLAT = `
  /* The shell is one viewport tall with the scroll inside it, which a full-page
     capture would otherwise photograph as one screenful. Both boxes give that up
     for the shot. */
  .rations {
    height: auto !important;
    min-height: 100svh !important;
  }
  .main {
    overflow-y: visible !important;
    height: auto !important;
  }
  /* The day's Way-in bar is position:fixed below 768 (ADR-0101 S3), and a
     fixed box in a full-page capture is rendered once at the viewport's top
     whatever the page's height — so left pinned it would be photographed lying
     across the meters rather than at the foot of the screen. Un-pinned it falls
     into the slot it already occupies above 768, at the head of the day, which
     is a stable place and a true one. The same device as .main above, for the
     same reason. (No backticks -- template literal.) */
  .way-in-bar {
    position: static !important;
  }
`;

/**
 * A full-page capture of a whole shell.
 *
 * `flatten` is the only thing the two Facets' catalogues do differently, and it
 * is a parameter rather than a second copy of this function (#348): the freeze
 * above it, the capture itself and taking the style tag away afterwards are the
 * same for both shells and were written twice before.
 *
 * **It passes no comparison options, and that is the rule rather than this
 * helper's habit (#405).** Everything a capture is allowed to tolerate is
 * declared once in `playwright.config.ts` — `threshold: 0.05`, a timeout, and
 * two knobs refused in writing — so the sheet helper below, and a third helper
 * written next month, compare at the same tolerance without anyone remembering
 * to pass it. ADR-0099 §2 is the rule and §3 derives the number;
 * `tests/unit/screenshot-tolerance.test.ts` holds the bracket by asking the
 * installed comparator what the palette does at whatever the config declares.
 *
 * **What was here was `maxDiffPixels: 5000`, and it is gone (ADR-0099 §4).** It
 * had been sized against the calorie ring's rounded arc cap (~2372 px of
 * observed flake, `837c141`); the ring went, and "kept for the rest" was never
 * measured. Three things condemned it independently, and they are the reasons a
 * count must not come back here:
 *
 * - It was not one budget. 5000 px is 0.089% of `rations-settings-page`
 *   (1280x4376) and 2.93% of `food-past-meal` desktop (600x284) — a 33x spread
 *   across the 31 baselines, so it was 31 claims wearing one number. A budget
 *   that returns has to be a `maxDiffPixelRatio`, which means one thing on all
 *   of them, and it has to arrive with the measurement that sized it.
 * - The antialiasing job it named belongs to a mechanism already on.
 *   `pixelmatch.js:29` sets `includeAA: false` and Playwright never overrides
 *   it, so an over-threshold pixel is re-tested by the AA detector and dropped
 *   if either image reads as an edge. This repo cannot turn that off or tune it.
 * - A budget cannot hide a resize. `comparators.js:69-72` errors on unequal
 *   dimensions before any budget is read, so only a same-size, in-box change
 *   could ever have been absorbed.
 */
async function takeFullPageScreenshot(
  page: import("@playwright/test").Page,
  name: string,
  flatten: string,
  stillShowing?: import("@playwright/test").Locator
) {
  const styleHandle = await page.addStyleTag({
    content: `${NO_MOTION}\n${flatten}`,
  });
  try {
    await expect(page).toHaveScreenshot(name, { fullPage: true });
    // **`stillShowing` is asserted after the shot, and only after it (#409).**
    // A capture is the one assertion in this file that cannot say what it
    // photographed, and `rations-reports-page` spent three weeks holding the
    // Rations day screen because of it: the test asserted the Reports heading
    // was visible, and it was — before the picture was taken. What came
    // between was `Page.captureScreenshot` with `captureBeyondViewport`, which
    // Chromium answers by resizing the widget, and Rations unmounts a page
    // below the shell breakpoint. `breakpoints.ts` no longer acts on a width
    // that lasts one frame, so the flip cannot happen; this is what would have
    // caught it, and what catches the next surface whose mount is decided by a
    // measurement rather than by a class.
    //
    // A caller passes it when the shot has a subject that can stop being on
    // screen. The root shell's captures do not — nothing there is mounted on a
    // width — so the parameter is optional rather than a locator six callers
    // would have to invent.
    if (stillShowing) await expect(stillShowing).toBeVisible();
  } finally {
    await styleHandle.evaluate((el) => (el as Element).remove());
  }
}

/**
 * The storage figures, pinned to numbers this file chose (#405).
 *
 * `playwright.config.ts` already pins `timezoneId` and `locale` for a stated
 * reason — "the same ledger renders different strings on each machine, so the
 * visual baselines would never agree". The browser's storage quota is a third
 * host setting nobody pinned, and `SettingsView`'s Storage section reads it
 * straight out of `navigator.storage.estimate()` into a sentence: "This site is
 * using about X of the roughly Y this browser allows it."
 *
 * Chromium sizes that quota from the runner's free disk, so it is different on
 * every run: four readings across #405's two rebaseline dispatches gave 1.0 GB,
 * 960 MB, 963 MB and 997 MB. And it does not stay in the sentence. On the
 * desktop shot the changed pixels run from the sentence at y 527 all the way to
 * y 2024, where the red "Clear" button's fill ends eight pixels lower than it
 * did. Both `settings-page` baselines were a photograph of the runner rather
 * than of the screen, and at `threshold` 0.2 that was absorbed intermittently —
 * which is worse than failing, because it froze whichever reading the last
 * rebaseline happened to catch.
 *
 * Pinned rather than masked, because a mask hides the sentence and not the
 * reflow under it, and because the screen's job here is to show that section
 * drawn with real figures in it. 4.6 MB of 1.0 GB is a plausible jar on a
 * desktop browser and exercises the branch that names both numbers.
 */
const STORAGE_ESTIMATE = { usage: 4_600_000, quota: 1_000_000_000 };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((estimate) => {
    // Assigned over the prototype's method rather than replacing
    // `navigator.storage`, which is a read-only accessor. `persist()` and the
    // rest of the manager stay the browser's.
    if (navigator.storage) navigator.storage.estimate = async () => estimate;
  }, STORAGE_ESTIMATE);
});

test.describe("Visual Catalog Generator", () => {
  test.beforeEach(async ({ page }) => {
    // Capture page console logs for debugging
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", (err) =>
      console.log("PAGE UNCAUGHT ERROR:", err.message)
    );

    await routeUsdaCorpus(page);

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

  /**
   * The boot each of the seven tests below takes.
   *
   * At ~1.1 s it is the entire price of one capture per test, and the capture
   * itself costs the same either way. ADR-0099 §1 carries #368's measurements
   * and why the suite comes out faster rather than slower.
   */
  async function boot(page: import("@playwright/test").Page) {
    await page.clock.install({ time: new Date("2026-06-05T08:30:00Z") });
    await page.goto("/?mem=1");
    await waitForDbReady(page);
  }

  /**
   * One event on the seeded day.
   *
   * It was a closure inside the monolith over that test's `page`; only the
   * agenda test seeds a schedule now, so it takes `page` as a parameter and
   * sits beside the other seeding helpers rather than inside its one caller.
   */
  async function addCalendarEvent(
    page: import("@playwright/test").Page,
    payload: {
      title: string;
      timed?: boolean;
      startTime?: string;
      endTime?: string;
      tracking?: boolean;
      subTargets?: string[];
    }
  ) {
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
      if (payload.subTargets) {
        // The first Sub-Target goes in the START input; the rest each
        // need a row of their own.
        await page
          .locator(".field-card:has-text('START')")
          .locator("input.time-input")
          .fill(payload.subTargets[0]);
        for (let i = 1; i < payload.subTargets.length; i++) {
          await page.locator("button:has-text('+ ADD ANOTHER TIME')").click();
          await page
            .locator(".slot-row")
            .nth(i - 1)
            .locator("input.time-input")
            .fill(payload.subTargets[i]);
        }
      }
    }

    if (payload.tracking !== undefined) {
      const isChecked = await page
        .locator(".field-card:has-text('REQUIRES CONFIRMATION') .toggle-tick")
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

  /**
   * The roster guard, which photographs nothing.
   *
   * It was the monolith's opening assertion, where it read "all registered
   * screens are covered by this visual catalog test". There is no longer a
   * single test that covers them, so it is the *describe* it speaks for, and
   * putting it back on top of one of the seven would mean a roster failure
   * masking that screen's capture — the coupling the split exists to remove.
   */
  test("the sidebar offers exactly the screens this catalogue photographs", async ({
    page,
  }) => {
    await boot(page);

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
  });

  test("the food dashboard, holding a logged breakfast", async ({ page }) => {
    test.slow();
    await boot(page);

    // Log a breakfast item via the direct sheet.
    await page.locator(".nav-item", { hasText: "Food" }).click();
    await openWayIn(page, "breakfast", "search");
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();
    await page.getByLabel("Amount in grams").fill("150");
    await page.locator("#log-food-btn").click();

    await takeFullPageScreenshot(page, "food-dashboard.png", ROOT_SHELL_FLAT);
  });

  /** The add-habit sheet mid-entry, which is the one capture here that is not a
   *  dashboard: the monolith took it partway through creating its first habit,
   *  and this test stops at that point rather than submitting. */
  test("the add-habit sheet, part-filled", async ({ page }) => {
    test.slow();
    await boot(page);
    await page.locator(".nav-item", { hasText: "Agenda" }).click();

    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Read Philosophy");
    await page.locator(".category-chip", { hasText: "MIND" }).click();
    await page.locator(".segment-btn", { hasText: "DAILY" }).click();

    await takeFullPageScreenshot(page, "add-habit-screen.png", ROOT_SHELL_FLAT);
  });

  test("the agenda dashboard, holding every habit shape and a seeded day", async ({
    page,
  }) => {
    test.slow();
    await boot(page);

    // Add blueprints & log executions.
    await page.locator(".nav-item", { hasText: "Agenda" }).click();

    // General Daily - Logged (Read Philosophy)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Read Philosophy");
    await page.locator(".category-chip", { hasText: "MIND" }).click();
    await page.locator(".segment-btn", { hasText: "DAILY" }).click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // General Daily - Unlogged (Morning Meditation)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Morning Meditation");
    await page.locator(".category-chip", { hasText: "MIND" }).click();
    await page.locator(".segment-btn", { hasText: "DAILY" }).click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // Daily with Multiple Reps - Logged 1/3 (Pushups Daily)
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

    // Daily with Specific Subtargets (Hydration Routine)
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

    // Weekly Days - Active (Gym Workout)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Gym Workout");
    await page.locator(".category-chip", { hasText: "FITNESS" }).click();
    await page.locator(".segment-btn", { hasText: "SPECIFIC DAYS" }).click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // Weekly Days - OFF Today (Weekend Hike)
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

    // Weekly Flexible - Logged 1/3 (Read 20 Pages)
    await page
      .locator("section:has-text('HABITS')")
      .locator("button", { hasText: "+ ADD HABIT" })
      .click();
    await page.locator("#habit-name-input").fill("Read 20 Pages");
    await page.locator(".category-chip", { hasText: "PRODUCTIVITY" }).click();
    await page.locator(".segment-btn", { hasText: "FLEXIBLE" }).click();
    await page.locator(".btn-submit-brutal").click();
    await expect(page.locator(".add-habit-sheet")).not.toBeVisible();

    // Add overlapping events, block durations, untimed events
    await addCalendarEvent(page, {
      title: "Take Medication",
      timed: true,
      tracking: true,
      subTargets: ["08:00", "20:00"],
    });
    await addCalendarEvent(page, {
      title: "Deep Work Session",
      timed: true,
      startTime: "09:00",
      endTime: "12:00",
      tracking: false,
    });
    await addCalendarEvent(page, {
      title: "Team Standup",
      timed: true,
      startTime: "09:30",
      endTime: "10:00",
      tracking: false,
    });
    await addCalendarEvent(page, {
      title: "Coffee Break",
      timed: true,
      startTime: "10:15",
      tracking: true,
    });
    await addCalendarEvent(page, {
      title: "Project Sync",
      timed: true,
      startTime: "11:00",
      endTime: "12:30",
      tracking: false,
    });
    await addCalendarEvent(page, {
      title: "Read Book",
      timed: false,
      tracking: true,
    });

    // Execute Quick Logs to show progress states
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

    await takeFullPageScreenshot(page, "agenda-dashboard.png", ROOT_SHELL_FLAT);
  });

  /** The one screen that wants `setupApiKeys`: without the TMDB key the search
   *  the seed runs has nothing to send. */
  test("the media dashboard, holding a started film and a saved book", async ({
    page,
  }) => {
    test.slow();
    await boot(page);
    await setupApiKeys(page);
    // `setupApiKeys` happens to leave the app on Media, because that is where
    // the gear holding the TMDB key lives. Say it rather than inherit it: this
    // test photographs Media whatever that helper does next.
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

    await takeFullPageScreenshot(page, "media-dashboard.png", ROOT_SHELL_FLAT);
  });

  test("the items dashboard, holding a hand-made twin and a scraped one", async ({
    page,
  }) => {
    test.slow();
    await boot(page);

    // Add a Wanted item by hand.
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

    await takeFullPageScreenshot(page, "items-dashboard.png", ROOT_SHELL_FLAT);
  });

  test("the notes dashboard, holding a checklist item and a note", async ({
    page,
  }) => {
    test.slow();
    await boot(page);

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

    await takeFullPageScreenshot(page, "notes-dashboard.png", ROOT_SHELL_FLAT);
  });

  /** The one screen that wants `resetDatabase`: it leaves `#dev-mode-toggle`
   *  checked, which is what reveals the OPFS Survival Test block this baseline
   *  has. The reset itself lands on Settings, and the click below is the
   *  monolith's, kept so the test says where it is photographing. */
  test("the settings page, with developer mode revealed", async ({ page }) => {
    test.slow();
    await boot(page);
    await resetDatabase(page);

    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await takeFullPageScreenshot(page, "settings-page.png", ROOT_SHELL_FLAT);
  });
});

/**
 * The surfaces a meal opens — the second half of the catalogue.
 *
 * These are sheets, not screens, so they are catalogued differently on two
 * counts. Each is its OWN test, which is now the rule every capture in this
 * repository is held to (ADR-0099 §1) and was first written down here: a
 * capture behind a failed one is neither passed nor failed, it is unreported,
 * which is how `settings-page` sat stale behind `food-dashboard`. Six tests
 * fail independently, and `fullyParallel` runs them at once.
 *
 * And each captures the SHEET rather than the page. A sheet is a fixed overlay:
 * `fullPage` would photograph the dashboard behind it and make every one of
 * these baselines hostage to a dashboard change — a coupling the dashboard
 * captures above accept because the dashboard is what they are about, and these
 * have no reason to.
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
          state_qualifiers: [],
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
    await openWayIn(page, "breakfast", "search");
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();
    await expect(page.locator(".staged")).toBeVisible();
    // The Log button is held while the full panel is read out of the Nutrient
    // store, and a hint says so. Capture before it clears and the card is
    // photographed mid-read.
    await expect(page.getByTestId("completing-panel")).toHaveCount(0);
  }

  /**
   * A sheet, photographed as an element.
   *
   * **The first column of the image is not the sheet** (#366). The ink border
   * starts at column 1 — mirrored on the right by columns 391 and 392 — so the
   * clip carries one pixel of *backdrop* on the left and none on the right.
   * Over most of its height that column reads `srgb(150)`, which is
   * `--bg-base` (`#fafafa`) through one `rgba(0, 0, 0, 0.4)` overlay:
   * 0.6 x 250. The rest of it is the page's own bottom nav, in ink, behind.
   *
   * So a sheet capture asserts something about the page behind the sheet as
   * well as about the sheet, and a change to the backdrop moves the baseline
   * with the surface under test standing still. That is what `bb65c52`
   * accepted: `867c14a` (#330, ADR-0089 §7) took a replaced sheet **and its
   * backdrop** off the screen on a phone, so the two explainers went from being
   * photographed through two dims to one. Columns 1-392 are byte-identical
   * across that commit — the sheet's box never moved, which is what the
   * rebaseline and #339 both read it as. The measurement is on #366; the rule
   * §7 changed is guarded in `tests/unit/sheet-geometry.test.ts`.
   *
   * **It passes no comparison options, and now nothing else does either**
   * (#405). That was already true here and it used to mean something weaker
   * than it looked: `threshold` defaulted to 0.2 (`comparators.js:83`) and
   * nothing in this repo set it, so a sheet capture tolerated a per-pixel
   * colour drift wide enough to pass `--highlight-bg` becoming `--paper`. Both
   * tolerances now live in `playwright.config.ts` — the count budget the
   * full-page helper carried was deleted rather than copied here — so the
   * absence below is the project's rule showing through rather than this
   * helper's silence.
   */
  async function takeSheetScreenshot(
    page: import("@playwright/test").Page,
    sheet: import("@playwright/test").Locator,
    name: string
  ) {
    // A sheet slides and fades in, so a capture can land mid-transition and
    // flake run-to-run. The same freeze the full-page shots take, and nothing
    // else: an element capture has no shell to flatten.
    const styleHandle = await page.addStyleTag({ content: NO_MOTION });
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
    await openWayIn(page, "breakfast", "search");
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
    await openWayIn(page, "breakfast", "custom");
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

    await openWayIn(page, "breakfast", "past");
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

/**
 * Rations' own shell — the third catalogue, and the first picture of it.
 *
 * The two above navigate to `/?mem=1`, which is the **root** Facet: all 26 of
 * their baselines show the food screen inside the root's shell, with a Sidebar
 * taking ~200px of the 1280px viewport. Rations renders the same screen at
 * `/food/` into a shell with no sidebar, the full measure, and two regions above
 * the shell breakpoint (ADR-0091 §2, §3). Two Facets, two shells, one set of
 * pictures — and only one of the shells was in it (#348).
 *
 * It is a `describe` of its own, and one test per capture inside it, for the
 * reason the sheet catalogue gives and ADR-0099 §1 states. It is also a
 * different Facet at a different URL, so sharing a run would mean navigating
 * out of the app being photographed.
 *
 * The fixture is the dashboard catalogue's, deliberately: one food, no
 * portions, no micronutrients. What is being photographed here is the shell, and
 * a richer food would make these baselines move for reasons that are about a
 * meal rather than about a shell.
 */
test.describe("Visual Catalog — Rations' own shell", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) =>
      console.log("PAGE UNCAUGHT ERROR:", err.message)
    );

    await routeUsdaCorpus(page);
  });

  /**
   * The app at `/food/`, on a pinned day.
   *
   * The clock is fixed for the catalogue's usual reason and for one more that is
   * this shell's alone: above the shell breakpoint the rail leads with a month
   * calendar (ADR-0091 §2), which prints a month name, a grid of day numbers and
   * a mark on today — so a live clock would restale every baseline here nightly
   * and redraw the whole grid at each month boundary.
   *
   * `openRationsDay` is the goto and the readiness wait, shared with the sweep
   * in `layout-invariants.spec.ts` because both are asking the same question of
   * the same shell and the answer carries an argument (`support/rations.ts`).
   */
  async function openRations(page: import("@playwright/test").Page) {
    await page.clock.install({ time: new Date("2026-06-05T08:30:00Z") });
    await openRationsDay(page);
  }

  /** One breakfast, so the timeline, the rail's numbers and a report all have
   *  something to be about. The same food and the same amount the root's
   *  `food-dashboard` shot logs, so the two shells are photographed holding the
   *  same day. */
  async function logBreakfast(page: import("@playwright/test").Page) {
    await openWayIn(page, "breakfast", "search");
    await page.locator("#food-search-input").fill("banana");
    await page.locator(".result-item", { hasText: "Mock Banana" }).click();
    await page.getByLabel("Amount in grams").fill("150");
    await page.locator("#log-food-btn").click();
    await expect(page.locator(".bottom-sheet-content")).toHaveCount(0);
  }

  test("the day, in the shell Rations actually ships", async ({ page }) => {
    // Both projects collect this one, and the two pictures are the point: at
    // 1280 it is the two-region shell — timeline left, month calendar and the
    // day's numbers in the rail — and on the Pixel 5 it is the single column
    // with the week strip, which is the same set of parts arranged differently
    // (ADR-0091 §1).
    await openRations(page);
    await logBreakfast(page);
    await takeFullPageScreenshot(page, "rations-day.png", RATIONS_SHELL_FLAT);
  });

  test.describe("the pages, which exist above the shell breakpoint", () => {
    test.beforeEach(({ viewport }) => {
      // Not `isMobile`: what decides whether a page exists is the width and
      // nothing else (ADR-0091 §5), and the number is the roster's, which the
      // stylesheet and `matchMedia` both read. Below it these controls open
      // sheets, which the catalogue above already photographs at the root.
      test.skip(
        !hasPagesAt(viewport),
        "A page exists only above the shell breakpoint (ADR-0091 §5)."
      );
    });

    // One test per page, drawn from the roster rather than three tests written
    // out: a fourth page is then photographed by the same rule that puts its
    // control in the header, and cannot be added with no picture of it. They
    // stay separate tests for the sheet catalogue's reason — one `expect` per
    // image, so a differing shot does not leave the ones behind it unverified.
    for (const p of PAGES) {
      test(`${pageLabel(p)}, whole`, async ({ page }) => {
        await openRations(page);
        // Only the report reads the ledger, and an empty one photographs its
        // own empty state rather than the three readings the page is
        // (ADR-0091 §6). The other two look the same either way, and paying for
        // a breakfast on all three would be two minutes of nothing.
        if (p === "reports") await logBreakfast(page);

        await page.locator(`#${iconIdOf(p)}`).click();
        const heading = page.getByRole("heading", { name: pageLabel(p) });
        await expect(heading).toBeVisible();
        // Passed as the subject so it is asserted on the far side of the
        // capture as well: all three of these are mounted on a width, and a
        // page that vanished during the shot is what #409 was.
        await takeFullPageScreenshot(
          page,
          `rations-${p}-page.png`,
          RATIONS_SHELL_FLAT,
          heading
        );
      });
    }
  });
});
