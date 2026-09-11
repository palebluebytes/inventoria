import { describe, it, expect } from "vitest";
// A plain-Node ops script, deliberately outside the app's tsconfig. Two things
// here come through it: the walk into `playwright-core`, and the reading of
// which config key binds a capture — shared so the gate and the instrument
// cannot end up disagreeing about either.
// @ts-ignore
import {
  playwrightModule,
  screenshotOptions,
} from "../../scripts/baseline-diff.mjs";
import playwrightConfig from "../../playwright.config";
import { tokenRgb } from "./support/stylesheet";
import { paint } from "./support/png";

// The bracket ADR-0099 §3 decides, held by asking the comparator the suite
// actually runs (#405).
//
// What the record fixes is a *bracket*, not a number, because a number cannot
// say what re-measures it when the thing it was sized against disappears —
// which is exactly how `maxDiffPixels: 5000` outlived the calorie ring it was
// sized against. So these are not assertions that `threshold` is 0.05. They are
// assertions about what the palette does at whatever `playwright.config.ts`
// declares: two anchor pairs that bracket it from both sides, and three
// semantic confusions Playwright's inherited 0.2 was passing silently.
//
// Nothing here restates pixelmatch's `35215`, its YIQ coefficients, or its
// antialiasing detector. `package.json` declares `^1.59.1` and all of that is
// `playwright-core` internals with no public guarantee: a reimplementation goes
// silently wrong on the upgrade that moves one, while a deep import fails as
// module-not-found, which is loud.
//
// On a uniform block the antialiasing detector is inert by construction — every
// neighbour is equal, so `zeroes > 2` and the pixel is never re-tested — which
// is what lets these blocks measure `threshold` alone.

const { getComparator } = playwrightModule("lib/utils");
const compare = getComparator("image/png");

/**
 * The options `toHaveScreenshot` runs at, read off the config rather than
 * written down here. If the config declared none the comparator would fall back
 * to Playwright's 0.2 and the must-fail anchor below would start passing, which
 * is the failure this whole file exists to make loud.
 */
const DECLARED = screenshotOptions(playwrightConfig);

/** Playwright's own default, inherited by anything that declares nothing. */
const INHERITED = { threshold: 0.2 };

/** Big enough that an interior pixel has all eight neighbours. */
const BLOCK = 8;

/** Does the comparator refuse two solid blocks of these tokens' colours? */
const refuses = (
  expected: string,
  actual: string,
  options: object = DECLARED
): boolean =>
  compare(
    paint(BLOCK, BLOCK, tokenRgb(actual)),
    paint(BLOCK, BLOCK, tokenRgb(expected)),
    options
  ) !== null;

describe("the tolerance the catalogue compares at is declared", () => {
  it("names a threshold, so no capture runs at a number nobody chose", () => {
    expect(DECLARED.threshold).toBeTypeOf("number");
  });

  it("names the assertion's budget, which tightening the threshold spends", () => {
    // `expectScreenshot` polls for stability against the *previous* screenshot,
    // so tightening the threshold tightens that loop and its failure mode is a
    // timeout rather than a diff. Inherited, that budget is `expect`'s own
    // 5000 ms (`expect.js:118`).
    expect(playwrightConfig.expect?.timeout).toBeTypeOf("number");
  });

  it("does not name it where Playwright deletes it unread", () => {
    // `toMatchSnapshot.js:44-49` lists `timeout` among `NonConfigProperties`
    // and strips it from the config options before merging them, so a budget
    // written inside `toHaveScreenshot` binds nothing and says so to no one.
    // ADR-0099 §3 names that key; its first 2026-09-11 Amendment corrects it,
    // and this is what keeps the correction from being re-lost.
    expect(playwrightConfig.expect?.toHaveScreenshot ?? {}).not.toHaveProperty(
      "timeout"
    );
  });

  it("carries no count budget, at the config or anywhere it could hide", () => {
    // `maxDiffPixels: 5000` meant 33 different things across the 31 baselines
    // and its measured basis was gone (ADR-0099 §4). A budget that returns is a
    // `maxDiffPixelRatio` arriving with the measurement that sized it.
    const declared = playwrightConfig.expect?.toHaveScreenshot ?? {};
    expect(declared).not.toHaveProperty("maxDiffPixels");
    expect(declared).not.toHaveProperty("maxDiffPixelRatio");
  });
});

describe("what the declared threshold admits, asked of the installed comparator", () => {
  it("refuses a 1px border losing itself into the page behind it", () => {
    // The ceiling anchor, delta 237.4. A vanished `--border` against
    // `--bg-base` is the regression this catalogue exists to catch, so a
    // threshold that passes it is outside the bracket however it got there.
    expect(refuses("--border", "--bg-base")).toBe(true);
  });

  it("passes a near-black substituted for the ink nobody can tell it from", () => {
    // The floor anchor, delta 43.2. `--ink` against `--text-primary` is a
    // token substitution no eye resolves, and a threshold tight enough to
    // reject it would redden the catalogue over nothing.
    expect(refuses("--ink", "--text-primary")).toBe(false);
  });

  it("refuses a success badge rendering as a warning badge", () => {
    expect(refuses("--green-bg", "--amber-bg")).toBe(true);
  });

  it("refuses a post-it highlight vanishing into paper", () => {
    expect(refuses("--highlight-bg", "--paper")).toBe(true);
  });

  it("refuses an over-limit rust reading as an error red", () => {
    // The tightest semantic confusion in the palette, delta 705.4 — and the one
    // that says how much room the landed value has: it fails by 8x.
    expect(refuses("--rda-over", "--red-text")).toBe(true);
  });
});

describe("the tolerance this repo used to inherit", () => {
  it("passed every confusion above, which is what declaring one bought", () => {
    // Not history for its own sake. This is the measurement behind "nothing in
    // this repo compares exactly": at 0.2 the comparator admits a YIQ delta of
    // 1408, and all four refusals above are under it. A revert to silence is a
    // revert to this row.
    expect(refuses("--border", "--bg-base", INHERITED)).toBe(false);
    expect(refuses("--green-bg", "--amber-bg", INHERITED)).toBe(false);
    expect(refuses("--highlight-bg", "--paper", INHERITED)).toBe(false);
    expect(refuses("--rda-over", "--red-text", INHERITED)).toBe(false);
  });
});
