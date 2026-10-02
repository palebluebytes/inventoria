import type { PhotoSurface } from "../../../src/lib/food/image-file";

/**
 * A canvas for the egress seal, for tests that go through `askModel`.
 *
 * The unit runner is Node: no `Image`, no `HTMLCanvasElement`, so
 * `browserPhotoSurface()` answers `null` and a sealed send has nothing to draw
 * on. This is the surface those tests inject instead, and it answers a **real
 * base64 data URL** — the thing `reencodeForEgress` strips — rather than a
 * marker string, so a test asserting the wire is asserting the real transform.
 *
 * `label` distinguishes the frames when a test sends several, which is how
 * "every photograph went, in order" is checked at all.
 */
export function stubPhotoSurface(): PhotoSurface {
  let nth = 0;
  return {
    decode: async () => {
      const label = `SEALED${nth++}`;
      return {
        width: 800,
        height: 600,
        redraw: async () =>
          `data:image/jpeg;base64,${Buffer.from(label).toString("base64")}`,
      };
    },
  };
}

/** What {@link stubPhotoSurface} seals the nth photograph to, as the wire carries it. */
export function sealedAs(nth: number): string {
  return Buffer.from(`SEALED${nth}`).toString("base64");
}
