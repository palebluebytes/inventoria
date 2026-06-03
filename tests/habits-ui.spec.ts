import { test, expect } from "@playwright/test";

test("Habits UI - create habit blueprint, log execution, view details, and edit version chain", async ({
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

  // Fill in the habit blueprint form
  const nameInput = page.locator("#habit-name-input");
  await nameInput.fill(habitName);

  // Select Category and Schedule
  await page.selectOption("#habit-category", "Mind");
  await page.selectOption("#habit-schedule", "daily_multiple");

  const instrumentInput = page.locator("#habit-instrument-input");
  await instrumentInput.fill(instrumentName);

  // Click the Add Habit Blueprint button
  const addBtn = page.locator("button", { hasText: "Add Habit Blueprint" });
  await addBtn.click();

  // Verify the habit blueprint is displayed in the list
  const habitItem = page.locator("#habits-blueprints-list .habit-item", {
    hasText: habitName,
  });
  await expect(habitItem).toBeVisible({ timeout: 5000 });

  // Verify category badge color/text
  const categoryBadge = habitItem.locator(".badge-custom");
  await expect(categoryBadge).toHaveText("Mind");

  // Click the "Quick Log ✓" button for the new habit
  const quickLogBtn = habitItem.locator("button", { hasText: "Quick Log ✓" });
  await quickLogBtn.click();

  // Verify that the streak mini-stat updates to 1d
  const streakStat = habitItem.locator(".mini-stat.streak");
  await expect(streakStat).toContainText("🔥 1d", { timeout: 5000 });

  // Click "Details & Logs" to enter the detail view
  const detailsBtn = habitItem.locator("button", { hasText: "Details & Logs" });
  await detailsBtn.click();

  // Inside Detail View: check for title
  const detailTitle = page.locator(".detail-header h1");
  await expect(detailTitle).toHaveText(habitName);

  // Verify heatmap is visible
  const heatmap = page.locator(".heatmap-grid");
  await expect(heatmap).toBeVisible();

  // Log execution with notes and difficulty from the detail view
  const noteInput = page.locator("#log-note");
  await noteInput.fill("Felt very focused");

  await page.selectOption("#log-difficulty", "easy");

  const logExecutionBtn = page.locator("button", { hasText: "Submit Log" });
  await logExecutionBtn.click();

  // Verify execution appears in history list
  const timelineItem = page.locator(".timeline-item").first();
  await expect(timelineItem).toContainText("Felt very focused");
  await expect(timelineItem).toContainText("easy");

  // Edit the blueprint directly to test version chaining
  const editNameInput = page.locator("#edit-name");
  const updatedHabitName = `${habitName} (Advanced)`;
  await editNameInput.fill(updatedHabitName);

  // Save changes
  const saveBtn = page.locator("button", { hasText: "Update Blueprint" });
  await saveBtn.click();

  // Detail title should update
  await expect(detailTitle).toHaveText(updatedHabitName);

  // Back to habits list
  const backBtn = page.locator("button", { hasText: "← Back to Habits" });
  await backBtn.click();

  // Verify updated habit is listed in the main view
  const updatedHabitItem = page.locator("#habits-blueprints-list .habit-item", {
    hasText: updatedHabitName,
  });
  await expect(updatedHabitItem).toBeVisible({ timeout: 5000 });
});
