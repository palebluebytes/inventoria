import { describe, it, expect } from "vitest";
import {
  planPhotoReduction,
  reduceCapturedPhoto,
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
      width: 1600,
      height: 1200,
    });
  });

  it("bounds the long edge whichever edge that is", () => {
    expect(planPhotoReduction({ width: 3024, height: 4032 })).toEqual({
      kind: "scale",
      width: 1200,
      height: 1600,
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
