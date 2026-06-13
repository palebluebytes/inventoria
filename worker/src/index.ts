import { checkProxyTarget } from "../../src/lib/ingestion/url-guard";
import { cleanHtml } from "../../src/lib/ingestion/html-clean";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 20_000;
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Defence-in-depth headers applied to every response.
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

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
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, ...securityHeaders },
      });
    }

    const urlString = new URL(request.url).searchParams.get("url");
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
      const response = await fetch(guard.url.toString(), {
        signal: controller.signal,
        redirect: "follow",
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

      // Reject oversized payloads early when the upstream declares a length.
      const declaredLength = Number(
        response.headers.get("content-length") || 0
      );
      if (declaredLength > MAX_RESPONSE_BYTES) {
        return errorResponse("Target response exceeds 5MB size limit", 413);
      }

      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("image/")) {
        const mime = contentType.split(";")[0].trim().toLowerCase();
        if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
          return errorResponse(`Unsupported image type: ${mime}`, 415);
        }
        const body = await response.arrayBuffer();
        if (body.byteLength > MAX_RESPONSE_BYTES) {
          return errorResponse("Target image exceeds 5MB size limit", 413);
        }
        return new Response(body, {
          status: 200,
          headers: {
            ...corsHeaders,
            ...securityHeaders,
            "Content-Type": mime,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }

      const raw = await response.text();
      if (raw.length > MAX_RESPONSE_BYTES) {
        return errorResponse("Target response exceeds 5MB size limit", 413);
      }

      const html = cleanHtml(raw);

      return new Response(html, {
        status: 200,
        headers: {
          ...corsHeaders,
          ...securityHeaders,
          "Content-Type": "text/html;charset=UTF-8",
          // The body is opaque scraped markup; lock rendering down hard in case
          // it is ever loaded directly in a browser context.
          "Content-Security-Policy":
            "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-ancestors 'none'",
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
