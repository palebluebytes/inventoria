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

// The retail linear symbologies a food barcode uses, plus QR — the same set the
// live `BarcodeDetector` scanner requests in FoodStager, so both paths decode
// alike. QR is here because the Scan way in reads a meal code as well as a
// barcode (ADR-0074 §4): a Send code's second carrier is a QR, and a photo of
// one — a screenshot somebody was sent — must read the same as the camera does.
// `readScannedCode` is what decides which of the two a decode turned out to be.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code"] as const;

// The ponyfill detector is built once, lazily, and reused; the promise doubles
// as the in-flight guard so concurrent uploads share a single wasm init.
let detectorPromise: Promise<{
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}> | null = null;

function getDetector() {
  if (!detectorPromise) {
    detectorPromise = import("barcode-detector/pure").then(
      ({ BarcodeDetector, prepareZXingModule }) => {
        // Point zxing at our self-hosted wasm instead of the CDN default.
        prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) =>
              path.endsWith(".wasm") ? zxingReaderWasmUrl : prefix + path,
          },
        });
        return new BarcodeDetector({ formats: [...FORMATS] });
      }
    );
  }
  return detectorPromise;
}

/**
 * Decodes the first product barcode from any image source — a still image, a
 * canvas, or a live `<video>` frame — or `null` when none is readable. Used both
 * by the desktop upload path (a decoded still) and as the live camera's fallback
 * (a video frame, when the native detector keeps missing). A `detect()` that
 * throws on an unreadable frame is a non-decode, not an error, so it maps to
 * `null`; only a genuine wasm-load failure rejects, so the caller can surface it.
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
