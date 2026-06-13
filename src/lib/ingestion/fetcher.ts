import { get } from "svelte/store";
import { settingsStore } from "../stores/settings.store";

// Read the proxy URL on demand instead of holding a module-level subscription
// that is never cleaned up.
function activeProxyUrl(): string {
  return get(settingsStore).scraper_proxy_url;
}

/**
 * Fetches HTML from a URL, automatically routing through a CORS proxy if in a browser environment.
 */
export async function fetchHtml(url: string): Promise<string> {
  const isBrowser = typeof window !== "undefined";
  let targetUrl = url;

  if (isBrowser) {
    const proxyUrl = activeProxyUrl();
    if (!proxyUrl) {
      throw new Error(
        "Scraper proxy URL is not configured. Please set it in Settings."
      );
    }
    targetUrl = `${proxyUrl}${encodeURIComponent(url)}`;
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
  } catch (err) {
    throw new Error("Failed to connect to the scraping proxy.");
  }

  const text = await response.text();

  if (!response.ok) {
    let errorMessage = `Failed to fetch URL: ${response.statusText} (${response.status})`;
    if (response.status === 413 || text.includes("exceeds 1MB size limit")) {
      errorMessage =
        "The product page is too large for the current proxy limit (1MB).";
    } else if (
      response.status === 403 ||
      response.status === 503 ||
      response.status === 520
    ) {
      errorMessage =
        "The target e-commerce site blocked the scraper connection.";
    }

    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).statusText = response.statusText;
    throw error;
  }

  return text;
}

/**
 * Resolves an image URL through the scraper proxy if it is a cross-origin absolute URL,
 * ensuring it bypasses CORS and COEP (Cross-Origin-Embedder-Policy) restrictions in the PWA.
 */
export function getProxyImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return "";
  // Return relative, data URLs, or already-proxied URLs as-is
  if (
    imageUrl.startsWith("/") ||
    imageUrl.startsWith("data:") ||
    imageUrl.startsWith("blob:")
  ) {
    return imageUrl;
  }

  const proxyUrl = activeProxyUrl();
  if (proxyUrl) {
    return `${proxyUrl}${encodeURIComponent(imageUrl)}`;
  }

  // Without a proxy configured, return raw image URL (corsproxy.io is completely removed)
  return imageUrl;
}
