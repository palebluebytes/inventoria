/**
 * What somebody just pasted into the Scan way in (ADR-0082 §13).
 *
 * Paste is one of ADR-0072 §4's two sanctioned addressing modes and always was;
 * it was made a full mode, replaced by the link, then dropped **without ever
 * being refused on its own terms**, and ADR-0082 §4 restores it. It lands on
 * the Scan way in rather than on a door of its own, which is what keeps
 * ADR-0074 §4's claim literally true: receiving still has no door, it borrows
 * one.
 *
 * **The bar is on the code's content, not on how the characters arrived.**
 * ADR-0072 §4's "no typed-code entry field, ever" is narrowed by ADR-0082 §12
 * to what its own paragraph argued: **no code a human is expected to
 * reproduce** — not spoken, not read out over a phone, not transcribed from
 * another screen. A field that accepts a pasted link is not that, because
 * nothing about it is sized to what a person can hold in their head. So this
 * accepts a **full link shape only** — `readSendCode` refuses anything that is
 * not a URL carrying both halves with an exactly-32-byte key — and the field it
 * reads for carries **no placeholder inviting anyone to type**.
 *
 * **On every platform, not iOS alone** (§13). A platform conditional is two
 * behaviours to build, test and explain, and what it would save is a text
 * field. On Android the link already lands in the installed app, so the field
 * is redundant there; redundant is not a reason to make it conditional.
 *
 * **Nothing reads the pasteboard.** `navigator.clipboard.readText()` is refused
 * outright (ADR-0082 §11.10): the programmatic read is gated three ways and
 * carries two residuals no public source can close, while manual paste is
 * ungated in WebKit — `LocalFrame::requestDOMPasteAccess` short-circuits on
 * `editor().isPastingFromMenuOrKeyBinding()` before any client callback, prompt
 * or origin check. The design takes the settled path, which means the person
 * pastes and this reads the field.
 */

import { readScannedCode } from "./scanned-code";
import type { SendCode } from "./send-code";

/** What was in the field, read for what the Scan way in should do with it. */
export type PastedLink =
  /** Nothing typed or pasted yet, which is not a refusal of anything. */
  | { kind: "empty" }
  /** A meal link: somebody is handing a meal over. */
  | { kind: "meal"; code: SendCode }
  /** Not a meal link, and the one line that says so. */
  | { kind: "refused"; line: string };

/**
 * Reads the field.
 *
 * It borrows {@link readScannedCode} rather than calling `readSendCode`
 * directly, because a pasted string and a decoded one are the same question
 * asked of the same shapes, and one rule covering both is what keeps the two
 * carriers from drifting apart.
 *
 * The refusals are one line each, which is ADR-0074 §6's shape. There is no
 * "show why" behind them: unlike a code that was carried across a wire, what
 * went wrong here is visible in the field, and the recovery is to paste the
 * whole link.
 */
export function readPastedLink(raw: string): PastedLink {
  const pasted = raw.trim();
  if (pasted === "") return { kind: "empty" };

  const read = readScannedCode(pasted);
  if (read.kind === "meal") return { kind: "meal", code: read.code };
  return { kind: "refused", line: refusalLine(read.kind) };
}

/**
 * Two lines, because two things went wrong and they send a person to different
 * places: a damaged code means the sender has to mint another, and everything
 * else means what is in the field was never a meal link.
 *
 * `FoodStager`'s `rejectionLine` is the same shape for the camera and it is
 * deliberately not shared. The two are read in different rooms — one over a
 * live preview by somebody holding a phone at somebody else's screen, the other
 * under a field by somebody who has just pasted — so the words differ, and a
 * single function serving both would have to say something true of neither.
 */
function refusalLine(kind: "barcode" | "broken" | "neither"): string {
  if (kind === "broken")
    return "That meal link is damaged. Ask them to send you a new one.";
  return "That is not a meal link. Paste the whole link they sent you.";
}
