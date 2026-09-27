import { expect, type Page } from "@playwright/test";

/**
 * The two questions every root-Facet spec asks before it can do anything:
 * **has the ledger opened**, and **how do I get to that face**.
 *
 * Both answers used to be written out in every spec that needed them, against
 * the root's `Sidebar`: readiness was the footer badge's words — `.db-badge`
 * containing "DB Ready" — and navigation was `.nav-item` filtered by the tab's
 * text. ADR-0114 §5 deletes that box. A badge that says "ready" and a tab bar
 * are both gone, so fifteen specs would have been fifteen separate migrations
 * and fifteen future ones; they are one file now, which is the shape
 * `tests/support/rations.ts` already had for the Facet that never had a badge.
 */

/**
 * Waits for the shell to report that the ledger has answered.
 *
 * **Read off an attribute rather than off words on the screen.** The old wait
 * matched the string "DB Ready" inside a badge, which coupled every spec to a
 * label that existed to be looked at — and that label is exactly what §9
 * retires, on the grounds that a permanent green tick is a developer's
 * affordance charging the user for it. The state is still real, so the shell
 * publishes it as `data-db` on its own box: `opening`, then `ready` or `error`.
 *
 * It matches either shell, because both write it and a spec should not have to
 * know which Facet it is standing in to ask whether the database is up.
 *
 * `toBeVisible` rather than `toHaveCount(1)`: a selector that has not matched
 * yet and a shell that never mounted are the same count, and #348's reading of
 * that trap is that an absence is only a fact once something present has been
 * seen.
 */
export async function waitForDbReady(page: Page): Promise<void> {
  await expect(page.locator('[data-db="ready"]')).toBeVisible();
}

/**
 * Opens the switcher and lands on a face by its canonical name.
 *
 * The name is the roster's one spelling (ADR-0114 §3) — the same string the
 * tile, the header's `<h1>` and the trigger's accessible name carry — so a spec
 * that says `goToFace(page, "Items")` is naming the face rather than a tab's
 * label that happened to match it.
 *
 * The tile is looked for **inside the panel**, by id. The header's own title is
 * not a button, but a face's screen may well hold a control with the same word
 * on it, and a bare `getByRole("button", { name })` would be ambiguous the first
 * time one did.
 */
export async function goToFace(page: Page, name: string): Promise<void> {
  await page.locator('button[aria-controls="face-switcher-panel"]').click();
  const panel = page.locator("#face-switcher-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name, exact: true }).click();
  // The panel is modal and closing it is what says the tap landed. Waiting here
  // rather than in each caller is what keeps a spec from racing the dim: bits-ui
  // puts `inert` on everything behind an open dialog, so a click issued at the
  // screen underneath while it is still up does nothing at all and the failure
  // arrives several assertions later.
  await expect(panel).toHaveCount(0);
}
