/**
 * Fetches HTML from a URL, automatically routing through a CORS proxy if in a browser environment.
 */
export async function fetchHtml(url: string): Promise<string> {
  const isBrowser = typeof window !== "undefined";
  let targetUrl = url;

  if (isBrowser) {
    const customProxy = import.meta.env.VITE_SCRAPER_PROXY_URL;
    if (customProxy) {
      targetUrl = `${customProxy}${encodeURIComponent(url)}`;
    } else {
      // In browser, route through corsproxy.io to avoid CORS blocks
      targetUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    }
  }

  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

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
