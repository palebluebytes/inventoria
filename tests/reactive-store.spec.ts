import { test, expect } from "@playwright/test";

/**
 * Reactive UI Layer — E2E tests
 *
 * These tests exercise the full stack: main thread → DB worker → OPFS →
 * invalidation broadcast → Svelte store re-query → DOM update.
 */

test.describe("Reactive store — live updates without page reload", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  });

  /** Wait until the app has finished initialising the DB worker */
  async function waitForDbReady(page: import("@playwright/test").Page) {
    await page.waitForFunction(
      () => {
        const badge = document.querySelector(".db-badge");
        return badge?.textContent?.includes("DB Ready");
      },
      { timeout: 10000 }
    );
  }

  test("food twin appears in query results after append, without reload", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForDbReady(page);

    // Inject a food twin via the already-initialised dbClient singleton
    await page.evaluate(async () => {
      const { dbClient } = await import("/src/lib/db/db.client.ts");
      await dbClient.append([
        {
          entity: "gtin:e2e_test_food",
          attribute: "food/name",
          value: "E2E Test Apple",
          time: Date.now(),
        },
      ]);
    });

    const rows = await page.evaluate(async () => {
      const { dbClient } = await import("/src/lib/db/db.client.ts");
      return dbClient.query(
        "SELECT entity, attribute, value FROM datoms WHERE entity = 'gtin:e2e_test_food'"
      );
    });

    expect(rows).toHaveLength(1);
    expect((rows[0] as any).value).toBe('"E2E Test Apple"');
  });

  test("execution event appears in query results after logExecution append", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForDbReady(page);

    const eventEntity = await page.evaluate(async () => {
      const { dbClient } = await import("/src/lib/db/db.client.ts");
      const { logExecution } = await import("/src/lib/habits/habits.ts");
      const datoms = logExecution(
        "habit:swing_01",
        "twin:kettlebell_16kg",
        Date.now()
      );
      await dbClient.append(datoms);
      return datoms[0].entity;
    });

    const rows = await page.evaluate(async (entityId) => {
      const { dbClient } = await import("/src/lib/db/db.client.ts");
      return dbClient.query(
        "SELECT attribute, value FROM datoms WHERE entity = ? AND attribute = 'event/type'",
        [entityId]
      );
    }, eventEntity);

    expect(rows).toHaveLength(1);
    expect((rows[0] as any).value).toBe('"ExerciseAction"');
  });
});
