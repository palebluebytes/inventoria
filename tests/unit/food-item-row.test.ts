/**
 * The food line's DOM, pinned across the #319 move onto `ui/Row`.
 *
 * `FoodItemRow` is drawn under visual baselines at three sites (the dashboard's
 * logged-food list, the recipe/instantiation ingredient list and the past-meal
 * picker) and addressed by class from the e2e suite (`.fi-name`, `.fi-qty`,
 * `.fi-remove`). Both are contracts the primitive underneath it may not change,
 * so they are asserted here rather than left to a screenshot in CI.
 *
 * The row has two shapes, chosen by `logged`, and both are pinned here: a recipe
 * ingredient reads quantity-under-name with its kcal on the right, and a logged
 * food reads as a full-width name over its amount, with no kcal at all.
 * `.fi-qty` names the quantity in either one.
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
    // The recipe list's shape, kept: a row handed no macros is an ingredient.
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

describe("a logged food line, which is the dashboard's", () => {
  const banana = {
    name: "Bananas, ripe and slightly ripe, raw",
    amount: 50,
    unit: "g" as const,
    calories: 44,
    logged: true,
  };

  it("reads as a name over its amount, and states no kcal", () => {
    // The kcal figure is in the meal's subtotal, the day's meters and the
    // picker; a column reserved for it on every row cost the name its width.
    const { body } = render(FoodItemRow, { props: banana });

    expect(body).toMatch(/class="[^"]*\bfi-name\b[^"]*">Bananas, ripe/);
    expect(body).toMatch(/class="[^"]*\bfi-qty\b[^"]*">50g</);
    expect(body).not.toContain("kcal");
    expect(body).not.toContain("fi-cals");
  });

  it("names the shape on the row, which is what the CSS keys on", () => {
    const { body } = render(FoodItemRow, { props: banana });

    const start = body.indexOf("<div");
    expect(body.slice(start, body.indexOf(">", start) + 1)).toContain(
      "fi-logged"
    );
  });

  it("leaves a recipe row's shape alone", () => {
    const { body } = render(FoodItemRow, {
      props: { ...banana, logged: false },
    });

    expect(body).toMatch(/class="[^"]*\bfi-cals\b[^"]*">44 kcal</);
    expect(body).not.toContain("fi-logged");
  });

  it("still wears the Provisional mark on the amount under a preview", () => {
    const { body } = render(FoodItemRow, {
      props: {
        ...banana,
        preview: { amount: 100, unit: "g" as const, calories: 89 },
      },
    });

    expect(body).toMatch(
      /class="[^"]*\bfi-qty\b[^"]*\bis-preview\b[^"]*">100g</
    );
    expect(body).not.toContain("50g");
    // Nothing else on the row can wear it: there is no second figure.
    expect(body.match(/is-preview/g)).toHaveLength(1);
  });

  it("keeps the skip note on the amount line", () => {
    // A row may not change height between previewing and not, so the note rides
    // the line that is already there.
    const { body } = render(FoodItemRow, {
      props: { ...banana, note: "no weight to scale" },
    });

    expect(body).toMatch(
      /class="[^"]*\bfi-qty\b[^"]*">50g · no weight to scale</
    );
  });
});

describe("a food line under a live Scale preview (ADR-0088 §6)", () => {
  const doubled = { amount: 200, unit: "g" as const, calories: 778 };

  it("states what the food WOULD read at, not what is stored", () => {
    const { body } = render(FoodItemRow, {
      props: { ...oats, preview: doubled },
    });

    expect(body).toMatch(/class="[^"]*\bfi-qty\b[^"]*">200g/);
    expect(body).toMatch(/class="[^"]*\bfi-cals\b[^"]*">778 kcal/);
    expect(body).not.toContain("100g");
    expect(body).not.toContain("389 kcal");
  });

  it("wears the Provisional figure mark on both figures", () => {
    const { body } = render(FoodItemRow, {
      props: { ...oats, preview: doubled },
    });

    // What is projected may never be read as what is stored.
    expect(body).toMatch(/class="[^"]*\bfi-qty\b[^"]*\bis-preview\b/);
    expect(body).toMatch(/class="[^"]*\bfi-cals\b[^"]*\bis-preview\b/);
  });

  it("wears nothing when no preview is live", () => {
    const { body } = render(FoodItemRow, { props: oats });

    expect(body).not.toContain("is-preview");
  });

  it("states the unit the food would be LOGGED in, which may change", () => {
    // A weightless entry against a per-100 panel is written back as a
    // measurement, so the preview says so before the write rather than
    // surprising the reader after it.
    const { body } = render(FoodItemRow, {
      props: {
        ...oats,
        amount: 1,
        unit: "serving" as const,
        preview: { amount: 200, unit: "g" as const, calories: 778 },
      },
    });

    expect(body).toMatch(/class="[^"]*\bfi-qty\b[^"]*">200g/);
  });

  it("says in place when a food cannot be scaled, on the quantity line", () => {
    // On the subtitle rather than a line of its own: a row may not change
    // height between previewing and not.
    const { body } = render(FoodItemRow, {
      props: { ...oats, note: "no weight to scale" },
    });

    expect(body).toMatch(
      /class="[^"]*\bfi-qty\b[^"]*">100g · no weight to scale</
    );
    expect(body).not.toContain("is-preview");
  });
});
