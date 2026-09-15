/**
 * What the amount control renders on a food published by volume (ADR-0108 §1).
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

// bits-ui renders the Segmented cells and Svelte appends a scoping hash to
// every class it styles, so both are matched loosely rather than by an exact
// attribute value.
const unitCells = (body: string) => {
  const row = /data-testid="amount-units"[\s\S]*?<\/div>/.exec(body)?.[0] ?? "";
  return [...row.matchAll(/<button[^>]*data-value="(\w+)"[^>]*>/g)];
};

const checkedUnit = (body: string) =>
  unitCells(body)
    .filter((m) => m[0].includes('data-state="checked"'))
    .map((m) => m[1]);

const numberIn = (body: string) =>
  /<input[^>]*class="num[^"]*"[^>]*value="([^"]*)"/.exec(body)?.[1];

describe("a food measured by weight has no choice to make", () => {
  it("draws no unit toggle at all", () => {
    // ADR-0060 §1 is unchanged everywhere a density is not involved, and this
    // is where "everywhere else" is proved: a gram food renders exactly the
    // control it always did.
    const { body } = render(AmountField, {
      props: { amount: 100, unit: "g", onAssertDensity: () => {} },
    });
    expect(unitCells(body)).toEqual([]);
    expect(body).toContain("Amount (grams)");
  });
});

describe("a food published by volume is offered the question", () => {
  it("draws the toggle even with no density, because tapping `g` is the ask", () => {
    // The door IS the toggle (ADR-0108 §1): the control that offers the
    // capability is the one that earns it, so there is no separate prompt and
    // no second surface to find.
    const { body } = render(AmountField, {
      props: {
        amount: 250,
        unit: "ml",
        panelUnit: "ml",
        onAssertDensity: () => {},
      },
    });
    expect(unitCells(body)).toHaveLength(2);
    expect(checkedUnit(body)).toEqual(["ml"]);
  });

  it("opens in millilitres and stays fully loggable with no class", () => {
    // §6: a food with no class stays in millilitres indefinitely. The gram path
    // is something a product earns once, never a precondition for using the app.
    const { body } = render(AmountField, {
      props: {
        amount: 250,
        unit: "ml",
        panelUnit: "ml",
        onAssertDensity: () => {},
      },
    });
    expect(body).toContain("Amount (millilitres)");
    expect(numberIn(body)).toBe("250");
  });

  it("does not open the picker before anybody has asked for grams", () => {
    const { body } = render(AmountField, {
      props: {
        amount: 250,
        unit: "ml",
        panelUnit: "ml",
        onAssertDensity: () => {},
      },
    });
    expect(body).not.toContain('data-testid="density-picker"');
  });

  it("draws no toggle where the host has nowhere to put the answer", () => {
    // A question whose answer goes nowhere is a control that does nothing, which
    // is the surface ADR-0108 §1 rejects read the other way round. A food that
    // can already be weighed still offers the switch, because switching is not
    // asking.
    const unanswerable = render(AmountField, {
      props: { amount: 250, unit: "ml", panelUnit: "ml" },
    });
    expect(unitCells(unanswerable.body)).toEqual([]);

    const classified = render(AmountField, {
      props: {
        amount: 250,
        unit: "ml",
        panelUnit: "ml",
        density: { class: "juice" },
      },
    });
    expect(unitCells(classified.body)).toHaveLength(2);
  });
});

describe("the amount is in the unit the host handed down", () => {
  it("shows grams, and the number as typed rather than as converted", () => {
    // The amount travels in its own unit (`CONTEXT.md`, **Amount unit**): 92 is
    // what was entered against an oil published per 100 ml, and it is not
    // silently relabelled or re-divided on the way to the screen. Putting it
    // into the panel's unit is the scaler's job, one layer out.
    const { body } = render(AmountField, {
      props: {
        amount: 92,
        unit: "g",
        panelUnit: "ml",
        density: { class: "oil" },
        onAssertDensity: () => {},
      },
    });
    expect(checkedUnit(body)).toEqual(["g"]);
    expect(body).toContain("Amount (grams)");
    expect(numberIn(body)).toBe("92");
  });

  it("shows millilitres where the host's context opened it there", () => {
    // Nobody weighs a can of Coke; they drink it. Both units stay available —
    // what the context decides is only which one the field opens on.
    const { body } = render(AmountField, {
      props: {
        amount: 330,
        unit: "ml",
        panelUnit: "ml",
        density: { class: "juice" },
        onAssertDensity: () => {},
      },
    });
    expect(checkedUnit(body)).toEqual(["ml"]);
    expect(numberIn(body)).toBe("330");
  });

  it("names the unit once, in the label, the suffix and the aria-label", () => {
    // Three places spell the unit and they read it from one derived, so the
    // control can never claim to take two different things at once.
    const { body } = render(AmountField, {
      props: {
        amount: 100,
        unit: "g",
        panelUnit: "ml",
        density: { g_per_ml: 1.2 },
        onAssertDensity: () => {},
      },
    });
    expect(body).toContain("Amount (grams)");
    expect(body).toContain("Amount in grams");
    expect(body).toMatch(/<span class="unit[^"]*">g<\/span>/);
  });
});
