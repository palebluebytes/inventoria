// FIRST, and deliberately: importing this installs the boot guard, so it is
// listening before the App graph below evaluates. A shell that cannot start
// otherwise has no way to replace itself — see src/lib/boot-recovery.ts.
import { markMounted } from "./boot-guard";
import { mount } from "svelte";
// Before app.css, so the @font-face rules are registered before the rules that
// reference the families. Upright and italic for each: the italic files are
// drawn faces, so the browser stops obliquing the upright ones. Every family the
// app names is bundled here (ADR-0044); nothing falls through to a system face.
import "@fontsource-variable/epilogue";
import "@fontsource-variable/epilogue/wght-italic.css";
import "@fontsource-variable/source-code-pro";
import "@fontsource-variable/source-code-pro/wght-italic.css";
import "@fontsource-variable/source-serif-4";
import "@fontsource-variable/source-serif-4/wght-italic.css";
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

// The shell is up: stand the guard down before its grace period expires.
markMounted();

export default app;
