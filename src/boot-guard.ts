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
  // shell out of the precache. The runtime image cache goes too, which is a
  // cheap price for a shell that will not start.
  dropServiceWorker: async () => {
    try {
      const registrations =
        (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(registrations.map((r) => r.unregister()));
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
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
