/**
 * One **Meal send**, from the moment a Send code exists to the moment it is
 * spent (ADR-0072 §5, §6 and §7).
 *
 * **Both people are present at the same moment, and the meal exists in exactly
 * two places, never three.** There is no store-and-forward at any layer, no
 * queue and no parked bundle: a session is two live sockets to one room, one
 * sealed frame each way, and then nothing. Synchrony is also what makes the
 * code's lifetime self-limiting — the code is alive exactly while the sender is
 * waiting, so a pasted code sitting in a messenger's scrollback is already dead
 * by the time it *is* scrollback, and that costs no expiry policy to obtain.
 *
 * **A device never listens for a send it was not asked for.** Nothing in this
 * module runs unless a person started it: no background listener, no push, no
 * persistent address, nothing reachable while the app is closed. The cost,
 * stated plainly, is that you cannot send to someone whose phone is in their
 * pocket. (§5 does not transfer to the own-device half, which ADR-0075 §2 owns.)
 *
 * ### The two frames
 *
 * The sender's frame is the Meal payload, deflated and then sealed. The
 * reverse frame is §7's **delivery acknowledgement**, and it is the reason the
 * sender can know whether to mint another code:
 *
 *   - `delivered` — the payload arrived and passed ADR-0073 §8's seven
 *     refusals and §9's ceiling.
 *   - `refused` — it did not.
 *
 * **Neither is acceptance, and there is no accept signal on this wire.**
 * Whether the recipient keeps the meal is their private decision about their
 * own ledger, and reporting it would make declining socially visible — a
 * pressure the app has no business creating. Under §5 the session is over the
 * instant delivery completes, so there is no channel left to carry one either.
 *
 * The negative word is not a widening of §11.2's "the delivery acknowledgement
 * and nothing else": it is the same acknowledgement, and without it a refused
 * send would leave the sender staring at a screen until the room's five minutes
 * ran out, unable to tell a refusal from a recipient who walked away. It
 * carries no reason. The reason is the recipient's to see (ADR-0074 §6), and a
 * free-text field here would be a hostile peer writing on the sender's screen.
 *
 * ### What burns the code
 *
 * §6's four conditions, and no fifth: one successful delivery, any refusal, the
 * sender cancelling, and five minutes. **A transport reconnect within a live
 * session is not a use** — the socket is redialled and the code survives, which
 * is why {@link enterRoom} rejoins rather than failing.
 *
 * "Any refusal" is read as the class rather than as ADR-0073 §8's list alone: a
 * frame that will not open under the code is a refusal at the seal, one step
 * before §8 has a payload to judge, and it ends the session the same way. What
 * it is *not* is a different condition.
 *
 * Two things are deliberately not burns. **An unreachable Relay** is not one —
 * nothing crossed, so nothing was spent, and the surface steps down to the
 * Ledger export instead (§14). Neither is **a recipient who gives up waiting**:
 * §6.3 names the sender cancelling, and the meal has not arrived, so the code
 * is still the live thing the sender is holding a screen open for.
 */

import { MEAL_WIRE_COMPRESSION } from "./meal-payload";
import {
  decodeMealPayload,
  readMealPayload,
  type MealPayloadRefusedError,
  type ReceivedMealPayload,
} from "./meal-reader";
import {
  PEER_WORD,
  RELAY_PATH,
  RELAY_ROOM_PARAM,
  ROOM_LIFETIME_MS,
  CLOSE_EXPIRED,
  relayChoseToClose,
} from "./relay-wire";
import {
  openSealedFrame,
  sealFrame,
  type SealRefusedError,
} from "./sealed-frame";
import {
  burnSendCode,
  isSendCodeSpent,
  SendCodeSpentError,
  type SendCode,
} from "./send-code";

/** §7's acknowledgement, and its negative. The whole of the reverse frame. */
export const DELIVERED_WORD = "delivered";
export const REFUSED_WORD = "refused";

/**
 * How long a lost socket waits before trying the room again.
 *
 * There is no attempt ceiling and no backoff, because the deadline is already
 * the bound: rejoining stops when the room's five minutes do, and a session
 * that spent all of them reconnecting has failed anyway.
 */
