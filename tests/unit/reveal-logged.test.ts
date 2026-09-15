/**
 * The three rules a newly logged row is revealed by (#440), as a table.
 *
 * `revealScroll` is arithmetic over three boxes, so every case here is three
 * spans and an expected delta. The band is written as 100..600 throughout — a
 * 700px scrollport with a 100px bar over its foot — so that a reader can check
 * any row of the table by eye.
 */
import { describe, it, expect } from "vitest";
import { revealScroll, type Span } from "../../src/lib/food/reveal-logged";

/** The free band: a scrollport from 0 to 700 with a bar standing on its foot. */
const BAND: Span = { top: 100, bottom: 600 };
const span = (top: number, height: number): Span => ({
  top,
  bottom: top + height,
});

describe("rule 1: a row already on screen does not move the page", () => {
  it("returns null, which is not a scroll of zero", () => {
    // The distinction is the caller's to act on: a smooth scroll of 0 still says
    // "something moved" to anyone watching.
    expect(revealScroll(span(300, 60), span(250, 200), BAND)).toBeNull();
  });

  it("counts the band's own edges as on screen", () => {
    expect(revealScroll(BAND, span(100, 500), BAND)).toBeNull();
  });

  it("treats a row half under the pinned bar as not visible", () => {
    // The whole reason the band is not the scrollport. This row's top is on
    // screen and its bottom is under the bar, and rule 1 must not claim it.
    expect(revealScroll(span(570, 60), span(560, 80), BAND)).not.toBeNull();
  });

  it("treats a row half above the band's top as not visible either", () => {
    expect(revealScroll(span(70, 60), span(60, 80), BAND)).not.toBeNull();
  });
});

describe("rule 2: the meal goes to the top where the meal fits", () => {
  it("scrolls by the meal's distance from the top of the band", () => {
    // Meal at 900, band top at 100: 800 down the page, and the row rides along.
    const meal = span(900, 300);
    expect(revealScroll(span(1140, 60), meal, BAND)).toBe(800);
  });

  it("holds at exactly the band's height", () => {
    // The row's bottom measured from the meal's top is 500, the band is 500.
    const meal = span(900, 500);
    expect(revealScroll(span(1340, 60), meal, BAND)).toBe(800);
  });

  it("scrolls the page UP for a meal above the band", () => {
    // Nothing about the rules is downward-only: a meal you have scrolled past
    // comes back the same way it left.
    const meal = span(-200, 300);
    expect(revealScroll(span(-150, 60), meal, BAND)).toBe(-300);
  });

  it("puts the row inside the band wherever in its meal the row sits", () => {
    // The guarantee rule 2 rests on: a row is inside its own meal, so a meal
    // whose foot fits cannot leave one of its rows above the band's top.
    const meal = span(900, 480);
    const row = span(900, 60); // the meal's first row
    const delta = revealScroll(row, meal, BAND)!;
    expect(row.top - delta).toBeGreaterThanOrEqual(BAND.top);
    expect(row.bottom - delta).toBeLessThanOrEqual(BAND.bottom);
  });
});

describe("rule 3: otherwise the row goes to the foot of the band", () => {
  it("scrolls by the row's distance past the band's bottom", () => {
    // A meal too tall for the band — 600 against 500 — so its heading cannot
    // come to the top without taking this row off the bottom.
    const meal = span(900, 600);
    expect(revealScroll(span(1440, 60), meal, BAND)).toBe(900);
  });

  it("is one pixel of travel at the boundary, not a jump to the meal", () => {
    // The case that separates the two rules: the row sits just under the bar.
    // Rule 2 would travel the height of the page to fix a pixel.
    const meal = span(0, 2000);
    expect(revealScroll(span(541, 60), meal, BAND)).toBe(1);
  });

  it("cuts the top off a row taller than the band, not the bottom", () => {
    // As asked for: a logged row ends with its own figures.
    const tall = span(700, 800);
    const delta = revealScroll(tall, span(700, 800), BAND)!;
    expect(tall.bottom - delta).toBe(BAND.bottom);
  });
});
