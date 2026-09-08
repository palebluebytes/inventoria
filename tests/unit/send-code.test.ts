/**
 * The Send code's carrier: one link, with the secret in its fragment
 * (ADR-0072 §3 and §4, ADR-0074 §8, ADR-0084 §5).
 *
 * The shape the link carries, the draw behind it and the seal it opens are
 * `room-code.test.ts`'s, because a Pairing code has all three and no link.
 */
import { describe, it, expect } from "vitest";
import {
  readSendCode,
  sendCodeFragment,
  sendCodeLink,
} from "../../src/lib/p2p/send-code";
import {
  ROOM_KEY_BYTES,
  RoomCodeError,
  mintRoomCode,
} from "../../src/lib/p2p/room-code";
import { facetOf } from "../../src/lib/facets/registry";

const ORIGIN = "https://inventoria.example";

describe("one code shape, two carriers", () => {
  it("puts the whole secret in the fragment, so it reaches no server", () => {
    const link = new URL(sendCodeLink(mintRoomCode(), ORIGIN));

    expect(link.search).toBe("");
    expect(link.hash).toMatch(/^#r=[\w-]+&k=[\w-]+$/);
  });

  it("mints at Rations, because a meal is Rations' (ADR-0084 §5)", () => {
    // Read off the roster rather than written out, so the link cannot point at
    // a path Rations has stopped answering to. It is `/food/` today.
    const rations = facetOf("food");

    expect(new URL(sendCodeLink(mintRoomCode(), ORIGIN)).pathname).toBe(
      rations.startUrl
    );
    expect(rations.startUrl).toBe("/food/");
  });

  it("mints where only one of the two installs can be ejected", () => {
    // The second of ADR-0084 §5's two converging arguments, and the one that
    // says what the choice costs each Facet. Prefix matching is
    // one-directional (ADR-0078 §3), so the two directions do not cost the
    // same, and it is the **asymmetry** that is the claim: containment in the
    // root's scope holds of every path, since that scope is `/`.
    const path = new URL(sendCodeLink(mintRoomCode(), ORIGIN)).pathname;

    // A root-only install opens this inside its own window.
    expect(path.startsWith(facetOf("root").scope)).toBe(true);
    // Had it minted at the root instead, a Rations-only install would have
    // opened a browser tab: `/` is not inside `/food/`.
    expect(facetOf("root").startUrl.startsWith(facetOf("food").scope)).toBe(
      false
    );
  });

  it("stays the size a version 5 symbol reads, whatever the meal weighs", () => {
    const code = mintRoomCode();

    // §3's "about 100 characters" is the link, and all but the origin of it is
    // here: 12 characters of room, 43 of key, and the five that name them. It
    // does not grow with the meal, because there is nothing in a code a payload
    // could reach — the same code carried a four-food meal and a 60-food feast.
    expect(sendCodeFragment(code).length).toBe(60);
    expect(sendCodeLink(code, ORIGIN)).toBe(
      `${ORIGIN}/food/#${sendCodeFragment(code)}`
    );
  });

  it("reads back the code it wrote", () => {
    const minted = mintRoomCode();

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
    const { room } = mintRoomCode();

    expect(() => readSendCode(`${ORIGIN}/#r=${room}`)).toThrow(RoomCodeError);
  });

  it("refuses a key that is not 256 bits, because that is the bar itself", () => {
    const { room } = mintRoomCode();

    expect(() => readSendCode(`${ORIGIN}/#r=${room}&k=c2hvcnQ`)).toThrow(
      /key is 5 bytes/
    );
  });

  it("refuses a key that is not base64url", () => {
    const { room } = mintRoomCode();

    expect(() => readSendCode(`${ORIGIN}/#r=${room}&k=$$$$`)).toThrow(
      RoomCodeError
    );
  });
});
