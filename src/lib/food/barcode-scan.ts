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

// The retail linear symbologies a food barcode uses — the same set the live
// `BarcodeDetector` scanner requests in FoodStager, so both paths decode alike.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

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
 * Decodes the first product barcode found in an image, or `null` when none is
 * readable (a poor photo, or no barcode in frame) — the caller then lets the
 * user type the digits. Never throws for a non-decode; a genuine failure (the
 * wasm couldn't load) rejects so the caller can surface it.
 */
export async function decodeBarcodeFromImage(
  image: Blob
): Promise<string | null> {
  const detector = await getDetector();
  const bitmap = await createImageBitmap(image);
  try {
    const codes = await detector.detect(bitmap);
    return codes[0]?.rawValue ?? null;
  } catch {
    // A detect() that throws on an unreadable frame is a non-decode, not an
    // error — treat it the same as "no barcode found".
    return null;
  } finally {
    bitmap.close();
  }
}
