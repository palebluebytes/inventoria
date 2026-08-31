/**
 * One Relay room, in this process.
 *
 * The room is exercised against fake sockets and a fake `DurableObjectState`
 * rather than against workerd. That is deliberate and it is what shaped the
 * module: everything the room decides is decided from `getWebSockets()`, a
 * per-socket attachment and an alarm, so a fake that answers those three
 * questions exercises the real decisions.
 *
 * Two suites build on it — `relay.test.ts` drives the room directly to prove
 * its five bounds, and `meal-send.test.ts` puts two real clients on either
 * side of it — which is why the fixture is here rather than in one of them.
 */
import type {
  RelaySocket,
  RelayRoomState,
  SocketAttachment,
} from "../../../worker/src/relay";

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
  let attachment: SocketAttachment | null = null;
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
    serializeAttachment: (value) => {
      attachment = value;
    },
    deserializeAttachment: () => attachment,
  };
  return socket;
}

export interface FakeRoom {
  /** Every socket the relay has taken in, the closed ones included. */
  readonly accepted: FakeSocket[];
  readonly held: Map<string, number>;
  alarmAt: number | null;
  cleared: boolean;
  state: RelayRoomState;
}

export function fakeRoom(): FakeRoom {
  const room: FakeRoom = {
    accepted: [],
    held: new Map(),
    alarmAt: null,
    cleared: false,
    state: {
      getWebSockets: () => room.accepted.filter((s) => s.closedWith === null),
      // A socket the platform hands back is one of ours by construction.
      acceptWebSocket: (ws) => {
        room.accepted.push(ws as FakeSocket);
      },
      storage: {
        get: async (key) => room.held.get(key),
        put: async (key, value) => {
          room.held.set(key, value);
        },
        getAlarm: async () => room.alarmAt,
        setAlarm: async (at) => {
          room.alarmAt = at;
        },
        deleteAlarm: async () => {
          room.alarmAt = null;
        },
        deleteAll: async () => {
          room.held.clear();
          room.cleared = true;
        },
      },
    },
  };
  return room;
}
