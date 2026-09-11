import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// A plain-Node ops script, deliberately outside the app's tsconfig: it drives
// Playwright's own comparator and is run by hand beside a rebaseline commit.
// @ts-ignore
import {
  measure,
  formatReport,
  screenshotOptions,
} from "../../scripts/baseline-diff.mjs";
import { paint, type Rgb, type Rgba } from "./support/png";

// The instrument ADR-0099 §8 clause 3 needs (#404): a rebaseline dispatch is
// green by construction, so it hands back the new PNGs and no diff at all, and
// "one measured read per cause" has nothing to read with.
//
// What these tests are for is the one way such a tool fails silently. It could
// report a number that is *plausible* and is not the suite's — a naive byte
// comparison, a threshold of its own, or a count swallowed by a budget the
// suite happened to tolerate. So each case below is one that separates the
// comparator's verdict from a reimplementation of it: a colour shift the
// comparator does not count, the same shift at a threshold that does, and a
// change sitting under a `maxDiffPixels` the suite would have passed.
//
// Reaching the comparator at all means two private paths inside
// `playwright-core`, which is a dependency nothing here declares: `lib/utils`
// for the comparator, walked by the script under test, and `lib/utilsBundle`
// for `PNG`, walked by `support/png.ts` on behalf of every caller that paints
// one. That is deliberate and it has a price: a Playwright upgrade that moves
// either path reddens `pnpm test:unit`, not just the tool. Loud is the whole
// argument for the deep import, and the local gate is where it lands.

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/** 8x8 black with a 2x3 white block at x 1-2, y 2-4. */
const blockAt = (x: number, y: number) =>
  x >= 1 && x <= 2 && y >= 2 && y <= 4 ? WHITE : null;

describe("what moved between two baselines", () => {
  it("measures a baseline that did not move as unchanged", () => {
    const before = paint(8, 8, BLACK);

    const m = measure(before, paint(8, 8, BLACK));

    expect(m.count).toBe(0);
    expect(m.ratio).toBe(0);
    expect(m.box).toBeNull();
    expect(m.transitions).toEqual([]);
    expect(m.resized).toBe(false);
    expect(m.identical).toBe(true);
    expect(m.differing).toBe(0);
  });

  it("counts the changed pixels and bounds the region they occupy", () => {
    const m = measure(paint(8, 8, BLACK), paint(8, 8, BLACK, blockAt));

    expect(m.count).toBe(6);
    expect(m.ratio).toBeCloseTo(6 / 64, 10);
    expect(m.box).toEqual({
      left: 1,
      top: 2,
      right: 2,
      bottom: 4,
      width: 2,
      height: 3,
    });
  });

  it("names the colours the changed pixels moved between", () => {
    const m = measure(paint(8, 8, BLACK), paint(8, 8, BLACK, blockAt));

    expect(m.transitions).toEqual([
      { from: [0, 0, 0, 255], to: [255, 255, 255, 255], count: 6 },
    ]);
  });

  it("reports a resize whose new rows the padding already matched", () => {
    // The comparator pads with transparent black, so a capture that grew two
    // transparent rows differs in size and in nothing else. It still answers
    // with a verdict — the size half of its message — and there is no region to
    // bound. Nothing may fall over on the way to saying so.
    const transparentTail = (_x: number, y: number): Rgba | null =>
      y >= 6 ? [0, 0, 0, 0] : null;
    const m = measure(paint(8, 8, BLACK, transparentTail), paint(8, 6, BLACK));

    expect(m.resized).toBe(true);
    expect(m.count).toBe(0);
    expect(m.differing).toBe(0);
    expect(m.identical).toBe(false);
    expect(m.box).toBeNull();
  });

  it("reports both sizes when the screen resized, and reads the pixels the comparator padded", () => {
    // The comparator pads the smaller image to the larger with transparent
    // black and compares that, so the two rows the shorter capture never had
    // are counted against nothing.
    const m = measure(paint(8, 8, BLACK), paint(8, 6, BLACK));

    expect(m.resized).toBe(true);
    expect(m.before).toEqual({ width: 8, height: 8 });
    expect(m.after).toEqual({ width: 8, height: 6 });
    expect(m.count).toBe(16);
    expect(m.box).toEqual({
      left: 0,
      top: 6,
      right: 7,
      bottom: 7,
      width: 8,
      height: 2,
    });
    expect(m.transitions).toEqual([
      { from: [0, 0, 0, 255], to: null, count: 16 },
    ]);
  });
});

