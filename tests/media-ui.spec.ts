import { test, expect } from "@playwright/test";

test("Media Library UI - search, save, and log engagement for books and movies", async ({
  page,
}) => {
  // Capture page console logs for debugging
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (err) =>
    console.log("PAGE UNCAUGHT ERROR:", err.message)
  );

  // Mock TMDB search endpoint
  await page.route("**/3/search/movie*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            id: 155,
            title: "The Dark Knight",
            release_date: "2008-07-16",
            poster_path: "/dark-knight-poster.jpg",
          },
        ],
      }),
    });
  });

  // Mock TMDB details (credits) endpoint for Christopher Nolan
  await page.route("**/3/movie/155*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 155,
        title: "The Dark Knight",
        release_date: "2008-07-16",
        poster_path: "/dark-knight-poster.jpg",
        credits: {
          crew: [{ job: "Director", name: "Christopher Nolan" }],
        },
      }),
    });
  });

  // Mock Open Library search endpoint
  await page.route("**/search.json*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        docs: [
          {
            key: "/works/OL1168083W",
            title: "1984",
            author_name: ["George Orwell"],
            first_publish_year: 1949,
            cover_i: 12345,
            isbn: ["9780141187761"],
          },
        ],
      }),
    });
  });

  // Go to page
  await page.goto("/");

  // Wait for DB ready
  await page.waitForFunction(
    () => {
      const badge = document.querySelector(".db-badge");
      return badge?.textContent?.includes("DB Ready");
    },
    { timeout: 10000 }
  );

  // Click on the Media Twins tab in Sidebar
  await page.locator(".nav-item", { hasText: "Media Twins" }).click();

  // Click on Ingest Media button
  await page.locator("#ingest-media-btn").click();

  // Search Movie "Dark Knight"
  await page.locator("#media-search-input").fill("Dark Knight");
  await page.locator("button[type='submit']", { hasText: "Search" }).click();

  // Save the result "The Dark Knight"
  const movieResult = page.locator(".search-result-item", {
    hasText: "The Dark Knight",
  });
  await expect(movieResult).toBeVisible();
  await movieResult.locator("button", { hasText: "Save" }).click();

  // Close the modal
  await page.locator(".close-btn").click();

  // Verify that the movie is added to the "Saved" column on the Kanban board
  const savedColumn = page.locator(".kanban-column", { hasText: "Saved" });
  const movieCard = savedColumn.locator(".media-card", {
    hasText: "The Dark Knight",
  });
  await expect(movieCard).toBeVisible();

  // Verify proper director display (strict separation)
  await expect(movieCard.locator(".card-creator")).toHaveText(
    "Director: Christopher Nolan"
  );

  // Click "Start →" quick action on the movie card
  await movieCard.locator("button", { hasText: "Start →" }).click();

  // Verify it moved to the "Started" column
  const startedColumn = page.locator(".kanban-column", { hasText: "Started" });
  await expect(
    startedColumn.locator(".media-card", { hasText: "The Dark Knight" })
  ).toBeVisible();

  // Now search for the Book "1984"
  await page.locator("#ingest-media-btn").click();
  await page.locator(".modal-tabs button", { hasText: "Books" }).click();
  await page.locator("#media-search-input").fill("1984");
  await page.locator("button[type='submit']", { hasText: "Search" }).click();

  // Save the result "1984"
  const bookResult = page.locator(".search-result-item", { hasText: "1984" });
  await expect(bookResult).toBeVisible();
  await bookResult.locator("button", { hasText: "Save" }).click();

  // Close the modal
  await page.locator(".close-btn").click();

  // Verify "1984" is in the "Saved" column
  const bookCard = savedColumn.locator(".media-card", { hasText: "1984" });
  await expect(bookCard).toBeVisible();

  // Verify proper author display (strict separation)
  await expect(bookCard.locator(".card-creator")).toHaveText(
    "Author: George Orwell"
  );

  // Click the card to open detail modal
  await bookCard.click();

  // Inside modal, update status to "progress", and pages read to 100
  await page.locator("#event-status-select").selectOption("progress");
  await page.locator("#event-pages-read").fill("100");
  await page.locator("button", { hasText: "Log Event" }).click();

  // Verify it moved to "Progress" column and displays pages read
  const progressColumn = page.locator(".kanban-column", {
    hasText: "Progress",
  });
  const progressedBookCard = progressColumn.locator(".media-card", {
    hasText: "1984",
  });
  await expect(progressedBookCard).toBeVisible();
  await expect(progressedBookCard.locator(".card-progress-stat")).toContainText(
    "100 pages read"
  );
});
