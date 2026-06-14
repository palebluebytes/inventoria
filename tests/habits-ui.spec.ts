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
  await page.goto("/?mem=1");

  // Wait for the DB connection to be fully ready
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );

  // Switch to the Agenda tab
  await page.locator(".nav-item", { hasText: "Agenda" }).click();

  // Open Add Habit screen via inline add row button
  await page
    .locator("section:has-text('HABITS')")
    .locator("button", { hasText: "+ ADD HABIT" })
    .click();

  // Generate a unique habit name to ensure no collision in the local-first database
  const habitName = `Meditate_${Date.now()}`;

  // Fill in the habit blueprint form
  const nameInput = page.locator("#habit-name-input");
  await nameInput.fill(habitName);

  // Select Category and Schedule using new custom chip/segment controls
  await page.locator(".category-chip", { hasText: "MIND" }).click();
  await page.locator(".segment-btn", { hasText: "DAILY" }).click();

  // Click the Add Habit Blueprint button
  const addBtn = page.locator("button", { hasText: "SAVE BLUEPRINT" });
  await addBtn.click();

  // Verify the habit blueprint is displayed in the list
  const habitItem = page.locator(".habit-item", {
    hasText: habitName,
  });
  await expect(habitItem).toBeVisible({ timeout: 5000 });

  // Verify category badge color/text
  const categoryBadge = habitItem.locator(".habit-category-pill");
  await expect(categoryBadge).toHaveText("MIND");

  // Click the habit item to log execution
  await habitItem.click();

  // Right click to open context menu and click View Details & History
  await habitItem.click({ button: "right" });
  await page.locator(".detail-action").click();

  // Inside Detail View: check for title
  const detailTitle = page.locator(".bottom-sheet-header h2").first();
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
  const backBtn = page.locator(".bottom-sheet-header .close-btn");
  await backBtn.click();

  // Verify updated habit is listed in the main view
  const updatedHabitItem = page.locator(".habit-item", {
    hasText: updatedHabitName,
  });
  await expect(updatedHabitItem).toBeVisible({ timeout: 5000 });
});
