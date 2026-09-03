import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import { decl, ruleOf, rulesOf, styleOf } from "./support/stylesheet";
import { readCode, readSource } from "./support/source";
import { BREAKPOINTS } from "../../src/lib/ui/breakpoints";
import MonthCalendar from "../../src/lib/views/food/MonthCalendar.svelte";
import { loggedDayKeys } from "../../src/lib/food/logged-days";
import type { ConsumptionEvent } from "../../src/lib/food/consumption-state";

/**
 * The rail leads with a month, and the week strip is the phone's (#344,
 * ADR-0091 §1 and §2).
 *
 * Two tiers, because the claims are of two kinds. Which of the two date
 * controls a width gets is a property of the **stylesheet** — this work's whole
 * risk is that both end up on screen at once, which a baseline taken at one
 * width cannot see and a baseline taken at the other cannot either — so those
 * are read as data, the way `shell.test.ts` reads the shell. What the grid
 * actually says about a day is a property of the **markup**, so those are
 * rendered.
 *
 * `styleOf` strips comments first, so the sentences above the rules cannot
 * satisfy or break one.
 */

const DAY = "src/lib/views/food/DailyDashboard.svelte";
const MONTH = "src/lib/views/food/MonthCalendar.svelte";
const SHELL = `@media (min-width: ${BREAKPOINTS.shell}px)`;

describe("one date control per screen, and the width picks it", () => {
  it("does not draw the month below the shell breakpoint", () => {
    // Mobile-first: the absence is the base rule, so a phone — and the root's
    // Food tab at every width — never renders it.
    expect(decl(ruleOf(DAY, ".day-month"), "display")).toBe("none");
  });

  it("takes the strip and the banner away where the month appears", () => {
    // The pair that matters. A month calendar is the week strip presented
    // differently (ADR-0091 §1), not a part added beside it — so the same query
    // that reveals one has to take the other away, and it has to take the
    // `.dashboard-header` banner with it, because the month names the day in
    // ink where the banner restated it across the whole column.
    const gone = ruleOf(DAY, ":global(.rations) .day > .day-strip", SHELL);
    expect(decl(gone, "display")).toBe("none");
    expect(gone.selectors).toContain(
      ":global(.rations) .day > .dashboard-header"
    );

    const month = ruleOf(DAY, ":global(.rations) .day > .day-month", SHELL);
    expect(decl(month, "display")).toBe("block");
    // The same rule that reveals it places it, so a revealed month can never be
    // a block auto-placed into the timeline's column.
    expect(decl(month, "grid-area")).toBe("month");
  });

  it("leaves the phone's two controls untouched below that width", () => {
    // Named positively, so the test above cannot pass by deleting the strip
    // outright. Neither box has an unconditional `display` of its own.
    const unconditional = rulesOf(styleOf(DAY)).filter((r) => r.at === null);
    const strip = unconditional.filter((r) =>
      r.selectors.includes(".day-strip")
    );
    expect(strip.flatMap((r) => decl(r, "display") ?? [])).toEqual([]);
    expect(decl(ruleOf(DAY, ".dashboard-header"), "display")).toBeUndefined();
  });
});

describe("the rail is a month over the day's numbers", () => {
  it("runs the timeline down the side of both rail blocks", () => {
    const day = ruleOf(DAY, ":global(.rations) .day", SHELL);
    const areas = decl(day, "grid-template-areas")?.replace(/\s+/g, " ");
    // The month leads: it is the thing the reader steers with, and the numbers
    // are what the day it chose turned out to be.
    expect(areas).toBe('"meals month" "meals numbers"');
  });

  it("still does not pin either of them", () => {
    // ADR-0091 §4, and the month is the block that would tempt someone to: it
    // is the rail's fixed-height half. `shell.test.ts` holds the same line for
    // the rail as a whole; this one holds it for the block that arrived after
    // that test was written.
    const wide = rulesOf(styleOf(DAY)).filter((r) => r.at === SHELL);
    expect(wide.map((r) => decl(r, "position")).filter(Boolean)).toEqual([]);
    const month = rulesOf(styleOf(MONTH));
    expect(month.map((r) => decl(r, "position")).filter(Boolean)).toEqual([]);
  });
});

