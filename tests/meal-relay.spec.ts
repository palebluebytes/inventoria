/// <reference types="node" />
import { test, expect, type Page } from "@playwright/test";

// **One meal, two browsers, one real room** (#298).
//
// Everything else in this arc tests one end of the wire against a fake of the
// other: `relay.test.ts` drives the Durable Object with fake sockets and a fake
// `DurableObjectState`, and `meal-send.test.ts` shuttles frames through an
// injected `dial`. Neither can reach `openRelaySocket`, the 101 upgrade, or
// `worker/src/index.ts`'s routing — Node's `Response` cannot even construct a
// 101 — so until this spec no meal had ever crossed a socket anywhere.
//
// What makes it possible is that `pnpm dev` now carries `/api/relay` to a real
// `wrangler dev` instead of 404ing it (`vite.config.ts`, `playwright.config.ts`).
// The relay is **proxied, never re-implemented**: a second room in the dev
// server would be the thing this proved, rather than the one that ships.
//
// **Every run is in a fresh room, by construction.** The sender's own
// `mintSendCode` draws the id from the CSPRNG when the way out is tapped, so
// each run of each project mints its own — which matters, because ADR-0072
// §11.1 holds at most two sockets per room and §11.2 burns the room after two
// frames, and `fullyParallel` with two workers would otherwise have a second
// run fail on a bound rather than on a defect.
//
// **No bound was moved to make this pass.** The room's five minutes (§11.4),
// the socket cap and the frame tally are the shipped numbers; a round trip is
// synchronous and finishes in a second or two.
//
// What it does not buy: an emulated handset is not a handset. The `Mobile
// Chrome` project is Pixel 5 emulation inside desktop Chromium, so this says
// nothing about iOS (#209, #287) or a physical Android phone. Nor does it reach
// `openRelaySocket`'s `wss:` arm, since a dev server is `http:` — what is
// covered is the swap happening at all, on the arm this origin has.

/** One food, so a meal has something in it and the arithmetic is the suite's. */
const MOCK_BANANA = {
  fdcId: 171705,
  description: "Mock Banana",
  dataType: "Foundation",
  macros: {
    calories: 89,
    protein_content: 1.1,
    fat_content: 0.3,
    carbohydrate_content: 22.8,
  },
};

/**
 * The bundled USDA corpus (ADR-0047), as a fixture, on **both** devices.
 *
 * The sender needs it to search for a food to log. The recipient needs it too,
 * and for a different reason: the accept path rebuilds an `fdc:` twin's
 * provenance from the Search index (ADR-0073 §3), so a recipient whose corpus
 * did not carry the food would be landing a meal by a different route than the
 * one this spec is about.
 */
async function serveUsdaCorpus(page: Page) {
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
        foods: [MOCK_BANANA],
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

async function waitForDbReady(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector(".db-badge")?.textContent?.includes("DB Ready") ===
      true,
    { timeout: 15_000 }
  );
}

/** Logs one Mock Banana into a meal on the day the week strip is showing. */
async function logMockBanana(page: Page, meal_type: string) {
  await page
    .getByRole("button", { name: `Search for a ${meal_type} food` })
    .click();
  await page.locator("#food-search-input").fill("banana");
  await page.locator(".result-item", { hasText: "Mock Banana" }).click();
  await page.getByLabel("Amount in grams").fill("100");
  await page.locator("#log-food-btn").click();
}

/** What `App.svelte` leaves on `window` for this suite to read the ledger. */
interface LedgerWindow {
  dbClient: { query: (sql: string) => Promise<Record<string, string>[]> };
}

/** One text column of a SELECT, through the client the app leaves on `window`. */
const ledgerColumn = (page: Page, sql: string, column: string) =>
  page.evaluate(
    ([query, key]) =>
      (window as unknown as LedgerWindow).dbClient
        .query(query)
        .then((rows) => rows.map((row) => row[key])),
    [sql, column]
  );

/**
 * Every device that has ever stamped a datom in this ledger.
 *
 * ADR-0073 §7 is a claim about this column and nothing else: a received meal
 * goes through the ordinary append path, which carries no stamp columns, so
 * **no foreign `device_id` can enter the ledger**. One distinct id is that
 * claim, read off the table it is made about.
 */
const stampingDevices = (page: Page) =>
  ledgerColumn(page, "SELECT DISTINCT device_id FROM datoms", "device_id");

/** The Consumption Events this ledger holds, by entity id (ADR-0073 §5). */
const consumptionEvents = (page: Page) =>
  ledgerColumn(
    page,
    "SELECT DISTINCT entity FROM datoms WHERE entity LIKE 'event:consume_%'",
    "entity"
  );

/** A written date (ADR-0074 §7) pulled out of a line that carries one. */
function dateWritten(text: string): string {
  const written = text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0];
  if (!written) throw new Error(`no date written in: ${text}`);
  return written;
}

/**
 * The options the two contexts are built with.
 *
 * `browser.newContext()` inherits nothing from the config, and every one of
 * these changes what is under test: without `baseURL` there is no app to go to,
 * without the pinned clock and locale the two devices write different date
 * strings, and without the project's device the `Mobile Chrome` run would be a
 * desktop browser wearing the project's name.
 */
