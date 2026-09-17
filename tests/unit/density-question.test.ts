/**
 * The class question itself (ADR-0108 §1), which two screens ask: the amount
 * field mid-entry, and the hand-capture form as one field among many.
 *
 * `render` reaches the row, the words on it, and what the exit reveals. What it
 * cannot reach is a tap, so the rule that a pre-filled cell still needs a
 * confirm — a RadioGroup fires nothing when you tap the cell already checked —
 * is CI's (`tests/food-ui.spec.ts`).
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import DensityQuestion from "../../src/lib/views/food/DensityQuestion.svelte";
import { DENSITY_CLASSES } from "../../src/lib/food/density-class";

const cells = (body: string) => [
  ...body.matchAll(/<button[^>]*data-value="([\w-]+)"[^>]*>/g),
];

describe("the question offers every class and a way past them", () => {
  it("draws one cell per shipped class, plus the exit", () => {
    const { body } = render(DensityQuestion, { props: { onAnswer: () => {} } });
    expect(cells(body).map((m) => m[1])).toEqual([
      ...DENSITY_CLASSES.map((c) => c.id),
      "other",
    ]);
  });

  it("names the thing and never the number", () => {
    // You pick by recognising your bottle. Showing `0.92 g/ml` beside it would
    // ask you to validate a figure you have no way to check, which is the trade
    // ADR-0108 §12 refuses for a model's per-food density.
    const { body } = render(DensityQuestion, { props: { onAnswer: () => {} } });
    // The cells' own words, not the whole document: a bits-ui id carries digits
    // and `1` is a real class figure, so the loose reading convicts the markup
    // rather than the copy.
    const words = [...body.matchAll(/<!---->([^<]+)<!---->/g)].map((m) => m[1]);
    expect(words).toContain("Oil — olive, sunflower, rapeseed");
    for (const word of words) {
      for (const cls of DENSITY_CLASSES) {
        expect(word).not.toContain(String(cls.figure));
      }
      expect(word).not.toMatch(/g\/ml/i);
    }
  });

  it("opens with nothing chosen where the source named no single class", () => {
    // The standing case: 41% of millilitre products the classes do not name,
    // plus the 24% carrying no usable tags at all.
    const { body } = render(DensityQuestion, { props: { onAnswer: () => {} } });
    expect(
      cells(body).filter((m) => m[0].includes('data-state="checked"'))
    ).toEqual([]);
  });

  it("opens on the source's proposal where it named exactly one", () => {
    const { body } = render(DensityQuestion, {
      props: { prefill: "oil", onAnswer: () => {} },
    });
    const oil = cells(body).find((m) => m[1] === "oil")?.[0] ?? "";
    expect(oil).toContain('data-state="checked"');
  });

  it("keeps the typed exit's field out of the way until it is chosen", () => {
    // Five short options is a row of cells; a number field beside them would be
    // asking for a figure before anybody has said the classes do not fit.
    const closed = render(DensityQuestion, { props: { onAnswer: () => {} } });
    expect(closed.body).not.toContain('data-testid="density-figure"');

    const open = render(DensityQuestion, {
      props: { prefill: "other" as never, onAnswer: () => {} },
    });
    expect(open.body).toContain('data-testid="density-figure"');
    expect(open.body).toContain("Grams per millilitre");
  });
});
