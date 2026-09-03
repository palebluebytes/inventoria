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

// ADR-0089 §7: on a phone a sheet opened over a sheet REPLACES it, and Back is
// what returns to the one beneath. Two claims, and each needs a browser: which
// sheet is on top is a stack (`tests/unit/back-stack.test.ts` proves the
// ordering), but "the one beneath is off the screen" is a rendered fact, and
// nothing but a real engine has a Back gesture at all.
//
// Both projects run this, and the width is what they disagree about: below 768px
// the sheet beneath is gone, above it both are on screen with a dim between them,
// which is the arrangement §7 deliberately leaves alone.
test.describe("BottomSheet primitive — a sheet raised over a sheet", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) =>
      console.log("PAGE UNCAUGHT ERROR:", err.message)
    );
    // A known entry underneath the app's own, so "the entry was spent" is
    // provable by arriving here rather than by counting something the browser
    // does not expose: `history.length` never shrinks on a Back.
    await page.goto("/?mem=1&demo=bottomsheet&back=probe");
    await page.goto("/?mem=1&demo=bottomsheet");
    await page.locator("#demo-open-parent").click();
    await page.locator("#demo-open-sheet").click();
    await expect(page.locator(".bottom-sheet-content")).toBeVisible();
    await page.locator("#demo-open-second").click();
    await expect(page.locator(".second-sheet")).toBeVisible();
  });

  test("replaces the sheet beneath it on a phone", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Replacement is the phone's shape (ADR-0089 §7).");
    // Not "covered by" — off the screen, so it is out of the focus order and
    // out of the accessibility tree while something else owns the screen.
    await expect(page.locator("#demo-open-second")).toBeHidden();
    await expect(page.locator("#demo-second-body")).toBeVisible();
  });

  test("stacks over it above 768px, where a dim between them is visible", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "The peek and the stack are the wide screen's.");
    await expect(page.locator("#demo-open-second")).toBeVisible();
    await expect(page.locator("#demo-second-body")).toBeVisible();
  });

  test("Back closes the top sheet and returns to the one beneath", async ({
    page,
  }) => {
    await page.goBack();
    await expect(page.locator(".second-sheet")).toHaveCount(0);
    // The sheet that was replaced is the sheet you come back to — the same one,
    // with what was in it, which is why it is hidden rather than unmounted.
    await expect(page.locator("#demo-open-second")).toBeVisible();

    // And again: one entry per sheet, so the second Back closes the first.
    await page.goBack();
    await expect(page.locator(".bottom-sheet-content")).toHaveCount(0);
    await expect(page.locator(".parent-card")).toBeVisible();
  });

  test("a sheet closed by its own control spends the entry it pushed", async ({
    page,
  }) => {
    // Otherwise the entry outlives the sheet, and every Back after that is
    // swallowed doing nothing — a dead gesture, which is worse than the one
    // that left the app. Both sheets leave by their own controls here, so with
    // the entries spent there is exactly one Back between this page and the one
    // before it.
    await page.locator("#demo-second-close").click();
    await expect(page.locator(".second-sheet")).toHaveCount(0);
    await page.locator("#demo-sheet-close").click();
    await expect(page.locator(".bottom-sheet-content")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/back=probe/);
  });
});
