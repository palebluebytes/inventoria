/**
 * The Pairing code: the Send code's shape, put to a different job, in a carrier
 * that is deliberately not a link (ADR-0096 §8).
 *
 * The claim these tests exist for is a **shape** claim rather than a naming
 * one: *the code must not parse as a URL, and not as a bare `scheme:` shape
 * either*, because a URL-shaped QR is a link in the operating system's hands
 * whatever this app calls it. So the assertions are about what `new URL` does
 * with the string and about which characters can be in it, never about what the
 * label says.
 */
import { describe, it, expect } from "vitest";
import {
  PAIRING_CODE_LABEL,
  readPairingCode,
  writePairingCode,
  type PairingCode,
} from "../../src/lib/p2p/pairing-code";
import {
  mintRoomCode,
  ROOM_ID_BYTES,
  ROOM_KEY_BYTES,
  RoomCodeError,
  type RandomBytes,
} from "../../src/lib/p2p/room-code";
import { sendCodeLink } from "../../src/lib/p2p/send-code";
import { readScannedCode } from "../../src/lib/p2p/scanned-code";

const counted = (length: number) =>
  new Uint8Array(length).map((_, i) => (i * 7 + 3) % 251);

/** A Pairing code is minted by the shared draw; the type says which act it is. */
const mintPairingCode = (draw?: RandomBytes): PairingCode => mintRoomCode(draw);

describe("a Pairing code carries a room and a key, and nothing else", () => {
  it("draws both halves together, at the widths a room code is", () => {
    const drawn: number[] = [];
    const code = mintPairingCode((length: number) => {
      drawn.push(length);
      return counted(length);
    });

    expect(drawn).toEqual([ROOM_ID_BYTES + ROOM_KEY_BYTES]);
    expect(code.key).toHaveLength(ROOM_KEY_BYTES);
    expect(code.room).not.toHaveLength(0);
  });

  it("carries no pairing secret, because there is nothing else in it", () => {
    const code = mintPairingCode();
    expect(Object.keys(code).sort()).toEqual(["key", "room"]);
  });
});

describe("the code is not a link, and the refusal lives in its shape", () => {
  const written = () => writePairingCode(mintPairingCode());

  it("does not parse as a URL", () => {
    expect(() => new URL(written())).toThrow();
  });

  it("carries no colon, so it cannot be a bare scheme: shape either", () => {
    // `new URL("x-pair:abc")` parses, so refusing a colon is what refuses the
    // shape. Asserted over the character set rather than over one sample.
    expect(written()).not.toContain(":");
    expect(written()).toMatch(/^[A-Za-z0-9\-_ ]+$/);
  });

  it("is not read as a meal by the Scan way in", () => {
    // Rations' scanner reads a Send code as well as a barcode. A Pairing code
    // is neither, and it must not arrive there as a broken meal.
    expect(readScannedCode(written())).toEqual({ kind: "neither" });
  });
});

describe("both carriers read back the code that was written", () => {
  it("round-trips what was minted", () => {
    const code = mintPairingCode();
    expect(readPairingCode(writePairingCode(code))).toEqual(code);
  });

  it("takes a paste with whitespace around it and inside it", () => {
    const code = mintPairingCode();
    const pasted = `\n  ${writePairingCode(code).replace(/ /g, "\n  ")}  \n`;
    expect(readPairingCode(pasted)).toEqual(code);
  });
});

describe("what it refuses, and how the two refusals differ", () => {
  it("says a Send code link is not a Pairing code, rather than breaking on it", () => {
    const link = sendCodeLink(mintRoomCode(), "https://example.test");
    expect(readPairingCode(link)).toBeNull();
  });

  it("says an ordinary barcode is not one either", () => {
    expect(readPairingCode("5060335635167")).toBeNull();
  });

  it("refuses a code that is labelled and then broken", () => {
    const code = mintPairingCode();
    const short = writePairingCode(code).slice(0, -4);
    expect(() => readPairingCode(short)).toThrow(RoomCodeError);
  });

  it("refuses a key that is not the width a key is", () => {
    expect(() => readPairingCode(`${PAIRING_CODE_LABEL} aaaa bbbb`)).toThrow(
      RoomCodeError
    );
  });

  it("refuses a code with a field missing", () => {
    const code = mintPairingCode();
    const [, room] = writePairingCode(code).split(" ");
    expect(() => readPairingCode(`${PAIRING_CODE_LABEL} ${room}`)).toThrow(
      RoomCodeError
    );
  });
});
