/**
 * What a Deposit's seal binds, and what it therefore refuses (ADR-0096 §5).
 *
 * > **The AEAD's additional data binds `{index, generation, chunk seq, final}`.**
 *
 * Three of the four were already somebody's: ADR-0075 §7 bound the sequence,
 * the index is the lane's, and the final marker is what makes a truncated
 * collection re-collectable. **The generation is the one nobody had**, and it
 * is the claim this file exists for — several distinct objects live at one
 * address under one key over the life of one index, so an operator holding a
 * superseded copy could otherwise splice a stale delta into a fresh collection
 * and have the collector import it as authentic.
 */
import { describe, it, expect } from "vitest";
import {
  DEPOSIT_GENERATION_BYTES,
  DepositRefusedError,
  chunkCost,
  openDeposit,
  sealDeposit,
} from "../../src/lib/p2p/sealed-deposit";
import { SealRefusedError } from "../../src/lib/p2p/sealed-frame";

const under = { key: new Uint8Array(32).fill(7) };
const other = { key: new Uint8Array(32).fill(9) };

const utf8 = new TextEncoder();
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const chunks = (...bodies: string[]) => bodies.map((body) => utf8.encode(body));

/** The frames of one object, as lengths and bodies, so a test can rebuild it. */
function framesOf(object: Uint8Array): {
  generation: Uint8Array;
  frames: Uint8Array[];
} {
  const view = new DataView(
    object.buffer,
    object.byteOffset,
    object.byteLength
  );
  const frames: Uint8Array[] = [];
  let at = DEPOSIT_GENERATION_BYTES;
  while (at < object.length) {
    const length = view.getUint32(at);
    at += 4;
    frames.push(object.slice(at, at + length));
    at += length;
  }
  return { generation: object.slice(0, DEPOSIT_GENERATION_BYTES), frames };
}

const rebuild = (generation: Uint8Array, frames: Uint8Array[]): Uint8Array => {
  const object = new Uint8Array(
    frames.reduce((total, f) => total + 4 + f.length, DEPOSIT_GENERATION_BYTES)
  );
  object.set(generation, 0);
  const view = new DataView(object.buffer);
  let at = DEPOSIT_GENERATION_BYTES;
  for (const frame of frames) {
    view.setUint32(at, frame.length);
    at += 4;
    object.set(frame, at);
    at += frame.length;
  }
  return object;
};

describe("a deposit round-trips under the lane it was sealed for", () => {
  it("gives back every chunk, in order", async () => {
    const sealed = await sealDeposit(under, 0, chunks("head", "one", "two"));
    expect((await openDeposit(under, 0, sealed)).map(text)).toEqual([
      "head",
      "one",
      "two",
    ]);
  });

  it("carries one chunk, which is the acknowledgement-only deposit", async () => {
    const sealed = await sealDeposit(under, 4, chunks('{"acknowledges":3}'));
    expect((await openDeposit(under, 4, sealed)).map(text)).toEqual([
      '{"acknowledges":3}',
    ]);
  });

  it("costs its plaintext plus a length, a nonce and a tag", async () => {
    const sealed = await sealDeposit(under, 0, chunks("head"));
    expect(sealed.length).toBe(DEPOSIT_GENERATION_BYTES + chunkCost(4));
  });

  it("does not open under another lane's key", async () => {
    const sealed = await sealDeposit(under, 0, chunks("head"));
    await expect(openDeposit(other, 0, sealed)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("does not open at another index, so a lane cannot read the one behind it", async () => {
    const sealed = await sealDeposit(under, 3, chunks("head"));
    await expect(openDeposit(under, 4, sealed)).rejects.toThrow(
      SealRefusedError
    );
  });
});

describe("the generation stops a superseded chunk splicing into a fresh one", () => {
  it("draws a new generation for every rewrite at the same index", async () => {
    const first = await sealDeposit(under, 0, chunks("head", "rows"));
    const second = await sealDeposit(under, 0, chunks("head", "rows"));
    expect(framesOf(first).generation).not.toEqual(framesOf(second).generation);
  });

  it("refuses a chunk lifted from a superseded object at the same address", async () => {
    const superseded = await sealDeposit(under, 0, chunks("head", "stale"));
    const fresh = await sealDeposit(under, 0, chunks("head", "current"));

    // The whole attack, in one line: same key, same index, same sequence, and
    // an operator that kept the bytes when R2 overwrote the object.
    const spliced = rebuild(framesOf(fresh).generation, [
      framesOf(fresh).frames[0],
      framesOf(superseded).frames[1],
    ]);

    await expect(openDeposit(under, 0, spliced)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses the whole superseded object presented under a fresh generation", async () => {
    const superseded = await sealDeposit(under, 0, chunks("head", "stale"));
    const fresh = await sealDeposit(under, 0, chunks("head", "current"));
    const relabelled = rebuild(
      framesOf(fresh).generation,
      framesOf(superseded).frames
    );
    await expect(openDeposit(under, 0, relabelled)).rejects.toThrow(
      SealRefusedError
    );
  });
});

describe("the sequence and the final marker", () => {
  it("refuses two chunks swapped round", async () => {
    const { generation, frames } = framesOf(
      await sealDeposit(under, 0, chunks("head", "one", "two"))
    );
    const reordered = rebuild(generation, [frames[1], frames[0], frames[2]]);
    await expect(openDeposit(under, 0, reordered)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses a chunk repeated", async () => {
    const { generation, frames } = framesOf(
      await sealDeposit(under, 0, chunks("head", "one", "two"))
    );
    const replayed = rebuild(generation, [frames[0], frames[0], frames[2]]);
    await expect(openDeposit(under, 0, replayed)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses a stream whose tail was dropped, so nothing deletes it", async () => {
    const { generation, frames } = framesOf(
      await sealDeposit(under, 0, chunks("head", "one", "two"))
    );
    // The final chunk is gone, so the chunk now in last place was sealed as
    // `more` and does not open as `final`. That is the whole of "a truncated
    // collection is re-collectable rather than destroyed".
    const truncated = rebuild(generation, frames.slice(0, 2));
    await expect(openDeposit(under, 0, truncated)).rejects.toThrow(
      SealRefusedError
    );
  });

  it("refuses a chunk appended past the final one", async () => {
    const { generation, frames } = framesOf(
      await sealDeposit(under, 0, chunks("head", "one"))
    );
    const extended = rebuild(generation, [...frames, frames[1]]);
    await expect(openDeposit(under, 0, extended)).rejects.toThrow(
      SealRefusedError
    );
  });
});

describe("an object that is not a deposit at all", () => {
  it("refuses bytes shorter than a generation", async () => {
    await expect(openDeposit(under, 0, new Uint8Array(8))).rejects.toThrow(
      DepositRefusedError
    );
  });

  it("refuses a generation with no chunks behind it", async () => {
    await expect(
      openDeposit(under, 0, new Uint8Array(DEPOSIT_GENERATION_BYTES))
    ).rejects.toThrow(DepositRefusedError);
  });

  it("refuses a length that runs off the end", async () => {
    const sealed = await sealDeposit(under, 0, chunks("head"));
    await expect(
      openDeposit(under, 0, sealed.slice(0, sealed.length - 3))
    ).rejects.toThrow(DepositRefusedError);
  });

  it("refuses to seal a deposit with no chunks, which would have no final one", async () => {
    await expect(sealDeposit(under, 0, [])).rejects.toThrow(
      DepositRefusedError
    );
  });
});
