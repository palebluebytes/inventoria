/**
 * The Pairing act, up to the point where both devices hold chain state
 * (ADR-0096 §8).
 *
 * **The order inverts.** A one-shot room id and a fresh 256-bit key are minted
 * exactly as `send-code.ts` mints a Send code, and the **256-bit pairing secret
 * is minted inside the sealed room** by the device that minted the code.
 * Nothing a camera can see carries it.
 *
 * **The sentence this exists to carry: today's pairing QR is a stronger
 * credential than either device's own disk.** A photographed QR under ADR-0075
 * §3 regenerates both `state₀`s and with them every deposit address and every
 * seal key from pairing onward — passively, retrospectively, forever, against a
 * store that retains — where §4's bound concedes a compromised device one
 * outstanding object per lane. Destroying the secret on disk buys nothing
 * against a photograph, because the photograph is not on disk.
 *
 * **What the inversion does not fix, stated rather than glossed.** Photograph
 * *and* race inside five minutes and you take the second socket and become a
 * paired device, permanently. That attack is **active and loud** where today's
 * is passive and silent: the legitimate second device finds the room full and
 * is refused, so one device says paired and the other says pairing failed. The
 * trade is an undetectable permanent compromise for a detectable five-minute
 * one, not the elimination of a risk — which is why the refusal must reach the
 * screen rather than being retried away.
 *
 * **Contributory minting is refused**, on the record, because it will be
 * proposed later as free hardening: the room's own key is already a
 * single-source draw from the code-minter's CSPRNG, so an attacker who can
 * predict that RNG opens the room and reads both contributions. It adds a term
 * to a product that already has a zero factor, and minting at the code-minter
 * keeps the set of devices whose RNG must be sound at one.
 *
 * **The room is the caller's, not this module's.** Pairing does not end here:
 * §8's act runs on to a vector exchange, chunks both ways and a closing vector
 * in the *same* room, and the room id is spent — a successor room derived from
 * the secret is refused (§8), so there is nothing to reopen. Each function
 * below is one leg of that act, and whoever entered the room leaves it.
 */

import { derivePairingChains, type PairedChains } from "./pairing-chain";
import type { PairingCode } from "./pairing-code";
import { RoomFailedError, whyRoomEnded, type Room } from "./relay-room";
import {
  burnRoomCode,
  isRoomCodeSpent,
  randomBytes,
  RoomCodeSpentError,
  type RandomBytes,
} from "./room-code";
import { openSealedFrame, sealFrame } from "./sealed-frame";

/** The pairing secret's width: 256 bits, the bar §8 states. */
export const PAIRING_SECRET_BYTES = 32;

/**
 * What crossed the room was not a pairing secret.
 *
 * Distinct from a seal that would not open, which is `SealRefusedError` and is
 * different news: that one says *somebody else answered*, and this one says the
 * device holding the code sent something this version does not understand.
 */
export class PairingRefusedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PairingRefusedError";
  }
}

/**
 * The code-minter's leg: mint the pairing secret inside the room, hand it over
 * sealed, and derive both lanes off it.
 *
 * The secret is minted **after** the peer word rather than up front, so that a
 * code shown to an empty room and abandoned never had a secret to leak. It is
 * consumed by {@link derivePairingChains} on the next line, so the only place
 * it survives is inside the sealed frame that has already left.
 *
 * It does not wait for an acknowledgement, and there is none to wait for: the
 * act continues in the same room with the vector exchange, and **a pairing is
 * not complete until its first sync completes** (§2). Holding chain state is
 * not being paired.
 */
export async function handPairingSecret(
  room: Room,
  code: PairingCode,
  draw: RandomBytes = randomBytes
): Promise<PairedChains> {
  if (isRoomCodeSpent(code)) throw new RoomCodeSpentError();

  for (;;) {
    const event = await room.next();

    if (event.kind === "peer") {
      const secret = draw(PAIRING_SECRET_BYTES);
      room.send(await sealFrame(code, secret));
      // The code has done its one job the moment the secret has left.
      burnRoomCode(code);
      return derivePairingChains(secret, "showed");
    }

    if (event.kind === "frame") {
      // The relay sends its peer word to both parties the moment the room holds
      // two sockets, and forwards nothing before that — so a frame arriving
      // first is something in the room speaking out of turn rather than a race
      // this side lost. It ends the act loudly, as every surprise in a room
      // holding a live secret must.
      burnRoomCode(code);
      throw new RoomFailedError(
        "refused",
        "something answered in this room before the code was handed over."
      );
    }

    burnRoomCode(code);
    throw whyRoomEnded(event, "you called this off, and nothing crossed.");
  }
}

/**
 * The reader's leg: take the sealed pairing secret and derive both lanes off
 * it, mirrored.
 *
 * The frame is judged before anything is derived. A frame that will not open is
 * a `SealRefusedError` — somebody else is in the room — and one that opens to
 * something that is not a 256-bit secret is a {@link PairingRefusedError}. The
 * two are different news to the person holding the phone.
 */
export async function takePairingSecret(
  room: Room,
  code: PairingCode
): Promise<PairedChains> {
  if (isRoomCodeSpent(code)) throw new RoomCodeSpentError();

  for (;;) {
    const event = await room.next();

    // The peer word is the code-minter's cue, not this side's: the reader has
    // nothing to say until the secret arrives.
    if (event.kind === "peer") continue;

    if (event.kind === "frame") {
      burnRoomCode(code);
      const secret = await openSealedFrame(code, event.bytes);
      if (secret.length !== PAIRING_SECRET_BYTES) {
        secret.fill(0);
        throw new PairingRefusedError(
          `the other device sent ${secret.length} bytes, not the ${PAIRING_SECRET_BYTES} a pairing secret is.`
        );
      }
      return derivePairingChains(secret, "read");
    }

    burnRoomCode(code);
    throw whyRoomEnded(event, "you called this off, and nothing crossed.");
  }
}
