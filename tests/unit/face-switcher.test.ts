/**
 * The pinned header, the panel it drops and the grid inside it (ADR-0114 §5–§7).
 *
 * Two kinds of claim, tested two ways, which is `way-in-bar.test.ts`'s split and
 * for its reason. The markup ones — one tile per face, in the roster's order,
 * with the current one inverted — are rendered. The geometry ones are read off
 * the stylesheets, because what this record decides is which properties these
 * boxes may name and which token they read, and that is a property of the CSS
 * rather than of any rendered pixel.
 *
 * The **cross-file** pair is the one worth the file on its own: the panel is
 * portalled to the end of `<body>` by bits-ui, so it cannot inherit the header's
 * padding, and §6's "left-aligned under the logo" is therefore two rules in two
 * files that have to agree. Nothing in the compiler can notice when they stop.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "svelte/server";
import { decl, ruleOf, rulesOf, styleOf } from "./support/stylesheet";
import { BREAKPOINTS } from "../../src/lib/ui/breakpoints";
import {
  SHELL_CEILING,
  clearShellCeiling,
  publishShellCeiling,
} from "../../src/lib/layout/shell-ceiling";
import { FACES, facesOf, facetOf } from "../../src/lib/facets/registry";
import FaceGrid from "../../src/lib/layout/FaceGrid.svelte";
import FaceHeader from "../../src/lib/layout/FaceHeader.svelte";
import { tileNames } from "./support/faces";

const HEADER = "src/lib/layout/FaceHeader.svelte";
const SWITCHER = "src/lib/layout/FaceSwitcher.svelte";
const GRID = "src/lib/layout/FaceGrid.svelte";
const WIDE = `@media (min-width: ${BREAKPOINTS.sheet}px)`;

const root = facetOf("root");
const rations = facetOf("food");

const grid = (current: string | null = null) =>
  render(FaceGrid, {
    props: {
      faces: facesOf(root),
      current,
      onPick: () => {},
    } as never,
  }).body;

describe("the grid is the roster, drawn in the roster's order", () => {
  it("draws one tile per face the shell declares, and no more", () => {
    // The root holds seven and Rations holds three (§8), and the difference is
    // not a filter applied here: a shell cannot declare a face whose screens its
    // build does not reach, which is what `check:facets` proves. So the grid's
    // job is to draw what it is handed, and this is the assertion that it does
    // not reach past its argument to `FACES`.
    expect(tileNames(grid())).toEqual([
      "Rations",
      "Recipes",
      "Media",
      "Items",
      "Agenda",
      "Notes",
      "Settings",
    ]);
    expect(facesOf(rations).map((f) => f.name)).toEqual([
      "Rations",
      "Recipes",
      "Settings",
    ]);
  });

  it("is the roster's order and never a re-sort", () => {
    // §7 refuses a frequency ordering at length, and the refusal is only worth
    // anything if nothing here can quietly reintroduce one. Read against `FACES`
    // itself rather than against the literal above, so a roster that gains a
    // face fails this on the order rather than on the count.
    expect(tileNames(grid())).toEqual(FACES.map((f) => f.name));
  });

  it("inverts the current face in place and says so to a screen reader", () => {
    const body = grid("items");
    // In place: the names are unchanged, so nothing moved to the front.
    expect(tileNames(body)).toEqual(FACES.map((f) => f.name));
    expect(body).toContain('aria-current="page"');
    // Exactly one, and it is Items'. A grid with two current faces would be a
    // grid whose `class:current` and whose attribute disagree about the state.
    expect(body.match(/aria-current="page"/g)).toHaveLength(1);
    const current =
      /class="[^"]*\bcurrent\b[^"]*"[^>]*>[\s\S]*?face-name[^>]*>([^<]+)</.exec(
        body
      );
    expect(current?.[1]).toBe("Items");
  });

  it("marks nothing current on the landing screen", () => {
    // §9: the grid *is* where you are there, so no tile is inverted. `null` is
    // the landing's case and not an absence of information.
    expect(grid(null)).not.toContain("aria-current");
  });

  it("reads each mark off the roster rather than deriving it from an id", () => {
    const body = grid();
    for (const face of FACES) {
      expect({
        id: face.id,
        drawn: body.includes(`src="${face.mark}"`),
      }).toEqual({ id: face.id, drawn: true });
    }
  });
});

describe("the header is the one canonical name, and a trigger beside it", () => {
  const body = render(FaceHeader, {
    props: {
      face: FACES[0],
      faces: facesOf(root),
      onPick: () => {},
    } as never,
  }).body;

  it("titles the face with the roster's one spelling (§3)", () => {
    expect(body).toMatch(/<h1 class="face-title[^"]*">Rations<\/h1>/);
    expect(body).toContain("Rations");
  });

  it("names the trigger for what it does, not for what it draws", () => {
    // "Rations, switch face": the face first, because a control announced only
    // as "switch face" tells a screen-reader user nothing about where they are,
    // and the visible mark carries no words at all.
    expect(body).toContain('aria-label="Rations, switch face"');
    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain('aria-controls="face-switcher-panel"');
  });

  it("keeps the primitive's caret beside the face's own mark (§5)", () => {
    // The amendment's third precision. A logo with no affordance would be the
    // app's only navigation with nothing to say so, and a caret drawn here
    // rather than by `ui/Disclosure` would be a second copy of its path.
    expect(body).toMatch(/class="face-trigger-mark[^"]*"/);
    expect(body).toContain("M7 6 L17 12 L7 18 Z");
  });
});

describe("the ceiling the header publishes", () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * A document stub rather than jsdom, following `viewport-inset.test.ts` next
   * door: what these two modules DO is talk to `<html>`, so the seam that is
   * worth having is a root element whose properties can be read back, not a
   * whole DOM implementation standing in for one line.
   */
  const stubDocument = () => {
    const props = new Map<string, string>();
    vi.stubGlobal("document", {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => props.set(k, v),
          removeProperty: (k: string) => props.delete(k),
          getPropertyValue: (k: string) => props.get(k) ?? "",
        },
      },
    });
    return props;
  };

  it("writes and clears one inline property on `<html>`", () => {
    const props = stubDocument();
    // On `<html>` rather than on the shell's box, and that is forced: the panel
    // is portalled to the end of `<body>`, so a property set on either shell
    // would not reach it. `ui/viewport-inset.ts` publishes the band the same way
    // for the same reason.
    publishShellCeiling(56);
    expect(props.get(SHELL_CEILING)).toBe("56px");

    // Cleared rather than zeroed, so what a consumer reads afterwards is
    // `src/app.css`'s declared `0` rather than an inline `0px` that would go on
    // beating every rule. A shell torn down otherwise leaves `<html>` naming a
    // box that is gone.
    clearShellCeiling();
    expect(props.has(SHELL_CEILING)).toBe(false);
  });

  it("is inert with no document at all", () => {
    // Both shells are server-rendered under a stubbed `window` in this tier, so
    // this is a path that is actually taken rather than a defensive branch.
    vi.stubGlobal("document", undefined);
    expect(() => publishShellCeiling(56)).not.toThrow();
    expect(() => clearShellCeiling()).not.toThrow();
  });

  it("names the property `src/app.css` declares", () => {
    // Declared there at `0`, which is what lets every consumer write a bare
    // `var(--shell-ceiling)` and still be correct before any measurement has
    // run. Two spellings of one name is the drift this pins.
    expect(SHELL_CEILING).toBe("--shell-ceiling");
    expect(styleOf(SWITCHER)).toContain("var(--shell-ceiling)");
  });
});

