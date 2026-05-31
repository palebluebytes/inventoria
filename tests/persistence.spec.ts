import { test, expect } from "@playwright/test";

test("OPFS Persistence Test survival across page reload", async ({ page }) => {
  // Capture page console logs
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) =>
    console.log("PAGE UNCAUGHT ERROR:", err.message)
  );

  // Capture worker logs
  page.on("worker", (worker) => {
    console.log("WORKER CREATED:", worker.url());
    worker.on("console", (msg) => console.log("WORKER LOG:", msg.text()));
    worker.on("pageerror", (err) => console.log("WORKER ERROR:", err.message));
  });

  // Navigate to root
  await page.goto("/");

  // Switch to the Dev tab so harness elements become visible
  await page.locator(".nav-item", { hasText: "Dev" }).click();

  // Wait for the DB connection to be fully ready
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );

  // Enable Developer / Testing Mode
  const devToggle = page.locator("#dev-mode-toggle");
  await devToggle.check();

  // Verify test card and button are visible
  const runTestBtn = page.locator("#run-test-btn");
  await expect(runTestBtn).toBeVisible();

  // Reset test state first to ensure clean execution
  const resetBtn = page.locator("#reset-test-btn");
  await expect(resetBtn).toBeVisible();
  await resetBtn.click();

  // Click the run button to write datom to OPFS and reload the page
  console.log("Clicking run-test-btn...");
  await runTestBtn.click();

  // Wait for the status badge to have text "PASSED"
  const resultBadge = page.locator("#test-result");
  await expect(resultBadge).toHaveText("PASSED", { timeout: 15000 });
});
