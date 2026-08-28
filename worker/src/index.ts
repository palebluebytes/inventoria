import {
  checkProxyTarget,
  guardedFetch,
} from "../../src/lib/ingestion/url-guard";
import {
  corsHeaders,
  securityHeaders,
  HTML_CSP,
  readProxyPayload,
} from "../../src/lib/ingestion/proxy-policy";

const FETCH_TIMEOUT_MS = 20_000;

// The one path this Worker answers, matching the `/api/proxy` the Vite dev
// middleware serves so a scrape reaches the same URL in both environments.
//
// Everything else on this origin is a static asset, and the platform serves
// those before the Worker is invoked at all (`run_worker_first` defaults off).
// A request arriving here on any other path therefore matched no asset either,
// which makes it a 404 rather than a proxy request missing its `url`.
const PROXY_PATH = "/api/proxy";

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      ...corsHeaders,
      ...securityHeaders,
      "Content-Type": "text/plain",
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname, searchParams } = new URL(request.url);

    if (pathname !== PROXY_PATH) {
      return errorResponse("Not found", 404);
    }

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, ...securityHeaders },
      });
    }

    const urlString = searchParams.get("url");
    if (!urlString) {
      return errorResponse("Missing target URL", 400);
    }

    // SSRF guard: reject internal/loopback/metadata hosts and non-HTTP schemes.
    const guard = checkProxyTarget(urlString);
    if (!guard.ok) {
      return errorResponse(`Refused target URL: ${guard.reason}`, 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await guardedFetch(guard.url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      if (!response.ok) {
        return errorResponse(
          `Failed to fetch: ${response.statusText}`,
          response.status
        );
      }

      const payload = await readProxyPayload(response);

      if (payload.kind === "error") {
        return errorResponse(payload.message, payload.status);
      }

      if (payload.kind === "image") {
        return new Response(payload.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            "Content-Type": payload.mime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      return new Response(payload.html, {
        status: 200,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          "Content-Type": "text/html;charset=UTF-8",
          "Content-Security-Policy": HTML_CSP,
        },
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        return errorResponse("Target request timed out", 504);
      }
      return errorResponse(`Proxy Error: ${error?.message || error}`, 500);
    } finally {
      clearTimeout(timeout);
    }
  },
};
