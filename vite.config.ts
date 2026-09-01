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
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import {
  FACETS,
  facetOf,
  nestedFacetsOf,
  type Facet,
} from "./src/lib/facets/registry";
import {
  facetForPath,
  manifestFor,
  manifestUrlOf,
  withOwnManifestLink,
} from "./src/lib/facets/manifest";
import {
  bundleFor,
  precacheUrlsFor,
  FACET_BUNDLE_METADATA_PATH,
  type BundleChunk,
  type FacetBundle,
  type FacetPrecache,
} from "./src/lib/facets/precache";

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
 * The scopes a Facet's service worker must not answer for: every other Facet's
 * that sits inside its own.
 *
 * Without this the root's `navigateFallback` serves `index.html` for `/food/` —
 * the precache holds `/food/index.html`, which a bare `/food/` navigation does
 * not match — so an installed root would quietly show Inventoria at Rations'
 * URL, and on a device that already had Inventoria the Rations page could never
 * boot at all (ADR-0077 §1).
 *
 * Read off the roster rather than written down, so the list is empty for a Facet
 * nothing nests inside — Rations has no denylist because nothing is below
 * `/food/` — and a third Facet costs no edit here (ADR-0083 §1).
 */
const nestedScopesOf = (facet: Facet) =>
  nestedFacetsOf(facet.id).map((f) => new RegExp(`^${f.scope}`));

/**
 * Per-Facet build metadata, filled in as the build runs and written out at the
 * end of it (ADR-0083 §6).
 *
 * Module scope rather than a parameter, because the two halves are produced by
 * different plugins at different moments: {@link facetBundles} walks the graph
 * in `generateBundle`, before anything is on disk, and each Facet's precache is
 * only known once `VitePWA`'s `closeBundle` has globbed the written build. One
 * artifact holding both is what stops "reachable" meaning three things
 * (ADR-0083 §6).
 */
const FACET_BUNDLES = new Map<string, FacetBundle>();
const FACET_PRECACHES = new Map<string, FacetPrecache>();

/** A source module id as the artifact records it: project-relative, no `?…`. */
const sourceIdOf = (id: string, root: string) => {
  const path = id.split("?")[0].split(sep).join("/");
  const inside = relative(root, path).split(sep).join("/");
  return inside.startsWith("..") ? path : inside;
};

const byteLengthOf = (source: string | Uint8Array) =>
  typeof source === "string" ? Buffer.byteLength(source) : source.byteLength;

/**
 * Walk each Facet's entry out of the bundle, and record what it reaches.
 *
 * This is ADR-0077 §2's derivation and ADR-0083 §6's artifact, which are one
 * thing: the precache manifests below read {@link FACET_BUNDLES} directly, and
 * the file written here is the same data for the build-time gates #309 adds.
 * Three readers computing "reachable" separately would drift, and the whole
 * point of a band is that it and the containment check are two readings of one
 * number.
 */
const facetBundles = (): Plugin => {
  let root = process.cwd();

  return {
    name: "facet-bundles",
    enforce: "post",
    // Build only. Vitest starts a Vite server and closes it, which fires
    // `closeBundle` with nothing having been bundled — and this plugin would
    // then overwrite a good artifact with an empty one, quietly, between a build
    // and the gates that read it.
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle(_options, bundle) {
      const chunks: BundleChunk[] = [];
      const assetBytes = new Map<string, number>();

      for (const [file, output] of Object.entries(bundle)) {
        if (output.type !== "chunk") {
          assetBytes.set(file, byteLengthOf(output.source));
          continue;
        }
        chunks.push({
          file,
          // The facade of an HTML input is the HTML file itself, which is what
          // lets a Facet be matched to its chunk by a fact rather than by a
          // hashed name (see `entryChunkOf`).
          entryModule: output.facadeModuleId
            ? sourceIdOf(output.facadeModuleId, root)
            : null,
          imports: output.imports,
          dynamicImports: output.dynamicImports,
          css: [...(output.viteMetadata?.importedCss ?? [])],
          modules: [
            ...new Set(
              Object.keys(output.modules).map((id) => sourceIdOf(id, root))
            ),
          ],
          bytes: Buffer.byteLength(output.code),
        });
      }

      FACET_BUNDLES.clear();
      FACET_PRECACHES.clear();
      for (const facet of FACETS) {
        FACET_BUNDLES.set(
          facet.id,
          bundleFor(
            facet,
            FACET_ENTRIES[facet.id],
            chunks,
            (file) => assetBytes.get(file) ?? 0
          )
        );
      }
    },
    closeBundle: {
      // After both `VitePWA` instances, whose own `closeBundle` is sequential
      // and unordered, so array position plus `post` puts this last. Written
      // here rather than in `generateBundle` because half of what it records —
      // what each service worker actually precached — does not exist until they
      // have been generated.
      sequential: true,
      order: "post",
      handler() {
        const path = resolve(root, FACET_BUNDLE_METADATA_PATH);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(
          path,
          `${JSON.stringify(
            {
              facets: FACETS.map((f) => FACET_BUNDLES.get(f.id)).filter(
                Boolean
              ),
              precaches: FACETS.map((f) => FACET_PRECACHES.get(f.id)).filter(
                Boolean
              ),
            },
            null,
            2
          )}\n`
        );
      },
    },
  };
};

