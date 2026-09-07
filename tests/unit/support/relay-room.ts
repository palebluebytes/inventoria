/**
 * One Relay room, in this process.
 *
 * The room is exercised against fake sockets and a fake `DurableObjectState`
 * rather than against workerd. That is deliberate and it is what shaped the
 * module: everything the room decides is decided from `getWebSockets()` and an
 * alarm, so a fake that answers those two questions exercises the real
 * decisions.
 *
 * Two suites build on it — `relay.test.ts` drives the room directly to prove
 * its two bounds, and `meal-send.test.ts` puts two real clients on either side
 * of it — which is why the fixture is here rather than in one of them.
 */
import type { RelaySocket, RelayRoomState } from "../../../worker/src/relay";

/** What a socket's other end sees, for a test that is playing that end. */
export interface SocketWatcher {
  sent?(message: ArrayBuffer | string): void;
  closed?(code?: number, reason?: string): void;
}

export interface FakeSocket extends RelaySocket {
  /** Everything the relay sent this socket, in order. */
  readonly received: (ArrayBuffer | string)[];
  /** The first close, since a socket closes once. */
  closedWith: { code?: number; reason?: string } | null;
}

export function fakeSocket(watch: SocketWatcher = {}): FakeSocket {
  const socket: FakeSocket = {
    received: [],
    closedWith: null,
    send: (message) => {
      socket.received.push(message);
      watch.sent?.(message);
    },
    close: (code, reason) => {
      if (socket.closedWith) return;
      socket.closedWith = { code, reason };
      watch.closed?.(code, reason);
    },
  };
  return socket;
}

export interface FakeRoom {
  /** Every socket the relay has taken in, the closed ones included. */
  readonly accepted: FakeSocket[];
  /**
   * Every storage mutation the room made, named and in order.
   *
   * A Durable Object is billed by rows written, and ADR-0096 §8's whole cost
   * argument is that a room writes a fixed three of them however much crosses
   * it — so what the room writes is a claim worth reading off the fake rather
   * than a detail of it (#372 §3.5).
   */
  readonly writes: string[];
  alarmAt: number | null;
  cleared: boolean;
  state: RelayRoomState;
}

export function fakeRoom(): FakeRoom {
  const room: FakeRoom = {
    accepted: [],
    writes: [],
    alarmAt: null,
    cleared: false,
    state: {
      getWebSockets: () => room.accepted.filter((s) => s.closedWith === null),
      // A socket the platform hands back is one of ours by construction.
      acceptWebSocket: (ws) => {
        room.accepted.push(ws as FakeSocket);
      },
      storage: {
        getAlarm: async () => room.alarmAt,
        setAlarm: async (at) => {
          room.writes.push("setAlarm");
          room.alarmAt = at;
        },
        deleteAlarm: async () => {
          room.writes.push("deleteAlarm");
          room.alarmAt = null;
        },
        deleteAll: async () => {
          room.writes.push("deleteAll");
          room.cleared = true;
        },
      },
    },
  };
  return room;
}
