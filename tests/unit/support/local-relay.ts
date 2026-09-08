/**
 * The real Relay, in this process, with clients allowed to dial it.
 *
 * **Against the real room, not a stand-in for it.** Two clients sit on either
 * side of the same `Relay` object that ships to the edge, joined through the
 * fake sockets in `relay-room.ts`, so what a suite built on this exercises is
 * the protocol both halves actually speak: the peer word, sealed frames, the
 * room's own bounds and its close codes. A hand-written fake relay would only
 * prove the two clients agree with the fake.
 *
 * What it cannot reach is the 101 upgrade and the platform's own hibernation,
 * which is why `relay.test.ts` records a workerd run beside it.
 *
 * It is here rather than inside one suite because two protocols are spoken in a
 * room now: a Meal send (ADR-0072) and a Pairing act (ADR-0096 §8).
 */
import {
  MAX_SOCKETS_PER_ROOM,
  Relay,
  CLOSE_NORMAL as RELAY_CLOSE_NORMAL,
} from "../../../worker/src/relay";
import type {
  RelayDial,
  RelayLinkHandlers,
} from "../../../src/lib/p2p/relay-room";
import { fakeRoom, fakeSocket, type FakeSocket } from "./relay-room";

/** The bytes of a frame, copied out of whatever view they arrived in. */
const asArrayBuffer = (frame: Uint8Array): ArrayBuffer =>
  frame.buffer.slice(
    frame.byteOffset,
    frame.byteOffset + frame.byteLength
  ) as ArrayBuffer;

/** What a browser reports when a socket goes away without a close frame. */
export const ABNORMAL_CLOSE = 1006;

export function localRelay() {
  const room = fakeRoom();
  const relay = new Relay(room.state);
  const joined: { server: FakeSocket; handlers: RelayLinkHandlers }[] = [];
  /** Every frame the relay forwarded: exactly what crossed it, in order. */
  const carried: Uint8Array[] = [];
  /** Anything the room threw while forwarding, which should stay empty. */
  const failures: unknown[] = [];

  const dial: RelayDial = async (_room, handlers) => {
    // §11.1: a third socket is refused, never queued, and a browser sees that
    // as a socket that would not open.
    if (room.state.getWebSockets().length >= MAX_SOCKETS_PER_ROOM) {
      throw new Error("the room already holds two sockets");
    }
    const server = fakeSocket({
      sent: (message) => {
        if (typeof message !== "string") carried.push(new Uint8Array(message));
        handlers.message(message);
      },
      closed: (code) => handlers.closed(code),
    });
    joined.push({ server, handlers });
    await relay.join(server);
    return {
      send: (frame) => {
        void relay
          .webSocketMessage(server, asArrayBuffer(frame))
          .catch((error) => failures.push(error));
      },
      close: () => {
        server.close(RELAY_CLOSE_NORMAL, "the party left");
        void relay
          .webSocketClose(server)
          .catch((error) => failures.push(error));
      },
    };
  };

  return {
    dial,
    relay,
    room,
    carried,
    failures,
    joined,
    /**
     * The transport losing a socket, which is not a party leaving.
     *
     * 1006 is what a browser reports for a connection that went away without a
     * close frame — the one code an endpoint cannot itself send, and the reason
     * the client reads the code at all.
     */
    drop: (which = joined.length - 1) => {
      const { server } = joined[which];
      server.close(ABNORMAL_CLOSE, "the transport dropped it");
      void relay.webSocketClose(server).catch((error) => failures.push(error));
    },
  };
}

/**
 * Lets whatever a session started reach the room before a test looks at it.
 *
 * Several turns rather than one: sealing a payload is real WebCrypto over a
 * real DEFLATE stream, and neither lands in a single tick.
 */
export const settle = async () => {
  for (let turn = 0; turn < 20; turn++) {
    await new Promise((done) => setTimeout(done, 1));
  }
};
