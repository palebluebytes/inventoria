/**
 * Registering a Facet's own service worker, at a scope handed in rather than
 * compiled in (ADR-0077 §1).
 *
 * **Why this is hand-rolled.** `vite-plugin-pwa` offers `virtual:pwa-register`,
 * and it is unusable here for a structural reason rather than a bug: with two
 * plugin instances, `MainPlugin.resolveId` filters on the same prefix in both
 * and the first non-null wins, so the virtual module resolves to instance #1
 * only — carrying a **hard-coded** `new Workbox("/sw.js", { scope: "/" })`. It
 * is imported by `ReloadPrompt`, which is reachable from both entries and
 * therefore lands in the chunk they share, so one module instance would have
 * `/food/` registering the root's service worker
 * (`docs/research/269-two-installable-apps-one-origin.md` §4, measured). A Facet
 * running on another Facet's precache, updating on its prompt and wiping with
 * its cache is exactly the scope hygiene ADR-0077 §1 pays for.
 *
 * `workbox-window` is what that virtual module wraps and is already a direct
 * dependency, so taking the scope as a parameter costs a small module rather
 * than a new dependency.
 */
import type { Workbox } from "workbox-window";
import type { Facet } from "./registry";

/** The handle a caller keeps: whether an update is waiting, and how to take it. */
export interface FacetRegistration {
  /** Apply the waiting service worker and reload onto it. */
  update: () => void;
}

/**
 * Register this Facet's service worker and call back when a newer one is
 * waiting.
 *
 * `registerType` stays `prompt` and neither built service worker claims clients,
 * so each registration prompts its own clients independently: a user with both
 * Facets installed is asked twice for one deploy (ADR-0077 §8). That is
 * accepted — a single prompt updating both would claim an authority the
 * registration model does not grant.
 *
 * Everything here is deferred behind a dynamic import and a support check, for
 * the same reason the whole app is: nothing about a page's first paint may
 * depend on a service worker existing.
 */
export function registerFacetServiceWorker(
  facet: Facet,
  onWaiting: () => void
): FacetRegistration {
  // Its own script, inside its own scope. Both are derived from the one field
  // on the roster, so a Facet cannot register a worker for somebody else's
  // pages: a service worker may only claim a scope its script sits inside.
  const url = `${facet.scope}sw.js`;

  /** Assigned once `register()` has been called, and never reassigned. */
  let workbox: Workbox | null = null;

  const start = async () => {
    // No service worker in dev — nothing is built to register — and none where
    // the browser has none to offer. Both are silence rather than a warning:
    // the app works either way, it just is not installable.
    if (import.meta.env.DEV) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const { Workbox } = await import("workbox-window");
    const wb = new Workbox(url, { scope: facet.scope });

    wb.addEventListener("waiting", () => onWaiting());
    workbox = wb;
    await wb.register();
  };

  // A registration that cannot happen is not a failure the user can act on, and
  // it must never reject into the page: this runs during a component's setup,
  // and an unhandled throw here would take the shell down with it.
  void start().catch((error) => {
    console.warn(`[${facet.name}] service worker registration failed`, error);
  });

  return {
    update: () => {
      // A documented precondition rather than an optional call: the button that
      // reaches this appears only after `onWaiting`, and no service worker event
      // can fire before the assignment above, which is synchronous with
      // `register()`. If this ever throws, the prompt is being shown by
      // something that did not wait for one.
      if (!workbox) {
        throw new Error(
          `${facet.name} was asked to update before its service worker was registered`
        );
      }
      // The reload is bound before the message, not after: `controlling` fires
      // as soon as the new worker takes over, and a listener added afterwards
      // would miss it and leave the page on the old build with the prompt gone.
      workbox.addEventListener("controlling", () => window.location.reload());
      void workbox.messageSkipWaiting();
    },
  };
}
