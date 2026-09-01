import { defineConfig, type Plugin } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
// SSRF guard, redirect re-validation, and the post-fetch response policy (size
// cap, image allowlist, security headers, HTML cleaning) are all shared with the
// Cloudflare worker so the dev proxy and prod proxy cannot drift.
import { checkProxyTarget, guardedFetch } from "./src/lib/ingestion/url-guard";
import {
  securityHeaders,
  HTML_CSP,
  readProxyPayload,
} from "./src/lib/ingestion/proxy-policy";
import { FACETS, facetOf, type Facet } from "./src/lib/facets/registry";
import {
  facetForPath,
  manifestFor,
  manifestUrlOf,
  withOwnManifestLink,
} from "./src/lib/facets/manifest";

const handleProxyRequest = async (req: any, res: any, next: any) => {
  const urlObj = new URL(
    req.url || "",
    `http://${req.headers.host || "localhost"}`
  );
  if (urlObj.pathname === "/api/proxy") {
    const targetUrl = urlObj.searchParams.get("url");
    if (!targetUrl) {
      res.statusCode = 400;
      res.end("Missing url parameter");
      return;
    }

    // SSRF guard: same internal/loopback/scheme checks as the prod worker.
    const guard = checkProxyTarget(targetUrl);
    if (!guard.ok) {
      res.statusCode = 400;
      res.end(`Refused target URL: ${guard.reason}`);
      return;
    }

    try {
      const fetchRes = await guardedFetch(guard.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.5 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: req.headers.accept || "*/*",
          "Accept-Language": req.headers["accept-language"] || "en-US,en;q=0.5",
        },
      });

      if (!fetchRes.ok) {
        res.statusCode = fetchRes.status;
        res.end(`Proxy fetch failed: ${fetchRes.statusText}`);
        return;
      }

      res.setHeader("Access-Control-Allow-Origin", "*");
      for (const [k, v] of Object.entries(securityHeaders)) {
        res.setHeader(k, v);
      }

      const payload = await readProxyPayload(fetchRes);

      if (payload.kind === "error") {
        res.statusCode = payload.status;
        res.end(payload.message);
        return;
      }

      if (payload.kind === "image") {
        res.setHeader("Content-Type", payload.mime);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.statusCode = 200;
        res.end(Buffer.from(payload.body));
        return;
      }

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Security-Policy", HTML_CSP);
      res.statusCode = 200;
      res.end(payload.html);
    } catch (error: any) {
      res.statusCode = 500;
      res.end(`Proxy error: ${error.message || error}`);
    }
    return;
  }
  next();
};

/**
 * Where `pnpm dev:relay` binds its `wrangler dev`.
 *
 * Three files write this port and all three have to agree: the `dev:relay`
 * script in `package.json` binds it, this carries the upgrade to it, and
 * `playwright.config.ts` waits on it. Nothing can import across those three, so
 * the number is repeated rather than shared, and IPv4 is named on both ends
 * because `wrangler dev --ip 127.0.0.1` does not answer on `::1`.
 */
const RELAY_DEV_TARGET = "ws://127.0.0.1:8787";

const localScraperProxyPlugin = () => ({
  name: "local-scraper-proxy",
  configureServer(server: any) {
    server.middlewares.use(handleProxyRequest);
  },
  configurePreviewServer(server: any) {
    server.middlewares.use(handleProxyRequest);
  },
});

// loro-crdt ships four browser-ish entries and only one of them can start
// offline. Measured against a production build, not read off the docs (#125):
//
//   browser  — loads its WASM with a *synchronous* XMLHttpRequest. Chrome
//              dispatches no service worker `fetch` event for a sync XHR, so the
//              request goes straight to the network and precaching cannot serve
//              it. Offline, it throws during module evaluation.
//   bundler  — fails the production build outright: Rolldown cannot load its
//              bare `import * as wasm from "./loro_wasm_bg.wasm"`
//              ([UNLOADABLE_DEPENDENCY]). This is a *build* limitation, not the
//              dev-server one an earlier version of this comment claimed.
//   web      — builds, then ships a broken app. Its default `__wbg_init` must be
//              awaited and nothing awaits it, so the whole loader tree-shakes
//              away; the emitted .wasm ends up referenced only by sw.js.
//   base64   — inlines the WASM bytes into the JS and instantiates them
//              synchronously, so there is no request to intercept and
//              `new LoroDoc()` keeps working without an await. The only entry
//              that both builds and starts offline.
//
// The payload rides in the lazily-imported Notes chunk (see App.svelte), so it
// stays off the critical path and out of the entry chunk.
//
// Unit tests run under Node, so we leave them on the default `node` build by
// skipping the alias when Vitest is driving the config.
const isVitest = !!process.env.VITEST;

const ROOT_FACET = facetOf("root");

/** The root's manifest, built from the roster like every other Facet's. */
const ROOT_MANIFEST = manifestFor(ROOT_FACET);

