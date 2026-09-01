/**
 * The Send code as a symbol somebody can point a camera at (ADR-0072 §7,
 * ADR-0074 §3).
 *
 * The writer is `zxing-wasm`, which this repo already ships, self-hosted
 * through Vite's `?url` for the same reason `src/lib/food/barcode-scan.ts`
 * self-hosts the reader: the app fetches from no CDN, and a feature whose whole
 * argument is that it needs no infrastructure certainly must not.
 *
 * **SVG rather than a raster**, because the display end of this is one phone
 * screen being photographed by another, and a vector symbol lands on the
 * device's real pixels instead of being resampled twice.
 *
 * **The symbol is sized for a version 5 code and no denser.** A Send code is a
 * room id and a key — about 100 characters with the origin, and it does not
 * grow with the meal, because there is nothing in a code a payload could reach
 * (ADR-0072 §3). The measured symbol is 37x37 modules, read in 931 ms. Error
 * correction stays at `L` for the same reason: the code is read once, at arm's
 * length, off a lit screen, and spending capacity on redundancy would buy a
 * denser symbol for a case that does not arise.
 *
 * Ported from the #198 probe's `qr-codec.ts` (retired by #239), narrowed on the
 * way: the probe carried arbitrary binary and had a byte-mode/base64 switch to
 * find out which survived a round trip. A code is a URL, so it is written as
 * text. Only the writer half came here — the Scan way in reads a code through
 * `src/lib/food/barcode-scan.ts`, which already had a reader and gained `QR` as
 * a format rather than a second decoder being stood up beside it.
 */

import zxingWriterWasmUrl from "zxing-wasm/writer/zxing_writer.wasm?url";

let writerReady: Promise<typeof import("zxing-wasm/writer")> | null = null;

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

/**
 * Hands the sizing back to CSS.
 *
 * zxing emits a root `<svg>` carrying its own `width`/`height` in module units,
 * which no stylesheet rule can beat once the markup is injected — the symbol
 * renders at 45 px in the corner of whatever holds it. Stripping them and
 * leaning on a `viewBox` is what gives a box the say; the writer's output
 * carries no `viewBox` at all, so one is synthesised from the dimensions being
 * removed rather than removing them blind.
 *
 * The 45 is 37 modules plus a four-module quiet zone each side, which the
 * writer fills with an opaque white rect. **That is the margin around the
 * symbol**, and it is why the box that holds this carries no padding of its own.
 */
export function fitToBox(raw: string): string {
  const cleaned = raw
    .replace(/<\?xml[^>]*\?>\s*/g, "")
    .replace(/<!DOCTYPE[^>]*>\s*/gi, "");
  return cleaned.replace(/<svg([^>]*)>/, (_match, attrs: string) => {
    const width = /\swidth="([^"]*)"/.exec(attrs)?.[1];
    const height = /\sheight="([^"]*)"/.exec(attrs)?.[1];
    let out = attrs
      .replace(/\s(width|height)="[^"]*"/g, "")
      .replace(/\sstyle="[^"]*"/g, "")
      .replace(/\spreserveAspectRatio="[^"]*"/g, "");
    if (!/\sviewBox=/.test(out) && width && height) {
      out += ` viewBox="0 0 ${parseFloat(width)} ${parseFloat(height)}"`;
    }
    return `<svg${out} preserveAspectRatio="xMidYMid meet">`;
  });
}

/** One Send code link as an SVG QR symbol, sized by whatever box holds it. */
export async function renderQrSymbol(text: string): Promise<string> {
  const { writeBarcode } = await writer();
  const result = await writeBarcode(text, {
    format: "QRCode",
    options: "ecLevel=L",
    scale: 1,
    addQuietZones: true,
  });
  if (result.error) throw new Error(result.error);
  return fitToBox(result.svg);
}
