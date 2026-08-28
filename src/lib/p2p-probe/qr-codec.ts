/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/p2p-probe/README.md`.
 *
 * The impure edge: bytes to a QR image, and a camera frame back to bytes.
 *
 * Both halves go through `zxing-wasm`, which this repo already ships, and both
 * wasm binaries are self-hosted via Vite's `?url` for the same reason
 * `src/lib/food/barcode-scan.ts` self-hosts the reader — the app does not fetch
 * from a CDN, and a probe about needing no infrastructure certainly must not.
 *
 * The reader here is `zxing-wasm/reader` directly, NOT the
 * `barcode-detector/pure` ponyfill the app uses for product barcodes. The
 * ponyfill's `detect()` returns `rawValue` as a string, and this probe carries
 * arbitrary binary; `readBarcodes` returns `bytes: Uint8Array`, which is the
 * whole difference. Whether that binary actually survives the round trip is one
 * of the things the probe is measuring, so `encoding` is a switch rather than a
 * decision.
 */

import zxingReaderWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import zxingWriterWasmUrl from "zxing-wasm/writer/zxing_writer.wasm?url";

/**
 * How a payload's bytes are put into the symbol.
 *
 * `binary` writes them as a byte-mode segment and reads `ReadResult.bytes`
 * back. `base64` writes ASCII and reads `ReadResult.text`, costing exactly 33%
 * more symbol capacity — QR byte mode charges 8 bits per character either way —
 * but surviving any reader that insists on decoding text. #194 §4.3 recommends
 * base45 (RFC 9285) over base64 for that job at 3.1% overhead; base64 is here
 * because it is one line and the probe only needs to know whether the binary
 * path is the one that breaks.
 */
export type QrEncoding = "binary" | "base64";

export type EcLevel = "L" | "M" | "Q" | "H";

let writerReady: Promise<typeof import("zxing-wasm/writer")> | null = null;
let readerReady: Promise<typeof import("zxing-wasm/reader")> | null = null;

function writer() {
  writerReady ??= import("zxing-wasm/writer").then((mod) => {
    mod.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? zxingWriterWasmUrl : prefix + path,
      },
    });
    return mod;
  });
  return writerReady;
}

function reader() {
  readerReady ??= import("zxing-wasm/reader").then((mod) => {
    mod.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? zxingReaderWasmUrl : prefix + path,
      },
    });
    return mod;
  });
  return readerReady;
}

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const fromBase64 = (text: string): Uint8Array => {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export interface RenderedSymbol {
  svg: string;
  /** The version zxing actually chose, parsed out of `ReadResult.extra`'s sibling. */
  version: string;
  bytes: number;
}

/**
 * Renders one frame as an SVG QR symbol.
 *
 * SVG rather than a raster because the display end of this is a phone screen
 * being photographed by another phone, and a vector symbol scales to the
 * device's real pixels instead of being resampled twice.
 */
export async function renderSymbol(
  frame: Uint8Array,
  ecLevel: EcLevel,
  encoding: QrEncoding
): Promise<RenderedSymbol> {
  const { writeBarcode } = await writer();
  const input: string | Uint8Array =
    encoding === "base64" ? toBase64(frame) : frame;
  const result = await writeBarcode(input, {
    format: "QRCode",
    options: `ecLevel=${ecLevel}`,
    scale: 1,
    addQuietZones: true,
  });
  if (result.error) throw new Error(result.error);
  return {
    svg: result.svg,
    version: `${result.symbol?.width ?? 0}x${result.symbol?.height ?? 0}`,
    bytes: typeof input === "string" ? input.length : input.length,
  };
}

/**
 * Reads every QR symbol in one camera frame back to bytes.
 *
 * `maxNumberOfSymbols` is raised above one because a chain is displayed as a
 * cycling single symbol but a receiver might be pointed at two screens, and
 * because a miss costs a whole frame — there is no reason to stop at the first.
 * `tryHarder` is on for the same reason: the frame rate is not the bottleneck,
 * the handover is.
 */
export async function readSymbols(
  frame: ImageData,
  encoding: QrEncoding
): Promise<Uint8Array[]> {
  const { readBarcodes } = await reader();
  const results = await readBarcodes(frame, {
    formats: ["QRCode"],
    tryHarder: true,
    tryInvert: false,
    maxNumberOfSymbols: 4,
  });
  const out: Uint8Array[] = [];
  for (const r of results) {
    if (!r.isValid) continue;
    try {
      out.push(encoding === "base64" ? fromBase64(r.text) : r.bytes);
    } catch {
      // A symbol that is not ours, or base64 that will not decode. Not an
      // error: the camera sees whatever is in the room.
    }
  }
  return out;
}
