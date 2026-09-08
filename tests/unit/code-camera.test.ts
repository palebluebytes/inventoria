/**
 * The live camera's capability probe (ADR-0096 §8).
 *
 * **Capability decides only what is *offered*, never what is chosen**, so the
 * one thing this has to get right is the answer *no detector here* — which is
 * the case rather than the corner: there is none on any iPhone and none on
 * desktop Firefox, and the paste carrier is what those devices use.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  codeDetector,
  PAIRING_CODE_FORMATS,
} from "../../src/lib/p2p/code-camera";

interface Detectable {
  BarcodeDetector?: unknown;
}

const platform = globalThis as Detectable;

afterEach(() => {
  delete platform.BarcodeDetector;
});

describe("a detector, or an honest nothing", () => {
  it("answers nothing where the platform has none", () => {
    expect(codeDetector()).toBeNull();
  });

  it("asks for the one symbology a Pairing code is ever drawn in", () => {
    const asked: string[][] = [];
    platform.BarcodeDetector = class {
      constructor(init: { formats: string[] }) {
        asked.push(init.formats);
      }
      detect() {
        return Promise.resolve([]);
      }
    };

    expect(codeDetector()).not.toBeNull();
    expect(asked).toEqual([[...PAIRING_CODE_FORMATS]]);
  });

  it("answers nothing where the constructor is there and refuses the format", () => {
    // Constructed rather than sniffed by name for exactly this: a browser that
    // has the constructor and will not take QR would otherwise answer "yes" to
    // a question the surface asks in order to decide what to offer.
    platform.BarcodeDetector = class {
      constructor() {
        throw new TypeError("unsupported format");
      }
    };
    expect(codeDetector()).toBeNull();
  });
});