/** Every Facet the root is not, which is the one asymmetry ADR-0078 §3 turns on. */
const FOREIGN_FACETS = FACETS.filter((f) => f.id !== ROOT_FACET.id);

/**
 * One HTML entry point per Facet, keyed by Facet id and read off the roster
 * rather than listed here (ADR-0076 §6, ADR-0083 §1).
 *
 * The path is **derived from the Facet's scope**, which is what keeps the two
 * from disagreeing: a Facet whose pages are declared to live under `/food/` and
 * whose HTML sat somewhere else would install a scope it cannot serve. Rolldown
 * emits each one at the path implied by its location relative to the project
 * root, so `food/index.html` becomes `dist/food/index.html` with no copy step
 * (measured in docs/research/269-two-installable-apps-one-origin.md §1).
 */
const FACET_ENTRIES = Object.fromEntries(
  FACETS.map((facet) => [
    facet.id,
    `${facet.scope.replace(/^\//, "")}index.html`,
  ])
);

/**
 * The scopes the root's service worker must not answer for.
 *
 * Without this the root's `navigateFallback` serves `index.html` for `/food/` —
 * the precache holds `/food/index.html`, which a bare `/food/` navigation does
 * not match — so an installed root would quietly show Inventoria at Rations'
 * URL. ADR-0077 gives each Facet its own service worker in #306; this is the
 * half of it the root needs the moment a second scope exists.
 */
const FOREIGN_SCOPES = FOREIGN_FACETS.map((f) => new RegExp(`^${f.scope}`));

/**
 * Give every Facet's page its own manifest, and only its own.
 *
 * Three jobs, and they are three because `VitePWA` does none of them —
 * `src/lib/facets/manifest.ts` carries why, which is one measurement rather
 * than four retellings of it:
 *
 *   - **emit** every foreign Facet's manifest into the build, from the registry;
 *   - **serve** it in dev, where there is no build to emit into;
 *   - **link** each page to its own, replacing whatever VitePWA injected.
 *
 * Only foreign Facets are emitted and served: the root's is `VitePWA`'s own
 * file at `/manifest.webmanifest`, built from the same {@link manifestFor} so
 * the two cannot say different things about the same roster.
 */
