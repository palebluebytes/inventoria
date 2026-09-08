/**
 * One room on the Relay, from the dial to the moment the session leaves it
 * (ADR-0072 §5, §6.4 and §11).
 *
 * **A room is not a send.** It was written inside `meal-send.ts` because a
 * Meal send was the only thing that entered one; ADR-0096 §8 gives it a second
 * caller — a Pairing act meets in a room minted exactly as a Send code is — and
 * two copies of a rejoining socket with a five-minute deadline are the last
 * thing to keep in step by hand. So the room is here and the two protocols
 * spoken inside one are theirs.
 *
 * What a room is: two live sockets to one client-minted id, a readiness word
 * from the Relay when both are present, opaque frames in either direction, and
 * five minutes. It stores nothing, it resumes nothing, and it forwards frames
 * it structurally cannot open.
 *
 * **A transport reconnect within a live session is not a use of the code**
 * (ADR-0072 §6), so a lost socket is redialled rather than ending anything. A
 * close the Relay *chose* is the room itself ending, and there is nothing left
 * to rejoin.
 */

import {
  PEER_WORD,
  RELAY_PATH,
  RELAY_ROOM_PARAM,
  ROOM_LIFETIME_MS,
  CLOSE_EXPIRED,
  relayChoseToClose,
} from "./relay-wire";

/**
 * How long a lost socket waits before trying the room again.
 *
 * There is no attempt ceiling and no backoff, because the deadline is already
 * the bound: rejoining stops when the room's five minutes do, and a session
 * that spent all of them reconnecting has failed anyway.
 */
export const REJOIN_PAUSE_MS = 1000;

/**
 * Why a session in a room ended without doing its job.
 *
 * **Four of these are the room's and the fifth is the protocol's.** A room ends
 * by being unreachable, by running out of its five minutes, by the party
 * leaving, or by the Relay closing it under one of its own bounds. `refused` is
 * the peer saying no to what crossed — a Meal the recipient would not take
 * (ADR-0072 §6.2) — which no room can see and every protocol spoken in one may
 * raise. It is in this union rather than beside it so that a surface's words
 * for an ending are one total map instead of two partial ones.
 */
export type RoomFailure =
  /** The Relay could not be reached, and nothing crossed. */
  | "unavailable"
  /** The room's five minutes ran out (ADR-0072 §6.4). */
  | "expired"
  /** This party pulled out. */
  | "cancelled"
  /** The other device refused what crossed. */
  | "refused"
  /**
   * The Relay closed the room under one of its own refusals (§11) — a text
   * frame, or a peer that went away before a frame could be forwarded. A third
   * socket is refused before a socket exists to be closed, so it arrives as
   * `unavailable` instead.
   */
  | "closed";

export class RoomFailedError extends Error {
  readonly failure: RoomFailure;

  constructor(failure: RoomFailure, reason: string) {
    super(reason);
    this.name = "RoomFailedError";
    this.failure = failure;
  }
}

// ---------------------------------------------------------------------------
// The socket, as a session needs it
// ---------------------------------------------------------------------------

/** What a session does to a room. */
export interface RelayLink {
  send(frame: Uint8Array): void;
  close(): void;
}

/**
 * What a room does to a session.
 *
 * The handlers are handed to {@link RelayDial} rather than attached to what it
 * returns, so there is no window between a socket opening and somebody
 * listening to it — the Relay's peer word can arrive on the same tick as the
 * upgrade, when the other party is already waiting.
 */
export interface RelayLinkHandlers {
  /** Text is the Relay's own register; binary is the peer's frame. */
  message(message: ArrayBuffer | string): void;
  /** With the close code, which says whether the room is gone or the socket. */
  closed(code?: number): void;
}

export type RelayDial = (
  room: string,
  handlers: RelayLinkHandlers
) => Promise<RelayLink>;

/** What a session in a room needs from outside itself. */
export interface RoomOptions {
  dial?: RelayDial;
  /** This party pulling out — the sender cancelling, the reader leaving. */
  signal?: AbortSignal;
  /**
   * The room's five minutes, as a parameter so a test can prove the deadline
   * without waiting one out — **never so a caller can extend it**. §11.4's one
   * clock and one number is the default, and the app passes no other.
   */
  lifetimeMs?: number;
}

/**
 * The real socket: same origin as the app and its receive link (§9), so there
 * is no allowlist to write, maintain and get wrong.
 *
 * It rejects only on an upgrade that never opened. A browser cannot see *why*
 * — a Relay that is down and a room already holding two sockets (§11.1's
 * refused third) both arrive as a socket that failed to open — and it does not
 * need to: both mean this session cannot proceed, and both leave the code
 * unspent.
 */
export const openRelaySocket: RelayDial = (room, handlers) =>
  new Promise((resolve, reject) => {
    const url = new URL(RELAY_PATH, location.href);
    url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
    url.searchParams.set(RELAY_ROOM_PARAM, room);

    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    socket.onmessage = (event) => handlers.message(event.data);
    socket.onclose = (event) => handlers.closed(event.code);
    socket.onerror = () => reject(new Error("the relay socket failed"));
    socket.onopen = () =>
      resolve({
        // The same `BufferSource` boundary the seal crosses: a `Uint8Array`
        // over an `ArrayBufferLike` is what every producer here hands out.
        send: (frame) => socket.send(frame as BufferSource),
        close: () => socket.close(),
      });
  });

// ---------------------------------------------------------------------------
// The room, which survives losing its socket
// ---------------------------------------------------------------------------

