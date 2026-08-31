/**
 * The Relay's five bounds (ADR-0072 §11), plus what it is allowed to hold (§12).
 *
 * The room is exercised against the fake sockets and fake `DurableObjectState`
 * in `support/relay-room.ts`, rather than against workerd. That is deliberate
 * and it is what shaped the module: everything the room decides is decided from
 * `getWebSockets()`, a per-socket attachment and an alarm, so a fake that
 * answers those three questions exercises the real decisions. The one thing it
 * cannot reach is the 101 upgrade response itself, which Node's `Response`
 * refuses to construct — so `fetch` is kept to the two refusals and one call to
 * `join`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Relay,
  MAX_SOCKETS_PER_ROOM,
  FRAMES_PER_ROOM,
  ROOM_LIFETIME_MS,
  WIRE_CEILING_BYTES,
  PEER_WORD,
  CLOSE_NORMAL,
  CLOSE_EXPIRED,
  CLOSE_OVER_CEILING,
  CLOSE_SECOND_FRAME,
  CLOSE_NOT_OPAQUE,
  CLOSE_NO_PEER,
} from "../../worker/src/relay";
import { findConsoleCalls } from "../../scripts/worker-closure-check.mjs";
import { fakeRoom, fakeSocket } from "./support/relay-room";

/** A room with both parties present and told so, which is where a send starts. */
async function occupiedRoom() {
  const room = fakeRoom();
  const relay = new Relay(room.state);
  const sender = fakeSocket();
  const recipient = fakeSocket();
  await relay.join(sender);
  await relay.join(recipient);
  return { room, relay, sender, recipient };
}

const upgradeRequest = () =>
  new Request("https://inventoria.example/api/relay?room=abc", {
    headers: { Upgrade: "websocket" },
  });

const frame = (bytes: number) => new ArrayBuffer(bytes);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-30T12:00:00.000Z"));
});

afterEach(() => vi.useRealTimers());

describe("bound 1: at most two concurrent sockets per room", () => {
  it("takes the first two sockets into the room", async () => {
    const { room } = await occupiedRoom();

    expect(MAX_SOCKETS_PER_ROOM).toBe(2);
    expect(room.state.getWebSockets()).toHaveLength(2);
  });

  it("refuses a third rather than queueing it", async () => {
    const { room } = await occupiedRoom();
    const relay = new Relay(room.state);

    const response = await relay.fetch(upgradeRequest());

    expect(response.status).toBe(409);
    expect(room.state.getWebSockets()).toHaveLength(MAX_SOCKETS_PER_ROOM);
  });

  it("frees the slot when a party drops, because reconnection survives", async () => {
    const { room, relay, sender } = await occupiedRoom();
    await relay.webSocketClose(sender);

    const rejoining = fakeSocket();
    await relay.join(rejoining);

    expect(room.state.getWebSockets()).toHaveLength(MAX_SOCKETS_PER_ROOM);
  });

  it("refuses a request that is not a WebSocket upgrade", async () => {
    const room = fakeRoom();
    const relay = new Relay(room.state);

    const response = await relay.fetch(
      new Request("https://inventoria.example/api/relay?room=abc")
    );

    expect(response.status).toBe(426);
  });
});

describe("bound 2: one payload frame in each direction, then the room closes", () => {
  it("forwards the payload to the other party and leaves the room open", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    const payload = frame(64);

    await relay.webSocketMessage(sender, payload);

    expect(recipient.received).toContain(payload);
    expect(sender.closedWith).toBeNull();
    expect(recipient.closedWith).toBeNull();
  });

  it("closes the room once the delivery acknowledgement crosses back", async () => {
    const { relay, sender, recipient } = await occupiedRoom();

    await relay.webSocketMessage(sender, frame(64));
    await relay.webSocketMessage(recipient, frame(8));

    expect(sender.closedWith?.code).toBe(CLOSE_NORMAL);
    expect(recipient.closedWith?.code).toBe(CLOSE_NORMAL);
  });

  it("closes the room on a second frame from the same party, forwarding nothing", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    await relay.webSocketMessage(sender, frame(64));
    const second = frame(64);

    await relay.webSocketMessage(sender, second);

    expect(recipient.received).not.toContain(second);
    expect(sender.closedWith?.code).toBe(CLOSE_SECOND_FRAME);
    expect(recipient.closedWith?.code).toBe(CLOSE_SECOND_FRAME);
  });

  // The attachment that refuses a live socket's second frame dies with that
  // socket, and §11 lets a dropped party reclaim the free slot unidentified.
  // Without the room's own tally, reconnecting would buy another frame each
  // time and the room would be an unbounded pipe for its whole five minutes.
  it("carries no more than two frames however often a party reconnects", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    let party = sender;

    // Each round is a fresh socket with a clean attachment, which is exactly
    // what a dropped party gets when it reclaims the free slot.
    for (let round = 0; round < 4; round++) {
      await relay.webSocketMessage(party, frame(64));
      await relay.webSocketClose(party);
      party = fakeSocket();
      await relay.join(party);
    }

    const payloads = recipient.received.filter((m) => m !== PEER_WORD);
    expect(payloads).toHaveLength(FRAMES_PER_ROOM);
  });
});

