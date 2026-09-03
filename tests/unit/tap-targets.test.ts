/**
 * The nav's six items, the food dock's controls and the amount field's operator
 * keys, measured against `--tap-min` (#332 §4, ADR-0089 §3).
 *
 * A measurement, not a guard: #332 is explicit that anything falling short here
 * gets a ticket rather than a fix inside it. What makes this worth writing down
 * rather than pasting into a comment is that every figure below is **derived**
 * from the declarations the control actually carries — its padding token, its
 * edge token, its type step, its line-height — so a later change to any of them
 * invalidates the recorded number instead of quietly outliving it.
 *
 * The model, stated so it can be argued with:
 *
 *   height = 2 × edge + 2 × vertical padding + every line box + the gaps,
 *
 * with a line box being its font size times its line-height, tokens resolved to
 * their `clamp()` floor — the value at and below the scale's narrowest width,
 * so the tightest a phone ever draws it — and `line-height: 1.5` inherited from
 * `:root` wherever a control declares none.
 *
 * Its one soft spot is that last inheritance, and it errs the safe way. A
 * browser that hands a text input `line-height: normal` instead makes the field
 * *smaller*, never larger, so a shortfall found here is a shortfall in any
 * browser — which is what let #336 be filed off arithmetic, and what makes a
 * declared floor the only fix that holds in every browser.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  appSheet,
  decl,
  ruleOf,
  tokenPx,
  type Rule,
} from "./support/stylesheet";

const APP = readFileSync("src/app.css", "utf8");

/** An `--edge*` token's width, in px. They are full shorthands, ink baked in,
 *  so the width is read off the front rather than through `tokenPx`. */
function edgePx(name: string): number {
  const width = APP.match(new RegExp(`${name}:\\s*([\\d.]+)px solid`));
  if (!width) throw new Error(`${name} is not an edge shorthand in app.css`);
  return Number(width[1]);
}

const TAP_MIN = tokenPx("--tap-min");

/** The document's own line-height, which every control below inherits. */
const ROOT_LINE_HEIGHT = Number(
  appSheet()
    .filter((r) => r.at === null && r.selectors.includes(":root"))
    .map((r) => decl(r, "line-height"))
    .filter(Boolean)
    .pop()
);

/** A length as written — a token, a raw px, or `none` — in px. */
function lengthPx(value: string): number {
  if (value === "none" || value === "0") return 0;
  const token = value.match(/^var\((--[\w-]+)\)$/);
  if (token) {
    return token[1].startsWith("--edge") ? edgePx(token[1]) : tokenPx(token[1]);
  }
  const px = value.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]);
  throw new Error(`cannot measure the length "${value}"`);
}

/** A rule's own vertical padding: the first value of the shorthand. */
const paddingYPx = (rule: Rule) =>
  lengthPx(decl(rule, "padding")!.split(/\s+(?![^(]*\))/)[0]);

/** A rule's own border width, per side. `border: none` is zero. */
const borderPx = (rule: Rule) =>
  lengthPx(decl(rule, "border")?.split(/\s+/)[0] ?? "none");

/** The type step a rule sets, in px. */
const fontSizePx = (rule: Rule) =>
  tokenPx(decl(rule, "font-size")!.match(/--step-[\w-]+/)![0]);

/** The line box a rule draws: its type step times the line-height it carries. */
const lineBoxPx = (rule: Rule) =>
  fontSizePx(rule) * Number(decl(rule, "line-height") ?? ROOT_LINE_HEIGHT);

/**
 * The height a rule builds out of its own declarations, for the single-line
 * shape: two edges, its vertical padding twice, and the one line box its type
 * step draws. The nav item is not this shape — it stacks two line boxes and a
 * gap — so it does its arithmetic inline and this speaks for the rest.
 */
const builtHeightPx = (rule: Rule) =>
  2 * borderPx(rule) + 2 * paddingYPx(rule) + lineBoxPx(rule);

/** What a control declares as its floor, or null where it declares none. */
function declaredFloorPx(rule: Rule): number | null {
  const floor = decl(rule, "min-height");
  return floor === undefined ? null : lengthPx(floor);
}

/** What a control actually stands: the taller of what it draws and its floor. */
function heightPx(rule: Rule): number {
  const drawn = builtHeightPx(rule);
  const floor = declaredFloorPx(rule);
  // Not `?? 0`: a rule with no floor is one whose drawn height is the whole
  // answer, which is a different fact from a floor of zero.
  return floor === null ? drawn : Math.max(drawn, floor);
}

const round = (n: number) => Math.round(n * 10) / 10;