/** One row of the manifest workbox hands a transform: `ManifestEntry` plus its size. */
interface PrecacheCandidate {
  url: string;
  revision: string | null;
  integrity?: string;
  size: number;
}

/**
 * Keep only what this Facet precaches, and record what that came to.
 *
 * Workbox globs the whole build for every instance — `globDirectory` defaults to
 * the one output directory and nothing narrows it per entry — so the glob is
 * widened until it makes no decision at all, every emitted file a candidate, and
 * this makes the whole of it. Which is the shape ADR-0077 §2 asks for: an
 * allowlist derived from the entry, never a `globIgnores` denylist that rots on
 * every new view. §2 named explicit manifest entries as the mechanism; the set
 * is the same one and the glob decides none of it, and what a glob still buys is
 * workbox computing every revision.
 *
 * **Absolute URLs.** Workbox resolves a precache URL against the service
 * worker's own location, so `assets/root.js` in `/food/sw.js` would ask for
 * `/food/assets/root.js` and every shared byte would 404 on a cold install. A
 * leading slash is what makes a precache manifest independent of where its
 * service worker sits.
 */
const facetPrecache = (facet: Facet) => (entries: PrecacheCandidate[]) => {
  const bundle = FACET_BUNDLES.get(facet.id);
  if (!bundle) {
    throw new Error(
      `the ${facet.name} Facet has no bundle metadata — facet-bundles did not run`
    );
  }

  const keep = precacheUrlsFor(
    facet,
    bundle,
    entries.map((entry) => entry.url)
  );
  const kept = entries.filter((entry) => keep.has(entry.url));

  // Recorded under the emitted file name rather than the URL, so this half of
  // the artifact and the reachability half above name the same file the same
  // way.
  //
  // One entry short of the count workbox prints for the root: the plugin
  // appends its own `manifest.webmanifest` record *after* every transform, so
  // that file is listed twice with one revision. Harmless — the two resolve to
  // one cache key and the precache controller stores it once — but it is why a
  // gate reading this artifact and a human reading the build log see 31 and 32.
  FACET_PRECACHES.set(facet.id, {
    facet: facet.id,
    urls: kept.map((entry) => ({ file: entry.url, bytes: entry.size })),
    count: kept.length,
    bytes: kept.reduce((sum, entry) => sum + entry.size, 0),
  });

  return {
    manifest: kept.map((entry) => ({ ...entry, url: `/${entry.url}` })),
    warnings: [] as string[],
  };
};

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

/**
 * One service worker per Facet scope (ADR-0077 §1).
 *
 * Service worker registration matches on the **longest scope prefix**, per
 * client, so `/food/` resolves to Rations' registration and `/` to the root's,
 * unambiguously; `Clients.claim()` re-runs the same match, so the two can never
 * fight over a page. That is what buys the split its point: Rations installs its
 * own weight rather than the whole app's.
 *
 * The cost is that installing both Facets stores every shared byte twice — the
 * precache `Cache` is named `workbox-precache-v2-<registration.scope>` and no
 * option changes the suffix. Accepted rather than mitigated (ADR-0077 §1):
 * whoever installs Rations installs nothing else, and whoever wants everything
 * installs Inventoria and gets food inside it.
 *
 * Four things are this app's rather than the plugin's, and each is measured in
 * `docs/research/269-two-installable-apps-one-origin.md` §4: the foreign
 * manifests and their `<link>` (`facetManifests` above), a scope-parameterised
 * registration (`src/lib/facets/service-worker.ts`), the two options below that
 * only the root sets, and the precache manifests. Everything else — the second
 * service worker, the nested output directory, the second `navigateFallback` —
 * the plugin does.
 */
