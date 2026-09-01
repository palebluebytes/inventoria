import { installBootGuard } from "./lib/boot-recovery";

// The one place the boot guard meets a real browser. It runs as a side effect
// of being imported, and `main.ts` imports it FIRST — before `./App.svelte` —
// because that is the only way to be listening when the shell dies where it
// actually dies: during module evaluation of the app graph, not inside
// `mount()`. A `try`/`catch` around `mount()` would never have seen #125.

/** Survives the guard's own reload, and only that reload — which is the point. */
const RECOVERED_KEY = "inventoria:boot-recovered";

const { markMounted } = installBootGuard({
  onShellError: (handler) => {
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", handler);
  },

  schedule: (ms, run) => {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  },

  // No session storage means no way to remember that we already tried, and a
  // recovery that cannot remember is a reload loop. So it reports "already
  // recovered" and the guard falls through to saying so on the page instead.
  hasRecovered: () => {
    try {
      return sessionStorage.getItem(RECOVERED_KEY) !== null;
    } catch {
      return true;
    }
  },

  markRecovered: () => {
    try {
      sessionStorage.setItem(RECOVERED_KEY, "1");
    } catch {
      // hasRecovered() already fails closed when storage is unavailable.
    }
  },

  // Both halves matter: unregistering stops the old worker answering fetches,
  // and deleting the caches stops the next load being served the same broken
  // shell out of the precache.
  //
  // **The registration serving this page, and only that one** (#306). There is
  // a service worker per Facet scope now (ADR-0077 §1), so on a device with both
  // installed, `getRegistrations()` and a bare `caches.keys()` had a failed
  // Rations boot unregister Inventoria and delete its 8.9 MB offline install —
  // the same harm ADR-0077 §1 turns `cleanupOutdatedCaches` off to prevent,
  // arriving by a second route.
  //
  // Which registration that is comes from **asking the browser**, not from
  // reading the URL: the argument-less `getRegistration()` resolves by longest
  // scope prefix against this document, the same rule that decided which worker
  // is serving the page. Nothing here works out which Facet it is, which matters
  // because this module is imported before any entry names one (ADR-0076 §6).
  //
  // On a device with Inventoria and not Rations, a failed `/food/` boot still
  // drops the root's registration — and that is right rather than a hole in the
  // narrowing, because with no Rations registration the root's is the only thing
  // that could be serving the broken shell.
  dropServiceWorker: async () => {
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (!registration) return;
      await registration.unregister();
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        // `endsWith` rather than `includes`, which is the bug workbox's own
        // `deleteOutdatedCaches` has: the root's scope is a *substring* of a
        // nested Facet's cache name, so a containment test run from the root
        // takes the child's precache with it. A cache name ends with the scope
        // it belongs to and with no other. The shared `external-image-cache`
        // matches neither and stays, which costs nothing — a CacheFirst cache
        // re-fetches on miss, and no image ever stopped a shell mounting.
        await Promise.all(
          keys
            .filter((key) => key.endsWith(registration.scope))
            .map((key) => caches.delete(key))
        );
      }
    } catch {
      // The reload is worth attempting whatever happened here.
    }
  },

  reload: () => location.reload(),

  showDeadEnd: () => {
    const target = document.getElementById("app");
    if (!target) return;
    target.textContent =
      "Inventoria could not start, and clearing its offline copy did not " +
      "help. Reload with Ctrl+Shift+R, or clear this site's data, and if it " +
      "still fails the problem is in the app rather than in what your " +
      "browser stored.";
    target.style.padding = "2rem";
    target.style.fontFamily = "system-ui, sans-serif";
    target.style.lineHeight = "1.5";
  },
});

export { markMounted };
