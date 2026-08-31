/**
 * The receive link, read once at boot on `/` and taken off the URL with the
 * same act (ADR-0074 §8).
 *
 * The link is the Send code's second carrier, because two people in different
 * cities cannot show each other a screen. Its shape is
 * `https://<origin>/#r=<room>&k=<key>` — the secret in the **fragment**, so it
 * reaches no server by construction — and the QR encodes the same link, so
 * there is one code shape with two carriers rather than two shapes.
 *
 * **It is read at boot on `/`, not on a `/receive` route.** This app has no
 * router, and §9 has a harder reason than that one: `GET /receive` on the live
 * site falls through to the Worker script, which answers without the
 * `cross-origin-*` headers `_headers` puts on an asset — so a Worker-served
 * receive page loses cross-origin isolation, loses `SharedArrayBuffer`, fails
 * `sqlite3_vfs_find("opfs")` and runs on an **in-memory database**. Nothing in
 * the Playwright suite would catch it, because `vite`'s `appType: 'spa'` falls
 * back to `index.html` in both `pnpm dev` and `pnpm preview`. The
 * fragment-on-`/` shape avoids the whole hole at no config cost.
 *
 * Two behaviours §8 calls **forced rather than chosen**, and this module is
 * where both live:
 *
 *   - **Read once, then clean the URL.** ADR-0072 §6 burns the code on
 *     delivery, so a reload must not read as a retry. The register that records
 *     a spent code does not survive a reload and does not need to: after this,
 *     there is no code on the URL to retry with.
 *   - **Parse after mount, inside a `try`.** ADR-0069's guard treats a
 *     module-scope throw as "this shell cannot start" and wipes the service
 *     worker and every cache. The caller owns that `try`; see below for the one
 *     thing this module deliberately lets through it.
 */

import { readSendCode, type SendCode } from "./send-code";

/** What the URL the app started on turned out to be carrying. */
export type ReceiveLink =
  /** An ordinary boot. Nothing was read and nothing was rewritten. */
  | { kind: "none" }
  /** A meal is being handed over, and the code that opens it. */
  | { kind: "code"; code: SendCode }
  /** A code that is a code and is broken — a truncated paste, a mangled link. */
  | { kind: "broken"; reason: string };

/** What reading a link needs from the page it is being read on. */
export interface ReceiveLinkSeams {
  /** The URL the app started on. */
  href: string;
  /**
   * Rewrites the address bar without a navigation or a history entry — the
   * app's `history.replaceState`.
   */
  clean: (url: string) => void;
}

/**
 * Takes the code off the URL: reads it and cleans it, or answers that there was
 * nothing there.
 *
 * "Takes" rather than "reads", because the reading and the cleaning are one
 * act and neither is available without the other. A caller that could read
 * without cleaning would be a caller that could make a reload into a retry.
 *
 * **A URL with no code on it is left exactly as it was.** Cleaning it would
 * throw away a fragment that belongs to something else, and this module has no
 * standing to decide that nobody else may ever use one.
 *
 * **A broken code is cleaned like a good one.** It was read, and §8's rule is
 * about the reading rather than about the outcome.
 *
 * **A `clean` that throws is allowed out.** It is the one thing here that must
 * not be swallowed: a `replaceState` the browser refused leaves the whole
 * secret sitting in the address bar, and carrying on would hand the surface a
 * code that a reload could spend a second time. The caller's `try` turns that
 * into an ordinary boot, which is the safe reading of it.
 */
export function takeReceiveLink({
  href,
  clean,
}: ReceiveLinkSeams): ReceiveLink {
  let read: ReceiveLink;
  try {
    const code = readSendCode(href);
    if (code === null) return { kind: "none" };
    read = { kind: "code", code };
  } catch (broken) {
    // Every refusal `readSendCode` raises is a `SendCodeError` about the shape
    // of the code, and there is nothing else here that can throw. It is caught
    // by class rather than by name because a boot path that re-raises reaches
    // ADR-0069's guard, and "the fragment was malformed" is not "this shell
    // cannot start".
    read = {
      kind: "broken",
      reason: broken instanceof Error ? broken.message : String(broken),
    };
  }
  clean(cleanUrl(href));
  return read;
}

/** The same address with the fragment gone: the path and whatever it queried. */
function cleanUrl(href: string): string {
  const url = new URL(href);
  return `${url.pathname}${url.search}`;
}
