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
 * The chip itself is no longer a `<select>` either (#453) — see `selectMeal`.
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
  // Two clicks, not `selectOption`: the chip stopped being a native `<select>`
  // at #453 and is now a `popover="auto"` panel of four tiles, because the
  // platform's own list is drawn by the platform and looked nothing like this
  // app on a device.
  //
  // The chip keeps its accessible name, and the tiles keep the upper-cased
  // spelling the options had — so this helper reads the way it always did and
  // `exact` still has to be case-sensitive.
  const chip = page.getByRole("button", {
    name: "Which meal these land in",
  });
  await chip.click();
  // Scoped to the panel the chip controls, because the day's own meal HEADINGS
  // are also buttons carrying these four words (they open a meal's nutrition
  // panel, ADR-0074 §1). Unscoped, "BREAKFAST" is ambiguous and Playwright is
  // right to refuse it.
  const panel = page.locator(`#${await chip.getAttribute("aria-controls")}`);
  await panel
    .getByRole("button", { name: meal_type.toUpperCase(), exact: true })
    .click();
  // The panel closes on a pick and the chip's label follows, which is the pair
  // worth asserting: a click that lands on nothing leaves both unchanged, and
  // the spec then fails thirty lines later on a missing way in.
  await expect(chip).toContainText(meal_type.toUpperCase());
  await expect(chip).toHaveAttribute("aria-expanded", "false");
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
