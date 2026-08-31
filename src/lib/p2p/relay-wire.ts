/**
 * The client's half of the Relay's wire contract (ADR-0072 §11 and §12).
 *
 * **Restated here rather than imported, and a test holds every value in step
 * with the Relay's own.**
 * `scripts/worker-closure-check.mjs` pins what the Worker may compile in, and
 * the pin runs one way: the Worker reaches into `src/lib/ingestion/` and
 * nothing else. Importing `worker/src/relay.ts` from the app would open the
 * reverse direction, put edge code in the app's module graph, and leave the
 * next workerd-only global in that file to break a browser build. So the
 * numbers are declared twice and `meal-send.test.ts` asserts each one equals
 * the Relay's — "one clock and one number, not two" (§11.4) enforced by a gate
 * rather than by a comment.
 *
 * Only what a *client* has to know is here. The Relay's own bounds — the socket
 * cap, the frame tally, the wire-byte backstop — are the Relay's to enforce and
 * a client that duplicated them would be guessing at another party's job.
 */

/** Where the Relay listens, on the app's own origin (ADR-0072 §9). */
export const RELAY_PATH = "/api/relay";

/** How a room is named to it. The id is client-minted (§10). */
export const RELAY_ROOM_PARAM = "room";

/**
 * The one thing the Relay ever says, and the only text on this wire.
 *
 * A party cannot speak before the other arrives, because §5 forbids
 * store-and-forward at any layer: a frame sent alone has nowhere to go. The
 * readiness signal cannot come from the peer either, whose single frame is
 * already spent on the delivery acknowledgement — so it is the Relay's. The
 * register that keeps it unambiguous is that **the Relay originates text and
 * the parties send binary**, which makes a party's text frame a refusal rather
 * than a silent drop.
 */
export const PEER_WORD = "peer";

/**
 * A room's five minutes (§11.4), which is also §6's fourth burn condition —
 * one clock and one number, not two.
 *
 * **The room's alarm is the clock, and the client's timer is only a backstop.**
 * A close the Relay chose ends a session the moment it arrives, so the number
 * below is what fires when no close arrives at all — measured against workerd
 * on 2026-08-30, a party whose client never sent a frame can sit in `CLOSING`
 * after the room has already released its slot.
 *
 * It starts when *this* party joins rather than when the room did, which the
 * client cannot know. That can only ever make it fire late, never early, and a
 * backstop that fires late is a backstop; one that fired early would be the
 * second timer §11.4 refuses.
 */
export const ROOM_LIFETIME_MS = 5 * 60 * 1000;

/**
 * The close code the Relay ends a finished room with. Its refusals are the
 * 4000-range codes an application may send.
 *
 * A client reads them for one decision: **whether the room is gone or the
 * socket is.** A code the Relay chose means the room ended and there is nothing
 * to rejoin; anything else — a code no endpoint can send, 1006's abnormal close
 * — is the transport losing its grip, which §6 says is not a use of the Send
 * code.
 *
 * It reads one of the refusals by name, and only one. The deadline is a burn
 * condition in its own right (§6.4) and the person waiting is owed those words;
 * the other four are the room refusing a shape, and a client that renamed them
 * would be reporting a defect as patience running out.
 */
export const CLOSE_NORMAL = 1000;
export const FIRST_REFUSAL_CLOSE = 4000;

/** The one refusal a client reads by name: the room's deadline (§11.4). */
export const CLOSE_EXPIRED = 4001;

export const relayChoseToClose = (code?: number): boolean =>
  code === CLOSE_NORMAL || (code !== undefined && code >= FIRST_REFUSAL_CLOSE);
