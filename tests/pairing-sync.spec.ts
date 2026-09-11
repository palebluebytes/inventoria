/// <reference types="node" />
import { test, expect, type Page } from "@playwright/test";

// **Two devices, one real room, and one ledger afterwards** (#395).
//
// The unit suites put two real sqlite ledgers either side of the real Durable
// Object through an injected `dial` (`first-sync.test.ts`), which is most of
// the protocol but none of the app: not `openRelaySocket`, not the 101 upgrade,
// not the worker RPC the version vector and every chunk actually travel over,
// and not the Settings section that starts the act and writes the record. This
// is the ticket's last acceptance criterion — *two browser profiles pair and
// the second holds the first's ledger* — and it is the only place that sentence
// is true end to end.
//
// It is `meal-relay.spec.ts`'s shape, and for its reasons: two contexts are two
// devices rather than two tabs on one ledger, `?mem=1` gives each its own fresh
// in-memory database, and the relay under it is the one that ships rather than
// a second room stood up in the dev server.
//
// **Every run mints its own room**, because `mintRoomCode` draws from the
// CSPRNG when "Show a code" is tapped. ADR-0072 §11.1 holds at most two sockets
// per room, so a shared id would make a parallel run fail on a bound rather
// than on a defect.
//
// **The paste carrier is the one under test, deliberately.** ADR-0096 §8 gives
// the code two carriers and says capability decides only what is *offered*; a
// headless browser has no camera and no `BarcodeDetector`, so the QR half is
// `code-camera.test.ts`'s and the half a person can always reach is this one.
//
// What it does not buy: an emulated handset is not a handset, and a dev server
// is `http:`, so `openRelaySocket`'s `wss:` arm is still uncovered.

async function waitForDbReady(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector(".db-badge")?.textContent?.includes("DB Ready") ===
      true,
    { timeout: 15_000 }
  );
}

/**
 * The options the two contexts are built with.
 *
 * `browser.newContext()` inherits nothing from the config, so the project's own
 * device and clock are passed through by hand — without them the `Mobile
 * Chrome` run would be a desktop browser wearing the project's name.
 */
function projectContextOptions() {
  const use = test.info().project.use;
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

/** Opens the root Facet's Settings, where pairing lives (ADR-0084 §6). */
async function openSettings(page: Page) {
  await page.locator(".nav-item", { hasText: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Paired devices" })
  ).toBeVisible();
}

/**
 * Writes one habit, which is the fact this test watches cross.
 *
 * A habit rather than a meal: pairing carries the **whole jar** rather than one
 * Facet's rows (ADR-0075 §7), so the thing that crosses should be something
 * Rations does not own, and a habit is three datoms rather than a food's
 * closure.
 */
async function addHabit(page: Page, name: string) {
  await page.locator(".nav-item", { hasText: "Agenda" }).click();
  await page
    .locator("section:has-text('HABITS')")
    .locator("button", { hasText: "+ ADD HABIT" })
    .click();
  await page.locator("#habit-name-input").fill(name);
  await page.locator(".category-chip", { hasText: "MIND" }).click();
  await page.locator(".segment-btn", { hasText: "DAILY" }).click();
  await page.locator("button", { hasText: "SAVE BLUEPRINT" }).click();
  await expect(page.locator(".habit-item", { hasText: name })).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("a first sync across two devices", () => {
  // Two app boots, two ledgers, a live handshake and a whole transfer. The
  // protocol's own numbers are untouched; this is only how long Playwright
  // waits before calling the run a failure.
  test.setTimeout(90_000);

  test("pairs, and the second device holds the first's ledger", async ({
    browser,
  }) => {
    const options = projectContextOptions();
    const firstContext = await browser.newContext(options);
    const secondContext = await browser.newContext(options);

    try {
      // ── The first device, holding a fact the second has never seen ───────
      const first = await firstContext.newPage();
      await first.goto("/?mem=1");
      await waitForDbReady(first);

      const habit = `Meditate_${Date.now()}`;
      await addHabit(first, habit);

      // ── It shows a code ──────────────────────────────────────────────────
      await openSettings(first);
      await expect(first.getByText("No devices are paired.")).toBeVisible();
      await first.locator("#pair-show-btn").click();

      const shown = first.getByTestId("pairing-code");
      await expect(shown).toBeVisible();
      const code = await shown.locator("code.written").innerText();

      // ADR-0096 §8: the code is a labelled token that must not parse as a URL,
      // read off the carrier the other device is about to be handed.
      expect(code.startsWith("inventoria-pair ")).toBe(true);
      expect(() => new URL(code)).toThrow();

      // ── The second device, empty, reads it ───────────────────────────────
      const second = await secondContext.newPage();
      await second.goto("/?mem=1");
      await waitForDbReady(second);

      // Its ledger really is empty of this fact before the act.
      await second.locator(".nav-item", { hasText: "Agenda" }).click();
      await expect(
        second.locator(".habit-item", { hasText: habit })
      ).toHaveCount(0);

      await openSettings(second);
      await second.locator("#pair-read-btn").click();
      const reader = second.getByTestId("pairing-reader");
      await expect(reader).toBeVisible();
      await reader.locator("input").fill(code);
      await reader.locator("button", { hasText: "Use this code" }).click();

      // ── Both sides land on the paired ending ─────────────────────────────
      //
      // "Paired" is said once in the whole app and only from the far side of a
      // first sync (`pairing-words.ts`), so this line is the guard-1 assertion:
      // it cannot be reached by a pairing that did not converge.
      await expect(
        second.getByText("These two devices are paired.")
      ).toBeVisible({ timeout: 60_000 });
      await expect(
        first.getByText("These two devices are paired.")
      ).toBeVisible({ timeout: 60_000 });

      // ── The ledger crossed ───────────────────────────────────────────────
      await second.locator(".nav-item", { hasText: "Agenda" }).click();
      await expect(
        second.locator(".habit-item", { hasText: habit })
      ).toBeVisible({ timeout: 30_000 });

      // ── And a row exists on both, which is what completing writes ────────
      //
      // "Done" is what closes the ending and puts the list back up; the section
      // expands in place, so there is no second surface to go to.
      for (const device of [first, second]) {
        // The card is mounted under every tab and merely hidden, so the second
        // device has to come back to Settings before its ending is reachable.
        await openSettings(device);
        await device.locator("button", { hasText: "Done" }).click();
        await expect(device.getByText("No devices are paired.")).toHaveCount(0);
        await expect(
          device.locator("button", { hasText: "Unpair" })
        ).toBeVisible();
      }
    } finally {
      await firstContext.close();
      await secondContext.close();
    }
  });

  test("an abandoned attempt leaves no row on either side", async ({
    browser,
  }) => {
    // Guard 1's other half: *an incomplete pairing deposits nothing and
    // collects nothing* (ADR-0096 §2). A code shown and then stopped never
    // reached a first sync, so there is nothing on either side to clean up.
    const options = projectContextOptions();
    const context = await browser.newContext(options);

    try {
      const page = await context.newPage();
      await page.goto("/?mem=1");
      await waitForDbReady(page);
      await openSettings(page);

      await page.locator("#pair-show-btn").click();
      await expect(page.getByTestId("pairing-code")).toBeVisible();
      await page.locator("button", { hasText: "Stop" }).click();

      await expect(page.getByText("No devices are paired.")).toBeVisible();
      // Nothing was written down, so nothing survives a reload either.
      await page.reload();
      await waitForDbReady(page);
      await openSettings(page);
      await expect(page.getByText("No devices are paired.")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