const SIDEBAR = "src/lib/layout/Sidebar.svelte";
const STAGER = "src/lib/views/food/FoodStager.svelte";
const AMOUNT_FIELD = "src/lib/views/food/AmountField.svelte";

describe("the floor itself", () => {
  it("is 48px, and is not fluid", () => {
    // Material's figure, which also clears Apple's 44pt, so one number
    // satisfies both rather than passing one guideline and failing the other.
    expect(TAP_MIN).toBe(48);
    expect(APP).not.toMatch(/--tap-min:\s*clamp/);
  });

  it("is compared against a border-box, which is the reset's and not a guess", () => {
    // The premise under every figure in this file, and the one thing here that
    // no control declares for itself. A height built up as border + padding +
    // line boxes is only the same box as a `min-height` under `border-box`;
    // under `content-box` a floor of 48 draws a 68px field, and the arithmetic
    // below would go on reporting 48. The reset is what makes the two
    // comparable, so it is read rather than assumed.
    const reset = appSheet().filter(
      (r) => r.at === null && r.selectors.includes("*")
    );

    expect(reset.map((r) => decl(r, "box-sizing"))).toContain("border-box");
  });
});

describe("the six nav items", () => {
  const item = ruleOf(SIDEBAR, ".nav-item");
  const icon = ruleOf(SIDEBAR, ".nav-item .icon");

  it("is six, each drawn from the one `.nav-item` box", () => {
    // What lets one measurement stand for all six: the nav is a loop over one
    // list, emitting one class, and every item is `flex: 1`. A seventh tab, or
    // a tab given a box of its own, would make the figure below a claim about
    // only some of them — so the shape of the loop is asserted, not assumed.
    const markup = readFileSync(SIDEBAR, "utf8").replace(
      /<style>[\s\S]*?<\/style>/,
      ""
    );
    const tabs = markup.match(/\{\s*id:\s*"[a-z]+"/g) ?? [];

    expect(tabs).toHaveLength(6);
    expect(markup.match(/class="nav-item/g)).toHaveLength(1);
    expect(decl(item, "flex")).toBe("1");
  });

  it("stands 68.4px tall, comfortably over the floor", () => {
    const label = fontSizePx(item);
    // `1.4em` against the item's own type step, not against the root's.
    const glyph = label * Number(decl(icon, "font-size")!.replace("em", ""));
    const height =
      2 * borderPx(item) +
      2 * paddingYPx(item) +
      glyph * ROOT_LINE_HEIGHT +
      lengthPx(decl(item, "gap")!) +
      label * ROOT_LINE_HEIGHT;

    expect(round(height)).toBe(68.4);
    expect(height).toBeGreaterThanOrEqual(TAP_MIN);
  });

  it("reaches that height without declaring a floor, on padding alone", () => {
    expect(declaredFloorPx(item)).toBeNull();
  });
});

describe("the amount field's four operator keys", () => {
  const key = ruleOf(AMOUNT_FIELD, ".op");

  it("is four, each drawn from the one `.op` box", () => {
    // The same thing the nav's first case establishes, for the same reason: the
    // keys are a loop over one roster emitting one class, so one measurement
    // speaks for all four. A fifth key, or one given a box of its own, would
    // make the figure below a claim about only some of them.
    const markup = readFileSync(AMOUNT_FIELD, "utf8").replace(
      /<style>[\s\S]*?<\/style>/,
      ""
    );
    const roster =
      readFileSync(AMOUNT_FIELD, "utf8").match(
        /glyph: "[^"]+", op: "[^"]+"/g
      ) ?? [];

    expect(roster).toHaveLength(4);
    expect(markup.match(/class="op"/g)).toHaveLength(1);
  });

  it("is floored at `--tap-min` on both axes, which is the whole of its size", () => {
    // A key carries no padding and no text beyond one glyph, so unlike every
    // other control here its box is not built up out of declarations — the two
    // floors ARE its size, and reading them is reading the box. Width matters
    // as much as height because a key is only as wide as a glyph: floor the
    // height alone and it stands 48px tall and 26px across.
    expect(declaredFloorPx(key)).toBe(TAP_MIN);
    expect(lengthPx(decl(key, "min-width")!)).toBe(TAP_MIN);
    expect(decl(key, "width")).toBeUndefined();
  });

  it("cannot be shrunk back under the floor by the row it sits in", () => {
    // The head row wraps rather than compressing its keys, and `flex: none` is
    // what makes that the only option available to it: without it a flex item
    // shrinks before it wraps, and a floor stated in `min-width` would still
    // hold while `width` collapsed around it — but there is no `width` here to
    // hold anything, so shrinking would go straight through the glyph.
    expect(decl(key, "flex")).toBe("none");
    expect(decl(ruleOf(AMOUNT_FIELD, ".af-head"), "flex-wrap")).toBe("wrap");
  });
});

describe("the dock's controls", () => {
  it("gives the method tabs 52px, declared outright", () => {
    const tab = ruleOf(STAGER, ".dock :global(.methods .method)");

    expect(declaredFloorPx(tab)).toBe(52);
    expect(declaredFloorPx(tab)!).toBeGreaterThanOrEqual(TAP_MIN);
  });

  it("gives the commit button 51px, over a floor of `--tap-min` itself", () => {
    const commit = ruleOf("src/lib/views/food/CommitButton.svelte", ".commit");

    expect(declaredFloorPx(commit)).toBe(TAP_MIN);
    expect(round(builtHeightPx(commit))).toBe(51);
    expect(builtHeightPx(commit)).toBeGreaterThanOrEqual(TAP_MIN);
  });

  /**
   * The pair #332 §4 measured and left, and #336 floored. They wear one skin —
   * `.cb-input`'s comment says so outright — and it is worn far beyond the
   * dock, which is why the fix is a floor and not more padding. That route is
   * priced below rather than asserted in prose: the next step up on the space
   * scale overshoots, and ADR-0089 §3 keeps the space scale and the
   * measurements apart precisely so that nothing in between exists to pick.
   *
   * The floor also retires this file's one soft spot, for these two boxes. The
   * model above assumes a field inherits `line-height: 1.5`; a browser handing
   * it `line-height: normal` draws a shorter line box, and so a shorter field.
   * A declared floor lands on 48 under either reading, which is more than the
   * arithmetic alone could promise.
   *
   * It is only these two, and the tree around them is not level. Swept at the
   * commit that floored them — every `input`, `textarea` and `select` skin in
   * `src/lib`, 47 rules — twelve still stand under the floor, five declaring
   * none and seven declaring one that is itself under it. The nearest is the
   * skin's own further wearer, `views/habits/HabitDetailView.svelte`'s
   * `.input-number-brutal`, at the same 47px and sharing its rule with a
   * `.select-brutal`. None of the twelve is the dock's and none was measured by
   * #332, so they are left: this file's scope is the nav, the dock and the
   * operator keys, and a floor swept across the app is its own ticket for the
   * same reason #336 was.
   */
  it("floors both text fields at `--tap-min`, a pixel over what the skin draws (#336)", () => {
    const fields = {
      "the search field": ruleOf(STAGER, ".cb-input"),
      "the barcode field": ruleOf("src/lib/ui/Input.svelte", ".input"),
    };

    const boxes = Object.fromEntries(
      Object.entries(fields).map(([name, rule]) => [
        name,
        {
          drawn: round(builtHeightPx(rule)),
          floor: declaredFloorPx(rule),
          // `box-sizing: border-box` is the reset's, universally — asserted at
          // the top of this file — so a floor and the built-up height are the
          // same box, and the taller of the two is what stands.
          height: round(heightPx(rule)),
        },
      ])
    );

    expect(boxes).toEqual({
      "the search field": { drawn: 47, floor: TAP_MIN, height: 48 },
      "the barcode field": { drawn: 47, floor: TAP_MIN, height: 48 },
    });
    for (const box of Object.values(boxes)) {
      expect(box.height).toBeGreaterThanOrEqual(TAP_MIN);
    }
  });

  it("could not have got there on the space scale, which is why it is a floor", () => {
    // The route #336 laid out beside this one, priced rather than asserted:
    // more vertical padding. `--space-2xs` is what the skin carries and comes
    // to 47; the next step up is `--space-xs` and it lands 8px over, so the
    // scale has nothing that reaches 48. ADR-0089 §3 is why — the space scale
    // is a design system and 48 is a measurement of a finger, and the two are
    // deliberately not the same list. Kept here because a figure that lives
    // only in a comment drifts, and this one carries the whole argument for
    // `min-height` over `padding`.
    const skin = ruleOf("src/lib/ui/Input.svelte", ".input");
    const onNextStepUp =
      2 * borderPx(skin) + 2 * tokenPx("--space-xs") + lineBoxPx(skin);

    expect(paddingYPx(skin)).toBe(tokenPx("--space-2xs"));
    expect(round(onNextStepUp)).toBe(56);
    expect(onNextStepUp).toBeGreaterThan(TAP_MIN);
  });
});