describe("the panel drops from the header, and the width is all that changes", () => {
  const panel = ruleOf(SWITCHER, ".face-panel");

  it("starts where the shell's own chrome ends", () => {
    // `--vv-top` is the visible band (ADR-0089 §1) and `--shell-ceiling` is the
    // header's measured height. Both bare, which is `src/app.css`'s point in
    // declaring each.
    expect(decl(panel, "top")).toBe(
      "calc(var(--vv-top) + var(--shell-ceiling))"
    );
    expect(decl(panel, "position")).toBe("fixed");
  });

  it("changes width at 768 and shape at no width at all (§6)", () => {
    // ADR-0091 §8's rule is that a shape change is what earns a breakpoint. The
    // card is top-anchored either side of this one; what moves is the inset and
    // the cap. Asserted as an absence so a `top` or a `position` added to the
    // wide rule later fails here rather than in a screenshot.
    const wide = ruleOf(SWITCHER, ".face-panel", WIDE);
    expect(decl(wide, "top")).toBeUndefined();
    expect(decl(wide, "position")).toBeUndefined();
    expect(decl(wide, "width")).toBe(
      "min(30rem, calc(100% - 2 * var(--space-s)))"
    );

    // One breakpoint, and it is the roster's rather than a literal — the pair
    // `breakpoints.test.ts` holds from the other end.
    const widths = [
      ...new Set(
        rulesOf(styleOf(SWITCHER))
          .map((r) => r.at)
          .filter((at): at is string => at !== null && at.includes("min-width"))
      ),
    ];
    expect(widths).toEqual([WIDE]);
  });

  it("lands its left edge under the logo, across two files", () => {
    // §6's "left-aligned under the logo", and the one claim here that no
    // compiler can check: the card is portalled out of the shell, so it cannot
    // inherit the header's padding and has to restate the same expression. If
    // one of these two moves without the other, the panel opens beside its own
    // trigger and every gate stays green.
    const inline = "var(--space-s)";
    expect(decl(ruleOf(HEADER, ".face-header"), "padding")).toBe(
      `var(--space-2xs) ${inline}`
    );
    expect(decl(ruleOf(SWITCHER, ".face-panel", WIDE), "left")).toBe(
      `calc(env(safe-area-inset-left, 0px) + ${inline})`
    );
  });

  it("takes the shadow ADR-0102 reserves for a box that covers", () => {
    expect(decl(panel, "box-shadow")).toBe("var(--shadow-2)");
    expect(decl(ruleOf(HEADER, ".face-header"), "box-shadow")).toBe(
      "var(--shadow-1)"
    );
  });

  it("is scrollable inside what the header leaves it", () => {
    // A roster long enough to overflow must not push its own last row off the
    // bottom of a phone, which is the failure a fixed top-anchored card has and
    // a bottom sheet does not.
    expect(decl(panel, "max-height")).toBe(
      "calc(var(--vv-h) - var(--shell-ceiling))"
    );
    expect(decl(panel, "overflow-y")).toBe("auto");
  });
});

describe("Settings holds the last column rather than the last place", () => {
  it("pins the roster's last member by position, not by name", () => {
    // §2: a list is a poor thing to trust with a right edge once faces can be
    // hidden (§10). The rule says "the last cell" and knows nothing about which
    // face that is, so hiding four of the seven still leaves Settings on the
    // right.
    expect(decl(ruleOf(GRID, ".face-cell:last-child"), "grid-column")).toBe(
      "4"
    );
    expect(styleOf(GRID)).not.toContain("settings");
    expect(FACES[FACES.length - 1].id).toBe("settings");
  });
});
