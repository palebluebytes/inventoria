// What an entry point is, minus which Facet it is.
//
// There is one entry point per Facet and there will be one per Facet added
// (ADR-0076 §6), so everything a Facet's page needs before its shell appears is
// here rather than copied into each entry: the boot guard, the bundled faces,
// the stylesheet and the cross-origin-isolation warning. The map's decision 5
// requires a second Facet to be an application of the mechanism rather than a
// re-derivation of it, and thirty-five lines of duplicated preamble is the
// re-derivation.
//
// FIRST, and deliberately: importing this installs the boot guard, so it is
// listening before an entry's component graph evaluates. A shell that cannot
// start otherwise has no way to replace itself — see src/lib/boot-recovery.ts.
// Each entry keeps that ordering by importing this module above its own shell.
import { markMounted } from "./boot-guard";
import { mount, type Component } from "svelte";
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
import type { Facet } from "./lib/facets/registry";

/**
 * Mount a Facet's shell into the page its entry point was served as.
 *
 * The Facet is a **parameter**, and that is the whole of ADR-0076 §6's rule:
 * each entry module names its own as a literal, and nothing anywhere works it
 * out from `location.pathname`. A path check would leave every Facet's screens
 * reachable from every entry, so the bundler would keep all of them and ship
 * each Facet's code in both builds — 4.23 MB of it `NotesView` alone (#272).
 *
 * Every shell takes the Facet it is, so its screen can read its own name rather
 * than repeat it.
 */
export function mountFacet(facet: Facet, shell: Component<{ facet: Facet }>) {
  // Multi-threaded SQLite WASM (OPFS) needs SharedArrayBuffer, which requires
  // cross-origin isolation via COOP+COEP headers. Vite sets these in
  // dev/preview; in production they come from public/_headers, whose `/*`
  // pattern reaches a scope only while it is served as a static asset rather
  // than by the Worker script (#312). Surface a clear warning if the deployed
  // host failed to apply them so the degraded state isn't silent.
  if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
    console.warn(
      `[${facet.name}] Not cross-origin isolated: COOP/COEP headers are ` +
        "missing, so SharedArrayBuffer is unavailable and SQLite/OPFS may run " +
        "degraded. Verify the production host serves the headers in " +
        "public/_headers, and that this scope is served as a static asset."
    );
  }

  // This is the only `getElementById("app")` a healthy boot evaluates — the
  // boot guard's other one runs only when the shell has already failed — which
  // is what makes the lookup a precise marker for "evaluation got as far as
  // mounting". See scripts/offline-boot-check.mjs.
  const app = mount(shell, {
    target: document.getElementById("app")!,
    props: { facet },
  });

  // The shell is up: stand the guard down before its grace period expires.
  markMounted();

  return app;
}
