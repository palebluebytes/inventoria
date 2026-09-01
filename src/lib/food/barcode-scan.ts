// Decode a product barcode from a still image — the desktop upload path (a
// photo dropped/chosen on the Scan tab), the equivalent of pointing a phone
// camera at the pack. Desktop Chrome/Firefox ship no native `BarcodeDetector`,
// so this falls back to the zxing-wasm ponyfill.
//
// Two deliberate choices keep it local-first and light:
//   • `barcode-detector/pure` — the PONYFILL, never the polyfill: it must NOT
//     register a global `BarcodeDetector`, because the Scan tab reads
//     `"BarcodeDetector" in window` to decide live-camera vs upload, and a
//     registered global would wrongly claim native support.
//   • The wasm is SELF-HOSTED via Vite's `?url` (served from our own origin),
//     not fetched from the package's default jsDelivr CDN — the app stays
//     self-contained. Only a tiny URL string is imported eagerly; the ~1 MB
//     wasm + glue load lazily on the first decode (dynamic `import`).

// A URL string only (Vite emits the asset and hands back its path) — importing
// this does NOT pull the wasm binary into the bundle; the browser fetches it
// when zxing initialises on first use.
import zxingReaderWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { ArtifactUnreachableError } from "./bundled-artifact";

// The retail linear symbologies a food barcode uses, plus QR.
//
// EXPORTED because the live camera in FoodStager asks the platform's own
// `BarcodeDetector` for the same list, and the two paths have to decode alike:
// a phone reads through the native detector and a dropped photo reads through
// this ponyfill, and a format in one list and not the other is a code that
// scans on the desktop and not on the phone. It is one list so it cannot drift.
//
// QR is here because the Scan way in reads a meal code as well as a barcode
// (ADR-0074 §4): a Send code's second carrier is a QR, whether it is on the
// other person's screen or in a screenshot they sent. `readScannedCode` is what
// decides which of the two a decode turned out to be.
export const SCAN_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "qr_code",
] as const;

// The ponyfill detector is built once, lazily, and reused; the promise doubles
// as the in-flight guard so concurrent uploads share a single wasm init.
let detectorPromise: Promise<{
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}> | null = null;

/**
 * The ponyfill detector, with its wasm already instantiated.
 *
 * **The module is prepared here rather than left to the first `detect()`**, and
 * that is the whole of #307 on this path. zxing instantiates lazily, so a wasm
 * that could not be fetched used to surface inside `detect()`, where it is
 * indistinguishable from a frame that carried no barcode — and the root does
 * not precache this wasm (ADR-0077 §5), so a cold offline Inventoria hit that
 * every time and told the user their photo was unreadable. Preparing it up
 * front costs nothing (the first decode paid for it anyway) and puts the
 * failure where it can be named.
 *
 * A SUCCESS is what is memoised, for the reason `loadNutrientStore` gives: a
 * cached rejection would answer every scan for the rest of the session, and the
 * likeliest cause here is one that clears by itself.
 */
function getDetector() {
  detectorPromise ??= (async () => {
    const { BarcodeDetector, prepareZXingModule, purgeZXingModule } =
      await import("barcode-detector/pure");
    try {
      // Point zxing at our self-hosted wasm instead of the CDN default, and
      // fetch it now rather than on the first frame.
      await prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? zxingReaderWasmUrl : prefix + path,
        },
        fireImmediately: true,
      });
    } catch (cause) {
      // zxing caches the module promise as well, keyed on the overrides object,
      // so forgetting ours below is not enough on its own: purge its rejected
      // one, or the retry is handed the same failure without a fetch.
      purgeZXingModule();
      throw cause;
    }
    return new BarcodeDetector({ formats: [...SCAN_FORMATS] });
  })().catch((cause) => {
    detectorPromise = null;
    // The wasm is what this names, and it is the only file here that can go
    // missing: the ponyfill chunk is in the derived code half of BOTH Facets'
    // precache (ADR-0077 §2), so an offline load gets the chunk and fails on
    // the wasm the root gave up (§5). Unlike the USDA artifacts there is no
    // status to read either way — zxing owns that fetch — so a build that
    // dropped the file is reported as needing a network too, which is a corner
    // this path cannot tell apart and does not pretend to.
    throw new ArtifactUnreachableError(
      "The barcode reader",
      zxingReaderWasmUrl,
      cause
    );
  });
  return detectorPromise;
}

/**
 * Decodes the first product barcode from any image source — a still image, a
 * canvas, or a live `<video>` frame — or `null` when none is readable. Used both
 * by the desktop upload path (a decoded still) and as the live camera's fallback
 * (a video frame, when the native detector keeps missing). A `detect()` that
 * throws on an unreadable frame is a non-decode, not an error, so it maps to
 * `null`; only a reader that could not load rejects, and it rejects as an
 * `ArtifactUnreachableError` so the caller can say the network is why (#307).
 */
export async function decodeBarcode(
  source: ImageBitmapSource
): Promise<string | null> {
  const detector = await getDetector();
  try {
    const codes = await detector.detect(source);
    return codes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

/**
 * Decodes the first product barcode found in an image blob (the desktop upload
 * path), or `null` when none is readable — the caller then lets the user type
 * the digits. A thin wrapper over {@link decodeBarcode} that owns the bitmap's
 * lifetime.
 */
export async function decodeBarcodeFromImage(
  image: Blob
): Promise<string | null> {
  const bitmap = await createImageBitmap(image);
  try {
    return await decodeBarcode(bitmap);
  } finally {
    bitmap.close();
  }
}
