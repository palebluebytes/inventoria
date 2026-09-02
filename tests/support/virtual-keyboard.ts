/**
 * A fake `visualViewport`, so a software keyboard can be raised in CI
 * (ADR-0089 §9).
 *
 * **Playwright cannot raise a software keyboard, in Chromium or in WebKit.**
 * Mobile emulation is a viewport size, a user-agent string and touch flags
 * inside a desktop engine; there is no OSK to raise. Nor can any CDP command in
 * the repo's pinned Chrome 147 reproduce the phenomenon — measured, per
 * mechanism:
 *
 * | Mechanism                                       | `visualViewport.height` | `innerHeight` |
 * | ----------------------------------------------- | ----------------------- | ------------- |
 * | `page.setViewportSize`                          | shrinks                 | shrinks       |
 * | `Emulation.setDeviceMetricsOverride`            | shrinks                 | shrinks       |
 * | `setDeviceMetricsOverride` + `viewport` clip    | unchanged               | unchanged     |
 * | `Emulation.setVisibleSize`                      | unchanged               | unchanged     |
 * | `Emulation.setVirtualKeyboardGeometryOverride`  | absent from Chrome 147  | —             |
 *
 * The clip and `setVisibleSize` are documented as "not observed by the page".
 * Every lever that *is* observed moves the layout viewport along with the visual
 * one — and that divergence is precisely what a real keyboard produces, so none
 * of them can stand in for it.
 *
 * What does reproduce it is replacing the object the app reads. `window.
 * visualViewport` is a configurable accessor, so `Object.defineProperty` shadows
 * it, and an init script installs the shadow before any app code has run.
 * Measured: `visualViewport.height` falling 727 → 377 while `innerHeight` held
 * at 727, driving a real sheet from 618px to 320px through real CSS `calc()`.
 *
 * **The fake subtracts and does nothing else.** Every property delegates to the
 * real visual viewport, and `height` delegates too, minus the keyboard. So with
 * no keyboard raised the page sees exactly what it would have seen — which is
 * what lets a spec assert that dismissing the keyboard restores a surface
 * *exactly*, rather than approximately.
 */
import type { BrowserContext, Page } from "@playwright/test";

declare global {
  interface Window {
    /** Installed by {@link installVirtualKeyboard}; driven by {@link setKeyboard}. */
    __setKeyboard?: (px: number) => void;
  }
}

/**
 * Shadow `window.visualViewport` for every page in this context, present and
 * future.
 *
 * Call it before the `goto` that mounts the app: `startViewportInset` reads
 * `window.visualViewport` once, at startup, and holds the object it was handed.
 * An init script runs before any page script on both creation and navigation,
 * so the app is handed the fake and never learns there was another one.
 */
export async function installVirtualKeyboard(
  context: BrowserContext
): Promise<void> {
  await context.addInitScript(() => {
    const real = window.visualViewport;
    let keyboard = 0;

    // An `EventTarget`, not an object with a listener array: the app registers
    // through `addEventListener` and expects `resize` and `scroll` to behave
    // like events, and inheriting that is cheaper and more faithful than
    // re-implementing it.
    class FakeVisualViewport extends EventTarget {
      get width() {
        return real ? real.width : window.innerWidth;
      }
      /** The band, less whatever the keyboard is covering. */
      get height() {
        return (real ? real.height : window.innerHeight) - keyboard;
      }
      get offsetLeft() {
        return real ? real.offsetLeft : 0;
      }
      get offsetTop() {
        return real ? real.offsetTop : 0;
      }
      get pageLeft() {
        return real ? real.pageLeft : window.scrollX;
      }
      get pageTop() {
        return real ? real.pageTop : window.scrollY;
      }
      get scale() {
        return real ? real.scale : 1;
      }
    }

    const fake = new FakeVisualViewport();

    // A genuine resize of the window must still reach the app, or a spec that
    // resizes and then raises the keyboard would see a stale band.
    real?.addEventListener("resize", () =>
      fake.dispatchEvent(new Event("resize"))
    );
    real?.addEventListener("scroll", () =>
      fake.dispatchEvent(new Event("scroll"))
    );

    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      get: () => fake,
    });

    window.__setKeyboard = (px: number) => {
      keyboard = Math.max(0, px);
      // `resize` and not `scroll`: this models `interactive-widget=resizes-visual`,
      // where the keyboard shrinks the band. The browser's *separate* habit of
      // scrolling the visual viewport to reveal a focused field moves `offsetTop`
      // instead, and is not what this handle claims to reproduce.
      fake.dispatchEvent(new Event("resize"));
    };
  });
}

/**
 * Raise a keyboard `px` tall along the bottom of the layout viewport, or lower
 * it with `0`.
 *
 * Resolves once the app has republished the band: the app's listener is
 * synchronous, so it has already run inside the `dispatchEvent` this awaits.
 */
export async function setKeyboard(page: Page, px: number): Promise<void> {
  await page.evaluate((height) => {
    const set = window.__setKeyboard;
    if (!set) {
      throw new Error(
        "No fake visualViewport on this page — call installVirtualKeyboard(context) before goto()."
      );
    }
    set(height);
  }, px);
}
