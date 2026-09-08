/**
 * The Pairing act in a room, against the real Relay (ADR-0096 §8).
 *
 * Two clients sit on either side of the same `Relay` object that ships to the
 * edge, through `support/local-relay.ts`, so what is exercised is the protocol
 * both halves actually speak rather than an agreement between two fakes. The
 * claim the whole ticket turns on is checkable from here: **what crosses the
 * camera is a room and a key, and the pairing secret is minted inside the
 * sealed room** — so the bytes the relay carried are read back and compared
 * against both.
 */
import { describe, it, expect } from "vitest";
import { localRelay, settle } from "./support/local-relay";
import {
  PAIRING_SECRET_BYTES,
  PairingRefusedError,
  handPairingSecret,
  takePairingSecret,
} from "../../src/lib/p2p/pairing-act";
import {
  derivePairingChains,
  type PairedChains,
} from "../../src/lib/p2p/pairing-chain";
import { writePairingCode } from "../../src/lib/p2p/pairing-code";
import { enterRoom, RoomFailedError } from "../../src/lib/p2p/relay-room";
import {
  isRoomCodeSpent,
  mintRoomCode,
  RoomCodeSpentError,
} from "../../src/lib/p2p/room-code";
import {
  openSealedFrame,
  sealFrame,
  SealRefusedError,
} from "../../src/lib/p2p/sealed-frame";

const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A deadline a test can wait out, standing in for the room's five minutes. */
const A_MOMENT_MS = 20;

const failure = async (act: Promise<unknown>): Promise<RoomFailedError> => {
  try {
    await act;
  } catch (error) {
    if (error instanceof RoomFailedError) return error;
    throw error;
  }
  throw new Error("the act did not fail");
};

describe("the secret is minted inside the room, and both sides derive off it", () => {
  it("ends with each device's deposit lane the other's collect lane", async () => {
    const relay = localRelay();
    const code = mintRoomCode();

    const readerRoom = await enterRoom(code.room, { dial: relay.dial });
    const reading = takePairingSecret(readerRoom, code);
    const showRoom = await enterRoom(code.room, { dial: relay.dial });
    const showing = handPairingSecret(showRoom, code);

    const [shown, read] = await Promise.all([showing, reading]);
    showRoom.leave();
    readerRoom.leave();

    expect(hex(shown.deposit.state)).toBe(hex(read.collect.state));
    expect(hex(shown.collect.state)).toBe(hex(read.deposit.state));
    expect(shown.deposit.direction).toBe("a2b");
    expect(read.deposit.direction).toBe("b2a");
  });

  it("carries the secret in one sealed frame and nowhere else", async () => {
    const relay = localRelay();
    const code = mintRoomCode();

    const readerRoom = await enterRoom(code.room, { dial: relay.dial });
    const reading = takePairingSecret(readerRoom, code);
    const showRoom = await enterRoom(code.room, { dial: relay.dial });
    const shown = await handPairingSecret(showRoom, code);
    await reading;
    showRoom.leave();
    readerRoom.leave();

    expect(relay.carried).toHaveLength(1);
    const secret = await openSealedFrame(code, relay.carried[0]);
    expect(secret).toHaveLength(PAIRING_SECRET_BYTES);

    // The chains are exactly what that secret derives, which is what makes the
    // next assertion mean something.
    const off: PairedChains = await derivePairingChains(
      secret.slice(),
      "showed"
    );
    expect(hex(off.deposit.state)).toBe(hex(shown.deposit.state));

    // And nothing a camera can see carries it: the written code is the room and
    // the key, and the sealed bytes are not the secret either.
    expect(writePairingCode(code)).not.toContain(hex(secret));
    expect(hex(relay.carried[0])).not.toContain(hex(secret));
  });

  it("spends the code on both sides the moment the secret has left", async () => {
    const relay = localRelay();
    const code = mintRoomCode();
    expect(isRoomCodeSpent(code)).toBe(false);

    const readerRoom = await enterRoom(code.room, { dial: relay.dial });
    const reading = takePairingSecret(readerRoom, code);
    const showRoom = await enterRoom(code.room, { dial: relay.dial });
    await handPairingSecret(showRoom, code);
    await reading;
    showRoom.leave();
    readerRoom.leave();

    expect(isRoomCodeSpent(code)).toBe(true);
    await expect(handPairingSecret(showRoom, code)).rejects.toThrow(
      RoomCodeSpentError
    );
  });
});

describe("a second device at a taken room is refused, loudly", () => {
  it("refuses the third socket rather than queueing it", async () => {
    const relay = localRelay();
    const code = mintRoomCode();

    const raced = await enterRoom(code.room, { dial: relay.dial });
    const legitimate = await enterRoom(code.room, { dial: relay.dial });

    // The room now holds its two. The device that was meant to be here arrives
    // to a socket that will not open, which is what the surface has to say out
    // loud rather than retry away.
    const refused = await failure(enterRoom(code.room, { dial: relay.dial }));
    expect(refused.failure).toBe("unavailable");

    raced.leave();
    legitimate.leave();
  });
});

describe("the code dies on cancel and on five minutes", () => {
  it("ends the act when the person waiting pulls out", async () => {
    const relay = localRelay();
    const code = mintRoomCode();
    const pulled = new AbortController();

    const room = await enterRoom(code.room, {
      dial: relay.dial,
      signal: pulled.signal,
    });
    const showing = handPairingSecret(room, code);
    await settle();
    pulled.abort();

    expect((await failure(showing)).failure).toBe("cancelled");
    expect(isRoomCodeSpent(code)).toBe(true);
    room.leave();
  });

  it("ends the act when the room's minutes run out", async () => {
    const relay = localRelay();
    const code = mintRoomCode();

    const room = await enterRoom(code.room, {
      dial: relay.dial,
      lifetimeMs: A_MOMENT_MS,
    });
    expect((await failure(handPairingSecret(room, code))).failure).toBe(
      "expired"
    );
    expect(isRoomCodeSpent(code)).toBe(true);
    room.leave();
  });
});

describe("what the reader refuses, and how the two refusals differ", () => {
  it("says somebody else answered when the frame will not open", async () => {
    const relay = localRelay();
    const code = mintRoomCode();
    const stranger = mintRoomCode();

    const readerRoom = await enterRoom(code.room, { dial: relay.dial });
    const reading = takePairingSecret(readerRoom, code);
    const other = await enterRoom(code.room, { dial: relay.dial });
    await settle();
    other.send(await sealFrame(stranger, new Uint8Array(PAIRING_SECRET_BYTES)));

    await expect(reading).rejects.toThrow(SealRefusedError);
    readerRoom.leave();
    other.leave();
  });

  it("says the secret is the wrong width when the frame opens to something else", async () => {
    const relay = localRelay();
    const code = mintRoomCode();

    const readerRoom = await enterRoom(code.room, { dial: relay.dial });
    const reading = takePairingSecret(readerRoom, code);
    const other = await enterRoom(code.room, { dial: relay.dial });
    await settle();
    other.send(await sealFrame(code, new Uint8Array(8)));

    await expect(reading).rejects.toThrow(PairingRefusedError);
    readerRoom.leave();
    other.leave();
  });
});