export const REJOIN_PAUSE_MS = 1000;

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/** Why a session ended without a meal crossing. */
export type SendFailure =
  /** The Relay could not be reached. §14: the surface offers the file export. */
  | "unavailable"
  /** The room's five minutes ran out (§6.4). */
  | "expired"
  /** The sender pulled out (§6.3). */
  | "cancelled"
  /** The other device refused the payload (§6.2, ADR-0073 §8 and §9). */
  | "refused"
  /**
   * The Relay closed the room under one of its own bounds (§11) — a third
   * socket, a frame over the wire ceiling, a second frame, a text frame, or a
   * peer that went away before the payload could be forwarded.
   */
  | "closed";

export class SendFailedError extends Error {
  readonly failure: SendFailure;

  constructor(failure: SendFailure, reason: string) {
    super(reason);
    this.name = "SendFailedError";
    this.failure = failure;
  }
}

// ---------------------------------------------------------------------------
// The socket, as the session needs it
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
  /** Text is the Relay's own register; binary is the peer's one frame. */
  message(message: ArrayBuffer | string): void;
  /** With the close code, which says whether the room is gone or the socket. */
  closed(code?: number): void;
}

export type RelayDial = (
  room: string,
  handlers: RelayLinkHandlers
) => Promise<RelayLink>;

