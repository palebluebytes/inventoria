import { expect, type Locator, type Page } from "@playwright/test";
import type { MealType } from "../../src/lib/food/meal-type";
import { wayInLabel, type WayIn } from "../../src/lib/food/ways-in";

/**
 * Reaching a **Way in** now that all five live on the day's one Way-in bar
 * (ADR-0101 §1) rather than on four repeated meal headers.
 *
 * The labels have not changed — every control still names its meal, which is
 * why `wayInLabel` is imported rather than restated — but **only one meal's
 * five are in the DOM at a time**. The bar is a tab list whose panel is the
 * selected meal's rail, so a spec that wants lunch's scanner has to put the bar
 * on lunch first. Without that step the control is absent rather than hidden,
 * and a `getByRole` for it times out on a screen that looks perfectly correct.
 *
 * Written once here for the reason #348 gives for `support/rations.ts`: this is
 * the same two lines in thirty-odd places, and the second time one of them
 * drifts is the time nobody notices.
 */

/**
 * Put the bar on `meal_type`, and wait until it says so.
 *
 * The wait is the point rather than politeness. `Tabs.Content` swaps the panel,
 * so clicking the tab and immediately clicking a way in races the panel that is
 * leaving — and the stale rail carries the *other* meal's five, every one of
 * which is a real control with a real label. A race here does not fail, it logs
 * the food into the wrong meal.
 */
export async function selectMeal(
  page: Page,
  meal_type: MealType
): Promise<void> {
  const tab = page.getByRole("tab", { name: meal_type, exact: true });
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
