import { describe, it, expect } from "vitest";
import {
  planPhotoReduction,
  reduceCapturedPhoto,
  reencodeForEgress,
  MAX_PHOTO_EDGE,
  PHOTO_QUALITY,
  type PixelSize,
  type PhotoSurface,
} from "../../src/lib/food/image-file";

const ORIGINAL = "data:image/jpeg;base64,AAAAoriginal";

/**
 * A canvas that records what it was asked to draw instead of drawing it. The
 * unit runner is Node, so there is no real one; this is the seam the browser
 * surface plugs into.
 */
function fakeSurface(source: PixelSize) {
  const drawn: { target: PixelSize; quality: number }[] = [];
  const surface: PhotoSurface = {
    decode: async (dataUrl: string) => ({
      ...source,
      redraw: async (target: PixelSize, quality: number) => {
        drawn.push({ target, quality });
        return `${dataUrl}-redrawn`;
      },
    }),
  };
  return { surface, drawn };
}

// A captured photo is bounded before it becomes a datom value (ADR-0066). The
// decision of what size to draw at is pure, so it is tested here on its own;
// the canvas that carries it out is exercised through the injected surface
// below.
describe("planning a captured photo's reduction", () => {
  it("scales a photo above the bound down to it, keeping the aspect ratio", () => {
    // A 12 MP phone photo, 4:3 landscape.
    expect(planPhotoReduction({ width: 4032, height: 3024 })).toEqual({
      kind: "scale",
      target: { width: 1600, height: 1200 },
    });
  });

  it("bounds the long edge whichever edge that is", () => {
    expect(planPhotoReduction({ width: 3024, height: 4032 })).toEqual({
      kind: "scale",
      target: { width: 1200, height: 1600 },
    });
  });

  it("leaves a photo already inside the bound alone", () => {
    expect(planPhotoReduction({ width: 1024, height: 768 })).toEqual({
      kind: "keep",
    });
    expect(planPhotoReduction({ width: MAX_PHOTO_EDGE, height: 900 })).toEqual({
      kind: "keep",
    });
  });
});

describe("reducing a captured photo before it is stored", () => {
  it("redraws a photo above the bound and stores what came back off the canvas", async () => {
    const { surface, drawn } = fakeSurface({ width: 4032, height: 3024 });

    const stored = await reduceCapturedPhoto(ORIGINAL, surface);

    expect(stored).toBe(`${ORIGINAL}-redrawn`);
    expect(drawn).toEqual([
      { target: { width: 1600, height: 1200 }, quality: PHOTO_QUALITY },
    ]);
  });

  it("stores the bytes it read when the photo is already inside the bound", async () => {
    const { surface, drawn } = fakeSurface({ width: 1024, height: 768 });

    expect(await reduceCapturedPhoto(ORIGINAL, surface)).toBe(ORIGINAL);
    expect(drawn).toEqual([]);
  });

  it("rejects a malformed image rather than storing something broken", async () => {
    const surface: PhotoSurface = {
      decode: () => Promise.reject(new Error("decode failed")),
    };

    await expect(reduceCapturedPhoto(ORIGINAL, surface)).rejects.toThrow(
      "decode failed"
    );
  });

  it("stores the bytes it read where there is no canvas to redraw on", async () => {
    expect(await reduceCapturedPhoto(ORIGINAL, null)).toBe(ORIGINAL);
  });
});

/**
 * The outbound seal (ADR-0115 §3.1, §5.1).
 *
 * It is the reduction's opposite number and deliberately differs from it in the
 * one place that matters: there is no `keep` branch, because the canvas
 * round-trip the reduction skips is the thing that drops EXIF. The test that
 * earns its place is the small-photo one — the reduction's own suite above
 * proves a small photo is NOT redrawn, so a shared implementation would make
 * one of the two wrong.
 */
describe("sealing a photo for egress", () => {
  /** A canvas whose redraw answers a real JPEG data URL, as the browser's does. */
  function egressSurface(source: PixelSize) {
    const drawn: { target: PixelSize; quality: number }[] = [];
    const surface: PhotoSurface = {
      decode: async () => ({
        ...source,
        redraw: async (target: PixelSize, quality: number) => {
          drawn.push({ target, quality });
          return "data:image/jpeg;base64,UkVEUkFXTg==";
        },
      }),
    };
    return { surface, drawn };
  }

  it("re-encodes a photo already inside the bound, at its own size", async () => {
    // The reduction leaves this one exactly as it was read, EXIF and all. The
    // outbound path must not: a kitchen photo under 1600 px carries a GPS tag.
    const { surface, drawn } = egressSurface({ width: 1200, height: 900 });
    const sealed = await reencodeForEgress(ORIGINAL, surface);

    expect(drawn).toEqual([
      { target: { width: 1200, height: 900 }, quality: PHOTO_QUALITY },
    ]);
    expect(sealed).toBe("UkVEUkFXTg==");
  });

  it("still scales a photo above the bound, on the same plan", async () => {
    const { surface, drawn } = egressSurface({ width: 4032, height: 3024 });
    await reencodeForEgress(ORIGINAL, surface);
    expect(drawn[0].target).toEqual({ width: 1600, height: 1200 });
  });

  it("answers bare base64, never a data URL", async () => {
    // §5.1's wire is `images: ["<base64>"]`, and the far side re-attaches a
    // preamble of its own. A data URL here arrives there double-prefixed.
    const { surface } = egressSurface({ width: 800, height: 600 });
    const sealed = await reencodeForEgress(ORIGINAL, surface);
    expect(sealed.startsWith("data:")).toBe(false);
    expect(sealed).not.toContain(",");
  });

  it("refuses a canvas result that is not a base64 data URL", async () => {
    const surface: PhotoSurface = {
      decode: async () => ({
        width: 800,
        height: 600,
        redraw: async () => "blob:https://example.test/abcd",
      }),
    };
    await expect(reencodeForEgress(ORIGINAL, surface)).rejects.toThrow(
      "not a data URL"
    );
  });
});
