# 4. Cloudflare Workers PWA Deployment Flow

We have configured a personal deployment pipeline utilizing Cloudflare Workers static asset serving paired with a Progressive Web App (PWA) "Prompt for Update" strategy.

## Status

Accepted

## Context

Inventoria is a local-first application using SQLite WASM backed by the Origin Private File System (OPFS) for data persistence. This creates two distinct architectural requirements:

1. **Cross-Origin Isolation:** Multi-threaded SQLite WASM worker requires `SharedArrayBuffer`, which relies on `Cross-Origin-Opener-Policy` (COOP) and `Cross-Origin-Embedder-Policy` (COEP) headers.
2. **Offline Capabilities & Updates:** Users expect the application to operate fully offline but also notify them when code updates (fixes, new features) are successfully deployed to the hosting CDN.

## Decision

1. **HOSTING LAYER:** We deploy the frontend to Cloudflare Workers using the native `[assets]` binding to host built assets from the `dist/` directory.
2. **SECURITY HEADERS:** We configure a static `_headers` file in `public/` (copied to `dist/_headers`) to emit:
   ```http
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```
3. **PWA ENABLING:** We use `vite-plugin-pwa` to register a Service Worker and manifest automatically.
4. **UPDATE PROPAGATION:** We enforce a `"prompt"` registration strategy. When a new deployment is compiled, the application displays a local notification toast letting the user trigger an immediate reload, rather than silently updating or leaving them on an old version.

## Consequences

- Direct integration with Cloudflare dashboard allows automated builds via GitHub webhook triggers.
- Guaranteed access to `SharedArrayBuffer` for sqlite3-wasm across modern browsers.
- Transparent app lifecycle where the user is informed of updates and controls when the new application code takes effect.
