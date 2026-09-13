import { expect, type Locator, type Page } from "@playwright/test";
import type { MealType } from "../../src/lib/food/meal-type";
import { wayInLabel, type WayIn } from "../../src/lib/food/ways-in";

/**
 * Reaching a **Way in** now that all five live on the day's one Way-in bar
 * (ADR-0101 §1) rather than on four repeated meal headers.
 *
 * The labels have not changed — every control still names its meal, which is
 * why `wayInLabel` is imported rather than restated — but **only one meal's
 * five are reachable at a time**. The bar is a tab list whose panel is the
 * selected meal's rail, so a spec that wants lunch's scanner has to put the bar
 * on lunch first.
 *
 * Reachable rather than present: bits keeps all four panels mounted and marks
 * three `hidden`, so the other fifteen controls are in the DOM and out of the
 * accessible tree. `getByRole` skips a hidden subtree, so a spec that forgets
 * the tab does not click the wrong meal — it times out on a screen that looks
 * perfectly correct. Which is the better failure, and still a failure.
 *
 * Written once here for the reason #348 gives for `support/rations.ts`: this is
 * the same two lines in thirty-odd places, and the second time one of them
 * drifts is the time nobody notices.
 */

/**
 * Put the bar on `meal_type`, and assert that it moved.
 *
 * The assertion is not a wait dressed up — Playwright already auto-waits for the
 * control the caller asks for next. It is there to name the failure. A tab click
 * that silently does nothing is a real state (the bar is `inert` while a
 * Selection is live, ADR-0101 §4), and without this the spec fails thirty lines
 * later on a missing way in, which reads as the rail being broken rather than as
 * the bar never having left the meal it was on.
 */
export async function selectMeal(
  page: Page,
  meal_type: MealType
): Promise<void> {
  // `toUpperCase`, because the tab's text is upper-cased in the markup rather
  // than by `text-transform` — so the accessible name really is "BREAKFAST", and
  // Playwright's `exact` is case-sensitive as well as whole-string. The pair is
  // deliberate: without `exact` a four-letter meal could match a longer name,
  // and without the case this matches nothing at all.
  const tab = page.getByRole("tab", {
    name: meal_type.toUpperCase(),
    exact: true,
  });
  await tab.click();
  await expect(tab).toHaveAttribute("data-state", "active");
}

/**
 * One of the five ways into `meal_type`, by its own accessible name.
 *
 * Does NOT select the meal: a spec asserting that a control is ABSENT (the
 * past-meal one, before that meal has history — ADR-0059 §4) needs the bar on
 * the right meal *and* the count taken, and doing the first silently inside this
 * would make `toHaveCount(0)` pass for the wrong reason on any other meal.
 */
export function wayInControl(
  page: Page,
  meal_type: MealType,
  kind: WayIn
): Locator {
  return page.getByRole("button", { name: wayInLabel(kind, meal_type) });
}

/** Select the meal and open one of its ways in — the whole gesture, in order. */
export async function openWayIn(
  page: Page,
  meal_type: MealType,
  kind: WayIn
): Promise<void> {
  await selectMeal(page, meal_type);
  await wayInControl(page, meal_type, kind).click();
}
