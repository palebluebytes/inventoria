import { expect, type Page } from "@playwright/test";
import { BREAKPOINTS } from "../../src/lib/ui/breakpoints";

/**
 * Rations at `/food/`, shared by the specs that photograph it and the ones that
 * sweep it (#348).
 *
 * Two specs asking the same two questions about the same Facet, and both answers
 * carry an argument that should be written once: what says this app is ready
 * when it has no `.db-badge`, and what "above the shell breakpoint" means when
 * the number belongs to `lib/ui/breakpoints.ts`.
 */

/**
 * Opens the day and waits for the ledger to have answered for it.
 *
 * **A positive marker first, then the absence.** The root's `waitForDbReady`
 * waits for the Sidebar's badge to *say* "DB Ready"; Rations has no sidebar to
 * put one in (ADR-0078 §1), so readiness is read off the day itself — each meal
 * draws a skeleton row until the day is known. But `goto` resolves on `load`,
 * before Svelte has mounted anything, and "no skeletons" is true of an empty
 * document as well as of a read day. Waiting for a meal section to exist first
 * is what tells the two apart: without it a boot failure photographs a blank
 * page and sweeps it for overflow, and passes.
 */
export async function openRationsDay(page: Page): Promise<void> {
  await page.goto("/food/?mem=1");
  await expect(page.locator(".meal-section").first()).toBeVisible();
  await expect(page.locator(".meal-skeleton")).toHaveCount(0);
}

/**
 * Whether Rations has pages at this project's viewport (ADR-0091 §5).
 *
 * Read from the roster rather than written as a number, which is the pair
 * `breakpoints.test.ts` exists to hold from the other end: the stylesheet's
 * `@media`, `matchMedia`'s query and a test's `skip` all have to name one width,
 * or a spec asserts about a shell the browser did not draw.
 */
export function hasPagesAt(viewport: { width: number } | null): boolean {
  return (viewport?.width ?? 0) >= BREAKPOINTS.shell;
}
