/**
 * The Relay's two bounds (ADR-0072 §11 as amended by ADR-0096 §8), what it
 * refuses on register rather than on volume, and what it is allowed to hold
 * (§12).
 *
 * The room is exercised against the fake sockets and fake `DurableObjectState`
 * in `support/relay-room.ts`, rather than against workerd. That is deliberate
 * and it is what shaped the module: everything the room decides is decided from
 * `getWebSockets()` and an alarm, so a fake that answers those two questions
 * exercises the real decisions. The one thing it cannot reach is the 101
 * upgrade response itself, which Node's `Response` refuses to construct — so
 * `fetch` is kept to the two refusals and one call to `join`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Relay,
  MAX_SOCKETS_PER_ROOM,
  ROOM_LIFETIME_MS,
  PEER_WORD,
  CLOSE_NORMAL,
  CLOSE_EXPIRED,
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

    // Closing our half is what actually frees the slot, and it is a clean end
    // rather than a refusal: nothing was wrong with the socket that left.
    expect(sender.closedWith?.code).toBe(CLOSE_NORMAL);
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

describe("bound 2: a room lifetime of five minutes", () => {
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

describe("a frame crosses whole or the room closes, and is never truncated", () => {
  it("forwards the payload to the other party and leaves the room open", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    const payload = frame(64);

    await relay.webSocketMessage(sender, payload);

    expect(recipient.received).toContain(payload);
    expect(sender.closedWith).toBeNull();
    expect(recipient.closedWith).toBeNull();
  });

  it("hands the peer the very bytes it was given", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    const payload = frame(64);

    await relay.webSocketMessage(sender, payload);

    expect(recipient.received.at(-1)).toBe(payload);
  });
});

describe("the relay holds nothing that outlives a room", () => {
  it("clears its storage and its alarm when a refusal closes the room", async () => {
    const { room, relay, sender } = await occupiedRoom();

    await relay.webSocketMessage(sender, "a party's text frame");

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

describe("the bounds that went (ADR-0096 §8)", () => {
  it("carries frame after frame across one room, with no tally to spend", async () => {
    const { relay, sender, recipient } = await occupiedRoom();

    for (let round = 0; round < 40; round++) {
      await relay.webSocketMessage(sender, frame(64));
      await relay.webSocketMessage(recipient, frame(64));
    }

    expect(sender.closedWith).toBeNull();
    expect(recipient.closedWith).toBeNull();
    expect(recipient.received.filter((m) => m !== PEER_WORD)).toHaveLength(40);
  });

  it("carries a payload well past the withdrawn wire ceiling", async () => {
    const { relay, sender, recipient } = await occupiedRoom();
    const payload = frame(8 * 1024 * 1024);

    await relay.webSocketMessage(sender, payload);

    expect(recipient.received).toContain(payload);
    expect(sender.closedWith).toBeNull();
  });

  it("writes no storage row per frame, however many cross", async () => {
    const { room, relay, sender } = await occupiedRoom();
    const written = room.writes.length;

    for (let round = 0; round < 40; round++) {
      await relay.webSocketMessage(sender, frame(64));
    }

    expect(room.writes.length).toBe(written);
  });

  it("costs three storage rows for a whole room, whatever crossed it", async () => {
    const { room, relay, sender } = await occupiedRoom();
    await relay.webSocketMessage(sender, frame(64));

    await relay.alarm();

    expect(room.writes).toEqual(["setAlarm", "deleteAlarm", "deleteAll"]);
  });
});
