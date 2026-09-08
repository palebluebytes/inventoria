#!/usr/bin/env node
/**
 * What moved between a committed image baseline and the one replacing it.
 *
 *   node scripts/baseline-diff.mjs <baseline.png>            # HEAD vs the tree
 *   node scripts/baseline-diff.mjs <before.png> <after.png>
 *
 * ADR-0099 §8 requires a rebaseline commit to put every moved baseline under a
 * named cause and to **measure** one file per cause rather than attribute it —
 * count, ratio, region. Nothing in CI can hand that over: a rebaseline dispatch
 * is green by construction (a rewritten baseline returns `pass: true`), and
 * `e2e.yml` uploads `test-results/` only `if: failure()`, so the committer
 * receives the new PNGs and no diff at all. Every measurement the #365 map
 * produced was a throwaway script written for that sitting and discarded, which
 * is the state a rule gets ignored in. This is the instrument.
 *
 * ONE-PATH FORM. The account is written on a dirty tree: the artifact has been
 * copied over `tests/*-snapshots/` wholesale and `git status` names the refused
 * set. The image that moved is therefore only in git, so a bare path compares
 * `git show HEAD:<path>` against the file on disk, which is the comparison the
 * commit is about. Two paths compare those two files and touch git not at all.
 *
 * THE VERDICT IS THE SUITE'S. The count comes from `getComparator("image/png")`
 * — the same function `toHaveScreenshot` calls — and the region from the diff
 * image it draws. A reimplementation would be a second opinion: it would have to
 * restate pixelmatch's `35215`, its YIQ metric and its antialiasing detector,
 * and it would go silently wrong the first time `^1.59.1` resolves to something
 * newer. A deep import fails as module-not-found instead, which is loud.
 *
 * Exit 0 whether or not anything moved — this measures, it does not judge. 2 if
 * it could not run.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/**
 * Reach a module inside `playwright-core`.
 *
 * Two things make this less direct than it looks. `playwright-core` is not a
 * declared dependency and pnpm's strict layout does not hoist it, so it is not
 * resolvable from the repo root at all; `@playwright/test` → `playwright` →
 * `playwright-core` is the real edge and this walks it rather than naming a path
 * under `node_modules/`. And the comparator's own file is **not** in
 * playwright-core's `exports` map — `lib/server/utils/comparators.js` is refused
 * with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `lib/utils` is exported and re-exports
 * that module wholesale, so it is the supported way in.
 */
export function playwrightModule(subpath) {
  const test = createRequire(import.meta.url).resolve("@playwright/test");
  const playwright = createRequire(test).resolve("playwright");
  return createRequire(playwright)(`playwright-core/${subpath}`);
}

const { getComparator } = playwrightModule("lib/utils");
const { PNG } = playwrightModule("lib/utilsBundle");

/**
 * pixelmatch paints a counted pixel in `diffColor`, opaque (`pixelmatch.js:29`).
 * Nothing else in the diff image can wear it: a pixel dropped as antialiasing is
 * yellow, and an unchanged one is drawn grey, so `r === g === b`.
 */
const COUNTED = [255, 0, 0, 255];

/**
 * The knobs that decide **which pixels differ**. `maxDiffPixels` and
 * `maxDiffPixelRatio` are deliberately not among them: they decide whether the
 * suite *tolerated* a difference, and handing them to the comparator makes it
 * return no error message and no diff image, so a tolerated move would measure
 * as no move at all.
 */
const COUNTING_KNOBS = ["comparator", "threshold"];

/** Whichever counting knobs a declaration actually sets, and nothing else. */
const countingKnobsOf = (declared) =>
  Object.fromEntries(
    COUNTING_KNOBS.filter((knob) => declared[knob] !== undefined).map(
      (knob) => [knob, declared[knob]]
    )
  );

/**
 * The options the config declares for the assertion the catalogue makes.
 *
 * `toHaveScreenshot`, not `toMatchSnapshot`: both are `expect` config keys and
 * both are implemented by `toMatchSnapshot.js`, but every capture in
 * `tests/visual-catalog.spec.ts` is a `toHaveScreenshot`, so the other key binds
 * nothing here and reading it would report a tolerance no capture runs at.
 */
