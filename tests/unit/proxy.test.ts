import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchHtml, getProxyImageUrl } from "../../src/lib/ingestion/fetcher";

// Helper to mimic worker regex behavior
function workerCleanup(html: string): string {
  // 1. Remove all style tags
  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "");

  // 2. Remove all svg tags
  html = html.replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, "");

  // 3. Remove all script tags *except* type="application/ld+json"
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

describe("Worker HTML regex cleanup", () => {
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

    const cleaned = workerCleanup(mockHtml);

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
});

describe("fetchHtml Proxy Error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("translates 413 or payload messages into friendly error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 413,
      statusText: "Payload Too Large",
      text: async () => "exceeds 1MB size limit",
    } as Response);

    await expect(fetchHtml("https://example.com/huge")).rejects.toThrow(
      "The product page is too large for the current proxy limit (1MB)."
    );
  });

  it("translates 403 or 503 bot blocks into friendly error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: async () => "Cloudflare challenge",
    } as Response);

    await expect(fetchHtml("https://example.com/blocked")).rejects.toThrow(
      "The target e-commerce site blocked the scraper connection."
    );
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

  it("prefixes cross-origin URLs with the scraper proxy URL from environment if present", () => {
    // Vite defines import.meta.env, which vitest supports. Let's mock it if needed or test with current value
    const expectedPrefix = import.meta.env.VITE_SCRAPER_PROXY_URL;
    if (expectedPrefix) {
      expect(getProxyImageUrl("https://example.com/img.jpg")).toBe(
        `${expectedPrefix}${encodeURIComponent("https://example.com/img.jpg")}`
      );
    } else {
      expect(getProxyImageUrl("https://example.com/img.jpg")).toBe(
        `https://corsproxy.io/?${encodeURIComponent("https://example.com/img.jpg")}`
      );
    }
  });
});