function projectContextOptions() {
  const use = test.info().project.use;
  // Guarded here rather than asserted away at each read: the config sets it, and
  // a project that did not would give both devices a different app to open.
  if (!use.baseURL) throw new Error("the project sets no baseURL");
  return {
    baseURL: use.baseURL,
    locale: use.locale,
    timezoneId: use.timezoneId,
    viewport: use.viewport,
    userAgent: use.userAgent,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    deviceScaleFactor: use.deviceScaleFactor,
  };
}

test.describe("a meal crossing a real relay", () => {
  // Two app boots, two in-memory ledgers and a live handshake in one test. The
  // protocol's own numbers are untouched; this is only how long Playwright
  // waits before calling the run a failure.
  test.setTimeout(90_000);

  test("lands on the recipient's own day, clock and meal", async ({
    browser,
  }) => {
    const options = projectContextOptions();
    const senderContext = await browser.newContext(options);
    const recipientContext = await browser.newContext(options);

    try {
      // ── The sender, on a day that is not the recipient's ─────────────────
      //
      // A week back, deliberately. The meal carries the sender's day with it
      // and lands on the recipient's (ADR-0073 §5 and §7), and the only way to
      // tell those two rules apart is for the days to differ.
      const sender = await senderContext.newPage();
      await serveUsdaCorpus(sender);
      await sender.goto("/?mem=1");
      await waitForDbReady(sender);
      await sender.getByRole("button", { name: "Previous Week" }).click();
      await logMockBanana(sender, "breakfast");

      const senderPanel = sender.locator(
        '[data-testid="meal-nutrient-breakdown"]'
      );
      await sender.locator('[data-testid="meal-total-breakfast"]').click();
      await senderPanel.locator('[data-testid="meal-way-out"]').click();

      const mealSend = senderPanel.locator('[data-testid="meal-send"]');
      await expect(mealSend).toContainText("Waiting for them…");
      const link = await mealSend.locator("code.link").innerText();

      // ADR-0072 §9's one origin, read off the carrier itself: the link the
      // sender is holding out is on the app's own origin, which is what lets
      // the socket be built from `location.href` with no allowlist anywhere.
      expect(new URL(link).origin).toBe(new URL(options.baseURL).origin);

      // The day the sender filed the meal under, as the send face writes it.
      const sentDay = dateWritten(
        await mealSend.locator("p.kicker").innerText()
      );

      // ── The recipient, opening the link ──────────────────────────────────
      //
      // The fragment carries the whole code (ADR-0074 §8), and `?mem=1` is
      // this suite's own fresh in-memory ledger — a second device, not a
      // second tab on the first one's data.
      const recipient = await recipientContext.newPage();
      await serveUsdaCorpus(recipient);
      await recipient.goto(`/?mem=1${link.slice(link.indexOf("#"))}`);

      const offered = recipient.getByTestId("received-meal");
      await expect(offered).toBeVisible();
      await expect(offered).toContainText("Mock Banana", { timeout: 30_000 });
      await expect(offered).toContainText("89 kcal");

      // The sender learns the meal arrived, and learns nothing else:
      // ADR-0072 §7's delivery acknowledgement fires here, before anybody has
      // decided whether to keep it.
      await expect(mealSend).toContainText("They have it.");
      await expect(mealSend).toContainText(
        "What they do with it is theirs. Inventoria will not tell you."
      );

      // ADR-0073 §7 both ways at once. The meal shows the day the SENDER filed
      // it under, and it is about to go in the day the recipient's own food
      // screen is showing, which is a different one.
      await expect(offered).toContainText(sentDay);
      const goesIn = await offered
        .getByText(/It goes in \d{2}\/\d{2}\/\d{4}/)
        .innerText();
      expect(dateWritten(goesIn)).not.toBe(sentDay);

      // ── Keeping it ───────────────────────────────────────────────────────
      await offered.getByTestId("received-meal-keep").click();
      await expect(offered).toContainText("1 food added to your breakfast.");
      await expect(offered).toContainText(
        "It is yours now, on your own clock and in your own day."
      );

      // Leaving the surface is the whole of being done with it, and what is
      // underneath is the recipient's own day with the meal in it.
      await offered.getByRole("button", { name: "Done" }).click();
      await expect(offered).toHaveCount(0);
      const breakfast = recipient.locator(".meal-section", {
        hasText: "BREAKFAST",
      });
      await expect(breakfast).toContainText("Mock Banana");
      await expect(breakfast).toContainText("100g");

      // …on the recipient's own clock: one stamping device in their ledger,
      // and it is not the sender's.
      const senderDevices = await stampingDevices(sender);
      const recipientDevices = await stampingDevices(recipient);
      expect(senderDevices).toHaveLength(1);
      expect(recipientDevices).toHaveLength(1);
      expect(recipientDevices[0]).not.toBe(senderDevices[0]);

      // …and re-minted rather than carried across (ADR-0073 §5): the event in
      // the recipient's ledger is one event, and it is not the sender's.
      const senderEvents = await consumptionEvents(sender);
      const recipientEvents = await consumptionEvents(recipient);
      expect(senderEvents).toHaveLength(1);
      expect(recipientEvents).toHaveLength(1);
      expect(recipientEvents[0]).not.toBe(senderEvents[0]);
    } finally {
      await senderContext.close();
      await recipientContext.close();
    }
  });
});