export function screenshotOptions(config) {
  return countingKnobsOf(config?.expect?.toHaveScreenshot ?? {});
}

/** The pixel at (x, y), or null where the comparator padded one image out. */
const pixelAt = (image, x, y) => {
  if (x >= image.width || y >= image.height) return null;
  const at = (y * image.width + x) * 4;
  return [
    image.data[at],
    image.data[at + 1],
    image.data[at + 2],
    image.data[at + 3],
  ];
};

/**
 * How many pixels differ **at all**, over the same padded canvas the comparator
 * compared. Not a second verdict and never the number an account quotes: it is
 * the population the tolerance acted on, and the gap between it and the count
 * is what `threshold` and the antialiasing detector took. Without it a reader
 * reproducing a measurement with a byte comparison gets a larger number and no
 * way to tell which of the two is wrong. On `bb65c52`'s sheet capture the two
 * are 437 and 352.
 */
const differingPixels = (before, after, size) => {
  let differing = 0;
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const a = x < before.width && y < before.height;
      const b = x < after.width && y < after.height;
      if (a !== b) {
        differing++;
        continue;
      }
      if (!a) continue;
      const i = (y * before.width + x) * 4;
      const j = (y * after.width + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        if (before.data[i + channel] !== after.data[j + channel]) {
          differing++;
          break;
        }
      }
    }
  }
  return differing;
};

