import { mount } from "svelte";
// Before app.css, so the @font-face rules are registered before the rules that
// reference the family. Ships the upright variable subsets; see app.css.
import "@fontsource-variable/epilogue";
import "./app.css";
import App from "./App.svelte";

// Multi-threaded SQLite WASM (OPFS) needs SharedArrayBuffer, which requires
// cross-origin isolation via COOP+COEP headers. Vite sets these in dev/preview;
// in production they come from public/_headers. Surface a clear warning if the
// deployed host failed to apply them so the degraded state isn't silent.
if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
  console.warn(
    "[Inventoria] Not cross-origin isolated: COOP/COEP headers are missing, " +
      "so SharedArrayBuffer is unavailable and SQLite/OPFS may run degraded. " +
      "Verify the production host serves the headers in public/_headers."
  );
}

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
