/**
 * Fetches HTML from a URL, automatically routing through a CORS proxy if in a browser environment.
 */
export async function fetchHtml(url: string): Promise<string> {
  const isBrowser = typeof window !== "undefined";
  let targetUrl = url;

  let customProxyUsed = false;
  if (isBrowser) {
    const customProxy = import.meta.env.VITE_SCRAPER_PROXY_URL;
    if (customProxy) {
      targetUrl = `${customProxy}${encodeURIComponent(url)}`;
      customProxyUsed = true;
    } else {
      // In browser, route through corsproxy.io to avoid CORS blocks
      targetUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    }
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
    if (customProxyUsed) {
      console.warn(
        "Custom proxy failed to connect, falling back to corsproxy.io:",
        err
      );
      const fallbackUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      try {
        response = await fetch(fallbackUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
      } catch (fallbackErr) {
        throw new Error("Failed to connect to the scraping proxy.");
      }
    } else {
      throw new Error("Failed to connect to the scraping proxy.");
    }
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

  const customProxy = import.meta.env.VITE_SCRAPER_PROXY_URL;
  if (customProxy) {
    return `${customProxy}${encodeURIComponent(imageUrl)}`;
  }

  // Fallback to corsproxy.io (which appends Access-Control-Allow-Origin: *)
  return `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
}
