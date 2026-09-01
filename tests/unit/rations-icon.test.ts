import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// #302: Rations gets an icon the project is allowed to ship, and the one thing
// about it that can break silently is transparency.
//
// The art is a black line drawing on nothing (`docs/icon-provenance.md`), and a
// manifest's `background_color` is what an installed app composites its icon
// onto. The root's is `#000000`, so a transparent copy of this icon is not a
// dimmer icon — it is a black square, measured. That failure never shows up in
// the build, in `pnpm check` or on a developer's light desktop; it shows up on
// somebody's home screen. So the invariant the shipped files carry is
// **opacity**, and it is asserted from the file rather than from the recipe
// that produced it, because a regenerated set is exactly where it would be lost.

const ICON = (name: string) =>
  fileURLToPath(new URL(`../../public/food/icons/${name}`, import.meta.url));

/**
 * The roster Rations installs under, and what each size is for.
 *
 * 192 and 512 are the pair a web app manifest is expected to carry, `maskable`
 * is Android's own crop (ADR-0077 ships per-Facet installs), 180 is the
 * `apple-touch-icon` iOS uses for a Home Screen clip, and 32 is the browser tab.
 * #305 is what turns this into a manifest; here it is only what must exist.
 */
const ROSTER = [
  { file: "rations-512.png", size: 512 },
  { file: "rations-maskable-512.png", size: 512 },
  { file: "rations-192.png", size: 192 },
  { file: "rations-180.png", size: 180 },
  { file: "rations-32.png", size: 32 },
] as const;

/**
 * What a PNG says about itself in its header, plus whether any chunk adds
 * transparency.
 *
 * Reading the header is the whole point: it proves opacity for every pixel at
 * once, where sampling decoded pixels would only prove it for the ones sampled.
 * A PNG can carry alpha in exactly two ways — a colour type with an alpha
 * channel (bit 2 of the type), or a `tRNS` chunk making one palette entry or one
 * colour transparent. Neither present means no pixel in the file can be anything
 * but opaque.
 */
function readPng(path: string) {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) {
    throw new Error(`${path} is not a PNG`);
  }

  let hasTrns = false;
  // Chunks run length(4) + type(4) + data + crc(4) from byte 8. IHDR is always
  // first, so its fields sit at fixed offsets; everything after is walked.
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    if (type === "tRNS") hasTrns = true;
    if (type === "IEND") break;
    at += 12 + length;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes[25],
    hasTrns,
  };
}

describe("the Rations icon (#302)", () => {
  it("ships every size a manifest and a home screen ask for, square", () => {
    for (const { file, size } of ROSTER) {
      const png = readPng(ICON(file));
      expect({ file, ...png }).toMatchObject({ width: size, height: size });
    }
  });

  it("carries no transparency, so no background_color can show through", () => {
    for (const { file } of ROSTER) {
      const png = readPng(ICON(file));
      // Bit 2 of the colour type is the alpha channel: types 4 and 6 have one,
      // types 0, 2 and 3 do not.
      expect({ file, alphaChannel: (png.colourType & 4) !== 0 }).toEqual({
        file,
        alphaChannel: false,
      });
      expect({ file, hasTrns: png.hasTrns }).toEqual({ file, hasTrns: false });
    }
  });
});
