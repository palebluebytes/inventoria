import { describe, it, expect } from "vitest";
import { styleOf, rulesOf, decl, type Rule } from "./support/stylesheet";

/**
 * A sheet's geometry, read out of its `<style>` block (ADR-0089 §5, §8).
 *
 * These are source-level assertions on purpose. What the record decides is a
 * *height model* — which properties a pinned box is allowed to name — and that
 * is a property of the CSS itself, not of any one rendered pixel height. The
 * pixels are proved separately, by the `visualViewport` fake of §9 (#333),
 * which can move the band; nothing in the unit tier can.
 *
 * `styleOf` strips comments before every match, so a sentence naming `85vh` or
 * `bottom` cannot satisfy or break a rule here.
 */

const SHEET = styleOf("src/lib/ui/BottomSheet.svelte");
const RULES = rulesOf(SHEET);

/** The one rule whose selector list contains exactly this selector. */
function rule(selector: string, at: string | null = null): Rule {
  const found = RULES.filter(
    (r) => r.at === at && r.selectors.includes(selector)
  );
  expect(found).toHaveLength(1);
  return found[0];
}

/**
 * `at === null` is "in no at-rule" — a declaration that applies at every width,
 * which is where the phone's shape is written. The record is mobile-first: the
 * base rule *is* the phone, and the breakpoint is the override.
 */
const EVERY_WIDTH = null;
const WIDE = "@media (min-width: 768px)";

describe("a sheet's box is the visible band", () => {
  it("anchors an ordinary sheet to the band's bottom edge, capped at its height", () => {
    const base = rule(".bottom-sheet-content", EVERY_WIDTH);
    expect(decl(base, "position")).toBe("fixed");
    expect(decl(base, "bottom")).toBe("var(--vv-bottom)");
    expect(decl(base, "max-height")).toBe("var(--vv-h)");
  });

  it("leaves an ordinary sheet's height to its content — only the cap is the band's", () => {
    // Load-bearing beyond the record. `tests/visual-catalog.spec.ts` un-pins
    // `.add-habit-sheet` for its full-page capture and lifts `max-height`; it
    // used to lift `height` too, which was dead CSS precisely because this rule
    // sets none, and #333 removed it. A `height` appearing here would make that
    // shot silently insensitive to the height model again.
    expect(
      decl(rule(".bottom-sheet-content", EVERY_WIDTH), "height")
    ).toBeUndefined();
  });

  it("names no viewport unit on a phone — every one is inert under a keyboard", () => {
    const phone = RULES.filter((r) => r.at === EVERY_WIDTH);
    const units = phone.flatMap((r) =>
      [...r.body.matchAll(/\d+(?:\.\d+)?(vh|svh|dvh|lvh)\b/g)].map(
        (m) => `${r.selectors.join(", ")}: ${m[0]}`
      )
    );
    expect(units).toEqual([]);
  });

  it("writes the band bare, with no fallback of its own (§3)", () => {
    expect(SHEET).toMatch(/var\(--vv-/);
    expect(SHEET).not.toMatch(/var\(\s*--vv-[a-z]+\s*,/);
  });
});

describe("a sheet holding a text field is full height on a phone", () => {
  it("pins the top edge and the height of both field-bearing shapes", () => {
    const full = rule(".bottom-sheet-content.flush", EVERY_WIDTH);
    expect(full.selectors).toContain(".bottom-sheet-content.fill");
    expect(decl(full, "top")).toBe("var(--vv-top)");
    expect(decl(full, "height")).toBe("var(--vv-h)");
  });

  it("lifts the inherited cap, so the height is the height", () => {
    expect(
      decl(rule(".bottom-sheet-content.flush", EVERY_WIDTH), "max-height")
    ).toBe("none");
  });

  it("never stretches between two edges: `top` + `height`, never `top` + `bottom`", () => {
    // `bottom` here would make the box depend on the layout viewport's height
    // as well as the band's, so any error in that number reappears as a gap.
    expect(
      decl(rule(".bottom-sheet-content.flush", EVERY_WIDTH), "bottom")
    ).toBeUndefined();
  });

  it("gives the peek back above 768px — one design that widens", () => {
    const wide = rule(".bottom-sheet-content.flush", WIDE);
    expect(wide.selectors).toContain(".bottom-sheet-content.fill");
    expect(decl(wide, "top")).toBe("auto");
    expect(decl(wide, "height")).toBe("85vh");
    expect(decl(wide, "max-height")).toBe("85vh");
  });
});

describe("a sheet's scroll region does not chain into the page (§8)", () => {
  it("contains the default body's overscroll", () => {
    expect(
      decl(rule(".bottom-sheet-body", EVERY_WIDTH), "overscroll-behavior")
    ).toBe("contain");
  });

  it("contains it in the flush body's owner too, which scrolls in its place", () => {
    const stager = rulesOf(styleOf("src/lib/views/food/FoodStager.svelte"));
    const stage = stager.filter(
      (r) => r.at === EVERY_WIDTH && r.selectors.includes(".stage")
    );
    expect(stage).toHaveLength(1);
    expect(decl(stage[0], "overflow-y")).toBe("auto");
    expect(decl(stage[0], "overscroll-behavior")).toBe("contain");
  });
});
