import { test, expect } from "@playwright/test";

test("Habits UI - create habit blueprint and log execution to update streak", async ({
  page,
}) => {
  // Capture page console logs for debugging
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) =>
    console.log("PAGE UNCAUGHT ERROR:", err.message)
  );

  // Navigate to root
  await page.goto("/");

  // Wait for the DB connection to be fully ready
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );

  // Switch to the Habits tab
  await page.locator(".nav-item", { hasText: "Habits" }).click();

  // Generate a unique habit name to ensure no collision in the local-first database
  const habitName = `Meditate_${Date.now()}`;
  const instrumentName = "twin:cushion";

  // Get initial execution count
  const countBadge = page.locator("#recent-executions-count");
  let initialCount = 0;
  if (await countBadge.isVisible()) {
    const text = await countBadge.textContent();
    initialCount = parseInt(text || "0", 10);
  }

  // Fill in the habit blueprint form
  const nameInput = page.locator("#habit-name-input");
  const instrumentInput = page.locator("#habit-instrument-input");
  await nameInput.fill(habitName);
  await instrumentInput.fill(instrumentName);

  // Click the Add Habit button
  const addBtn = page.locator("button", { hasText: "Add Habit" });
  await addBtn.click();

  // Verify the habit blueprint is displayed in the list
  const habitItem = page.locator("#habits-blueprints-list .twin-item", {
    hasText: habitName,
  });
  await expect(habitItem).toBeVisible({ timeout: 5000 });

  // Get the dynamically generated Entity ID
  const entitySpan = habitItem.locator(".twin-entity");
  await expect(entitySpan).toContainText("habit:meditate_");
  const entityId = await entitySpan.textContent();
  expect(entityId).toBeTruthy();

  // Click the "Log ✓" button for the new habit
  const logBtn = habitItem.locator("button", { hasText: "Log ✓" });
  await logBtn.click();

  // Verify the execution count is updated in the badge
  const expectedCount = initialCount + 1;
  await expect(countBadge).toHaveText(String(expectedCount), { timeout: 5000 });

  // Verify a new execution item starting with 'event:execute_' is listed
  const firstExecItem = page
    .locator("#recent-executions-list .twin-item")
    .first();
  await expect(firstExecItem).toBeVisible({ timeout: 5000 });
  const execEntity = firstExecItem.locator(".twin-entity");
  await expect(execEntity).toContainText("event:execute_");

  // Verify the streak 🔥 banner is updated and greater than or equal to 1
  const streakNum = page.locator(".streak-num");
  await expect(streakNum).toBeVisible();
  const streakText = await streakNum.textContent();
  const streakValue = parseInt(streakText || "0", 10);
  expect(streakValue).toBeGreaterThanOrEqual(1);
});
