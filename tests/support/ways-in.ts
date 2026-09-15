import { expect, type Locator, type Page } from "@playwright/test";
import type { MealType } from "../../src/lib/food/meal-type";
import { wayInLabel, type WayIn } from "../../src/lib/food/ways-in";

/**
 * Reaching a **Way in** now that all five live on the day's one Way-in bar
 * (ADR-0101 §1) rather than on four repeated meal headers.
 *
 * The labels have not changed — every control still names its meal, which is
 * why `wayInLabel` is imported rather than restated — but **only one meal's
 * five are on the screen at a time**. The bar chooses a meal with a picker and
 * the rail is rendered for that meal, so a spec that wants lunch's scanner has
 * to put the bar on lunch first.
 *
 * Absent rather than hidden, which is what the 2026-09-15 amendment changed
 * here: the bar used to be a tab list that mounted all four panels and marked
 * three `hidden`, so the other fifteen controls were in the DOM and out of the
 * accessible tree. Now they are not rendered at all. Either way a spec that
 * forgets the meal times out on a screen that looks perfectly correct rather
 * than clicking into the wrong one, which is the better failure and still a
 * failure.
 *
 * Written once here for the reason #348 gives for `support/rations.ts`: this is
 * the same two lines in thirty-odd places, and the second time one of them
 * drifts is the time nobody notices.
 */

/**
 * Put the bar on `meal_type`, and assert that it moved.
 *
 * The assertion is not a wait dressed up — Playwright already auto-waits for the
 * control the caller asks for next. It is there to name the failure. A choice
 * that silently does nothing is a real state (the bar is `inert` while a
 * Selection is live, ADR-0101 §4), and without this the spec fails thirty lines
 * later on a missing way in, which reads as the rail being broken rather than as
 * the bar never having left the meal it was on.
 */
export async function selectMeal(
  page: Page,
  meal_type: MealType
): Promise<void> {
  // The chip is a native `<select>` behind `ui/Select`, so this is
  // `selectOption` and not a click: the options live in the platform's own
  // picker, which Playwright drives through the element rather than the screen.
  // Its accessible name is the bar's, and the option's label is upper-cased in
  // the markup rather than by `text-transform` — the same spelling the tab
  // carried, kept deliberately so this helper reads the way it always did.
  const chip = page.getByRole("combobox", {
    name: "Which meal these land in",
  });
  await chip.selectOption(meal_type);
  await expect(chip).toHaveValue(meal_type);
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
