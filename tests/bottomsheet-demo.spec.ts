/// <reference types="node" />
import { test, expect } from "@playwright/test";

// Exercises the two shapes issue #17 grew into the BottomSheet primitive: a
// docked footer alongside the scrollable body, and a sheet raised over a parent
// bits-ui dialog (which sets `pointer-events: none` on <body>). The demo harness
// mounts via `?demo=bottomsheet`; `mem=1` keeps DB init off OPFS.
test.describe("BottomSheet primitive — docked footer over a dialog", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) =>
      console.log("PAGE UNCAUGHT ERROR:", err.message)
    );
    await page.goto("/?mem=1&demo=bottomsheet");
    await expect(page.locator("#demo-open-parent")).toBeVisible();
  });

  test("footer buttons stay interactive when the sheet is over a dialog", async ({
    page,
  }) => {
    // Open the parent bits-ui dialog, then raise the sheet over it.
    await page.locator("#demo-open-parent").click();
    await expect(page.locator(".parent-card")).toBeVisible();
    await page.locator("#demo-open-sheet").click();

    const sheet = page.locator(".bottom-sheet-content");
    await expect(sheet).toBeVisible();

    // The docked footer's controls respond — the primitive re-enabled pointer
    // events, so these are live and not click-through.
    const primary = page.locator("#demo-primary");
    await expect(primary).toHaveText(/count: 0/);
    await primary.click();
    await primary.click();
    await expect(primary).toHaveText(/count: 2/);

    // The method switcher (the other docked control) works too.
    await page.locator('[data-method="scan"]').click();
    await expect(page.locator("#demo-method-label")).toHaveText("Method: scan");
    await expect(page.locator('[data-method="scan"]')).toHaveClass(/on/);

    // Nothing fell through to the parent-dialog button sitting behind the sheet.
    await expect(page.locator("#demo-parent-trap")).toHaveText(/hits: 0/);
  });

  test("footer stays pinned while the body scrolls", async ({ page }) => {
    await page.locator("#demo-open-parent").click();
    await page.locator("#demo-open-sheet").click();
    await expect(page.locator(".bottom-sheet-content")).toBeVisible();

    const body = page.locator(".bottom-sheet-body");
    const primary = page.locator("#demo-primary");

    // Footer sits below the body and both are on screen to start.
    await expect(primary).toBeInViewport();

    // Scroll the body to its end; the docked footer must not scroll away.
    await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.locator(".body-list li").last()).toBeInViewport();
    await expect(primary).toBeInViewport();

    // Still live after scrolling.
    await primary.click();
    await expect(primary).toHaveText(/count: 1/);
  });

  test("close control dismisses the sheet, parent dialog remains", async ({
    page,
  }) => {
    await page.locator("#demo-open-parent").click();
    await page.locator("#demo-open-sheet").click();
    await expect(page.locator(".bottom-sheet-content")).toBeVisible();

    await page.locator("#demo-sheet-close").click();
    await expect(page.locator(".bottom-sheet-content")).not.toBeVisible();
    await expect(page.locator(".parent-card")).toBeVisible();
  });
});
