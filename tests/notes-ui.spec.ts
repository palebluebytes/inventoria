import { test, expect } from "@playwright/test";
import { faceTitle, goToFace, waitForDbReady } from "./support/shell";

test.describe("Notes (Loro CRDT)", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      console.log(`[BROWSER CONSOLE - ${msg.type()}]:`, msg.text());
    });
    // `?mem=1` forces an in-memory DB so OPFS writes don't fail in CI.
    await page.goto("/?mem=1");
    await waitForDbReady(page);
    await goToFace(page, "Notes");
  });

  test("adds and completes a checklist item", async ({ page }) => {
    await expect(faceTitle(page)).toHaveText("Notes");

    const input = page.getByTestId("new-item-input");
    await input.fill("Write the report");
    await input.press("Enter");

    const item = page.getByTestId("checklist-item").filter({
      hasText: "Write the report",
    });
    await expect(item).toBeVisible();

    await item.getByRole("checkbox").check();
    await expect(item.getByRole("checkbox")).toBeChecked();
  });

  test("creates a note and edits its body", async ({ page }) => {
    await page.locator(".tab-btn", { hasText: "Notes" }).click();
    await page.locator("button", { hasText: "+ New note" }).click();

    const body = page.getByTestId("note-body");
    await expect(body).toBeVisible();
    await body.fill("These are my meeting notes.");
    await expect(body).toHaveValue("These are my meeting notes.");
  });
});