describe("the marks the month is worth its column for", () => {
  it("draws the logged mark as a bar, with its own named geometry", () => {
    // A bar and not a dot: `--radius` is 0, so a dot would draw as a square and
    // read as a second selected day. The two numbers are named on the component
    // the way `HabitHeatmap` names `--cell` and `--seam` — a drawing the space
    // scale has no step for (CODING_STANDARDS §7).
    const mark = ruleOf(MONTH, ".month-mark");
    expect(decl(mark, "height")).toBe("var(--mark-h)");
    expect(decl(mark, "width")).toBe("var(--mark-w)");
    expect(decl(mark, "border-radius")).toBeUndefined();
    expect(decl(ruleOf(MONTH, ".month"), "--mark-h")).toMatch(/^\d+px$/);

    // The box is permanent and only its ink is conditional, so a month whose
    // marks move does not move the rows they sit in.
    expect(decl(mark, "background")).toBe("none");
    expect(decl(ruleOf(MONTH, ".month-mark.is-logged"), "background")).toBe(
      "currentColor"
    );
  });

  it("says today and selected in two different channels", () => {
    // Both can be true at once, and each answers a different question: what day
    // it is does not move, which day you are looking at does. One rule fills the
    // cell, the other draws inside it, so neither can hide the other.
    const selected = ruleOf(MONTH, ".month-day[data-selected]");
    const today = ruleOf(MONTH, ".month-day[data-today]");
    expect(decl(selected, "background")).toBe("var(--ink)");
    expect(decl(selected, "color")).toBe("var(--paper)");
    expect(decl(today, "background")).toBeUndefined();
    // `currentColor`, so today's edge survives the selected day's invert.
    expect(decl(today, "box-shadow")).toContain("currentColor");
  });
});

/**
 * The component with everything it *says* removed, leaving only what it does.
 *
 * The rules below are about marks nobody should type, and the comments beside
 * those rules have to name the marks to explain themselves. Read raw, this file
 * would fail on its own prose (#303 found the same trap).
 */
const monthCode = readCode(MONTH);

describe("the month's chrome is drawn, not typed", () => {
  it("substitutes no glyph for an arrow", () => {
    // ◀ and ▶ (U+25C0/U+25B6) fall outside every unicode-range Epilogue is
    // served in, so the browser would draw a face of its own for exactly those
    // two marks beside an Epilogue month name — #317 in miniature. The week
    // strip's ← and → are here too: whichever a hand reached for, the answer is
    // that this component types no arrow at all.
    expect(monthCode).not.toMatch(/[◀▶←→▸▾]/);
  });

  it("is one shape at two rotations, and the shape the app already draws", () => {
    const path = (file: string) =>
      readSource(file).match(/ d="(M7 6[^"]*)"/)?.[1];
    // The same triangle the Nutrition disclosure draws, so the app has one
    // solid caret rather than two that can drift.
    expect(path(MONTH)).toBeDefined();
    expect(path(MONTH)).toBe(path(DAY));
    // Drawn once and turned, so the pair cannot drift apart either.
    expect(monthCode.match(/M7 6 L17 12 L7 18 Z/g)).toHaveLength(2);
    expect(decl(ruleOf(MONTH, ".month-arrow.back"), "transform")).toBe(
      "rotate(180deg)"
    );
  });

  it("declares no width of its own", () => {
    // The month exists only inside the rail, which is the shell's shape. A
    // media query here would be a second place deciding the same thing.
    expect(monthCode).not.toMatch(/@media[^{]*width/);
  });
});

describe("the day loop holds no derived of its own", () => {
  it("uses no `{@const}` anywhere in the grid", () => {
    // `{@const}` compiles to a derived owned by its block's effect, and bits-ui
    // rebuilds the grid's rows on a month change — which reads that derived
    // after its owner is gone and trips `derived_inert`. The two questions a
    // cell asks are function calls instead.
    expect(monthCode).not.toContain("{@const");
  });
});

