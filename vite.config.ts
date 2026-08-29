import { defineConfig } from "vite";
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

const localScraperProxyPlugin = () => ({
  name: "local-scraper-proxy",
  configureServer(server: any) {
    server.middlewares.use(handleProxyRequest);
  },
  configurePreviewServer(server: any) {
    server.middlewares.use(handleProxyRequest);
  },
});

// ---------------------------------------------------------------------------
// #198 probe rendezvous — THROWAWAY, dev server only, never in a build
// ---------------------------------------------------------------------------

/**
 * The smallest thing that lets one scan carry a meal.
 *
 * #194 §4.4 proves a session needs a bidirectional exchange: ICE keys a check on
 * the peer's password and DTLS on the peer's fingerprint, and no shared seed
 * derives a certificate. #199 §8 recorded that as "both devices must show and
 * both must read" — true under §4's no-server premise, where a human was the
 * only channel there was. A rendezvous separates the two claims: the exchange
 * stays bidirectional, and only one leg stays human.
 *
 * What this holds is a room's two session descriptions, in memory, for the
 * seconds a live handshake takes. It never sees the payload, which crosses the
 * data channel encrypted under a key that rides in the QR and therefore never
 * reaches here — which is how #199 §9's no-MITM clause is satisfied in the
 * direction the QR cannot cover on its own. And it stores nothing after the
 * process exits, so #199 §4's "exactly two places, never three" holds: the meal
 * is never one of the things kept.
 */
interface ProbeRoom {
  offer?: string;
  answer?: string;
  at: number;
}
const probeRooms = new Map<string, ProbeRoom>();
/** A room is a handshake, not a mailbox. Anything older than this is swept. */
const PROBE_ROOM_TTL_MS = 5 * 60 * 1000;

const handleProbeRendezvous = async (req: any, res: any, next: any) => {
  const url = new URL(
    req.url || "",
    `http://${req.headers.host || "localhost"}`
  );
  if (!url.pathname.startsWith("/__probe198/")) {
    next();
    return;
  }

  const now = Date.now();
  for (const [id, room] of probeRooms)
    if (now - room.at > PROBE_ROOM_TTL_MS) probeRooms.delete(id);

  const id = url.searchParams.get("room") ?? "";
  const slot = url.pathname.endsWith("/answer") ? "answer" : "offer";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (!id) {
    res.statusCode = 400;
    res.end("missing room");
    return;
  }

  if (req.method === "PUT") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const room = probeRooms.get(id) ?? { at: now };
    room[slot] = body;
    room.at = now;
    probeRooms.set(id, room);
    res.statusCode = 204;
    res.end();
    return;
  }

  const value = probeRooms.get(id)?.[slot];
  if (!value) {
    res.statusCode = 404;
    res.end("not yet");
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.statusCode = 200;
  res.end(value);
};

const probeRendezvousPlugin = () => ({
  name: "probe198-rendezvous",
  // configureServer ONLY. There is deliberately no configurePreviewServer and
  // no build hook: this must be unreachable outside `pnpm dev`/`pnpm proto:198`.
  configureServer(server: any) {
    server.middlewares.use(handleProbeRendezvous);
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    localScraperProxyPlugin(),
    svelte(),
    probeRendezvousPlugin(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Inventoria",
        short_name: "Inventoria",
        description: "Local-first item and habit tracking",
        theme_color: "#863bff",
        background_color: "#000000",
        display: "standalone",
        icons: [
          {
            src: "favicon.svg",
            sizes: "192x192 512x512",
            type: "image/svg+xml",
          },
        ],
        share_target: {
          action: "/",
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
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico,wasm,webmanifest,woff2,json}",
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
  ],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    // `pnpm proto:198` sets PROTO_TUNNEL, because the #198 probe has to reach
    // two phones and both a camera and `RTCPeerConnection` are secure-context
    // only — so the dev server is fronted by an HTTPS tunnel whose hostname is
    // minted per run and cannot be listed ahead of time. Vite's Host-header
    // check would reject it. Nothing but that script sets the variable, so the
    // DNS-rebinding protection stays on for an ordinary `pnpm dev`.
    allowedHosts: process.env.PROTO_TUNNEL ? true : undefined,
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
