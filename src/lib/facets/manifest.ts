// A Facet's web app manifest, and the one `<link>` that points a page at it.
//
// **Hand-written rather than plugin-generated**, and the reason is measured
// rather than preferential. `VitePWA` is one plugin instance per manifest, and
// four of its parts are entry-blind (docs/research/269-two-installable-apps-one-
// origin.md §4). The one that decides it: `transformIndexHtml` has no notion of
// *which* HTML it is looking at, so a second instance puts both links into both
// pages — and the HTML spec reads only the **first** `rel="manifest"` in tree
// order (§4.6.8.11). `/food/` would then advertise an installable Inventoria
// whose `start_url` is `/`: an unlabelled door out of Rations into the other
// Facet, which ADR-0078 §4 routes through a labelled `target="_blank"` in the
// other direction and refuses in this one.
//
// So the *file* is built here, from the registry, and `vite.config.ts` emits it.
// Nothing in this module is Vite-aware, which is what lets the whole of it be
// checked by a unit test rather than by opening a browser at install time.
import { FACETS, type Facet, type ManifestIcon } from "./registry";

/**
 * The members of a manifest this app declares, spelled the way the spec spells
 * them. `start_url` and `short_name` are snake_case because they are a
 * browser's field names and not this app's — CODING_STANDARDS §1.3 reserves
 * snake_case for the ledger, and a manifest is not the ledger; the rename from
 * the registry's `startUrl` happens here and nowhere else (ADR-0076 §6).
 */
export interface WebAppManifest {
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly id: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: "standalone";
  readonly lang: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly ManifestIcon[];
}

/**
 * What a Facet installs as.
 *
 * Every member is read off the roster, so the two manifests cannot drift from
 * the Facet they describe or from each other. The two that are not: `display`,
 * because installability is what a Facet *is* (ADR-0076 §1) and a Facet that
 * opened in a browser tab would be a bookmark; and `lang`, because the app has
 * one and both entry documents declare it.
 */
export function manifestFor(facet: Facet): WebAppManifest {
  return {
    name: facet.name,
    // The same word. A `short_name` exists for a home screen that has to
    // truncate, and neither of these two is long enough to need one — a
    // separate abbreviation would be a second name to keep true.
    short_name: facet.name,
    description: facet.description,
    // Pinned rather than defaulted. The spec derives `id` from `start_url` and
    // says a UA SHOULD treat a manifest whose identity does not match an
    // installed app as a **distinct application**; writing it down is what
    // stops a future `start_url` move from renaming somebody's installed app
    // into a new one (docs/research/269-two-installable-apps-one-origin.md §2).
    id: facet.startUrl,
    start_url: facet.startUrl,
    scope: facet.scope,
    display: "standalone",
    lang: "en",
    theme_color: facet.themeColor,
    background_color: facet.backgroundColor,
    icons: facet.icons,
  };
}

/** Where a Facet's manifest is served from: inside its own scope, always. */
export function manifestUrlOf(facet: Facet): string {
  return `${facet.scope}manifest.webmanifest`;
}

/**
 * The Facet a built page belongs to, by **longest matching scope**.
 *
 * The same rule a service worker's registration follows, and for the same
 * reason: `/food/index.html` is inside `/food/` and inside `/`, and only one of
 * those is the page's own. Returns `undefined` for a path no Facet claims,
 * which the root's `/` scope makes unreachable today and will not the day a
 * build emits something that is not a Facet's entry.
 */
export function facetForPath(path: string): Facet | undefined {
  return [...FACETS]
    .sort((a, b) => b.scope.length - a.scope.length)
    .find((facet) => path.startsWith(facet.scope));
}

/**
 * Leave a page carrying exactly one manifest link: its own Facet's.
 *
 * A **replace**, not an append, because `VitePWA` has already injected the
 * root's into every entry by the time this runs, and not a rewrite of that one
 * either, because in dev there may be nothing to rewrite. Strip whatever is
 * there, then write the one that belongs — which makes the result the same
 * whichever way the page arrived.
 */
export function withOwnManifestLink(html: string, facet: Facet): string {
  const link = `<link rel="manifest" href="${manifestUrlOf(facet)}">`;
  return html
    .replace(/\s*<link[^>]+rel="manifest"[^>]*>/g, "")
    .replace("</head>", `${link}</head>`);
}
