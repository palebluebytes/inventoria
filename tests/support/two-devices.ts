/**
 * Two browser profiles as two devices, and the act that pairs them.
 *
 * Shared by the two specs that need a real pairing before they can test
 * anything — `pairing-sync.spec.ts` (#395: they converge live) and
 * `sleeping-peer.spec.ts` (#396: they converge with one of them shut). The
 * pairing act is the same in both and is a dozen interactions long, so it lives
 * here rather than in whichever file wrote it first.
 *
 * Two contexts are **two devices rather than two tabs on one ledger**: each has
 * its own storage, so each has its own OPFS database, its own `device_id` and
 * its own Paired Device record.
 *
 * Collected by nothing: Playwright matches `*.spec.ts`, so this file is a
 * module the specs import rather than a suite of its own.
 */
import { expect, test, type Page } from "@playwright/test";

export async function waitForDbReady(page: Page) {
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
export function projectContextOptions() {
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
export async function openSettings(page: Page) {
  await page.locator(".nav-item", { hasText: "Settings" }).click();
  await expect(
    page.getByRole("heading", { name: "Paired devices" })
  ).toBeVisible();
}

/**
 * Writes one habit, which is the fact these specs watch cross.
 *
 * A habit rather than a meal: a pairing carries the **whole jar** rather than
 * one Facet's rows (ADR-0075 §7), so the thing that crosses should be something
 * Rations does not own, and a habit is three datoms rather than a food's
 * closure.
 */
export async function addHabit(page: Page, name: string) {
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

export const habitShows = (page: Page, name: string) =>
  page.locator(".habit-item", { hasText: name });

/**
 * Runs the whole pairing act between two open pages, ending where both say they
 * are paired.
 *
 * **Every run mints its own room**, because `mintRoomCode` draws from the
 * CSPRNG when "Show a code" is tapped, and with it the pairing secret both
 * lanes come off — so two runs in parallel share neither a room nor an address.
 *
 * **The paste carrier is the one exercised, deliberately.** ADR-0096 §8 gives
 * the code two carriers and says capability decides only what is *offered*; a
 * headless browser has no camera and no `BarcodeDetector`, so the QR half is
 * `code-camera.test.ts`'s and the half a person can always reach is this one.
 *
 * `onCode` is handed the code as the shower's screen renders it, for the one
 * spec that has something to say about its shape.
 */
export async function pairDevices(
  first: Page,
  second: Page,
  { onCode }: { onCode?: (code: string) => void } = {}
) {
  await openSettings(first);
  await expect(first.getByText("No devices are paired.")).toBeVisible();
  await first.locator("#pair-show-btn").click();

  const shown = first.getByTestId("pairing-code");
  await expect(shown).toBeVisible();
  const code = await shown.locator("code.written").innerText();
  onCode?.(code);

  await openSettings(second);
  await second.locator("#pair-read-btn").click();
  const reader = second.getByTestId("pairing-reader");
  await expect(reader).toBeVisible();
  await reader.locator("input").fill(code);
  await reader.locator("button", { hasText: "Use this code" }).click();

  // "Paired" is said once in the whole app and only from the far side of a
  // first sync (`pairing-words.ts`), so these two lines are the guard-1
  // assertion: they cannot be reached by a pairing that did not converge.
  for (const device of [second, first]) {
    await expect(device.getByText("These two devices are paired.")).toBeVisible(
      { timeout: 60_000 }
    );
  }
}
