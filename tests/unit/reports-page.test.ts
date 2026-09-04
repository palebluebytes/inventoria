import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import ReportsPage from "../../src/lib/views/food/ReportsPage.svelte";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

/**
 * The page the three readings are drawn on (#346, ADR-0091 §6).
 *
 * Rendered rather than read as source, because what is at risk here is what the
 * page *says*: `reports.test.ts` already holds every decision the folds make,
 * and the thing left to get wrong is a bar drawn against the wrong scale or an
 * absence printed as a number. The page takes its events and its clock as props
 * precisely so this tier can ask it — no store, no worker, no width.
 *
 * Only the default period is reachable here. A tab switch and the range picker
 * are browser behaviour and belong to the end-to-end tier; what is asserted is
 * that all four periods offer a control, and that the weekly panel is the one
 * holding a report.
 */

const TODAY = new Date(2026, 8, 4, 12, 0);

/** A logged food on `day`, with the flat macros the projection surfaces. */
function ate(
  time: Date,
  frozen: Partial<
    Pick<ConsumptionEvent, "calories" | "protein" | "fat" | "carbs">
  >,
  foodName?: string
): ConsumptionEvent {
  return {
    id: `event:consume_${time.getTime()}_${foodName ?? ""}`,
    time: time.getTime(),
    ...frozen,
    foodName,
  };
}

const drawn = (events: ConsumptionEvent[]) =>
  render(ReportsPage, { props: { events, today: TODAY } }).body;

describe("the reports page", () => {
  it("offers every period and starts on the week", () => {
    const html = drawn([]);
    for (const label of ["Weekly", "Monthly", "Yearly", "Custom"]) {
      expect(html).toContain(label);
    }
    // The shortest window that has a shape, and the question somebody opening
    // this screen most often has.
    expect(html).toMatch(/data-state="active" data-value="weekly"/);
    expect(html).not.toMatch(
      /data-state="active" data-value="(monthly|yearly|custom)"/
    );
  });

  it("holds nothing in the three panels you are not on", () => {
    // The tab still owns a panel, which is what wires the control to the region
    // it switches — but a hidden panel that had folded the ledger three more
    // times over would be three readings nobody asked for.
    const html = drawn([
      ate(new Date(2026, 8, 3, 8, 0), { calories: 500 }, "Porridge"),
    ]);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(4);
    expect(html.match(/Energy by day/g)).toHaveLength(1);
  });

  it("says there is nothing rather than drawing three empty readings", () => {
    const html = drawn([]);
    expect(html).toContain("No food logged in this period");
    expect(html).not.toContain("Energy by day");
  });

  it("draws all three readings once there is food in the period", () => {
    const html = drawn([
      ate(
        new Date(2026, 8, 2, 8, 0),
        { calories: 500, protein: 20, fat: 10, carbs: 60 },
        "Porridge"
      ),
      ate(
        new Date(2026, 8, 3, 8, 0),
        { calories: 700, protein: 30, fat: 20, carbs: 70 },
        "Porridge"
      ),
    ]);
    expect(html).toContain("Energy by day");
    expect(html).toContain("Where the energy came from");
    expect(html).toContain("What you eat most");
  });

  it("scales each day's bar against the tallest day, not against a target", () => {
    const html = drawn([
      ate(new Date(2026, 8, 2, 8, 0), { calories: 500 }, "Porridge"),
      ate(new Date(2026, 8, 4, 8, 0), { calories: 1000 }, "Porridge"),
    ]);
    // The tallest day runs full and the half day runs half. A report has no
    // target to measure against — that is the day screen's question — so the
    // period's own peak is the only honest scale.
    expect(html).toContain('aria-valuetext="Today, 1000 kcal"');
    expect(html).toContain('aria-valuetext="Wednesday, 500 kcal"');
    expect(html).toMatch(/width:\s*50%/);
    expect(html).toMatch(/width:\s*100%/);
  });

  it("gives a day with food but no energy a track rather than a bar", () => {
    // ADR-0048 reaching the pixel: `Meter` with no fill draws a striped,
    // role-less track, which reads as "tracked, nothing measured" instead of as
    // a day somebody ate nothing on.
    const html = drawn([ate(new Date(2026, 8, 3, 8, 0), {}, "Porridge")]);
    expect(html).toContain('data-meter-state="empty"');
    expect(html).not.toContain('aria-valuetext="Yesterday, 0 kcal"');
  });

  it("prices the macros at 4/9/4 and says the share out loud", () => {
    const html = drawn([
      ate(
        new Date(2026, 8, 3, 8, 0),
        { calories: 1700, protein: 100, fat: 100, carbs: 100 },
        "Porridge"
      ),
    ]);
    // 400 / 900 / 400 kcal of 1700: fat is the larger half of the plate even
    // though all three weigh the same.
    expect(html).toContain('aria-valuetext="Protein, 24% of energy, 100 g"');
    expect(html).toContain('aria-valuetext="Fat, 53% of energy, 100 g"');
    expect(html).toContain('aria-valuetext="Carbs, 24% of energy, 100 g"');
  });

  it("counts a food by name however it was reached", () => {
    const html = drawn([
      ate(new Date(2026, 8, 2, 8, 0), { calories: 100 }, "Porridge"),
      ate(new Date(2026, 8, 3, 8, 0), { calories: 100 }, "Porridge"),
      ate(new Date(2026, 8, 3, 12, 0), { calories: 100 }, "Toast"),
    ]);
    expect(html).toContain('aria-valuetext="Porridge, logged 2 times"');
    // Singular, because a reading that says "1 times" is a reading nobody
    // proof-read.
    expect(html).toContain('aria-valuetext="Toast, logged 1 time"');
  });

  it("leaves out food logged outside the period", () => {
    // The rolling week ends today and opens six days before it, so a meal from
    // three weeks ago is not in this report at all.
    const html = drawn([
      ate(new Date(2026, 7, 14, 8, 0), { calories: 900 }, "Cassoulet"),
    ]);
    expect(html).toContain("No food logged in this period");
    expect(html).not.toContain("Cassoulet");
  });
});
