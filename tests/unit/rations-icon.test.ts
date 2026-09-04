import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// #302: Rations gets an icon the project is allowed to ship, and the things
// about it that can break silently are what its alpha channel does and does not
// cover.
//
// The art is a black line drawing on nothing (`docs/icon-provenance.md`), so
// every white in the picture — the tin's body, the fish, the paper inside the
// ring pull — is ground showing through rather than paint. The shipped set
// keeps that ground only *inside* the drawing's outline and clears it outside,
// which is what makes the mark sit on a tab bar or a launcher of any colour.
// Two ways that goes wrong, neither of which shows up in the build, in
// `pnpm check` or on a developer's light desktop:
//
//   - **The paper goes too.** Keying out white by colour rather than by
//     reachability takes the interior with the ground, and a manifest's
//     `background_color` is what an installed app composites its icon onto. On
//     the root's `#000000` the drawing then collapses to one uniform black
//     square — measured, not estimated.
//   - **The ground stays.** A regenerated set flattened onto paper is a white
//     rectangle again, which is the thing this change removed.
//
// So the invariants are asserted from the files: which of them carry alpha at
// all, that the cleared ground really is cleared, and that the paper under the
// drawing really did survive. All three are read out of the pixels rather than
// out of the recipe that produced them, because a regenerated set is exactly
// where they would be lost, and the loss would show up on somebody's home
// screen rather than in any gate.

const ICON = (name: string) =>
  fileURLToPath(new URL(`../../public/food/icons/${name}`, import.meta.url));

/**
 * The roster Rations installs under, what each size is for, and whether it may
 * carry transparency.
 *
 * 192 and 512 are the pair a web app manifest is expected to carry, `maskable`
 * is Android's own crop (ADR-0077 ships per-Facet installs), 180 is the
 * `apple-touch-icon` iOS uses for a Home Screen clip, and 32 is the browser tab.
 * #305 turned three of the five into `icons` entries; here it is only what
 * must exist, which is the wider set — the 180 and the 32 are `<link>`s in
 * `food/index.html` rather than manifest members, because that is where a
 * browser looks for them.
 *
 * `ground` is the shape of the opaque paper each file keeps, and the maskable
 * is the one that keeps all of it: Android crops a maskable icon to a shape the
 * icon does not get told, so any transparency in it is a hole onto whatever the
 * launcher puts behind, and the file has to be full-bleed.
 */
const ROSTER = [
  { file: "rations-512.png", size: 512, ground: "drawing" },
  { file: "rations-maskable-512.png", size: 512, ground: "full-bleed" },
  { file: "rations-192.png", size: 192, ground: "drawing" },
  { file: "rations-180.png", size: 180, ground: "disc" },
  { file: "rations-32.png", size: 32, ground: "drawing" },
] as const;

/**
 * What a PNG says about itself in its header, plus whether any chunk adds
 * transparency.
 *
 * A PNG can carry alpha in exactly two ways — a colour type with an alpha
 * channel (bit 2 of the type), or a `tRNS` chunk making one palette entry or
 * one colour transparent. Reading both is what lets the maskable's opacity be
 * proved for every pixel at once, where sampling decoded pixels would only
 * prove it for the ones sampled.
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
  const idat: Buffer[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    if (type === "tRNS") hasTrns = true;
    if (type === "IDAT") idat.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === "IEND") break;
    at += 12 + length;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colourType: bytes[25],
    interlace: bytes[28],
    hasTrns,
    idat,
  };
}

/**
 * Grey and alpha for every pixel, decoded from the file.
 *
 * The whole set is 8-bit, non-interlaced, and either greyscale (colour type 0)
 * or greyscale-with-alpha (type 4), so this handles those and refuses anything
 * else rather than quietly mis-reading it. Undoing the per-row filters is the
 * only real work: PNG stores each scanline as one filter byte plus bytes that
 * are differences against the pixel to the left, the row above, or both.
 */
