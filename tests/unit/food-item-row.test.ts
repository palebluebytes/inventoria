/**
 * The food line's DOM, pinned across the #319 move onto `ui/Row`.
 *
 * `FoodItemRow` is drawn under visual baselines at three sites (the dashboard's
 * logged-food list, the recipe/instantiation ingredient list and the past-meal
 * picker) and addressed by class from the e2e suite (`.fi-name`, `.fi-qty`,
 * `.fi-remove`). Both are contracts the primitive underneath it may not change,
 * so they are asserted here rather than left to a screenshot in CI.
 */
import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import { createRawSnippet } from "svelte";
import FoodItemRow from "../../src/lib/views/food/FoodItemRow.svelte";

const oats = {
  name: "Mock Oats",
  amount: 100,
  unit: "g" as const,
  calories: 389,
};

describe("a food line", () => {
  it("reads as a name over its quantity, with the kcal on the right", () => {
    const { body } = render(FoodItemRow, { props: oats });

    expect(body).toMatch(/class="[^"]*\bfi-name\b[^"]*">Mock Oats</);
    expect(body).toMatch(/class="[^"]*\bfi-qty\b[^"]*">100g</);
    expect(body).toMatch(/class="[^"]*\bfi-cals\b[^"]*">389 kcal</);
  });

  it("names the row `food-item`, alongside the caller's own class", () => {
    const { body } = render(FoodItemRow, {
      props: { ...oats, class: "recipe-ingredient" },
    });

    const start = body.indexOf("<div");
    const root = body.slice(start, body.indexOf(">", start) + 1);
    expect(root).toContain("food-item");
    expect(root).toContain("recipe-ingredient");
  });

  it("is inert with no tap handler — no role, no tab stop", () => {
    const { body } = render(FoodItemRow, { props: oats });

    expect(body).not.toContain('role="button"');
    expect(body).not.toContain("tabindex");
  });

  it("takes the tap as a div role=button, never a native button", () => {
    // The remove ✕ is a button, and HTML forbids one inside another: the row
    // that is clickable *and* removable is the recipe list's, and it is why
    // this line has always been a div with a hand-rolled keyboard path.
    const { body } = render(FoodItemRow, {
      props: { ...oats, onclick: () => {}, onRemove: () => {} },
    });

    expect(body).toMatch(/<div[^>]*role="button"/);
    expect(body).toMatch(/<div[^>]*tabindex="0"/);
    expect(body).toMatch(/class="[^"]*\bclickable\b/);
    expect(body).not.toMatch(/<button[^>]*class="[^"]*\bfood-item\b/);
  });

  it("draws the remove ✕ in the corner, named for the food it removes", () => {
    const { body } = render(FoodItemRow, {
      props: { ...oats, onRemove: () => {} },
    });

    expect(body).toMatch(
      /<button[^>]*class="[^"]*\bfi-remove\b[^"]*"[^>]*aria-label="Remove Mock Oats"/
    );
  });

  it("gives the corner to `corner` when there is one, ✕ or no ✕", () => {
    const { body } = render(FoodItemRow, {
      props: {
        ...oats,
        onRemove: () => {},
        corner: createRawSnippet(() => ({
          render: () => "<span>✓</span>",
        })),
      },
    } as Record<string, unknown>);

    expect(body).toContain("✓");
    expect(body).not.toContain("fi-remove");
  });

  it("carries the dashboard's selection highlight", () => {
    const { body } = render(FoodItemRow, {
      props: { ...oats, selected: true },
    });

    expect(body).toMatch(/class="[^"]*\bselected\b/);
  });
});
