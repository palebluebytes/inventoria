/**
 * The Send code: the room and key a Meal send meets in, and the link that
 * carries them (ADR-0072 §3, §4, §6 and §10).
 *
 * **The shape is `room-code.ts`'s**, and the argument for it — why the key is
 * the security, why the room id is only an address, and which four omissions
 * are deliberate — is stated there once for both codes that have it. What is
 * here is the half that is a Send code's alone: the carrier. A Send code
 * travels as a **link**, and ADR-0096 §8's Pairing code deliberately does not.
 *
 * The code is minted here and dies here. Everything between is `meal-send.ts`.
 */

import { facetOf } from "../facets/registry";
import {
  base64url,
  readRoomKey,
  RoomCodeError,
  type RoomCode,
} from "./room-code";

/**
 * One send's whole secret.
 *
 * A named alias rather than a bare {@link RoomCode} because the vocabulary
 * distinguishes them: `CONTEXT.md` has a Send code addressing a meal at
 * Rations and a Pairing code addressing an act at the root.
 *
 * **It is documentation, not a guard.** The two are structurally identical, so
 * nothing stops a Pairing code reaching {@link sendCodeLink} — which is the one
 * mistake worth catching, since ADR-0096 §8 exists to keep that code out of a
 * link. A brand would catch it and would cost a cast at every mint, and the
 * population is two call sites in one directory; if a third code shape ever
 * shares this one, that trade changes.
 */
export type SendCode = RoomCode;

/** The fragment a code travels in, without its `#` (ADR-0074 §8). */
export function sendCodeFragment(code: SendCode): string {
  return `r=${code.room}&k=${base64url(code.key)}`;
}

/**
 * The code's carrier: `https://<origin>/food/#r=<room>&k=<key>` (ADR-0074 §8,
 * ADR-0084 §5).
 *
 * **The secret is in the fragment, never a query parameter**, so it reaches no
 * server by construction — RFC 9110 §7.1 excludes a fragment from the target
 * URI. The QR encodes this same link, so there is one code shape with two
 * carriers rather than two shapes.
 *
 * **It mints at Rations' scope rather than the root's**, and the two arguments
 * ADR-0084 §5 gives converge without either restating the other. By
 * **ownership**: a meal is `event:consume_*` and food twins, which belong to
 * Rations, and a hand-off belongs to the Facet that owns what it carries. By
 * **scope**: prefix matching is one-directional (ADR-0078 §3), so `/food/`
 * opened by someone who installed only the root is still inside their scope and
 * lands, while `/` opened by someone who installed only Rations is outside
 * theirs and opens a browser tab. The two directions do not cost the same.
 *
 * ADR-0074 §9's reason for `/` survives the move intact and is now #312's:
 * `public/_headers` is `/*`, so an **asset-served** `/food/` inherits
 * `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` and keeps
 * `SharedArrayBuffer`. A `/food/` that fell through to the Worker script
 * instead would answer without them and drop the app onto an in-memory
 * database, which is why the move waited on a real request rather than on a
 * local run — `vite`'s `appType: 'spa'` falls back to `index.html` in both
 * `pnpm dev` and `pnpm preview` and would show nothing.
 *
 * **The path is read off the roster, never written out here**, for the reason
 * the root reads Rations' name off it to offer the install: a literal would let
 * this mint a link to a path Rations has stopped answering to.
 *
 * The link is the only carrier that leaves a trace: a messenger learns that two
 * people exchanged something at a time. The code is dead by then (§5), but that
 * metadata is not, and it is the user's choice of messenger rather than the
 * app's.
 */
export function sendCodeLink(code: SendCode, origin: string): string {
  const rations = facetOf("food");
  return `${new URL(rations.startUrl, origin).href}#${sendCodeFragment(code)}`;
}

/**
 * The code in a link, or `null` if there is no code in it.
 *
 * Two different answers on purpose. `null` is "this is not a Send code" — an
 * ordinary boot, a scanned product barcode, a Pairing code — and the caller
 * carries on. {@link RoomCodeError} is "this is a Send code and it is broken",
 * which the receive surface can say something about.
 */
export function readSendCode(href: string): SendCode | null {
  let hash: string;
  try {
    hash = new URL(href).hash;
  } catch {
    // Whatever the camera read, it was not a URL. The scanner sees whatever is
    // in the room (ADR-0074 §4: the Scan way in reads a meal code as well as a
    // barcode), so this is an ordinary answer rather than a failure.
    return null;
  }

  const fields = new URLSearchParams(hash.slice(1));
  const room = fields.get("r");
  const key = fields.get("k");
  if (room === null && key === null) return null;
  if (!room || !key) {
    throw new RoomCodeError("this code is missing half of itself.");
  }
  return { room, key: readRoomKey(key) };
}
