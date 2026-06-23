import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to declare and initialize mockSettings before vi.mock executes
const { mockSettings } = vi.hoisted(() => {
  const { writable } = require("svelte/store");
  return {
    mockSettings: writable({
      usda_api_key: "",
      tmdb_api_key: "",
      scraper_proxy_url: "",
    }),
  };
});

vi.mock("../../src/lib/stores/settings.store", () => ({
  settingsStore: mockSettings,
}));

import { fetchHtml, getProxyImageUrl } from "../../src/lib/ingestion/fetcher";
import { cleanHtml } from "../../src/lib/ingestion/html-clean";

describe("cleanHtml (shared proxy cleaner)", () => {
  it("strips style and svg tags but keeps application/ld+json script tags", () => {
    const mockHtml = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script src="tracker.js"></script>
          <script type="application/ld+json">
            { "@context": "https://schema.org", "@type": "Product", "name": "Clean Product" }
          </script>
        </head>
        <body>
          <svg viewBox="0 0 100 100"><path d="M10 10" /></svg>
          <h1>Hello World</h1>
        </body>
      </html>
    `;

    const cleaned = cleanHtml(mockHtml);

    // style should be gone
    expect(cleaned).not.toContain("body { color: red; }");
    expect(cleaned).not.toContain("<style>");
    // svg should be gone
    expect(cleaned).not.toContain("<svg>");
    expect(cleaned).not.toContain("viewBox");
    // tracker.js script should be gone
    expect(cleaned).not.toContain("tracker.js");
    // application/ld+json script MUST remain
    expect(cleaned).toContain('type="application/ld+json"');
    expect(cleaned).toContain("Clean Product");
  });

  it("removes multiple non-LD scripts without swallowing content between them", () => {
    const html =
      `<p>before</p><script>a()</script><p>middle</p>` +
      `<script type="text/javascript">b()</script><p>after</p>`;
    const cleaned = cleanHtml(html);
    expect(cleaned).not.toContain("a()");
    expect(cleaned).not.toContain("b()");
    expect(cleaned).toContain("before");
    expect(cleaned).toContain("middle");
    expect(cleaned).toContain("after");
  });

  it("keeps ld+json even with single quotes and extra attributes", () => {
    const html = `<script type='application/ld+json' id="x">{"a":1}</script>`;
    expect(cleanHtml(html)).toContain('{"a":1}');
  });

  it("handles a closing tag with whitespace (</script >)", () => {
    const html = `<script>evil()</script ><h1>kept</h1>`;
    const cleaned = cleanHtml(html);
    expect(cleaned).not.toContain("evil()");
    expect(cleaned).toContain("kept");
  });
});

describe("fetchHtml Proxy Error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default to a configured proxy url for fetchHtml success/error path testing
    mockSettings.set({
      usda_api_key: "test-usda-key",
      tmdb_api_key: "test-tmdb-key",
      scraper_proxy_url: "https://my-proxy.com/?url=",
    });
  });

  it("throws configuration error if proxy is empty in browser", async () => {
    // Set proxy URL to empty
    mockSettings.set({
      usda_api_key: "test-usda-key",
      tmdb_api_key: "test-tmdb-key",
      scraper_proxy_url: "",
    });

    // Mock window to simulate browser environment
    vi.stubGlobal("window", {});

    await expect(fetchHtml("https://example.com/blocked")).rejects.toThrow(
      "Scraper proxy URL is not configured. Please set it in Settings."
    );

    vi.unstubAllGlobals();
  });

  it("translates a 413 into the friendly oversized-page message", async () => {
    vi.stubGlobal("window", {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 413,
      statusText: "Payload Too Large",
      text: async () => "Target response exceeds 5MB size limit",
    } as Response);

    await expect(fetchHtml("https://example.com/huge")).rejects.toThrow(
      "The product page is too large for the current proxy limit (5MB)."
    );
    vi.unstubAllGlobals();
  });

  it("translates 403 or 503 bot blocks into friendly error message", async () => {
    vi.stubGlobal("window", {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "Cloudflare challenge",
    } as Response);

    await expect(fetchHtml("https://example.com/blocked")).rejects.toThrow(
      "The target e-commerce site blocked the scraper connection."
    );
    vi.unstubAllGlobals();
  });
});

describe("getProxyImageUrl utility", () => {
  it("returns empty string for falsy/empty values", () => {
    expect(getProxyImageUrl(undefined)).toBe("");
    expect(getProxyImageUrl("")).toBe("");
  });

  it("returns same-origin, data URLs, and blob URLs as-is", () => {
    expect(getProxyImageUrl("/images/item.jpg")).toBe("/images/item.jpg");
    expect(getProxyImageUrl("data:image/png;base64,123")).toBe(
      "data:image/png;base64,123"
    );
    expect(getProxyImageUrl("blob:http://localhost/123")).toBe(
      "blob:http://localhost/123"
    );
  });

  it("prefixes cross-origin URLs with the scraper proxy URL if configured", () => {
    mockSettings.set({
      usda_api_key: "test-usda-key",
      tmdb_api_key: "test-tmdb-key",
      scraper_proxy_url: "https://my-custom-proxy.com/?u=",
    });

    expect(getProxyImageUrl("https://example.com/img.jpg")).toBe(
      `https://my-custom-proxy.com/?u=${encodeURIComponent("https://example.com/img.jpg")}`
    );
  });

  it("returns raw cross-origin URLs as-is if no proxy is configured", () => {
    mockSettings.set({
      usda_api_key: "test-usda-key",
      tmdb_api_key: "test-tmdb-key",
      scraper_proxy_url: "",
    });

    expect(getProxyImageUrl("https://example.com/img.jpg")).toBe(
      "https://example.com/img.jpg"
    );
  });
});
