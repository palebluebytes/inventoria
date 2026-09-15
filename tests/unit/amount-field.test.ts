/**
 * What the amount control renders on a food published by volume (ADR-0105 §1).
 *
 * `render` reaches the markup — whether the toggle is drawn at all, which unit
 * it shows as chosen, what the label names, and what number the box holds. It
 * cannot run an `$effect` or a click, so the reconciliation between a tap on
 * `g` and the picker that opens under it is CI's (`tests/food-ui.spec.ts`) and
 * not this file's. Everything asserted here is a statement about the first
 * paint, which is the half a user meets before touching anything.
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import AmountField from "../../src/lib/views/food/AmountField.svelte";

// Svelte appends a scoping hash to every class it styles, so the classes are
// matched as the first word of the attribute rather than as its whole value.
const unitKeys = (body: string) =>
  [...body.matchAll(/<button[^>]*class="unit-key[^"]*"[^>]*>/g)].map(
    (m) => m[0]
  );

const pressed = (body: string) =>
  unitKeys(body)
    .filter((tag) => tag.includes('aria-pressed="true"'))
    .map((tag) => /data-unit="(\w+)"/.exec(tag)?.[1]);

const numberIn = (body: string) =>
  /<input[^>]*class="num[^"]*"[^>]*value="([^"]*)"/.exec(body)?.[1];

describe("a food measured by weight has no choice to make", () => {
  it("draws no unit toggle at all", () => {
    // ADR-0060 §1 is unchanged everywhere a density is not involved, and this
    // is where "everywhere else" is proved: a gram food renders exactly the
    // control it always did.
    const { body } = render(AmountField, {
      props: { amount: 100, unit: "g" },
    });
    expect(unitKeys(body)).toEqual([]);
    expect(body).toContain("Amount (grams)");
  });
});

describe("a food published by volume is offered the question", () => {
  it("draws the toggle even with no density, because tapping `g` is the ask", () => {
    // The door IS the toggle (ADR-0105 §1): the control that offers the
    // capability is the one that earns it, so there is no separate prompt and
    // no second surface to find.
    const { body } = render(AmountField, {
      props: { amount: 250, unit: "ml", onAssertDensity: () => {} },
    });
    expect(unitKeys(body)).toHaveLength(2);
    expect(pressed(body)).toEqual(["ml"]);
  });

  it("opens in millilitres and stays fully loggable with no class", () => {
    // §6: a food with no class stays in millilitres indefinitely. The gram path
    // is something a product earns once, never a precondition for using the app.
    const { body } = render(AmountField, {
      props: { amount: 250, unit: "ml", onAssertDensity: () => {} },
    });
    expect(body).toContain("Amount (millilitres)");
    expect(numberIn(body)).toBe("250");
  });

  it("does not open the picker before anybody has asked for grams", () => {
    const { body } = render(AmountField, {
      props: { amount: 250, unit: "ml", onAssertDensity: () => {} },
    });
    expect(body).not.toContain('data-testid="density-picker"');
  });
});

describe("a classified food answers in the unit the host opens it on", () => {
  it("shows grams, and the weight the class resolves to", () => {
    // 100 ml of olive oil is 92 g. Assuming 1 g/ml instead is 78 kcal of error
    // on that amount, which is the whole reason this record exists.
    const { body } = render(AmountField, {
      props: {
        amount: 100,
        unit: "ml",
        density: { class: "oil" },
        openOn: "g",
      },
    });
    expect(pressed(body)).toEqual(["g"]);
    expect(body).toContain("Amount (grams)");
    expect(numberIn(body)).toBe("92");
  });

  it("shows millilitres where the host's context opens it there", () => {
    // Nobody weighs a can of Coke; they drink it. Both units stay available —
    // what the context decides is only which one the field opens on.
    const { body } = render(AmountField, {
      props: {
        amount: 330,
        unit: "ml",
        density: { class: "juice" },
        openOn: "ml",
      },
    });
    expect(pressed(body)).toEqual(["ml"]);
    expect(numberIn(body)).toBe("330");
  });

  it("ignores an opening unit it has no density to reach", () => {
    // A host may hand down grams for a food nobody has classified — the memory
    // and the context rules do not know what the twin says. Converting anyway
    // would be ADR-0060 §2's ratio-1 pretence, so the field simply stays where
    // the panel put it.
    const { body } = render(AmountField, {
      props: {
        amount: 250,
        unit: "ml",
        openOn: "g",
        onAssertDensity: () => {},
      },
    });
    expect(pressed(body)).toEqual(["ml"]);
    expect(numberIn(body)).toBe("250");
  });

  it("draws no toggle where the host has nowhere to put the answer", () => {
    // A question whose answer goes nowhere is a control that does nothing, which
    // is the surface ADR-0105 §1 rejects read the other way round. A food that
    // can already be weighed still offers the switch, because switching is not
    // asking.
    const unanswerable = render(AmountField, {
      props: { amount: 250, unit: "ml" },
    });
    expect(unitKeys(unanswerable.body)).toEqual([]);

    const classified = render(AmountField, {
      props: { amount: 250, unit: "ml", density: { class: "juice" } },
    });
    expect(unitKeys(classified.body)).toHaveLength(2);
  });

  it("names the unit once, in the label, the suffix and the aria-label", () => {
    // Three places spell the unit and they read it from one derived, so the
    // control can never claim to take two different things at once.
    const { body } = render(AmountField, {
      props: {
        amount: 100,
        unit: "ml",
        density: { g_per_ml: 1.2 },
        openOn: "g",
      },
    });
    expect(body).toContain("Amount (grams)");
    expect(body).toContain("Amount in grams");
    expect(body).toMatch(/<span class="unit[^"]*">g<\/span>/);
  });
});
