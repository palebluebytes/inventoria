# 7. Serverless Proxy and Metadata Fallback for Web Scraping

We have implemented a serverless proxy pipeline on Cloudflare Workers and a client-side Open Graph metadata fallback parser to securely ingest product data from complex e-commerce websites like Amazon.

## Status

Accepted

## Context

Inventoria allows users to input external URLs to automatically generate "Digital Twins" of items. However, directly fetching these URLs from the browser-based Progressive Web App (PWA) faces multiple strict barriers:

1. **Browser CORS Policies:** The browser's Same-Origin Policy strictly prohibits a PWA (e.g., hosted on `inventoria.app`) from reading responses from a different origin like `amazon.es` without explicit `Access-Control-Allow-Origin` headers. This restriction applies equally to the Main Thread, Web Workers, and Service Workers within the browser sandbox.
2. **Payload Size Limits:** E-commerce product pages are massive (often 2MB–5MB). Passing this raw HTML through standard free CORS proxies (like `corsproxy.io`) exceeds maximum payload thresholds (e.g., 1MB), resulting in `413 Payload Too Large` failures.
3. **Anti-Bot Defenses:** E-commerce sites routinely block generic `fetch` user agents or headless environments returning `403 Forbidden` or `503 Service Unavailable`.
4. **Missing JSON-LD Data:** Some large platforms (notably Amazon) do not emit standard `<script type="application/ld+json">` metadata blocks on product pages, relying instead on Open Graph `<meta>` tags and custom DOM structures.

## Decision

1. **Proxy Layer:** We deployed a lightweight Cloudflare Worker proxy (`worker/src/index.ts`). This worker mimics a standard desktop `User-Agent`, bypasses simple bot filters, and fetches the target HTML on the server.
2. **Payload Pruning:** The Cloudflare Worker applies regular expressions to strip out heavy elements (`<style>`, `<svg>`, and non-JSON-LD `<script>`) before transmitting the HTML back to the client. This typically shrinks a 2.5MB payload down to under 100KB, easily bypassing payload limits.
3. **Local Dev DevServer Middleware:** To ensure out-of-the-box local development compatibility (particularly under NixOS where Wrangler's precompiled `workerd` binary fails to run due to dynamic linking issues), we added `localScraperProxyPlugin` to `vite.config.ts`. This middleware mimics the Cloudflare Worker HTML cleanup logic directly inside the Vite Dev and Preview servers under the `/api/proxy` path, removing local external process dependencies (like `wrangler dev` and `concurrently`) during development.
4. **Client-Side Fallback Parser:** We updated our ingestion pipeline (`src/lib/ingestion/json-ld.ts`) to fall back to `og:title`, `og:image`, and `description` meta tags when JSON-LD is missing. We also added Amazon-specific parsing logic to locate the high-resolution image (`<img id="landingImage">`).
5. **ASIN Extraction & Normalization:** When processing Amazon URLs, the client extracts the 10-character Amazon Standard Identification Number (ASIN) from the URL path. This normalizes the `entityId` to `asin:ASIN` (instead of hashing the localized URL), allowing multiple regional or tracking-tagged links to resolve to the same canonical digital twin in the ledger.

## Note on Direct Device Scraping Issues & Future Alternatives

The decision to route scraping through an external serverless proxy is dictated by browser constraints. **It is fundamentally impossible for a web application running in a standard browser environment (PWA) to bypass CORS and scrape third-party websites directly.**

If a future requirement demands that scraping must execute entirely locally on the user's device (e.g., to perfectly mimic the user's IP address, authenticated cookies, or to guarantee 100% privacy without an intermediary proxy), the PWA architecture alone will not suffice. We would have to adopt one of the following alternative deployment models:

1. **Native App Wrapper (Tauri / Capacitor / Electron):** Wrapping the PWA in a native application shell grants access to the host OS's native HTTP clients. Native HTTP requests operate entirely outside the browser sandbox and ignore CORS.
2. **Browser Extension Companion:** A companion extension can request host permissions (e.g., `*://*.amazon.es/*`) in its `manifest.json`. The extension's background scripts can bypass CORS, scrape the content natively, and securely communicate the JSON payload back to the PWA.
3. **User-Assisted Bookmarklet:** A bookmarklet executed manually by the user while browsing the target e-commerce site operates under that site's origin, allowing it to scrape the DOM directly and push the data into Inventoria.

## Consequences

- Successfully stabilized e-commerce scraping, particularly for heavy and non-standard sites like Amazon.
- Drastically reduced bandwidth consumption for the client.
- Eliminated dev-time OS and platform binary compatibility issues (like NixOS dynamic linker error with Wrangler) by routing local development proxy requests through standard Node.js/Vite middleware.
- Introduced a server-side dependency (Cloudflare Workers) only for production deployment, keeping local development completely self-contained.