describe("bound 3: a wire-byte ceiling as a crude backstop", () => {
  it("carries a frame at exactly the ceiling", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    const payload = frame(WIRE_CEILING_BYTES);

    await relay.webSocketMessage(sender, payload);

    expect(WIRE_CEILING_BYTES).toBe(1024 * 1024);
    expect(recipient.received).toContain(payload);
  });

  it("closes the room over the ceiling", async () => {
    const { relay, sender, recipient } = await occupiedRoom();

    await relay.webSocketMessage(sender, frame(WIRE_CEILING_BYTES + 1));

    expect(sender.closedWith?.code).toBe(CLOSE_OVER_CEILING);
    expect(recipient.closedWith?.code).toBe(CLOSE_OVER_CEILING);
  });
});

describe("bound 4: a room lifetime of five minutes", () => {
  it("starts the five minutes when the first socket joins", async () => {
    const room = fakeRoom();
    const relay = new Relay(room.state);

    await relay.join(fakeSocket());

    expect(ROOM_LIFETIME_MS).toBe(5 * 60 * 1000);
    expect(room.alarmAt).toBe(Date.now() + ROOM_LIFETIME_MS);
  });

  it("does not push the deadline out when the second socket joins", async () => {
    const room = fakeRoom();
    const relay = new Relay(room.state);
    await relay.join(fakeSocket());
    const deadline = room.alarmAt;

    vi.advanceTimersByTime(60_000);
    await relay.join(fakeSocket());

    expect(room.alarmAt).toBe(deadline);
  });

  it("closes both sockets when the five minutes are up", async () => {
    const { relay, sender, recipient } = await occupiedRoom();

    await relay.alarm();

    expect(sender.closedWith?.code).toBe(CLOSE_EXPIRED);
    expect(recipient.closedWith?.code).toBe(CLOSE_EXPIRED);
  });
});

describe("bound 5: over a bound the room closes, and is never truncated", () => {
  it("forwards no part of a frame over the ceiling", async () => {
    const { relay, sender, recipient } = await occupiedRoom();

    await relay.webSocketMessage(sender, frame(WIRE_CEILING_BYTES + 1));

    expect(recipient.received).toEqual([PEER_WORD]);
  });

  it("hands the peer the very bytes it was given", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    const payload = frame(64);

    await relay.webSocketMessage(sender, payload);

    expect(recipient.received.at(-1)).toBe(payload);
  });
});

describe("the relay holds nothing that outlives a room", () => {
  it("clears its storage and its alarm when the room closes", async () => {
    const { room, relay, sender, recipient } = await occupiedRoom();

    await relay.webSocketMessage(sender, frame(64));
    await relay.webSocketMessage(recipient, frame(8));

    expect(room.cleared).toBe(true);
    expect(room.alarmAt).toBeNull();
  });

  it("clears its storage when the room expires unused", async () => {
    const { room, relay } = await occupiedRoom();

    await relay.alarm();

    expect(room.cleared).toBe(true);
    expect(room.alarmAt).toBeNull();
  });
});

describe("the relay's own word is the only text on the wire", () => {
  it("says nothing until the second party arrives", async () => {
    const room = fakeRoom();
    const relay = new Relay(room.state);
    const sender = fakeSocket();

    await relay.join(sender);

    expect(sender.received).toEqual([]);
  });

  it("tells both parties when the room fills, since a lone frame has nowhere to go", async () => {
    const { sender, recipient } = await occupiedRoom();

    expect(sender.received).toEqual([PEER_WORD]);
    expect(recipient.received).toEqual([PEER_WORD]);
  });

  it("closes the room on a text frame from a party", async () => {
    const { relay, sender, recipient } = await occupiedRoom();

    await relay.webSocketMessage(sender, PEER_WORD);

    expect(sender.closedWith?.code).toBe(CLOSE_NOT_OPAQUE);
    expect(recipient.closedWith?.code).toBe(CLOSE_NOT_OPAQUE);
  });

  it("closes the room on a frame with no peer to forward it to", async () => {
    const room = fakeRoom();
    const relay = new Relay(room.state);
    const sender = fakeSocket();
    await relay.join(sender);

    await relay.webSocketMessage(sender, frame(64));

    expect(sender.closedWith?.code).toBe(CLOSE_NO_PEER);
  });
});

// ADR-0072 §9: the no-record posture is enforced structurally rather than by
// review, so the gate itself is worth a test — a matcher that never matches
// would pass every build silently.
describe("the relay module may call no console", () => {
  it("finds a console call in a module that makes one", () => {
    expect(findConsoleCalls("if (x) console.warn(`room ${id}`);")).toEqual([
      "console.warn",
    ]);
  });

  it("finds every console member, not only log", () => {
    expect(findConsoleCalls("console.log(a); console.error(b);")).toEqual([
      "console.log",
      "console.error",
    ]);
  });

  it("finds none in the relay module as it stands", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("../../worker/src/relay.ts", import.meta.url),
      "utf8"
    );

    expect(findConsoleCalls(source)).toEqual([]);
  });
});
