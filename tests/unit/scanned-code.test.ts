/**
 * What the Scan way in read (ADR-0074 §4).
 *
 * The camera reads whatever is in the room, so the discrimination is the
 * module's whole job: a meal code routes the same-room case through the way in
 * that already exists, and a barcode carries on to Open Food Facts as it always
 * did.
 */
import { describe, it, expect } from "vitest";
import { readScannedCode } from "../../src/lib/p2p/scanned-code";
import { mintSendCode, sendCodeLink } from "../../src/lib/p2p/send-code";

const ORIGIN = "https://inventoria.example";

describe("the scanner reads a meal code as well as a barcode", () => {
  it("reads the link the symbol on their screen carries", () => {
    const code = mintSendCode();

    expect(readScannedCode(sendCodeLink(code, ORIGIN))).toEqual({
      kind: "meal",
      code,
    });
  });

  it("reads a meal code whatever origin it was minted on", () => {
    const code = mintSendCode();

    expect(
      readScannedCode(sendCodeLink(code, "https://elsewhere.test"))
    ).toEqual({ kind: "meal", code });
  });

  it("still reads every retail symbology a food barcode uses", () => {
    for (const digits of ["04963406", "5000112637922", "012345678905"]) {
      expect(readScannedCode(digits)).toEqual({ kind: "barcode", digits });
    }
  });
});

describe("a code that is neither", () => {
  it("says a meal code is broken rather than looking it up as a food", () => {
    const read = readScannedCode(`${ORIGIN}/#r=a-room&k=AAAA`);

    expect(read.kind).toBe("broken");
  });

  it("refuses an ordinary QR rather than asking Open Food Facts about it", () => {
    expect(readScannedCode("https://example.test/menu").kind).toBe("neither");
  });

  it("refuses a number that is no barcode length", () => {
    expect(readScannedCode("42").kind).toBe("neither");
  });
});
