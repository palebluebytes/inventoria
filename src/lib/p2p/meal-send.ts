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
 * and nothing else" — a rule ADR-0096 §8 has since withdrawn, though this was
 * never outside it: it is the same acknowledgement, and without it a refused
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
 * is why `relay-room.ts` rejoins rather than failing.
 *
 * "Any refusal" is read as the class rather than as ADR-0073 §8's list alone: a
 * frame that will not open under the code is a refusal at the seal, one step
 * before §8 has a payload to judge, and it ends the session the same way. What
 * it is *not* is a different condition.
 *
 * The room itself — the dial, the rejoin, the deadline and the four ways a
 * session ends — is `relay-room.ts`, because a Pairing act meets in one too
 * (ADR-0096 §8). What is left here is the Meal send's own protocol: two frames,
 * and what each of them means.
 *
 * Two things are deliberately not burns. **An unreachable Relay** is not one —
 * nothing crossed, so nothing was spent, and the surface offers another code
 * rather than ending anything. Neither is **a recipient who gives up waiting**:
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
  enterRoom,
  RoomFailedError,
  whyRoomEnded,
  type RoomOptions,
} from "./relay-room";
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

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

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

/** §7's acknowledgement, and its negative. The whole of the reverse frame. */
export const DELIVERED_WORD = "delivered";
export const REFUSED_WORD = "refused";

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
 * different facts rather than degrees of the same one: {@link RoomFailedError}
 * for how a session ended, {@link SendCodeSpentError} for a code that has
 * already done its job, and {@link SealRefusedError} when something in the room
 * answered with a frame this code does not open — which is §3's third clause
 * firing, and not the same thing as a refusal.
 */
export async function sendMealPayload(
  code: SendCode,
  ndjson: string,
  options: RoomOptions = {}
): Promise<void> {
  if (isSendCodeSpent(code)) throw new SendCodeSpentError();

  const payload = await sealFrame(code, await deflateWire(ndjson));
  const room = await enterRoom(code.room, options);
  let sent = false;

  try {
    for (;;) {
      const event = await room.next();

      if (event.kind === "peer") {
        // A second peer word is a rejoin, and this send is one frame: sending
        // again would hand the recipient the same meal twice. The room would
        // now carry it — ADR-0096 §8 dropped the tally that used to close the
        // room over it — so the guard is this side's alone.
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
          throw new RoomFailedError(
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
      throw whyRoomEnded(
        event,
        "you cancelled this send, and nothing crossed."
      );
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
  options: RoomOptions = {}
): Promise<ReceivedMealPayload> {
  if (isSendCodeSpent(code)) throw new SendCodeSpentError();

  const room = await enterRoom(code.room, options);

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
      throw whyRoomEnded(event, "you left before the meal arrived.");
    }
  } finally {
    room.leave();
  }
}
