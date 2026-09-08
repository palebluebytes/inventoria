/**
 * A room code and its seal (ADR-0072 §2, §3, §6 and §10).
 *
 * One shape with two jobs — a Send code addresses a meal, a Pairing code
 * addresses an act (ADR-0096 §8) — so what is asserted here is what they share:
 * the single draw, the key's width, the rule that a code does one job, and the
 * seal that rides on the key.
 *
 * The seal is exercised against the platform's own WebCrypto rather than a
 * stand-in, for the reason the ledger tests run against real sqlite-wasm: the
 * property under test is that a frame cannot be opened or forged without the
 * key, and a fake AEAD would only prove that a fake behaves.
 */
import { describe, it, expect } from "vitest";
import {
  ROOM_ID_BYTES,
  ROOM_KEY_BYTES,
  RoomCodeError,
  burnRoomCode,
  isRoomCodeSpent,
  mintRoomCode,
} from "../../src/lib/p2p/room-code";
import { readSendCode, sendCodeLink } from "../../src/lib/p2p/send-code";
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
    const code = mintRoomCode((length) => {
      draws.push(length);
      return rampDraw(0)(length);
    });

    expect(draws).toEqual([ROOM_ID_BYTES + ROOM_KEY_BYTES]);
    // The room is the front of the draw and the key is the rest of it.
    expect(code.key).toEqual(rampDraw(ROOM_ID_BYTES)(ROOM_KEY_BYTES));
  });

  it("mints 256 bits of key, which is twice the bar §3 states", () => {
    expect(ROOM_KEY_BYTES * 8).toBe(256);
    expect(mintRoomCode().key.length).toBe(ROOM_KEY_BYTES);
  });

  it("does not repeat itself", () => {
    const codes = Array.from({ length: 32 }, () => mintRoomCode().room);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("refuses a draw that did not answer with what it was asked for", () => {
    expect(() => mintRoomCode(() => new Uint8Array(4))).toThrow(RoomCodeError);
  });
});

describe("a code is single-use", () => {
  it("is spent once it has burned, and unspent before", () => {
    const code = mintRoomCode();
    expect(isRoomCodeSpent(code)).toBe(false);

    burnRoomCode(code);

    expect(isRoomCodeSpent(code)).toBe(true);
  });

  it("is spent for a link pasted a second time, not only for one object", () => {
    const code = mintRoomCode();
    burnRoomCode(code);

    // The way a person actually retries: the same link, read again.
    const pastedAgain = readSendCode(sendCodeLink(code, ORIGIN));

    expect(pastedAgain && isRoomCodeSpent(pastedAgain)).toBe(true);
  });
});

describe("the seal is the whole binding", () => {
  it("opens what it sealed", async () => {
    const code = mintRoomCode();

    const frame = await sealFrame(code, utf8.encode("a meal"));

    expect(new TextDecoder().decode(await openSealedFrame(code, frame))).toBe(
      "a meal"
    );
  });

  it("hides the plaintext, behind a fresh nonce each time", async () => {
    const code = mintRoomCode();
    const meal = utf8.encode("inventoria-meal");

    const first = await sealFrame(code, meal);
    const second = await sealFrame(code, meal);

    expect(first.subarray(SEAL_NONCE_BYTES)).not.toEqual(
      second.subarray(SEAL_NONCE_BYTES)
    );
    expect(new TextDecoder().decode(first)).not.toContain("inventoria-meal");
  });

  it("refuses a frame somebody changed a byte of", async () => {
    const code = mintRoomCode();
    const frame = await sealFrame(code, utf8.encode("a meal"));
    frame[frame.length - 1] ^= 0xff;

    await expect(openSealedFrame(code, frame)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses a frame sealed under another code", async () => {
    const frame = await sealFrame(mintRoomCode(), utf8.encode("a meal"));

    await expect(openSealedFrame(mintRoomCode(), frame)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses bytes that were never a frame", async () => {
    await expect(
      openSealedFrame(mintRoomCode(), new Uint8Array(4))
    ).rejects.toThrow(SealRefusedError);
  });
});