const facetPwa = (facet: Facet) => {
  const isRoot = facet.id === ROOT_FACET.id;
  /** Its scope with no leading slash, which is how a build path is spelled. */
  const inScope = facet.scope.replace(/^\//, "");

  return VitePWA({
    registerType: "prompt",
    // `resolveSwPaths` turns a filename carrying a directory into
    // `dist/food/sw.js` and workbox creates the directory. The script has to sit
    // inside the scope it claims, so this is derived from the scope rather than
    // written down beside it.
    filename: `${inScope}sw.js`,
    scope: facet.scope,
    // **No `registerSW.js`, in either page.** Registration is hand-rolled and
    // scope-parameterised — `src/lib/facets/service-worker.ts` carries the
    // measurement — and this is what stops the plugin injecting a script that
    // would register the wrong Facet's worker beside it.
    injectRegister: false,
    // The manifest's icons ride in on the roster's `precache` declaration like
    // every other static asset, rather than being appended to the manifest
    // afterwards where no allowlist can see them (ADR-0077 §3).
    includeManifestIcons: false,
    // Only the root's is the plugin's to write. Every other Facet's is emitted
    // by `facetManifests` above, from the same builder, because
    // `transformIndexHtml` is entry-blind and a second instance would put both
    // links into both pages.
    manifest: isRoot
      ? {
          // The root's identity comes off the same roster and through the same
          // builder as Rations' (#305), so the two manifests cannot describe the
          // same registry differently. What is added here rather than there is
          // the share target: it is a **hand-off**, and who owns one is ADR-0084
          // §1's question rather than a fact about what a Facet is called. The
          // root owns this one because what it carries is a URL to a physical
          // item, and Rations' hand-off is a fragment rather than a share target
          // (ADR-0084 §5) — so a `shareTarget` field on the roster would have
          // exactly one filled entry and would invite the other Facet to fill
          // it, which the spec forbids anyway: an action outside the manifest's
          // own scope is dropped
          // (docs/research/269-two-installable-apps-one-origin.md §5).
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
        }
      : false,
    workbox: {
      // Two assets sit far above workbox's 2 MiB default: the Loro CRDT WASM
      // (~4.2 MB), so the root's Notes works offline on first load, and the USDA
      // Nutrient store, so Rations' food staging does (ADR-0047 §11). Workbox
      // weighs the raw file, not the ~782 KiB gzip it is served as, and the
      // store measured 4.03 MiB on 2026-08-19 — over the 4 MiB this used to
      // allow, which failed the build outright. The headroom is for a mirror
      // refresh growing it, not for a second asset this size.
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      // Every emitted file is a candidate and the transform decides. The glob
      // deliberately makes no decision: `globDirectory` defaults to the one
      // output directory for both instances, so a per-Facet pattern here would
      // be a denylist by another name (ADR-0077 §2).
      globPatterns: ["**/*"],
      manifestTransforms: [facetPrecache(facet)],
      navigateFallback: `/${inScope}index.html`,
      navigateFallbackDenylist: nestedScopesOf(facet),
      // **Off for the root, and nothing is bought back** (ADR-0077 §1).
      // `deleteOutdatedCaches` filters cache names on
      // `cacheName.includes(self.registration.scope)`, a substring test, and the
      // root's scope is a substring of every nested Facet's cache name — so with
      // this on, the root service worker deletes the entire Rations offline
      // install on every activation. One-directional: `/food/` is not a
      // substring of the root's cache name, so Rations keeps it. The option only
      // ever removed precaches left by an *older workbox precache version*,
      // never by an older deploy, so turning it off costs nothing before workbox
      // bumps `precache-v2`.
      cleanupOutdatedCaches: nestedScopesOf(facet).length === 0,
      runtimeCaching: [
        {
          // **Genuinely shared between the Facets, and the one place they do not
          // duplicate bytes** (ADR-0077 §7): `getRuntimeName` returns a
          // user-supplied name verbatim, with no scope suffix, so both service
          // workers write to literally the same `Cache`. The hazard is recorded
          // rather than fixed — two `ExpirationPlugin` instances keep
          // independent bookkeeping over one store, so `maxEntries` is enforced
          // twice against a set neither fully knows. The failure mode is
          // over-eviction of a `CacheFirst` cache that re-fetches on miss.
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
  });
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    localScraperProxyPlugin(),
    svelte(),
    // One instance per Facet, read off the roster rather than listed here: a
    // third Facet is an entry on the registry and nothing else (ADR-0083 §1).
    ...FACETS.map(facetPwa),
    // After VitePWA, so the manifest links its instances injected into every
    // page are there to replace.
    facetManifests(),
    // Last, so its `closeBundle` runs after both service workers have been
    // generated and each Facet's precache is a fact rather than a plan.
    facetBundles(),
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
