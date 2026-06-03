import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
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
      },
    }),
  ],
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
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
