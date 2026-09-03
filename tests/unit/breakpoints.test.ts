import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BREAKPOINTS,
  LOCAL_BREAKPOINTS,
  ALL_BREAKPOINTS,
  atLeast,
} from "../../src/lib/ui/breakpoints";

/**
 * The gate `src/lib/ui/breakpoints.ts` describes: the set of widths this app
 * changes shape at is **closed**, and a literal that is not on the roster fails
 * here.
 *
 * This is what stands in for `postcss-custom-media`, which #337 settled on and
 * which does not survive the build: Svelte runs no preprocessor here, so PostCSS
 * never sees a component's `<style>` block, and that is where sixteen of the
 * nineteen width queries live. A gate reaches all nineteen.
 *
 * Read off the source rather than a compiled bundle, for the same reason
 * `sheet-geometry.test.ts` is: a stylesheet is data, and the claim is about what
 * is written.
 */

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name))
      : e.name.endsWith(".svelte") || e.name.endsWith(".css")
        ? [join(dir, e.name)]
        : []
  );

/**
 * Every width in an `@media` prelude in the tree, with where it is.
 *
 * **`@media` only, never `@container`.** A container query asks how much room
 * the element itself has, which is a different question and the one this roster
 * recommends asking instead — `ui/Segmented.svelte` uses `@container (max-width:
 * 26rem)` and is not a breakpoint at all. Swept together, the roster would have
 * been pushed to adopt a number that is not a width of the window.
 */
const widthQueries = sourceFiles("src").flatMap((file) => {
  const text = readFileSync(file, "utf8");
  return [
    ...text.matchAll(/@media[^{]*?\((?:min|max)-width:\s*([\d.]+)(px|rem)\)/g),
  ].map((m) => ({ file, value: Number(m[1]), unit: m[2], raw: m[0].trim() }));
});

describe("the breakpoint roster is closed", () => {
  it("finds the width queries at all — a sweep that matches nothing proves nothing", () => {
    // Without this, a regex that quietly stopped matching would turn every
    // assertion below into a vacuous pass over an empty list.
    expect(widthQueries.length).toBeGreaterThanOrEqual(19);
  });

  it("uses no width that is not on the roster", () => {
    const offenders = widthQueries
      .filter((q) => !ALL_BREAKPOINTS.includes(q.value))
      .map((q) => `${q.file}: ${q.raw}`);
    expect(offenders).toEqual([]);
  });

  it("states every breakpoint in px — one unit, so two numbers are comparable", () => {
    // A `rem` breakpoint moves with the user's font size while a `px` one does
    // not, so a roster holding both could not say whether 48rem is 768px
    // without knowing a root size it has no business assuming.
    const wrongUnit = widthQueries
      .filter((q) => q.unit !== "px")
      .map((q) => `${q.file}: ${q.raw}`);
    expect(wrongUnit).toEqual([]);
  });
});

describe("the app-wide breakpoints are the ones more than one file agrees on", () => {
  it("keeps the shell inside the desktop test viewport", () => {
    // A shell no test viewport ever reaches is a shell nothing defends: the
    // `chromium` Playwright project is 1280x720, so a shell breakpoint above it
    // would silently un-cover the whole two-region layout (#337 Q21).
    expect(BREAKPOINTS.shell).toBeLessThanOrEqual(1280);
  });

  it("puts the shell above the sheet, so the two shapes nest", () => {
    // Below `sheet` the overlay is a sheet and the shell is one column; between
    // them the overlay is a card and the shell is still one column; above
    // `shell` both have changed. Reversed, there would be a band where Rations
    // had a rail but still slid its sheets up from the floor.
    expect(BREAKPOINTS.shell).toBeGreaterThan(BREAKPOINTS.sheet);
  });

  it("hands `matchMedia` the same number the stylesheets use", () => {
    // The pair this roster exists for. `matchMedia` decides whether Rations has
    // pages; the media query decides whether the grid has split. Disagree, and a
    // full-page settings screen renders into an unsplit column.
    expect(atLeast("shell")).toBe(`(min-width: ${BREAKPOINTS.shell}px)`);
    expect(widthQueries.some((q) => q.value === BREAKPOINTS.sheet)).toBe(true);
    // The shell is drawn as well as decided: the stylesheets split the day into
    // two regions at this width (#342), and a roster entry no stylesheet uses
    // would be a number `matchMedia` could drift away from unopposed.
    expect(widthQueries.some((q) => q.value === BREAKPOINTS.shell)).toBe(true);
  });

  it("names no width twice", () => {
    // Two names for one number is two things that can be changed apart.
    const all = ALL_BREAKPOINTS;
    expect(new Set(all).size).toBe(all.length);
  });

  it("is used by exactly the files each local breakpoint declares", () => {
    // The roster names its users, so gaining one is a deliberate edit rather
    // than something discovered later by whoever changes one of the two. This is
    // what keeps "local" honest: a width quietly picked up by a third file is an
    // app-wide breakpoint nobody promoted.
    const drift = Object.entries(LOCAL_BREAKPOINTS).flatMap(([name, bp]) => {
      const actual = [
        ...new Set(
          widthQueries
            .filter((q) => q.value === bp.px)
            .map((q) => q.file.replaceAll("\\", "/"))
        ),
      ].sort();
      const declared = [...bp.files].sort();
      return JSON.stringify(actual) === JSON.stringify(declared)
        ? []
        : [{ name, declared, actual }];
    });
    expect(drift).toEqual([]);
  });
});
