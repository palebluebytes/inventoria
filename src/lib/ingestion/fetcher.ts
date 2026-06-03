/**
 * Fetches HTML from a URL, automatically routing through a CORS proxy if in a browser environment.
 */
export async function fetchHtml(url: string): Promise<string> {
  const isBrowser = typeof window !== "undefined";
  // In browser, route through corsproxy.io to avoid CORS blocks
  const targetUrl = isBrowser
    ? `https://corsproxy.io/?${encodeURIComponent(url)}`
    : url;

  const response = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.statusText} (${response.status})`
    );
  }

  // If using allorigins or other proxy formats, we might need to parse JSON.
  // corsproxy.io returns the raw response directly, so we just call .text()
  return await response.text();
}
