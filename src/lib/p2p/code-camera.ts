/**
 * The live camera the "Read a code" control uses (ADR-0096 §8).
 *
 * **The platform's own `BarcodeDetector` only.** Rations' Scan way in falls
 * back to the `zxing-wasm` ponyfill on a still photo, and this deliberately
 * does not: §8 makes the reader live-camera only, with **paste as the second
 * carrier**, so a device without a native detector is offered the field rather
 * than a second decoder. That keeps 648 KB of reader wasm out of the root's
 * precache for a path that already has a working carrier, and it is why the
 * absence of a detector is an ordinary answer here rather than a failure.
 *
 * The absence is the case, not the corner: there is no `BarcodeDetector` on any
 * iPhone, and none on desktop Firefox.
 *
 * The typed view of `globalThis` is the genuine external boundary
 * `CODING_STANDARDS.md` §3.2 admits a cast at — the alternative in the app
 * today is `new (window as any).BarcodeDetector(...)`, and §3.2 says not to add
 * another of those.
 */

/** The one symbology a Pairing code is ever drawn in. */
export const PAIRING_CODE_FORMATS = ["qr_code"] as const;

/** As much of the platform's detector as a reader touches. */
export interface CodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

interface CodeDetectorGlobal {
  BarcodeDetector?: new (init: { formats: string[] }) => CodeDetector;
}

/**
 * A detector, or `null` where the platform has none.
 *
 * Constructed rather than sniffed by name, because a browser that has the
 * constructor and refuses the format would otherwise answer "yes" to a question
 * the surface asks in order to decide what to offer.
 */
export function codeDetector(): CodeDetector | null {
  const ctor = (globalThis as CodeDetectorGlobal).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: [...PAIRING_CODE_FORMATS] });
  } catch {
    return null;
  }
}
