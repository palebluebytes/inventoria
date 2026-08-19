import { test, expect } from "@playwright/test";

async function waitForDbReady(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const badge = document.querySelector(".db-badge");
    return badge?.textContent?.includes("DB Ready");
  });
}

test.describe("Settings — API key reveal toggle", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      console.log(`[BROWSER CONSOLE - ${msg.type()}]:`, msg.text());
    });
    // `?mem=1` forces an in-memory DB so OPFS writes don't fail in CI.
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await page.locator(".nav-item", { hasText: "Settings" }).click();
    await expect(
      page.getByRole("heading", { name: "API Credentials" })
    ).toBeVisible();
  });

  test("reveal toggle is an icon inside the input that flips masking", async ({
    page,
  }) => {
    // The USDA key is retired (ADR-0047 §1) and the OFF password lives on the
    // Food screen's settings sheet; the TMDB key keeps the identical reveal
    // toggle on this screen, so it's the regression proof here.
    const input = page.locator("#tmdb-api-key");
    await input.fill("secret-tmdb-key");

    // Starts masked.
    await expect(input).toHaveAttribute("type", "password");

    // The toggle is an icon button (accessible label + an <svg>), and it lives
    // inside the same wrapper as the input rather than as a sibling text button.
    const toggle = page.getByRole("button", { name: "Show TMDB API key" });
    await expect(toggle).toBeVisible();
    await expect(toggle.locator("svg")).toBeVisible();
    await expect(toggle).toHaveText("");

    // Reveals on click.
    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Hide TMDB API key" })
    ).toBeVisible();

    // And masks again.
    await page.getByRole("button", { name: "Hide TMDB API key" }).click();
    await expect(input).toHaveAttribute("type", "password");
  });

  test("the toggle sits within the input bounds and nothing overflows the card", async ({
    page,
  }) => {
    // A long value must not push the input or its toggle out of the card.
    const input = page.locator("#tmdb-api-key");
    await input.fill("x".repeat(120));

    const wrapper = input.locator(
      "xpath=ancestor::div[contains(@class,'input-wrapper')][1]"
    );
    const card = input.locator("xpath=ancestor::*[contains(@class,'card')][1]");

    const inputBox = await input.boundingBox();
    const toggleBox = await page
      .getByRole("button", { name: /TMDB API key/ })
      .boundingBox();
    const wrapperBox = await wrapper.boundingBox();
    const cardBox = await card.boundingBox();
    expect(inputBox && toggleBox && wrapperBox && cardBox).toBeTruthy();

    // The toggle is contained within the input's horizontal bounds (with a 1px
    // tolerance for sub-pixel rounding).
    expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(
      inputBox!.x + inputBox!.width + 1
    );
    expect(toggleBox!.x).toBeGreaterThanOrEqual(inputBox!.x - 1);

    // The input, its toggle, and their wrapper all stay within the card that
    // contains them — this is the regression the old flex "Show" button caused,
    // where the input's intrinsic (monospace) width overflowed the card.
    for (const box of [inputBox!, toggleBox!, wrapperBox!]) {
      expect(box.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width + 1
      );
    }
  });

  test("the Database Ledger buttons stay within their card and sit below the header", async ({
    page,
  }) => {
    const heading = page.getByRole("heading", { name: "Database Ledger" });
    const card = heading.locator(
      "xpath=ancestor::*[contains(@class,'card')][1]"
    );
    const viewBtn = page.locator("#toggle-ledger-btn");
    const wipeBtn = page.locator("#wipe-db-btn");

    const cardBox = await card.boundingBox();
    const headingBox = await heading.boundingBox();
    const viewBox = await viewBtn.boundingBox();
    const wipeBox = await wipeBtn.boundingBox();
    expect(cardBox && headingBox && viewBox && wipeBox).toBeTruthy();

    // Neither button overflows the card horizontally (the mobile regression:
    // "Wipe Database" ran off the right edge, "View Raw Ledger" overlapped the
    // heading).
    for (const box of [viewBox!, wipeBox!]) {
      expect(box.x).toBeGreaterThanOrEqual(cardBox!.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width + 1
      );
    }

    // Both buttons sit below the header rather than beside/over it.
    const headingBottom = headingBox!.y + headingBox!.height;
    expect(viewBox!.y).toBeGreaterThanOrEqual(headingBottom - 1);
    expect(wipeBox!.y).toBeGreaterThanOrEqual(headingBottom - 1);
  });
});
