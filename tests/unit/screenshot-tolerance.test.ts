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
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import offlineConfig from "../../playwright.offline.config";

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

/**
 * What this repo compared at before #405, written down rather than read back
 * out of Playwright.
 *
 * It was Playwright's default, and that is how it got here — but the last
 * `describe` below is a claim about **this number**, not about whatever
 * Playwright defaults to next. Reading the live default would make that block
 * keep passing while measuring something else.
 */
const WAS_INHERITED: ComparisonOptions = { threshold: 0.2 };

/** Big enough that an interior pixel has all eight neighbours. */
const BLOCK = 8;

/** The counting knobs a comparison runs at — the two `screenshotOptions` reads. */
type ComparisonOptions = { threshold?: number; comparator?: string };

/** Does the comparator refuse two solid blocks of these tokens' colours? */
const refuses = (
  expected: string,
  actual: string,
  options: ComparisonOptions = DECLARED
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

  it("declares no count budget at all", () => {
    // Only what the config says. `maxDiffPixels: 5000` spent a year at a call
    // site instead, which is where a count can still hide — nothing here
    // sweeps for that, and ADR-0099 §4 is the rule that keeps it out.
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
    expect(refuses("--border", "--bg-base", WAS_INHERITED)).toBe(false);
    expect(refuses("--green-bg", "--amber-bg", WAS_INHERITED)).toBe(false);
    expect(refuses("--highlight-bg", "--paper", WAS_INHERITED)).toBe(false);
    expect(refuses("--rda-over", "--red-text", WAS_INHERITED)).toBe(false);
  });
});

// ─── The other half of §2: the call sites, and the configs ──────────────────
//
// Everything above asks what the declared tolerance *does*. This asks whether
// it is the only one, which is the half that actually failed: `maxDiffPixels:
// 5000` did not live in a config for a year, it lived at a call site, orphaned
// from the measurement that sized it and invisible to anyone reading
// `playwright.config.ts`. ADR-0099 §2 answers that with a rule — "they live in
// the config, not at the call sites" — and a rule with no reader is how the
// first one went stale.

/** The four knobs `toMatchSnapshot.js:260-263` reads to decide what differs. */
const COMPARISON_KNOBS = [
  "threshold",
  "comparator",
  "maxDiffPixels",
  "maxDiffPixelRatio",
];

/**
 * Every Playwright spec this repo tracks.
 *
 * Two pathspecs, for the reason `support/markup.ts`'s `trackedSvelteFiles`
 * docblock sets out at length: git resolves a leading `tests/**` against path
 * *segments*, so the recursive glob alone means "inside a directory under
 * tests" and silently omits every spec sitting directly in it — which today is
 * all of them.
 */
const trackedSpecFiles = (): string[] =>
  execFileSync("git", ["ls-files", "tests/*.spec.ts", "tests/**/*.spec.ts"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);

/** Where the string starting at `open` ends, escapes honoured. */
function endOfString(source: string, open: number): number {
  const quote = source[open];
  for (let i = open + 1; i < source.length; i++) {
    if (source[i] === "\\") i++;
    else if (source[i] === quote) return i;
  }
  return source.length;
}

/**
 * The index of the `)` closing the `(` at `open`, or -1.
 *
 * It steps over strings, template literals and both comment forms rather than
 * counting every bracket it meets. A depth counter that does not is the reader
 * that stops at an apostrophe, and this repo has shipped that bug before — in
 * `worn-classes`' markup census, where a fixed brace depth dropped whole tags.
 */
function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") i = endOfString(source, i);
    else if (c === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      if (end === -1) return -1;
      i = end;
    } else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 1;
    } else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

/** The comparison knobs named inside each `toHaveScreenshot(…)` in `source`. */
function knobsPassedAtCallSites(source: string): string[] {
  const CALL = "toHaveScreenshot(";
  const found: string[] = [];
  for (let at = source.indexOf(CALL); at !== -1; ) {
    const open = at + CALL.length - 1;
    const close = matchingParen(source, open);
    // A call whose arguments cannot be delimited is not a call this reader may
    // report as clean: it is a reader that has lost the file.
    if (close === -1)
      throw new Error(`unterminated toHaveScreenshot( at ${at}`);
    const args = source.slice(open + 1, close);
    for (const knob of COMPARISON_KNOBS) {
      if (new RegExp(`(?:^|[{,\\s])${knob}\\s*:`).test(args)) found.push(knob);
    }
    at = source.indexOf(CALL, close);
  }
  return found;
}

describe("the reader that sweeps the call sites", () => {
  // A sweep whose whole output is "nothing found" has two explanations and the
  // dangerous one is silent. These pin which it is.

  it("sees a knob passed at a call site", () => {
    expect(
      knobsPassedAtCallSites(
        `await expect(page).toHaveScreenshot("x.png", { fullPage: true, threshold: 0.9 });`
      )
    ).toEqual(["threshold"]);
  });

  it("is not stopped by a bracket inside a string", () => {
    expect(
      knobsPassedAtCallSites(
        "await expect(p).toHaveScreenshot(`a) b`, { maxDiffPixels: 1 });"
      )
    ).toEqual(["maxDiffPixels"]);
  });

  it("passes the options a call site is still allowed to name", () => {
    // `fullPage`, `clip` and `mask` are about *what is photographed*, which is
    // the caller's question and always was. `mask` especially: ADR-0099 §3's
    // amendment route and §7 both name it as the answer to a noisy region.
    expect(
      knobsPassedAtCallSites(
        `await expect(page).toHaveScreenshot(name, { fullPage: true, mask: [banner] });`
      )
    ).toEqual([]);
  });
});

describe("nothing but the config decides how closely two captures match", () => {
  const specs = trackedSpecFiles();

  it("sweeps a population it discovered, and the catalogue is in it", () => {
    expect(specs).toContain("tests/visual-catalog.spec.ts");
    expect(specs.length).toBeGreaterThan(1);
  });

  it("finds a capture to sweep, so a clean sweep means something", () => {
    const calls = specs.flatMap((file) =>
      readFileSync(file, "utf8").split("toHaveScreenshot(").slice(1)
    );
    expect(calls.length).toBeGreaterThan(0);
  });

  it("finds no comparison knob at any call site", () => {
    const offenders = specs.flatMap((file) =>
      knobsPassedAtCallSites(readFileSync(file, "utf8")).map(
        (knob) => `${file}: ${knob}`
      )
    );
    expect(offenders).toEqual([]);
  });

  it("declares the tolerance in every config that can run a capture", () => {
    // `playwright.offline.config.ts` is a second config over the same `tests/`
    // directory, and it declared nothing. That was only harmless because the
    // one spec it matches happens to take no picture — which is a fact about
    // today's specs, not about the config, and is exactly the shape of silence
    // §2 refuses.
    for (const config of [playwrightConfig, offlineConfig]) {
      expect(config.expect?.toHaveScreenshot?.threshold).toBeTypeOf("number");
    }
  });
});
