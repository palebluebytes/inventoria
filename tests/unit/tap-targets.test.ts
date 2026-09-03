/**
 * The nav's six items and the food dock's controls, measured against
 * `--tap-min` (#332 §4, ADR-0089 §3).
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
 * browser — which is what lets #336 be filed off arithmetic.
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

/** What a control declares as its floor, or null where it declares none. */
function declaredFloorPx(rule: Rule): number | null {
  const floor = decl(rule, "min-height");
  return floor === undefined ? null : lengthPx(floor);
}

const round = (n: number) => Math.round(n * 10) / 10;

const SIDEBAR = "src/lib/layout/Sidebar.svelte";
const STAGER = "src/lib/views/food/FoodStager.svelte";

describe("the floor itself", () => {
  it("is 48px, and is not fluid", () => {
    // Material's figure, which also clears Apple's 44pt, so one number
    // satisfies both rather than passing one guideline and failing the other.
    expect(TAP_MIN).toBe(48);
    expect(APP).not.toMatch(/--tap-min:\s*clamp/);
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

describe("the dock's controls", () => {
  it("gives the method tabs 52px, declared outright", () => {
    const tab = ruleOf(STAGER, ".dock :global(.methods .method)");

    expect(declaredFloorPx(tab)).toBe(52);
    expect(declaredFloorPx(tab)!).toBeGreaterThanOrEqual(TAP_MIN);
  });

  it("gives the commit button 51px, over a floor of `--tap-min` itself", () => {
    const commit = ruleOf("src/lib/views/food/CommitButton.svelte", ".commit");
    const height =
      2 * borderPx(commit) + 2 * paddingYPx(commit) + lineBoxPx(commit);

    expect(declaredFloorPx(commit)).toBe(TAP_MIN);
    expect(round(height)).toBe(51);
    expect(height).toBeGreaterThanOrEqual(TAP_MIN);
  });

  /**
   * The one that falls short, and the reason #332 §4 says to measure rather
   * than redesign: it is the shared field skin, worn far beyond the dock, so
   * the smallest honest fix is a change to every text field in the app. #336
   * carries it.
   */
  it("leaves both text fields at 47px, just under the floor (#336)", () => {
    const fields = {
      "the search field": ruleOf(STAGER, ".cb-input"),
      "the barcode field": ruleOf("src/lib/ui/Input.svelte", ".input"),
    };

    const measured = Object.fromEntries(
      Object.entries(fields).map(([name, rule]) => [
        name,
        round(2 * borderPx(rule) + 2 * paddingYPx(rule) + lineBoxPx(rule)),
      ])
    );

    expect(measured).toEqual({
      "the search field": 47,
      "the barcode field": 47,
    });
    for (const rule of Object.values(fields)) {
      expect(declaredFloorPx(rule)).toBeNull();
    }
  });
});
