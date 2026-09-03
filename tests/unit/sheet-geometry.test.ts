import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  styleOf,
  rulesOf,
  decl,
  ruleOf,
  bandFallbacksIn,
  viewportUnitsIn,
} from "./support/stylesheet";

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

const SHEET_FILE = "src/lib/ui/BottomSheet.svelte";
const SHEET = styleOf(SHEET_FILE);
const RULES = rulesOf(SHEET);

/** The one rule in the sheet whose selector list contains exactly this one. */
const rule = (selector: string, at: string | null = null) =>
  ruleOf(SHEET_FILE, selector, at);

/**
 * `at === null` is "in no at-rule" — a declaration that applies at every width,
 * which is where the phone's shape is written. The record is mobile-first: the
 * base rule *is* the phone, and the breakpoint is the override.
 */
const EVERY_WIDTH = null;
const WIDE = "@media (min-width: 768px)";

/** §6's one centring expression, written where the sheet writes it. */
const centredWide = ".bottom-sheet-content.centred";

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
    // Only the phone's rules: above 768px the peek returns and `85vh` is the
    // shape, so a blanket sweep here would fail on the design rather than on a
    // defect.
    expect(viewportUnitsIn(RULES.filter((r) => r.at === EVERY_WIDTH))).toEqual(
      []
    );
  });

  it("writes the band bare, with no fallback of its own (§3)", () => {
    expect(SHEET).toMatch(/var\(--vv-/);
    expect(bandFallbacksIn(SHEET)).toEqual([]);
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

/**
 * §6: on a phone there is one overlay shape, and it is the sheet.
 *
 * The seven hand-rolled cards (#329) folded onto this primitive, so "centred"
 * is now one expression **inside** it, behind the breakpoint, rather than seven
 * copies of `translate(-50%, -50%)` outside it. The first two assertions read
 * the expression; the sweep below is what keeps an eighth copy from appearing.
 */
describe("a centred card is this primitive above 768px (§6)", () => {
  it("is nothing at all on a phone — a centred sheet is a sheet", () => {
    // The class exists only under the breakpoint. A rule for it at every width
    // would be a second shape on the platform §6 gives one shape.
    expect(
      RULES.filter(
        (r) => r.at === EVERY_WIDTH && r.selectors.includes(centredWide)
      )
    ).toEqual([]);
  });

  it("moves the box above 768px and sizes the card to its content", () => {
    const wide = rule(centredWide, WIDE);
    expect(decl(wide, "top")).toBe("50%");
    expect(decl(wide, "bottom")).toBe("auto");
    expect(decl(wide, "transform")).toBe("translate(-50%, -50%)");
    // It takes the height back from `flush`/`fill`, whose full-height claim is
    // about a phone's keyboard (§5) and not about a wide screen: a card sizes
    // to its content, capped so it keeps a margin of backdrop the way the peek
    // does. All seven of the folded cards capped themselves; none pinned.
    expect(decl(wide, "height")).toBe("auto");
    expect(decl(wide, "max-height")).toBe("85vh");
  });

  it("swaps the slide for a pop, without overriding an opt-out", () => {
    // `.no-anim` sets `animation: none` at every width and is written above the
    // breakpoint block, so an `animation-name` at equal specificity would win
    // on source order and re-animate a sheet that asked not to be.
    const anim = rule(`${centredWide}:not(.no-anim)`, WIDE);
    expect(decl(anim, "animation-name")).toBe("popIn");
    expect(decl(rule(centredWide, WIDE), "animation-name")).toBeUndefined();
  });

  it("closes the frame a bottom-anchored sheet leaves open", () => {
    // The base sheet drops its bottom border and paints an ink bar above its
    // top edge, because its bottom edge is off-screen. A centred card has four
    // edges on screen and needs all four drawn.
    const wide = rule(centredWide, WIDE);
    expect(decl(wide, "border-bottom")).toBe("var(--edge-thick)");
    expect(decl(wide, "box-shadow")).toBe("var(--shadow-3)");
  });
});

/**
 * Every `position: fixed` box outside the primitive, and why each is not a
 * card. #329 folded the seven; these two stay, and the ticket asked for the
 * second to be decided out loud rather than left silently behind:
 *
 *   `SelectionBar` is a bar, not an overlay — ADR-0089 §1's consumer with no
 *   dialog around it at all, pinned to the band's bottom edge (#331);
 *
 *   `LabelPhotoReader` is `inset: 0` full-bleed and was never a centred card.
 *   It holds no field, so no keyboard can open under it, and the shape a
 *   full-height sheet resolves to on a phone is the shape it already has. What
 *   folding would change is only the wide screen, where a photo reader wants
 *   the screen rather than a 600px card. Out of scope, on purpose.
 */
const PINNED_OUTSIDE_THE_PRIMITIVE = [
  "src/lib/views/food/LabelPhotoReader.svelte",
  "src/lib/views/food/SelectionBar.svelte",
];

describe("no surface hand-rolls a centred card (§6)", () => {
  const svelteFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? svelteFiles(join(dir, e.name))
        : e.name.endsWith(".svelte")
          ? [join(dir, e.name)]
          : []
    );

  /** Files whose `<style>` block pins a box to the viewport, and how. A
   *  component with no `<style>` block at all styles nothing and so pins
   *  nothing; `styleOf` throws on one rather than returning "". */
  const pinned = svelteFiles("src/lib")
    .filter((file) => readFileSync(file, "utf8").includes("<style>"))
    .map((file) => ({
      file,
      rules: rulesOf(styleOf(file)).filter(
        (r) => decl(r, "position") === "fixed"
      ),
    }))
    .filter((f) => f.rules.length > 0);

  it("leaves the centring expression in one file", () => {
    const centring = pinned.flatMap(({ file, rules }) =>
      rules
        .filter((r) => /translate\(\s*-50%,\s*-50%\s*\)/.test(r.body))
        .map((r) => `${file}: ${r.selectors.join(", ")}`)
    );
    expect(centring).toEqual([]);

    // ...and that file is the primitive, under the breakpoint, where §6 puts
    // it. Asserted here rather than trusted, so an empty sweep can never be an
    // empty sweep because the expression went missing too.
    expect(decl(rule(centredWide, WIDE), "transform")).toBe(
      "translate(-50%, -50%)"
    );
  });

  it("names every pinned surface that is not the primitive", () => {
    const outside = pinned
      .map((f) => f.file)
      .filter((f) => !f.startsWith("src/lib/ui/"))
      .sort();
    expect(outside).toEqual(PINNED_OUTSIDE_THE_PRIMITIVE);
  });
});