/** What either half of a Meal send needs from outside itself. */
export interface MealSendOptions {
  dial?: RelayDial;
  /** The sender cancelling (§6.3), or the recipient leaving. */
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
 * need to: both mean this send cannot proceed, and both leave the code unspent.
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

type RoomEvent =
  | { kind: "peer" }
  | { kind: "frame"; bytes: Uint8Array }
  | { kind: "closed"; code?: number }
  | { kind: "expired" }
  | { kind: "cancelled" };

interface Room {
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
async function enterRoom(
  code: SendCode,
  {
    dial = openRelaySocket,
    signal,
    lifetimeMs = ROOM_LIFETIME_MS,
  }: MealSendOptions
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
  // The room stays ours until one of the four burn conditions fires, so a lost
  // socket is redialled rather than ending the send. The first attempt is
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
        const rejoined = await dial(code.room, handlers);
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
  // A send called off while its payload was still being sealed is called off:
  // a listener attached after the fact would never hear it.
  if (signal?.aborted) cancelled();

  try {
    link = await dial(code.room, handlers);
  } catch (error) {
    // The session is over before it began, and saying so is what stops the
    // rejoin: a browser reports an upgrade that never opened as an error AND
    // an abnormal close, so `handlers.closed` has very likely already started
    // one. Nothing would end it — the deadline is being cleared on the next
    // line, and `leave` is only reachable through the room this never returns.
    left = true;
    clearTimeout(deadline);
    signal?.removeEventListener("abort", cancelled);
    throw new SendFailedError(
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
        throw new SendFailedError(
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

// ---------------------------------------------------------------------------
// Compression, the browser's own
// ---------------------------------------------------------------------------

/**
 * Raw DEFLATE, not gzip: gzip's header and trailer are 18 bytes bought for
 * nothing (#194 §4.3). Compressing is the transport's job and undoing it is the
 * reader's, which is why {@link MEAL_WIRE_COMPRESSION} is declared once beside
 * the format and applied at both ends from there.
 */
async function deflateWire(ndjson: string): Promise<Uint8Array> {
  const deflated = new Blob([utf8.encode(ndjson) as BlobPart])
    .stream()
    .pipeThrough(
      new CompressionStream(
        MEAL_WIRE_COMPRESSION
      ) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
    );
  return new Uint8Array(await new Response(deflated).arrayBuffer());
}

/**
 * Why a session ended, in the words the surface will need.
 *
 * The Relay's own close is read for exactly one thing: whether it was the
 * deadline. That one is a burn condition in its own right (§6.4) and the person
 * waiting needs to be told their five minutes went; the other four bounds are
 * the room refusing a shape, and flattening them into a fake timeout would
 * report a defect as patience running out.
 *
 * `leaving` is the caller's, because the two halves leave differently: one
 * cancels a send, the other gives up waiting for one.
 */
function whyItEnded(
  event: { kind: "closed"; code?: number } | { kind: "expired" | "cancelled" },
  leaving: string
): SendFailedError {
  if (event.kind === "cancelled") {
    return new SendFailedError("cancelled", leaving);
  }
  const closeCode = event.kind === "closed" ? event.code : undefined;
  if (event.kind === "expired" || closeCode === CLOSE_EXPIRED) {
    return new SendFailedError(
      "expired",
      "this code's five minutes are up, and nothing crossed."
    );
  }
  return new SendFailedError(
    "closed",
    `the relay closed this room before the meal crossed (${closeCode}).`
  );
}

// ---------------------------------------------------------------------------
// The two halves of a send
// ---------------------------------------------------------------------------

/**
 * Hands one Meal payload to whoever holds the code, and learns whether it
 * landed.
 *
 * The payload is sealed before the room is entered, so the seconds a large meal
 * spends compressing are not seconds the other person spends waiting.
 *
 * Resolving means delivered. Three things can escape instead, and they are
 * different facts rather than degrees of the same one: {@link SendFailedError}
 * for how a session ended, {@link SendCodeSpentError} for a code that has
 * already done its job, and {@link SealRefusedError} when something in the room
 * answered with a frame this code does not open — which is §3's third clause
 * firing, and not the same thing as a refusal.
 */
export async function sendMealPayload(
  code: SendCode,
  ndjson: string,
  options: MealSendOptions = {}
): Promise<void> {
  if (isSendCodeSpent(code)) throw new SendCodeSpentError();

  const payload = await sealFrame(code, await deflateWire(ndjson));
  const room = await enterRoom(code, options);
  let sent = false;

  try {
    for (;;) {
      const event = await room.next();

      if (event.kind === "peer") {
        // A second peer word is a rejoin, and our one frame is already gone:
        // sending again would spend the room's tally (§11.2) and close it.
        if (!sent) {
          room.send(payload);
          sent = true;
        }
        continue;
      }

      if (event.kind === "frame") {
        // A frame in the reverse direction ends the session whatever it says,
        // so the code is spent before it is read.
        burnSendCode(code);
        const word = fromUtf8.decode(await openSealedFrame(code, event.bytes));
        if (word !== DELIVERED_WORD) {
          throw new SendFailedError(
            "refused",
            "the other device refused this meal, so nothing was added to their day."
          );
        }
        return;
      }

      // Two of §6's four, plus the room ending under one of the Relay's own
      // bounds — which is not a fifth condition but a session that cannot
      // deliver, on a room id that is spent either way.
      burnSendCode(code);
      throw whyItEnded(event, "you cancelled this send, and nothing crossed.");
    }
  } finally {
    room.leave();
  }
}

/**
 * Waits in the room the code names, and returns the meal that arrives.
 *
 * The refusals are judged **here, before anything is shown** (ADR-0073 §8), so
 * a hostile payload never reaches the screen and the failure lands while the
 * sender is still there to be told. What the payload then *becomes* is the
 * accept path's, and nothing on this wire says whether it ever does.
 *
 * It throws what {@link sendMealPayload} throws, plus {@link MealPayloadRefusedError}
 * for a payload that was judged and refused — the one the sender is told about
 * in a single word, and the recipient is shown a reason for.
 */
export async function receiveMealPayload(
  code: SendCode,
  options: MealSendOptions = {}
): Promise<ReceivedMealPayload> {
  if (isSendCodeSpent(code)) throw new SendCodeSpentError();

  const room = await enterRoom(code, options);

  /**
   * Tells the sender how it went, and never fails doing so: if the room has
   * gone, the sender learns from its own five minutes instead, and a refusal
   * this side has already judged is the more important fact to keep.
   */
  const answer = async (word: string) => {
    try {
      room.send(await sealFrame(code, utf8.encode(word)));
    } catch {
      // The sender's deadline is the fallback, and it is already running.
    }
  };

  try {
    for (;;) {
      const event = await room.next();

      // The peer word is the sender's cue, not ours: the recipient has nothing
      // to say until a meal arrives.
      if (event.kind === "peer") continue;

      if (event.kind === "frame") {
        burnSendCode(code);
        let payload: ReceivedMealPayload;
        try {
          const wire = await openSealedFrame(code, event.bytes);
          payload = readMealPayload(await decodeMealPayload(wire));
        } catch (refusal) {
          await answer(REFUSED_WORD);
          throw refusal;
        }
        await answer(DELIVERED_WORD);
        return payload;
      }

      // Giving up waiting spends nothing: §6.3 is the *sender* cancelling, and
      // a meal that never arrived leaves the sender still holding a live code.
      if (event.kind !== "cancelled") burnSendCode(code);
      throw whyItEnded(event, "you left before the meal arrived.");
    }
  } finally {
    room.leave();
  }
}
