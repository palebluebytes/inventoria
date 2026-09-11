// A plain-Node ops script, deliberately outside the app's tsconfig: it is the
// one module that knows how to reach inside playwright-core (AGENTS.md §1).
// @ts-ignore
import { playwrightModule } from "../../../scripts/baseline-diff.mjs";

/**
 * Small PNGs, painted pixel by pixel.
 *
 * Two tests hand images to Playwright's own comparator — `baseline-diff.test.ts`
 * proves the instrument reports what the comparator saw, and
 * `screenshot-tolerance.test.ts` asks the comparator what `threshold` admits.
 * Both need a buffer the comparator will read, and both reach `PNG` through the
 * same deep import, so the walk into `playwright-core` is written once here
 * rather than once per caller (ADR-0099's second 2026-09-08 Amendment).
 *
 * These are *inputs*, not fixtures of anything the app draws: solid blocks and
 * rectangles a few pixels across, small enough that a failure can quote the
 * whole image.
 */
const { PNG } = playwrightModule("lib/utilsBundle");

/** An opaque colour, as the channels a PNG stores. */
export type Rgb = [number, number, number];

/** A colour that may also say what it does to what is behind it. */
export type Rgba = [number, number, number, number];

/**
 * An image filled with `base`, then overwritten wherever `over` names a colour.
 *
 * `over` returning `null` means "leave this one alone", so a caller describes
 * the shape it cares about and says nothing about the rest — which is what
 * keeps a block's coordinates readable beside the assertion about them.
 */
export function paint(
  width: number,
  height: number,
  base: Rgb,
  over: (x: number, y: number) => Rgb | Rgba | null = () => null
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const [r, g, b, a = 255] = over(x, y) ?? base;
      png.data[at] = r;
      png.data[at + 1] = g;
      png.data[at + 2] = b;
      png.data[at + 3] = a;
    }
  }
  return PNG.sync.write(png);
}