describe("the verdict is the suite's, not a second opinion about it", () => {
  // 20 grey levels apart: the bytes differ everywhere, and pixelmatch's YIQ
  // delta for it is ~202, under the ~1409 that Playwright's default threshold
  // of 0.2 admits. A byte comparison would call this 64 changed pixels.
  const before = paint(8, 8, BLACK);
  const after = paint(8, 8, [20, 20, 20]);

  it("does not count a colour shift the comparator tolerates", () => {
    const m = measure(before, after);

    expect(m.count).toBe(0);
    // Not the same thing as a baseline that did not move: every pixel changed
    // and none of it is a change this comparison can see.
    expect(m.identical).toBe(false);
  });

  it("still says how many pixels differ, so the tolerance's reach is visible", () => {
    // The gap between the two is what `threshold` and the antialiasing detector
    // took. A reader reproducing a measurement by comparing bytes gets this
    // larger number, and without it published beside the count there is no way
    // to tell which of the two readings is the wrong one.
    const m = measure(before, after);

    expect(m.differing).toBe(64);
    expect(m.count).toBe(0);
  });

  it("counts that same shift at a threshold that admits it", () => {
    const m = measure(before, after, { threshold: 0.05 });

    expect(m.count).toBe(64);
    expect(m.options.threshold).toBe(0.05);
  });

  it("measures a change the suite's pixel budget would have passed", () => {
    // The budget knobs decide whether the suite *tolerated* a change, never
    // which pixels differ. Handed to the comparator they erase the measurement:
    // it returns no error message and no diff image at all, and the tool would
    // report a moved baseline as an unchanged one.
    const m = measure(paint(8, 8, BLACK), paint(8, 8, BLACK, blockAt), {
      maxDiffPixels: 5000,
      maxDiffPixelRatio: 1,
    });

    expect(m.count).toBe(6);
    expect(m.options.maxDiffPixels).toBeUndefined();
    expect(m.options.maxDiffPixelRatio).toBeUndefined();
  });
});

describe("the options come from the assertion the catalogue actually makes", () => {
  it("reads toHaveScreenshot, which is what the capture helpers call", () => {
    expect(
      screenshotOptions({ expect: { toHaveScreenshot: { threshold: 0.05 } } })
    ).toEqual({ threshold: 0.05 });
  });

  it("ignores toMatchSnapshot, a different key that binds no capture here", () => {
    expect(
      screenshotOptions({ expect: { toMatchSnapshot: { threshold: 0.9 } } })
    ).toEqual({});
  });

  it("declares nothing when the config declares nothing", () => {
    expect(screenshotOptions({})).toEqual({});
  });
});

describe("the report", () => {
  it("carries the count, the ratio, the region and the colours", () => {
    const text = formatReport(
      measure(paint(8, 8, BLACK), paint(8, 8, BLACK, blockAt)),
      { before: "HEAD", after: "working tree" }
    );

    expect(text).toContain("HEAD");
    expect(text).toContain("working tree");
    expect(text).toContain("6 px");
    expect(text).toContain("ratio 0.0938");
    expect(text).toContain("x 1-2, y 2-4");
    expect(text).toContain("srgb(0) → srgb(255)");
  });

  it("tells a baseline that did not move from one whose move is under tolerance", () => {
    const at = { before: "HEAD", after: "working tree" };
    const still = formatReport(
      measure(paint(8, 8, BLACK), paint(8, 8, BLACK)),
      at
    );
    const under = formatReport(
      measure(paint(8, 8, BLACK), paint(8, 8, [20, 20, 20])),
      at
    );

    expect(still).toContain("identical");
    expect(still).not.toContain("region");
    expect(under).toContain("0 px");
    expect(under).not.toContain("identical");
  });
});

describe("the script as a rebaseline actually runs it", () => {
  // Driven end to end, the way `tests/unit/docs-check.test.ts` drives the docs
  // gate, because three things only exist in `main`: the one-path form reading
  // the prior out of git, the tolerance read out of `playwright.config.ts` by a
  // Node that strips its types, and the exit-2 contract. All three are on the
  // path a committer takes and none is reachable from the exports above.

  const SCRIPT = fileURLToPath(
    new URL("../../scripts/baseline-diff.mjs", import.meta.url)
  );
  const BASELINE = "shot-chromium-linux.png";

  let repo: string;

  const git = (...args: string[]) =>
    spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      encoding: "utf8",
    });

  const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: repo,
      encoding: "utf8",
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "baseline-diff-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    writeFileSync(join(repo, BASELINE), paint(8, 8, BLACK));
    git("add", BASELINE);
    git("commit", "-q", "-m", "the baseline before it moved");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("compares the prior in HEAD against the file the artifact left on disk", () => {
    writeFileSync(join(repo, BASELINE), paint(8, 8, BLACK, blockAt));

    const { code, out } = run(BASELINE);

    expect(code).toBe(0);
    expect(out).toContain(`HEAD:${BASELINE}`);
    expect(out).toContain("6 px changed of 64");
    expect(out).toContain("x 1-2, y 2-4");
  });

  it("names the tolerance it compared at, read out of playwright.config.ts", () => {
    const { out } = run(BASELINE);

    expect(out).toContain("comparator pixelmatch");
    expect(out).toContain("threshold");
  });

  it("refuses a baseline with no prior, which is a new one and owes more", () => {
    writeFileSync(join(repo, "new-chromium-linux.png"), paint(8, 8, BLACK));

    const { code, out } = run("new-chromium-linux.png");

    expect(code).toBe(2);
    expect(out).toContain("not in HEAD");
    expect(out).toContain("§8 clause 4");
  });

  it("refuses more paths than it has forms for", () => {
    const { code, out } = run(BASELINE, BASELINE, BASELINE);

    expect(code).toBe(2);
    expect(out).toContain("usage:");
  });
});
