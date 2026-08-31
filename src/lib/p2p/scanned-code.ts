/**
 * What the camera just read: a barcode, or somebody's meal (ADR-0074 §4).
 *
 * **The Scan way in reads a meal code as well as a barcode.** That is the
 * second of receiving's two doors, and it is a door the app already had: two
 * people in the same room point one phone at the other's screen, which is the
 * gesture the Scan way in already teaches. Routing it through an existing way
 * in is what lets §4 refuse a receive control, an inbox and a count badge — the
 * whole "there is no door" shape rests on this discrimination.
 *
 * It is text rather than symbology, deliberately. The live camera reads through
 * the platform's `BarcodeDetector` and a still photo reads through the
 * zxing-wasm ponyfill, and the two report their formats from different
 * vocabularies; what both hand back verbatim is the string. So the string is
 * what decides, and one rule covers both paths.
 *
 * **A code that is neither is said to be neither.** Before a meal code existed
 * the scanner asked for four retail symbologies and every decode was digits, so
 * a raw hand-off to Open Food Facts could not misfire. A QR reader can read a
 * poster, a wifi credential or a URL, and asking Open Food Facts about one
 * would answer "not in Open Food Facts yet — add it here", which invites a
 * person to enter a menu as a food.
 */

import { readSendCode, type SendCode } from "./send-code";

/** One decode, read for what it turned out to be. */
export type ScannedCode =
  /** A product barcode, for the lookup the Scan way in has always done. */
  | { kind: "barcode"; digits: string }
  /** A Send code: somebody is handing over a meal (ADR-0072 §3). */
  | { kind: "meal"; code: SendCode }
  /** A meal code that is broken — a truncated link, a mangled key. */
  | { kind: "broken"; reason: string }
  /** A code this app has no use for, which is not the same as a broken one. */
  | { kind: "neither"; reason: string };

/**
 * The lengths the four retail symbologies the scanner asks for actually decode
 * to: UPC-E's six or eight, EAN-8's eight, UPC-A's twelve and EAN-13's
 * thirteen, with fourteen left in for a GTIN-14 arriving zero-padded.
 */
const BARCODE_DIGITS = /^\d{6,14}$/;

/** Reads one decoded string for what the Scan way in should do with it. */
export function readScannedCode(raw: string): ScannedCode {
  const scanned = raw.trim();

  try {
    const code = readSendCode(scanned);
    if (code !== null) return { kind: "meal", code };
  } catch (broken) {
    return {
      kind: "broken",
      reason: broken instanceof Error ? broken.message : String(broken),
    };
  }

  if (BARCODE_DIGITS.test(scanned)) return { kind: "barcode", digits: scanned };
  return {
    kind: "neither",
    reason: "that is a code, but it is neither a barcode nor a meal.",
  };
}