/** How many pixels the comparator counted, read off its own message. */
const countFrom = (errorMessage) =>
  Number(/(\d+) pixels \(ratio/.exec(errorMessage ?? "")?.[1] ?? 0);

/**
 * What moved, at the tolerance the caller passes.
 *
 * `before` is the comparator's *expected* and `after` its *actual*, which is
 * also the denominator of the ratio: the comparator divides by the expected
 * image's area rather than the padded one, so a resize does not quietly change
 * what the ratio is a ratio of.
 */
export function measure(beforeBuffer, afterBuffer, options = {}) {
  const counting = countingKnobsOf(options);
  const before = PNG.sync.read(beforeBuffer);
  const after = PNG.sync.read(afterBuffer);
  const verdict = getComparator("image/png")(
    afterBuffer,
    beforeBuffer,
    counting
  );

  const resized =
    before.width !== after.width || before.height !== after.height;
  const size = {
    width: Math.max(before.width, after.width),
    height: Math.max(before.height, after.height),
  };
  const differing = differingPixels(before, after, size);
  const measurement = {
    before: { width: before.width, height: before.height },
    after: { width: after.width, height: after.height },
    resized,
    identical: !resized && differing === 0,
    differing,
    count: countFrom(verdict?.errorMessage),
    ratio: 0,
    box: null,
    transitions: [],
    options: counting,
  };
  measurement.ratio = measurement.count / (before.width * before.height);
  if (measurement.count === 0) return measurement;

  const diff = PNG.sync.read(verdict.diff);
  const pairs = new Map();
  let seen = 0;
  for (let y = 0; y < diff.height; y++) {
    for (let x = 0; x < diff.width; x++) {
      const at = (y * diff.width + x) * 4;
      if (
        diff.data[at] !== COUNTED[0] ||
        diff.data[at + 1] !== COUNTED[1] ||
        diff.data[at + 2] !== COUNTED[2] ||
        diff.data[at + 3] !== COUNTED[3]
      ) {
        continue;
      }
      seen++;
      const box = (measurement.box ??= {
        left: x,
        top: y,
        right: x,
        bottom: y,
      });
      box.left = Math.min(box.left, x);
      box.right = Math.max(box.right, x);
      box.bottom = y;
      const from = pixelAt(before, x, y);
      const to = pixelAt(after, x, y);
      const key = `${from}>${to}`;
      const pair = pairs.get(key) ?? { from, to, count: 0 };
      pair.count++;
      pairs.set(key, pair);
    }
  }

  // The two readings are of one thing, so a disagreement means pixelmatch has
  // changed how it draws a counted pixel and every region below it is fiction.
  if (seen !== measurement.count) {
    throw new Error(
      `The comparator counted ${measurement.count} changed pixels and drew ` +
        `${seen} of them. playwright-core's diff colours have moved; see ` +
        `COUNTED in this file.`
    );
  }

  measurement.box.width = measurement.box.right - measurement.box.left + 1;
  measurement.box.height = measurement.box.bottom - measurement.box.top + 1;
  measurement.transitions = [...pairs.values()].sort(
    (a, b) => b.count - a.count
  );
  return measurement;
}

/** `srgb(48)` for a grey, `srgb(48,50,52)` otherwise, alpha only when it bites. */
const colour = (pixel) => {
  if (pixel === null) return "nothing (outside that capture)";
  const [r, g, b, a] = pixel;
  const channels = r === g && g === b ? `${r}` : `${r},${g},${b}`;
  return a === 255 ? `srgb(${channels})` : `srgb(${channels} / ${a})`;
};

/** How many colour pairs a report names before it stops listing them. */
const PAIRS_SHOWN = 4;

/** The measurement as the lines a rebaseline commit's account is written from. */
export function formatReport(measurement, labels) {
  const { before, after, box, count, ratio, resized, options } = measurement;
  const size = `${before.width}x${before.height}`;
  const lines = [
    `${labels.before} → ${labels.after}`,
    resized
      ? `  resized ${size} → ${after.width}x${after.height}`
      : `  ${size}`,
    `  compared at ${describeOptions(options)}`,
  ];

  if (measurement.identical) {
    lines.push("  identical: not one pixel differs, at any tolerance");
    return lines.join("\n");
  }

  const area = before.width * before.height;
  lines.push(
    `  ${count} px changed of ${area} (ratio ${ratio.toPrecision(3)})`
  );
  if (measurement.differing > count) {
    lines.push(
      `  ${measurement.differing} px differ at all; the tolerance above took ` +
        `${measurement.differing - count} of them`
    );
  }
  if (count === 0) return lines.join("\n");

  const covered = box.width * box.height;
  lines.push(
    `  region x ${box.left}-${box.right}, y ${box.top}-${box.bottom} ` +
      `— ${box.width}x${box.height} px, ${count} of ${covered} filled`
  );
  for (const pair of measurement.transitions.slice(0, PAIRS_SHOWN)) {
    lines.push(`  ${pair.count} px ${colour(pair.from)} → ${colour(pair.to)}`);
  }
  const rest = measurement.transitions.length - PAIRS_SHOWN;
  if (rest > 0) lines.push(`  and ${rest} further colour pairs`);
  return lines.join("\n");
}

/** What the comparison ran at, saying out loud where a default came from. */
const describeOptions = (options) => {
  const threshold =
    options.threshold === undefined
      ? "threshold 0.2 (Playwright's default; nothing declares one)"
      : `threshold ${options.threshold}`;
  const comparator = options.comparator ?? "pixelmatch";
  return `${threshold}, comparator ${comparator}`;
};

const die = (message) => {
  console.error(message);
  process.exit(2);
};

async function main(argv) {
  if (argv.length !== 1 && argv.length !== 2) {
    die(
      "usage: node scripts/baseline-diff.mjs <baseline.png>            " +
        "# HEAD vs the tree\n" +
        "       node scripts/baseline-diff.mjs <before.png> <after.png>"
    );
  }

  const config = await import("../playwright.config.ts");
  const options = screenshotOptions(config.default);

  const [first, second] = argv;
  const labels = second
    ? { before: first, after: second }
    : { before: `HEAD:${first}`, after: `${first} (working tree)` };
  const read = (path) => {
    try {
      return readFileSync(path);
    } catch (error) {
      die(`Cannot read ${path}: ${error.message}`);
    }
  };
  const fromHead = (path) => {
    try {
      return execFileSync("git", ["show", `HEAD:./${path}`], {
        maxBuffer: 128 * 1024 * 1024,
        // git's own "exists on disk, but not in HEAD" lands before the sentence
        // below and says less than it does.
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      die(
        `${path} is not in HEAD. A baseline with no prior is a new one, and ` +
          "ADR-0099 §8 clause 4 asks the account for what the screen is rather " +
          "than for a diff."
      );
    }
  };

  const before = second ? read(first) : fromHead(first);
  console.log(
    formatReport(measure(before, read(second ?? first), options), labels)
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main(process.argv.slice(2));