const facetManifests = (): Plugin => {
  const bodyOf = (facet: Facet) => JSON.stringify(manifestFor(facet), null, 2);

  return {
    name: "facet-manifests",
    // `enforce` *and* `order`, because VitePWA's build plugin carries both and a
    // plugin with only the second still runs before it. Among equally-enforced
    // plugins the array position decides, which is why this sits after VitePWA.
    enforce: "post",
    configureServer(server) {
      const routes = new Map(
        FOREIGN_FACETS.map((f) => [manifestUrlOf(f), bodyOf(f)])
      );
      server.middlewares.use((req, res, next) => {
        const body = routes.get((req.url || "").split("?")[0]);
        if (!body) return next();
        res.setHeader("Content-Type", "application/manifest+json");
        res.end(body);
      });
    },
    generateBundle() {
      for (const facet of FOREIGN_FACETS) {
        // A leading slash would be an absolute path on disk; the emitted name
        // is relative to `dist/`, which is what `/food/` means once served.
        this.emitFile({
          type: "asset",
          fileName: manifestUrlOf(facet).replace(/^\//, ""),
          source: bodyOf(facet),
        });
      }
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // A page no Facet claims gets no manifest, which is not a dead branch:
        // the root's scope is `/` so every entry point is claimed today, and
        // the day a build emits an HTML that is not one — a demo page, an error
        // page — offering it as an installable app would be the defect.
        const facet = facetForPath(ctx.path);
        return facet ? withOwnManifestLink(html, facet) : html;
      },
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    localScraperProxyPlugin(),
    svelte(),
    VitePWA({
      registerType: "prompt",
      // The root's identity comes off the same roster and through the same
      // builder as Rations' (#305), so the two manifests cannot describe the
      // same registry differently. What is added here rather than there is the
      // share target: it is a **hand-off**, and who owns one is ADR-0084 §1's
      // question rather than a fact about what a Facet is called. The root owns
      // this one because what it carries is a URL to a physical item, and
      // Rations' hand-off is a fragment rather than a share target (ADR-0084
      // §5) — so a `shareTarget` field on the roster would have exactly one
      // filled entry and would invite the other Facet to fill it, which the
      // spec forbids anyway: an action outside the manifest's own scope is
      // dropped (docs/research/269-two-installable-apps-one-origin.md §5).
      manifest: {
        ...ROOT_MANIFEST,
        icons: [...ROOT_MANIFEST.icons],
        share_target: {
          action: ROOT_FACET.startUrl,
          method: "GET",
          enctype: "application/x-www-form-urlencoded",
          params: {
            title: "title",
            text: "text",
            url: "url",
          },
        },
      },
      workbox: {
        // Two assets sit far above workbox's 2 MiB default and both must be
        // precached: the Loro CRDT WASM (~3.1 MB), so Notes works offline on
        // first load, and the USDA Nutrient store, so food staging does
        // (ADR-0047 §11). Workbox weighs the raw file, not the ~782 KiB gzip it
        // is served as, and the store measured 4.03 MiB on 2026-08-19 — over the
        // 4 MiB this used to allow, which failed the build outright. The headroom
        // is for a mirror refresh growing it, not for a second asset this size.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Everything the default pattern already caught, plus `woff2`: the
        // default omits fonts, so the self-hosted Epilogue subsets shipped in
        // src/assets/fonts would be fetched over the network on a cold offline
        // load and fall back to a system face. Listing this replaces the
        // default rather than extending it, so the other extensions have to
        // stay named here.
        // …and `json`: the USDA Search index and Nutrient store are committed
        // assets, not code, so the default pattern would silently omit them and
        // leave a cold offline install with no food data at all. An app whose
        // case rests on keyless offline search must not need a network for its
        // first search (ADR-0047 §11).
        // …and `txt`: two of the assets above carry a licence that asks its
        // notice to travel with every copy of the work — CC BY 3.0 clause 4(a)
        // for the Rations icon, OFL 1.1 clause 2 for Epilogue. An offline
        // install *is* a copy, so precaching `/food/icons/rations-*.png` and
        // the font subsets while leaving `CREDITS.txt` and `OFL.txt` on the
        // network would distribute the works without their notices. 8 KiB.
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico,wasm,webmanifest,woff2,json,txt}",
        ],
        // Fontsource ships every subset it has, and the browser only fetches
        // the ones a rendered character needs. Precaching is the exception:
        // it pulls everything up front, so this app would install ~190KB of
        // Cyrillic, Greek and Vietnamese it never draws. They stay in the
        // bundle and stay fetchable; they just do not ride along on the offline
        // install. Vietnamese joined the list on 2026-08-28 — it belonged here
        // from the start and was simply missed, measured at 66KB across six
        // files in the precache manifest.
        globIgnores: [
          "**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2",
        ],
        navigateFallbackDenylist: FOREIGN_SCOPES,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "external-image-cache",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
    // After VitePWA, so its injected manifest link is there to replace.
    facetManifests(),
  ],
  server: {
    // The relay is **proxied to a real `wrangler dev`, never re-implemented
    // here** (#298). The middleware above stands in for the Worker's
    // `/api/proxy` by importing that route's own guards, which works because a
    // scrape is a pure function of a URL. A room is not: it is a Durable Object
    // holding two sockets, counting frames and burning itself after two, and a
    // second implementation of it would be the thing a test then proved rather
    // than the one that ships.
    //
    // Same origin is a requirement and not a convenience. `openRelaySocket`
    // builds its URL from `location.href` (ADR-0072 §9: app, link and socket
    // are one origin, so there is no allowlist to write, maintain and get
    // wrong), so the socket has to leave from the port the app is served on —
    // pointing a test straight at :8787 would be testing a different app.
    //
    // **`pnpm dev` still starts one process.** ADR-0070 keeps the middleware
    // above on the ground that a dev server should not require a second one,
    // and that is untouched: the relay's process is started by whoever wants a
    // relay (`pnpm dev:relay`, which `playwright.config.ts` runs for the
    // suite). Without one, this entry refuses the upgrade, which is the same
    // absent relay a send behind `pnpm dev` has always met.
    proxy: {
      "/api/relay": { target: RELAY_DEV_TARGET, ws: true },
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    watch: {
      // Exclude the Nix flake inputs directory — it contains the entire
      // Nixpkgs tree and quickly exhausts the inotify watch limit.
      ignored: ["**/.direnv/**"],
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    // `rolldownOptions` rather than `rollupOptions`: Vite 8 still accepts the
    // latter but its own types mark it `@deprecated Use rolldownOptions
    // instead` and type it as `RolldownOptions` anyway.
    rolldownOptions: { input: FACET_ENTRIES },
  },
  resolve: {
    alias: isVitest ? {} : { "loro-crdt": "loro-crdt/base64" },
  },
  optimizeDeps: {
    // SQLite is WASM-backed and self-loads its binary from a URL; let Vite serve
    // it as-is instead of pre-bundling, which would mangle that URL resolution.
    // loro-crdt needs no such protection on the `base64` entry — its bytes are
    // inlined, so there is no WASM URL to mangle.
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  // @ts-ignore
  test: {
    // Vitest owns the unit tests; Playwright owns the rest of tests/ (see
    // playwright.config.ts `testIgnore: ["**/unit/**"]`). Scoping include to
    // tests/unit keeps the two runners disjoint — otherwise Vitest's default
    // glob also collects the Playwright `*.spec.ts` files (which throw under
    // Vitest) and stray `*.test.js` under nested `worker/node_modules`.
    include: ["tests/unit/**/*.test.ts"],
  },
});