function decodePng(path: string) {
  const png = readPng(path);
  if (png.bitDepth !== 8 || png.interlace !== 0) {
    throw new Error(`${path}: expected 8-bit non-interlaced`);
  }
  if (png.colourType !== 0 && png.colourType !== 4) {
    throw new Error(
      `${path}: expected greyscale, colour type ${png.colourType}`
    );
  }

  const channels = png.colourType === 4 ? 2 : 1;
  const stride = png.width * channels;
  const raw = inflateSync(Buffer.concat(png.idat));
  const out = Buffer.alloc(stride * png.height);

  let above = Buffer.alloc(stride);
  for (let y = 0; y < png.height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = above[i];
      const upLeft = i >= channels ? above[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        // Paeth: whichever of the three neighbours the linear prediction
        // left + up - upLeft lands nearest to.
        const guess = left + up - upLeft;
        const dLeft = Math.abs(guess - left);
        const dUp = Math.abs(guess - up);
        const dUpLeft = Math.abs(guess - upLeft);
        v +=
          dLeft <= dUp && dLeft <= dUpLeft
            ? left
            : dUp <= dUpLeft
              ? up
              : upLeft;
      }
      row[i] = v & 255;
    }
    above = row;
  }

  const at = (x: number, y: number) => {
    const i = (y * png.width + x) * channels;
    return { grey: out[i], alpha: channels === 2 ? out[i + 1] : 255 };
  };

  let clear = 0;
  let paper = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const { grey, alpha } = at(x, y);
      if (alpha === 0) clear++;
      else if (alpha === 255 && grey === 255) paper++;
    }
  }

  const total = png.width * png.height;
  return {
    ...png,
    at,
    /** Fraction of the canvas that is fully transparent. */
    clear: clear / total,
    /** Fraction that is fully opaque white — the drawing's own ground. */
    paper: paper / total,
  };
}

describe("the Rations icon (#302)", () => {
  it("ships every size a manifest and a home screen ask for, square", () => {
    for (const { file, size } of ROSTER) {
      const png = readPng(ICON(file));
      expect({ file, width: png.width, height: png.height }).toEqual({
        file,
        width: size,
        height: size,
      });
    }
  });

  it("keeps the maskable full-bleed, because Android crops it to a shape it is not told", () => {
    const png = readPng(ICON("rations-maskable-512.png"));
    // Bit 2 of the colour type is the alpha channel: types 4 and 6 have one,
    // types 0, 2 and 3 do not.
    expect({
      alphaChannel: (png.colourType & 4) !== 0,
      hasTrns: png.hasTrns,
    }).toEqual({ alphaChannel: false, hasTrns: false });
  });

  it("clears the ground outside the drawing on every other file", () => {
    for (const { file, ground, size } of ROSTER) {
      if (ground === "full-bleed") continue;
      const png = decodePng(ICON(file));
      expect({ file, alphaChannel: (png.colourType & 4) !== 0 }).toEqual({
        file,
        alphaChannel: true,
      });
      // A corner is the one place every layout in the set agrees is ground:
      // the drawing is centred and inset, and so is the disc.
      expect({ file, corner: png.at(0, 0).alpha }).toEqual({ file, corner: 0 });
      expect({ file, centre: png.at(size >> 1, size >> 1).alpha }).toEqual({
        file,
        centre: 255,
      });
    }
  });

  it("keeps the paper inside the drawing, so no background_color shows through it", () => {
    // The failure this guards is keying white out by colour instead of by
    // reachability from the edge. It would leave the outline intact and the
    // whole interior clear, which reads correctly on paper and collapses to a
    // single black square on the root's `#000000`. A tenth of the canvas is
    // well under every file's measured share (13.2% is the smallest, on the
    // 192, where antialiasing takes the largest bite) and far above what a
    // hollowed-out drawing could retain.
    for (const { file } of ROSTER) {
      const png = decodePng(ICON(file));
      expect({ file, keepsPaper: png.paper > 0.1 }).toEqual({
        file,
        keepsPaper: true,
      });
    }
  });

  it("gives the apple-touch-icon a disc, because iOS composites its alpha onto black", () => {
    // iOS does not honour a Home Screen clip's transparency; it fills it with
    // black. So this one file's ground is a shape rather than a silhouette —
    // the tin sits on a white disc, and what iOS blacks out is only the four
    // corners the disc does not reach. A full-canvas circle leaves
    // 1 - pi/4 = 21.5% of the square outside it, less the antialiased rim; the
    // silhouette files clear well over half, so this band is what separates a
    // disc from a keyed-out drawing rather than a restatement of it.
    const png = decodePng(ICON("rations-180.png"));
    expect(png.clear).toBeGreaterThan(0.15);
    expect(png.clear).toBeLessThan(0.215);
  });
});
