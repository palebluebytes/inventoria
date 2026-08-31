/**
 * The Send code and its seal (ADR-0072 §2, §3, §4, §6 and §10).
 *
 * The seal is exercised against the platform's own WebCrypto rather than a
 * stand-in, for the reason the ledger tests run against real sqlite-wasm: the
 * property under test is that a frame cannot be opened or forged without the
 * key, and a fake AEAD would only prove that a fake behaves.
 */
import { describe, it, expect } from "vitest";
import {
  SEND_CODE_KEY_BYTES,
  SEND_CODE_ROOM_BYTES,
  SendCodeError,
  burnSendCode,
  isSendCodeSpent,
  mintSendCode,
  readSendCode,
  sendCodeFragment,
  sendCodeLink,
} from "../../src/lib/p2p/send-code";
import {
  SEAL_NONCE_BYTES,
  SealRefusedError,
  openSealedFrame,
  sealFrame,
} from "../../src/lib/p2p/sealed-frame";

const ORIGIN = "https://inventoria.example";

/** A draw that answers with a known ramp, so a mint can be read back byte for byte. */
const rampDraw = (from: number) => (length: number) =>
  Uint8Array.from({ length }, (_, i) => (from + i) % 256);

const utf8 = new TextEncoder();

describe("the code is one draw, and 256 bits of it are the key", () => {
  it("takes the room and the key from a single draw", () => {
    const draws: number[] = [];
    const code = mintSendCode((length) => {
      draws.push(length);
      return rampDraw(0)(length);
    });

    expect(draws).toEqual([SEND_CODE_ROOM_BYTES + SEND_CODE_KEY_BYTES]);
    // The room is the front of the draw and the key is the rest of it.
    expect(code.key).toEqual(
      rampDraw(SEND_CODE_ROOM_BYTES)(SEND_CODE_KEY_BYTES)
    );
  });

  it("mints 256 bits of key, which is twice the bar §3 states", () => {
    expect(SEND_CODE_KEY_BYTES * 8).toBe(256);
    expect(mintSendCode().key.length).toBe(SEND_CODE_KEY_BYTES);
  });

  it("does not repeat itself", () => {
    const codes = Array.from({ length: 32 }, () => mintSendCode().room);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("refuses a draw that did not answer with what it was asked for", () => {
    expect(() => mintSendCode(() => new Uint8Array(4))).toThrow(SendCodeError);
  });
});

describe("one code shape, two carriers", () => {
  it("puts the whole secret in the fragment, so it reaches no server", () => {
    const link = new URL(sendCodeLink(mintSendCode(), ORIGIN));

    expect(link.pathname).toBe("/");
    expect(link.search).toBe("");
    expect(link.hash).toMatch(/^#r=[\w-]+&k=[\w-]+$/);
  });

  it("stays the size a version 5 symbol reads, whatever the meal weighs", () => {
    const code = mintSendCode();

    // §3's "about 100 characters" is the link, and all but the origin of it is
    // here: 12 characters of room, 43 of key, and the five that name them. It
    // does not grow with the meal, because there is nothing in a code a payload
    // could reach — the same code carried a four-food meal and a 60-food feast.
    expect(sendCodeFragment(code).length).toBe(60);
    expect(sendCodeLink(code, ORIGIN)).toBe(
      `${ORIGIN}/#${sendCodeFragment(code)}`
    );
  });

  it("reads back the code it wrote", () => {
    const minted = mintSendCode();

    const read = readSendCode(sendCodeLink(minted, ORIGIN));

    expect(read).toEqual(minted);
  });

  it("says there is no code here, rather than failing, when there is none", () => {
    expect(readSendCode(`${ORIGIN}/`)).toBeNull();
    expect(readSendCode(`${ORIGIN}/#mem=1`)).toBeNull();
    // The Scan way in reads a meal code as well as a barcode, so it meets
    // whatever is in the room.
    expect(readSendCode("5060335635013")).toBeNull();
  });

  it("refuses a code that is half a code", () => {
    const { room } = mintSendCode();

    expect(() => readSendCode(`${ORIGIN}/#r=${room}`)).toThrow(SendCodeError);
  });

  it("refuses a key that is not 256 bits, because that is the bar itself", () => {
    const { room } = mintSendCode();

    expect(() => readSendCode(`${ORIGIN}/#r=${room}&k=c2hvcnQ`)).toThrow(
      /key is 5 bytes/
    );
  });

  it("refuses a key that is not base64url", () => {
    const { room } = mintSendCode();

    expect(() => readSendCode(`${ORIGIN}/#r=${room}&k=$$$$`)).toThrow(
      SendCodeError
    );
  });
});

describe("a code is single-use", () => {
  it("is spent once it has burned, and unspent before", () => {
    const code = mintSendCode();
    expect(isSendCodeSpent(code)).toBe(false);

    burnSendCode(code);

    expect(isSendCodeSpent(code)).toBe(true);
  });

  it("is spent for a link pasted a second time, not only for one object", () => {
    const code = mintSendCode();
    burnSendCode(code);

    // The way a person actually retries: the same link, read again.
    const pastedAgain = readSendCode(sendCodeLink(code, ORIGIN));

    expect(pastedAgain && isSendCodeSpent(pastedAgain)).toBe(true);
  });
});

describe("the seal is the whole binding", () => {
  it("opens what it sealed", async () => {
    const code = mintSendCode();

    const frame = await sealFrame(code, utf8.encode("a meal"));

    expect(new TextDecoder().decode(await openSealedFrame(code, frame))).toBe(
      "a meal"
    );
  });

  it("hides the plaintext, behind a fresh nonce each time", async () => {
    const code = mintSendCode();
    const meal = utf8.encode("inventoria-meal");

    const first = await sealFrame(code, meal);
    const second = await sealFrame(code, meal);

    expect(first.subarray(SEAL_NONCE_BYTES)).not.toEqual(
      second.subarray(SEAL_NONCE_BYTES)
    );
    expect(new TextDecoder().decode(first)).not.toContain("inventoria-meal");
  });

  it("refuses a frame somebody changed a byte of", async () => {
    const code = mintSendCode();
    const frame = await sealFrame(code, utf8.encode("a meal"));
    frame[frame.length - 1] ^= 0xff;

    await expect(openSealedFrame(code, frame)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses a frame sealed under another code", async () => {
    const frame = await sealFrame(mintSendCode(), utf8.encode("a meal"));

    await expect(openSealedFrame(mintSendCode(), frame)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses bytes that were never a frame", async () => {
    await expect(
      openSealedFrame(mintSendCode(), new Uint8Array(4))
    ).rejects.toThrow(SealRefusedError);
  });
});