describe("the month a reader is actually handed", () => {
  // A day in the middle of a month with a full week either side of it, so the
  // grid's six fixed weeks spill into August and October and the marks have
  // somewhere to land outside the month being named.
  const SEPT_3 = new Date(2026, 8, 3);
  const ate = (date: Date): ConsumptionEvent => ({
    id: `event:consume_${date.getTime()}`,
    time: date.getTime(),
  });

  const month = (selectedDate: Date, events: ConsumptionEvent[] = []) =>
    render(MonthCalendar, {
      props: { selectedDate, loggedDays: loggedDayKeys(events) },
    }).body;

  it("names the month of the day it was handed", () => {
    // The banner this replaces said "Thursday, Sep 3" across the whole column.
    expect(month(SEPT_3)).toContain("September 2026");
  });

  it("opens on the selected day, and on exactly one", () => {
    // Matched on the day rather than on `data-selected` alone: bits-ui marks the
    // `<td>` and the day inside it, so the bare attribute is there twice per
    // selected day and a count of it would pass a grid that had selected two.
    const body = month(SEPT_3);
    expect(
      body.match(/<div[^>]*data-selected[^>]*class="month-day/g)
    ).toHaveLength(1);
    // The app's own reading of a day, not bits-ui's "Thursday, September 3,
    // 2026" — the same shape the week strip gives a day button.
    expect(body).toContain('aria-label="Thursday, September 3"');
  });

  it("lets one day be today and the day being looked at, at once", () => {
    // Two marks, not one (ADR-0091's rail is a wayfinding surface): what day it
    // is does not move and which day you are looking at does, so the cell that
    // is both has to be able to say both.
    const body = month(new Date());
    expect(
      body.match(/<div[^>]*data-today[^>]*data-selected[^>]*class="month-day/g)
    ).toHaveLength(1);
  });

  it("starts the week on Monday, the way the strip does", () => {
    // One app, one convention: a month whose columns disagreed with the strip's
    // seven would be a second answer to a question the strip already answers.
    const head = month(SEPT_3).match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
    expect(
      head
        .replace(/<[^>]*>/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    ).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
  });

  it("marks the days that have food on them, and only those", () => {
    // Two meals on the 1st and one on the 7th: two marked days, not three.
    const body = month(SEPT_3, [
      ate(new Date(2026, 8, 1, 8, 15)),
      ate(new Date(2026, 8, 1, 19, 40)),
      ate(new Date(2026, 8, 7, 12, 0)),
    ]);
    expect(body.match(/is-logged/g)).toHaveLength(2);
    expect(body).toContain('aria-label="Tuesday, September 1, food logged"');
    expect(body).toContain('aria-label="Monday, September 7, food logged"');
    // The bar's box is drawn on every day; only its ink is conditional.
    expect(body.match(/class="month-mark/g)).toHaveLength(42);
  });

  it("marks a day the six weeks reach into from the month either side", () => {
    // 2026-08-31 is a Monday, so it leads September's grid. Dimming it is
    // right; hiding its bar would have the calendar say there was nothing there.
    const body = month(SEPT_3, [ate(new Date(2026, 7, 31, 18, 0))]);
    expect(body).toContain('aria-label="Monday, August 31, food logged"');
    expect(body.match(/is-logged/g)).toHaveLength(1);
  });

  it("says nothing about a day with nothing on it", () => {
    const body = month(SEPT_3, [ate(new Date(2026, 8, 1, 8, 15))]);
    expect(body).toContain('aria-label="Wednesday, September 2"');
    expect(body).not.toContain("September 2, food logged");
  });

  it("draws six weeks whatever the month is", () => {
    // A rail block that changed height as the reader paged through months would
    // move the Nutrition block under it on every click.
    for (const first of [new Date(2026, 1, 3), new Date(2026, 7, 3)]) {
      expect(month(first).match(/class="month-day/g)).toHaveLength(42);
    }
  });
});
