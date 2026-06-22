import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

// Simple helper to clean up HTML exactly like the Cloudflare worker
function cleanHtml(html: string): string {
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");
  html = html.replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, "");
  html = html.replace(
    /<script([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs) => {
      const isJsonLd = /type\s*=\s*['"]?application\/ld\+json['"]?/i.test(
        attrs
      );
      return isJsonLd ? match : "";
    }
  );
  return html;
}

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

    try {
      const fetchRes = await fetch(targetUrl, {
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

      const contentType = fetchRes.headers.get("content-type") || "";
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (contentType.includes("image/")) {
        const arrayBuffer = await fetchRes.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.statusCode = 200;
        res.end(Buffer.from(arrayBuffer));
        return;
      }

      const rawHtml = await fetchRes.text();
      const cleanedHtml = cleanHtml(rawHtml);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.statusCode = 200;
      res.end(cleanedHtml);
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    localScraperProxyPlugin(),
    svelte(),
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
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  // @ts-ignore
  test: {
    exclude: ["node_modules", "dist", ".idea", ".git", ".cache", ".direnv"],
  },
});
