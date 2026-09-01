/**
 * Which copy of the app this is, on the one platform where the answer changes
 * what a receive link is allowed to do (ADR-0082 §6, ADR-0074 §11).
 *
 * Two separate facts, from two different signals, and **handing the code over
 * requires both**:
 *
 *   1. **Is this WebKit on iOS?** A sniff, and a sniff deliberately — said here
 *      so nobody later replaces it with a feature test that does not exist.
 *   2. **Am I the installed copy?** `navigator.standalone`, and nothing else.
 *
 * **Both fail closed in the same direction**, which is why this is one rule
 * stated about two facts rather than two rules. An unknown WebKit build hands
 * the code over rather than accepting a meal into a jar that is not the app's;
 * anything falsy, absent or thrown on the second reads as *not installed*. The
 * cost of a false positive is a Mac with a touch screen being told to open an
 * app it is already in, which is loud and recoverable. The cost of a false
 * negative is the silent wrong-jar write the whole of ADR-0082 exists to
 * prevent.
 *
 * **`display-mode` is refused and must not be added** (ADR-0082 §6). WebKit has
 * supported the media feature since 2017, but it evaluates it against the
 * declared manifest applied to the frame rather than against the presentation:
 * `m_applicationManifest` is set once from `PageConfiguration` and never
 * updated by parsing `<link rel="manifest">`, and Safari 17 ships installs for
 * sites carrying no manifest at all, which report `browser`. Requiring both
 * signals to agree would let the **installed** app read itself as not installed
 * and hand the code to itself, forever. A second signal that can only turn a
 * correct accept into a loop is not corroboration.
 *
 * **There is no third test and there will not be one.** Nothing exposes whether
 * an install *exists*, and that is WebKit's position rather than a gap — a site
 * in a browser knowing a web app is installed would break Safari's privacy
 * model. ADR-0082 §5 is built on exactly that asymmetry, so nothing here waits
 * for it.
 *
 * **Nothing on the send path reads any of this** (ADR-0082 §3): sending is
 * platform-neutral, and its way out is present on iOS exactly as it is
 * everywhere else.
 */

/**
 * The three properties the two tests read.
 *
 * A real `Navigator` satisfies it. `standalone` is optional because it is a
 * WebKit extension the DOM lib does not declare, and `platform` and
 * `maxTouchPoints` are optional because a stub in a test is entitled to leave
 * out the ones its case is not about.
 */
export interface PlatformSignals {
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
}

/**
 * Whether this is WebKit on iOS — ADR-0074 §11's sniff, unchanged.
 *
 * **The trap is the iPad.** Since iPadOS 13 it requests the desktop site by
 * default and reports `MacIntel`, indistinguishable from a Mac by user agent
 * alone, so the touch-point count is the only thing that separates them. Every
 * browser on iOS is WebKit, so Chrome and Firefox on an iPhone are the same
 * case and need no handling of their own.
 *
 * **When it is unsure it answers yes**, and "unsure" is *no readable platform
 * string* rather than a getter that threw. `navigator.platform` is deprecated
 * and a user-agent reduction that dropped it or emptied it would otherwise send
 * every device down the ordinary path — writing the meal into Safari's jar on
 * the one device that cannot keep it, which is the failure §5 prices and the
 * quiet direction ADR-0074 §11 refuses to fail in.
 *
 * The cost of answering yes when it should not have is a page telling somebody
 * to open an app they may already be in, and the code it shows still pastes
 * into Scan on every platform. That is loud and it is recoverable, which is why
 * it is the side to be wrong on.
 */
export function isWebKitOnIos(signals: PlatformSignals): boolean {
  try {
    const platform = signals.platform;
    if (typeof platform !== "string" || platform === "") return true;
    if (/iPhone|iPod/.test(platform)) return true;
    return platform === "MacIntel" && (signals.maxTouchPoints ?? 0) > 1;
  } catch {
    return true;
  }
}

/**
 * Whether this page **is** the copy that was added to the Home Screen.
 *
 * `Navigator::standalone()` returns `frame->settings().standalone()`, and the
 * `Standalone` preference is embedder-set with a default of `false` across
 * WebKitLegacy, WebKit and WebCore — so a Safari tab reports `false` rather than
 * `undefined`, and the property exists on every Cocoa port rather than iOS
 * alone. That is why {@link isWebKitOnIos} is still needed and cannot be
 * replaced by the presence of this property.
 *
 * **`=== true`, and nothing else.** Anything falsy, absent or thrown reads as
 * not installed, which is the direction that hands the code over.
 */
export function isTheInstalledCopy(signals: PlatformSignals): boolean {
  try {
    return signals.standalone === true;
  } catch {
    return false;
  }
}

/**
 * Whether a receive link landing here must be handed over rather than opened:
 * an iOS Safari tab, which cannot write to the installed app's jar and so does
 * not try (ADR-0082 §2).
 */
export function isIosSafariTab(signals: PlatformSignals): boolean {
  return isWebKitOnIos(signals) && !isTheInstalledCopy(signals);
}