export type RoomEvent =
  | { kind: "peer" }
  | { kind: "frame"; bytes: Uint8Array }
  | { kind: "closed"; code?: number }
  | { kind: "expired" }
  | { kind: "cancelled" };

export interface Room {
  /** The next thing the room has to say, awaited one at a time. */
  next(): Promise<RoomEvent>;
  send(frame: Uint8Array): void;
  leave(): void;
}

const pause = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

/**
 * Joins a room and keeps a socket in it until the session leaves or the five
 * minutes are up.
 *
 * The deadline is the client's own, against the same number as the Relay's
 * (`relay-wire.ts` says why a waiting party cannot rely on being told).
 */
export async function enterRoom(
  roomId: string,
  { dial = openRelaySocket, signal, lifetimeMs = ROOM_LIFETIME_MS }: RoomOptions
): Promise<Room> {
  const queued: RoomEvent[] = [];
  let waiting: ((event: RoomEvent) => void) | null = null;
  let link: RelayLink | null = null;
  let left = false;

  const push = (event: RoomEvent) => {
    if (left) return;
    const wake = waiting;
    waiting = null;
    if (wake) wake(event);
    else queued.push(event);
  };

  const handlers: RelayLinkHandlers = {
    message: (message) => {
      if (typeof message === "string") {
        // The Relay's register. Its one word says both parties are present;
        // anything else it might ever say is not this version's to interpret.
        if (message === PEER_WORD) push({ kind: "peer" });
        return;
      }
      push({ kind: "frame", bytes: new Uint8Array(message) });
    },
    closed: (closeCode) => {
      link = null;
      // A close the Relay chose is the room itself ending, and it ends the
      // session with it: there is nothing to rejoin, and redialling a spent id
      // would open a *fresh* five-minute room on the edge after every send.
      // Anything else — a code no endpoint can send, an abnormal close — is the
      // transport losing its grip, which §6 says is not a use of the code.
      if (relayChoseToClose(closeCode))
        push({ kind: "closed", code: closeCode });
      else void rejoin();
    },
  };

  // §6: a transport reconnect within a live session is not a use of the code.
  // The room stays ours until one of the burn conditions fires, so a lost
  // socket is redialled rather than ending the session. The first attempt is
  // immediate, because a socket that dropped is usually replaceable at once;
  // the pause is between retries, and the deadline is what ends them.
  let rejoining = false;
  const rejoin = async () => {
    // One loop at a time. A rejoin's own failed dial reports an abnormal close
    // like any other, which lands back here — so without this each failure
    // would leave behind a second loop dialling the same room, and the room's
    // five minutes would be spent doubling rather than reconnecting.
    if (rejoining) return;
    rejoining = true;
    try {
      await keepDialling();
    } finally {
      rejoining = false;
    }
  };

  const keepDialling = async () => {
    while (!left && link === null) {
      try {
        const rejoined = await dial(roomId, handlers);
        if (left) return rejoined.close();
        link = rejoined;
        return;
      } catch {
        // Keep trying: the deadline stops this, not a counter.
      }
      await pause(REJOIN_PAUSE_MS);
    }
  };

  const cancelled = () => push({ kind: "cancelled" });
  const deadline = setTimeout(() => push({ kind: "expired" }), lifetimeMs);
  signal?.addEventListener("abort", cancelled);
  // A session called off while its first frame was still being sealed is called
  // off: a listener attached after the fact would never hear it.
  if (signal?.aborted) cancelled();

  try {
    link = await dial(roomId, handlers);
  } catch (error) {
    // The session is over before it began, and saying so is what stops the
    // rejoin: a browser reports an upgrade that never opened as an error AND
    // an abnormal close, so `handlers.closed` has very likely already started
    // one. Nothing would end it — the deadline is being cleared on the next
    // line, and `leave` is only reachable through the room this never returns.
    left = true;
    clearTimeout(deadline);
    signal?.removeEventListener("abort", cancelled);
    throw new RoomFailedError(
      "unavailable",
      `the relay could not be reached: ${error instanceof Error ? error.message : error}`
    );
  }

  return {
    next: () => {
      const held = queued.shift();
      return held
        ? Promise.resolve(held)
        : new Promise<RoomEvent>((resolve) => {
            waiting = resolve;
          });
    },
    send: (frame) => {
      if (!link) {
        throw new RoomFailedError(
          "unavailable",
          "the relay socket went away mid-session."
        );
      }
      link.send(frame);
    },
    leave: () => {
      left = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", cancelled);
      link?.close();
      link = null;
    },
  };
}

/**
 * Why a session ended, in the words the surface will need.
 *
 * The Relay's own close is read for exactly one thing: whether it was the
 * deadline. That one is a burn condition in its own right (§6.4) and the person
 * waiting needs to be told their five minutes went; the other bounds are the
 * room refusing a shape, and flattening them into a fake timeout would report a
 * defect as patience running out.
 *
 * `leaving` is the caller's, because the two ends of a session leave
 * differently: one cancels a send, the other gives up waiting for one.
 */
export function whyRoomEnded(
  event: { kind: "closed"; code?: number } | { kind: "expired" | "cancelled" },
  leaving: string
): RoomFailedError {
  if (event.kind === "cancelled") {
    return new RoomFailedError("cancelled", leaving);
  }
  const closeCode = event.kind === "closed" ? event.code : undefined;
  if (event.kind === "expired" || closeCode === CLOSE_EXPIRED) {
    return new RoomFailedError(
      "expired",
      "this code's five minutes are up, and nothing crossed."
    );
  }
  return new RoomFailedError(
    "closed",
    `the relay closed this room before anything crossed (${closeCode}).`
  );
}
