/**
 * Reads an image File into a base64 data URL — the one shared helper behind every
 * food-capture surface that stashes a photo on a twin (the label form's multi-shot
 * reader, the desktop barcode upload, and the manual-entry mini-forms). Rejects if
 * the read fails, so callers can surface a "couldn't read that image" message.
 *
 * A photo is bounded on its way through (ADR-0066): what the camera produced is
 * far more resolution than a label needs, and the ledger is append-only, so an
 * oversized photo is a cost it carries forever. The reduction lives here rather
 * than at the call sites precisely so no capture surface can skip it.
 */

/** A pixel size, of a source image or of the canvas it is redrawn onto. */
export interface PixelSize {
  width: number;
  height: number;
}

/**
 * The longest edge a stored photo may have, in pixels (ADR-0066). Landscape or
 * portrait, whichever edge is longer is bounded to this and the other follows.
 */
export const MAX_PHOTO_EDGE = 1600;

/**
 * What to do with a decoded photo: redraw it at a bounded size, or store the
 * bytes that were read. A photo already inside the bound is left exactly as it
 * came, so a small upload is never re-encoded and never loses anything.
 */
export type PhotoReduction = { kind: "keep" } | ({ kind: "scale" } & PixelSize);

/**
 * The pure half of the reduction: what size does this source size imply?
 * Separated from the canvas so the decision is testable without a DOM.
 *
 * The bound applies to the longer edge and the shorter one is scaled by the same
 * ratio, so the aspect ratio survives. Rounding is toward the nearest pixel; a
 * canvas cannot draw a fractional one.
 */
export function planPhotoReduction(
  source: PixelSize,
  maxEdge: number = MAX_PHOTO_EDGE
): PhotoReduction {
  const longest = Math.max(source.width, source.height);
  if (longest <= maxEdge) return { kind: "keep" };
  const ratio = maxEdge / longest;
  return {
    kind: "scale",
    width: Math.round(source.width * ratio),
    height: Math.round(source.height * ratio),
  };
}

/**
 * The image machinery the reduction needs, behind an interface: decoding a data
 * URL to something with intrinsic dimensions, and redrawing it smaller.
 *
 * It is an interface because the browser is the only place any of this exists.
 * The unit runner is Node, with no `Image` and no `HTMLCanvasElement`, so a test
 * supplies a surface that records what it was asked to draw.
 */
export interface PhotoSurface {
  decode(dataUrl: string): Promise<DecodedPhoto>;
}

/** A decoded image: the size it came in at, and a way to redraw it smaller. */
export interface DecodedPhoto extends PixelSize {
  /** Draws this image at `target` and encodes it, answering a fresh data URL. */
  redraw(target: PixelSize, quality: number): Promise<string>;
}

/**
 * The encoder quality a reduced photo is written at, 0 to 1 (ADR-0066). High
 * enough that JPEG's ringing does not chew the edges of small print, which is
 * the one thing a label photo exists to preserve.
 */
export const PHOTO_QUALITY = 0.8;

/** The format a reduced photo is re-encoded to (ADR-0066). */
const PHOTO_MIME = "image/jpeg";

/**
 * Bounds a photo that has already been read, answering the data URL to store.
 *
 * A photo inside the bound comes back exactly as it was read: no round-trip, no
 * re-encode, nothing lost. Above it, what comes back is what the canvas drew.
 * A `surface` of `null` is a browser with no canvas, where the honest answer is
 * the bytes we have rather than no photo at all.
 *
 * A failed decode rejects, and the callers' existing "couldn't read that image"
 * path carries it — a malformed image is not stored half-reduced.
 */
export async function reduceCapturedPhoto(
  dataUrl: string,
  surface: PhotoSurface | null,
  maxEdge: number = MAX_PHOTO_EDGE
): Promise<string> {
  if (!surface) return dataUrl;
  const photo = await surface.decode(dataUrl);
  const plan = planPhotoReduction(photo, maxEdge);
  if (plan.kind === "keep") return dataUrl;
  return photo.redraw(
    { width: plan.width, height: plan.height },
    PHOTO_QUALITY
  );
}

/**
 * Reads an image File to a data URL, bounded on the way through.
 *
 * Deliberately one parameter and no more: a call site reads a multi-shot capture
 * with `files.map(readImageAsDataUrl)`, which would hand a second parameter the
 * array index. Anything the reduction needs to be told is told to
 * {@link reduceCapturedPhoto} instead.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
  return readFileAsDataUrl(file).then((dataUrl) =>
    reduceCapturedPhoto(dataUrl, browserPhotoSurface())
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** The real surface: an `Image` to decode with and a canvas to redraw on. */
function browserPhotoSurface(): PhotoSurface | null {
  if (typeof Image === "undefined" || typeof document === "undefined")
    return null;
  return {
    decode: (dataUrl) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
            redraw: async (target, quality) => {
              const canvas = document.createElement("canvas");
              canvas.width = target.width;
              canvas.height = target.height;
              const context = canvas.getContext("2d");
              if (!context) throw new Error("no drawing context");
              // JPEG carries no alpha, and a canvas starts out transparent, so
              // the clear parts of a PNG would encode as black. Lay a white
              // ground first — paper, which is what a label is photographed on.
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, target.width, target.height);
              context.drawImage(image, 0, 0, target.width, target.height);
              return canvas.toDataURL(PHOTO_MIME, quality);
            },
          });
        image.onerror = () => reject(new Error("decode failed"));
        image.src = dataUrl;
      }),
  };
}
